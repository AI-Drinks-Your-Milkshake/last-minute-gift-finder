import { NextRequest, NextResponse } from 'next/server';
import { getGiftIdeas } from '@/lib/anthropic';
import { addRecentSearch } from '@/lib/kv';
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
// Max time we'll wait for trending products before starting Claude anyway.
// Trends feed into Claude so every extra ms here adds directly to response time.
const TRENDS_TIMEOUT_MS = 2000;

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

  if (!recipient || !age || !occasion) {
    return badRequest('Recipient, age, and occasion are required.');
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

  // Optional relatedness
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

  // Optional vibes
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
    // Fire trending fetch immediately. Cap the wait at TRENDS_TIMEOUT_MS so
    // Claude isn't blocked longer than necessary — trends are an enrichment,
    // not a hard dependency. If the search comes back after the cap, Claude
    // just runs without trending hints (graceful degradation).
    const trendingPromise = getTrendingProducts({ recipient, occasion, interests, vibes });
    const trendingProducts = await Promise.race([
      trendingPromise,
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), TRENDS_TIMEOUT_MS)),
    ]);

    // Buffer 15% above the requested count (reduced from 35%) so we have
    // a small cushion after client-side image filtering. Cap at 35.
    // Images are now loaded client-side, so there's no need for a large buffer.
    const bufferedCount = Math.min(35, Math.ceil(count * 1.15));

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

    // ── Build the public page slug ──────────────────────────────────────────
    const recipientPlural  = pluralizeRecipient(recipient);
    const vibeLabel        = vibes?.[0] ? getAesthetic(vibes[0])?.label : undefined;
    const primaryInterest  = extractPrimaryInterest(interests);
    const pageTitle        = buildPinTitle({ vibeLabel, occasion, recipientPlural, primaryInterest: primaryInterest ?? undefined });
    const pageSlug         = buildSlug(pageTitle);

    // Persist results for the public /g/ page. Fire-and-forget — KV failure
    // is non-fatal. Images are NOT included here (they're loaded client-side);
    // the public page renders emoji cards which is fine for SEO/sharing.
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

    // Await the KV write for recent searches — fire-and-forget is unreliable
    // in serverless (the function may terminate before the async write completes).
    await addRecentSearch({
      recipient,
      occasion,
      timestamp: Date.now(),
    }).catch((err) => console.error('Failed to save recent search:', err));

    // Return themes immediately — images are NOT included.
    // The client calls /api/images after cards are rendered to load them lazily.
    return NextResponse.json({ themes, pageSlug });
  } catch (err) {
    console.error('Gift search error:', err);
    return NextResponse.json(
      { error: 'Something went wrong generating gift ideas. Please try again.' },
      { status: 500 },
    );
  }
}
