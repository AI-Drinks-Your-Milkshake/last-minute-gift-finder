import { NextRequest, NextResponse } from 'next/server';
import { getGiftIdeas } from '@/lib/anthropic';
import { addRecentSearch } from '@/lib/kv';
import { enrichThemesWithImages } from '@/lib/product-images';
import { getTrendingProducts } from '@/lib/trends';
import { AESTHETIC_VALUES, getAesthetic } from '@/lib/aesthetics';
import {
  pluralizeRecipient,
  extractPrimaryInterest,
  buildPinTitle,
  buildSlug,
} from '@/lib/pin-title';
import { savePageResult } from '@/lib/page-results';

const COUNT_MIN = 3;
const COUNT_MAX = 25;
const VALID_LEVELS = ['casual', 'interested', 'enthusiast'] as const;
const VALID_RELATEDNESS = ['similar', 'mixed', 'adventurous'] as const;
const MAX_VIBES = 2;

type Level = (typeof VALID_LEVELS)[number];
type Relatedness = (typeof VALID_RELATEDNESS)[number];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  // No per-user rate limit — access to the wizard is gated by the login
  // middleware in middleware.ts, so only authenticated users can reach
  // this endpoint via the UI.

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest('Invalid request body.');
  }

  const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
  const age = typeof body.age === 'string' ? body.age.trim() : '';
  const occasion = typeof body.occasion === 'string' ? body.occasion.trim() : '';
  const interests = typeof body.interests === 'string' ? body.interests.trim() : '';

  if (!recipient || !age || !occasion || !interests) {
    return badRequest('All fields are required.');
  }

  const count = body.count;
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < COUNT_MIN ||
    count > COUNT_MAX
  ) {
    return badRequest(`Invalid count. Must be an integer between ${COUNT_MIN} and ${COUNT_MAX}.`);
  }

  const priceMin = body.priceMin;
  const priceMax = body.priceMax;
  if (
    typeof priceMin !== 'number' || !Number.isFinite(priceMin) ||
    typeof priceMax !== 'number' || !Number.isFinite(priceMax) ||
    priceMin < 0 || priceMax > 1500 || priceMin > priceMax
  ) {
    return badRequest('Invalid price range.');
  }

  const level = body.level;
  if (typeof level !== 'string' || !VALID_LEVELS.includes(level as Level)) {
    return badRequest('Invalid level.');
  }

  // Optional relatedness — shapes per-theme gift distribution so visible
  // count matches what the user requested. Defaults to 'adventurous' so
  // old clients (or direct API calls) continue to work unchanged.
  let relatedness: Relatedness = 'adventurous';
  if (body.relatedness !== undefined) {
    if (
      typeof body.relatedness !== 'string' ||
      !VALID_RELATEDNESS.includes(body.relatedness as Relatedness)
    ) {
      return badRequest('Invalid relatedness value.');
    }
    relatedness = body.relatedness as Relatedness;
  }

  // Optional vibes — must be an array of strings from AESTHETIC_VALUES,
  // with at most MAX_VIBES entries. Reject malformed values rather than
  // silently dropping them so the client surfaces the bug.
  let vibes: string[] | undefined;
  if (body.vibes !== undefined) {
    if (!Array.isArray(body.vibes)) {
      return badRequest('Invalid vibes — must be an array.');
    }
    if (body.vibes.length > MAX_VIBES) {
      return badRequest(`Too many vibes selected. Max ${MAX_VIBES}.`);
    }
    if (!body.vibes.every((v) => typeof v === 'string' && AESTHETIC_VALUES.includes(v))) {
      return badRequest('Invalid vibe value.');
    }
    vibes = body.vibes as string[];
  }

  try {
    // Fetch currently-trending product names via Brave Web Search, then feed
    // them into the Claude prompt as in-context examples. Patches Claude's
    // training cutoff (Aug 2025 for Sonnet 4.6 vs. today). Failures are
    // silent — getTrendingProducts() returns [] if Brave is unconfigured or
    // the call fails, and the main flow proceeds without trending hints.
    const trendingProducts = await getTrendingProducts({
      recipient,
      occasion,
      interests,
      vibes,
    });

    // Request ~35% more gifts than the user asked for. After image validation
    // filters out broken/inaccessible images the client will still have enough
    // cards to fill the requested count. Cap at 40 to keep Claude response time
    // reasonable. The client trims display to `count` via visibleThemes.
    const bufferedCount = Math.min(40, Math.ceil(count * 1.35));

    const themes = await getGiftIdeas({
      recipient,
      age,
      occasion,
      interests,
      count: bufferedCount,
      priceMin,
      priceMax,
      level: level as Level,
      relatedness,
      vibes,
      trendingProducts,
    });

    // Enrich each gift with a product image URL via Brave Image Search +
    // og:image second hop, cached in KV. Mutates themes in place. Never
    // throws — failed lookups leave imageUrl as null so the UI falls back
    // to the emoji-only card.
    await enrichThemesWithImages(themes);

    // ── Build the public page slug ──────────────────────────────────────────
    // Slug is derived from the pin title formula so the URL matches the pin.
    // Pattern: "{vibe}-{occasion}-gifts-for-{recipient-plural}"
    const recipientPlural  = pluralizeRecipient(recipient);
    const vibeLabel        = vibes?.[0] ? getAesthetic(vibes[0])?.label : undefined;
    const primaryInterest  = extractPrimaryInterest(interests);
    const pageTitle        = buildPinTitle({ vibeLabel, occasion, recipientPlural, primaryInterest: primaryInterest ?? undefined });
    const pageSlug         = buildSlug(pageTitle);

    // Persist full results so the public page can read them without re-running
    // the search. Fire-and-forget — KV failure is non-fatal.
    savePageResult(pageSlug, {
      title: pageTitle,
      recipient,
      recipientPlural,
      occasion,
      age,
      vibeLabel,
      primaryInterest: primaryInterest ?? undefined,
      themes,
      createdAt: Date.now(),
    }).catch((err) => console.error('[route] page-results write failed:', err));

    // Await the KV write — fire-and-forget is unreliable in serverless
    // (the function terminates before the async write completes)
    await addRecentSearch({
      recipient,
      occasion,
      timestamp: Date.now(),
    }).catch((err) => console.error('Failed to save recent search:', err));

    return NextResponse.json({ themes, pageSlug });
  } catch (err) {
    console.error('Gift search error:', err);
    return NextResponse.json(
      { error: 'Something went wrong generating gift ideas. Please try again.' },
      { status: 500 },
    );
  }
}
