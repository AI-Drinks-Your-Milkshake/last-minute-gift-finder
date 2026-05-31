import { NextRequest, NextResponse } from 'next/server';
import { getProductImage } from '@/lib/product-images';

// Max gifts per request — prevents abuse and keeps the endpoint snappy.
const MAX_GIFTS = 50;
// Concurrency cap: run at most this many image lookups simultaneously.
// Too high exhausts connections and causes queuing; 8 is empirically fast
// without hammering Brave or the KV connection pool.
const CONCURRENCY = 8;

/**
 * Run `fn` over every item in `items` with at most `limit` concurrent calls.
 * Uses a simple worker-pool pattern that's safe in JS's single-threaded model
 * (the `next` counter increment is atomic).
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * POST /api/images
 *
 * Body: { gifts: { searchTerms: string }[] }
 * Response: { results: { searchTerms: string; imageUrl: string | null }[] }
 *
 * Accepts a list of gift search-term strings and returns an image URL for each.
 * Results are in the same order as the input. Failures are null — never throws.
 *
 * This endpoint is called by the client *after* gift cards are already rendered,
 * so images appear progressively rather than blocking the initial results render.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!Array.isArray(body.gifts)) {
    return NextResponse.json({ error: 'gifts must be an array.' }, { status: 400 });
  }

  // Validate each entry has a searchTerms string; silently drop malformed ones.
  const gifts = (body.gifts as unknown[]).filter(
    (g): g is { searchTerms: string } =>
      typeof g === 'object' &&
      g !== null &&
      typeof (g as Record<string, unknown>).searchTerms === 'string',
  );

  if (gifts.length > MAX_GIFTS) {
    return NextResponse.json(
      { error: `Too many gifts (max ${MAX_GIFTS}).` },
      { status: 400 },
    );
  }

  const results = await mapWithConcurrency(gifts, CONCURRENCY, async (g) => {
    const imageUrl = await getProductImage(g.searchTerms).catch(() => null);
    return { searchTerms: g.searchTerms, imageUrl };
  });

  return NextResponse.json({ results });
}
