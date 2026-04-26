import { NextRequest, NextResponse } from 'next/server';
import { getGiftIdeas } from '@/lib/openai';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { addRecentSearch } from '@/lib/kv';

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

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { recipient, age, occasion, interests } = body;

  if (!recipient?.trim() || !age?.trim() || !occasion?.trim() || !interests?.trim()) {
    return NextResponse.json(
      { error: 'All fields are required.' },
      { status: 400 },
    );
  }

  try {
    const gifts = await getGiftIdeas({
      recipient: recipient.trim(),
      age: age.trim(),
      occasion: occasion.trim(),
      interests: interests.trim(),
    });

    // Fire-and-forget — don't block the response on KV write
    addRecentSearch({
      recipient: recipient.trim(),
      occasion: occasion.trim(),
      timestamp: Date.now(),
    }).catch((err) => console.error('Failed to save recent search:', err));

    return NextResponse.json(
      { gifts },
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
