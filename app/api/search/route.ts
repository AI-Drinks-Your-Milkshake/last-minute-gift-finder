import { NextRequest, NextResponse } from 'next/server';
import { getGiftIdeas } from '@/lib/anthropic';
import { addRecentSearch } from '@/lib/kv';
import { enrichThemesWithImages } from '@/lib/product-images';

const COUNT_MIN = 3;
const COUNT_MAX = 15;
const VALID_LEVELS = ['casual', 'interested', 'enthusiast'] as const;

type Level = (typeof VALID_LEVELS)[number];

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

  try {
    const themes = await getGiftIdeas({
      recipient,
      age,
      occasion,
      interests,
      count,
      priceMin,
      priceMax,
      level: level as Level,
    });

    // Enrich each gift with a product image URL via Brave Image Search +
    // og:image second hop, cached in KV. Mutates themes in place. Never
    // throws — failed lookups leave imageUrl as null so the UI falls back
    // to the emoji-only card.
    await enrichThemesWithImages(themes);

    // Await the KV write — fire-and-forget is unreliable in serverless
    // (the function terminates before the async write completes)
    await addRecentSearch({
      recipient,
      occasion,
      timestamp: Date.now(),
    }).catch((err) => console.error('Failed to save recent search:', err));

    return NextResponse.json({ themes });
  } catch (err) {
    console.error('Gift search error:', err);
    return NextResponse.json(
      { error: 'Something went wrong generating gift ideas. Please try again.' },
      { status: 500 },
    );
  }
}
