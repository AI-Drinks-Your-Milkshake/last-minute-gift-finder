import { NextRequest, NextResponse } from 'next/server';
import { getGiftIdeas } from '@/lib/openai';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { addRecentSearch } from '@/lib/kv';

const VALID_COUNTS = [6, 9, 12] as const;
const VALID_LEVELS = ['casual', 'interested', 'enthusiast'] as const;

type Level = (typeof VALID_LEVELS)[number];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limit check — fail open so KV errors don't break the app
  let rateLimitRemaining = 5;
  try {
    const { allowed, remaining } = await checkRateLimit(ip);
    rateLimitRemaining = remaining;

    if (!allowed) {
      return NextResponse.json(
        { error: 'You have reached the limit of 5 searches per day. Please try again tomorrow.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0' } },
      );
    }
  } catch (err) {
    console.error('Rate limit check failed:', err);
  }

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
  if (typeof count !== 'number' || !VALID_COUNTS.includes(count as 6 | 9 | 12)) {
    return badRequest('Invalid count. Must be 6, 9, or 12.');
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

    // Await the KV write — fire-and-forget is unreliable in serverless
    // (the function terminates before the async write completes)
    await addRecentSearch({
      recipient,
      occasion,
      timestamp: Date.now(),
    }).catch((err) => console.error('Failed to save recent search:', err));

    return NextResponse.json(
      { themes },
      { headers: { 'X-RateLimit-Remaining': String(rateLimitRemaining - 1) } },
    );
  } catch (err) {
    console.error('Gift search error:', err);
    return NextResponse.json(
      { error: 'Something went wrong generating gift ideas. Please try again.' },
      { status: 500 },
    );
  }
}
