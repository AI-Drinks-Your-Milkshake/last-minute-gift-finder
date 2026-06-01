// POST /api/images — enriches gifts with product image URLs.
//
// Streams results as SSE so gift cards update one-by-one as images arrive
// rather than waiting for the full batch. The wizard's loadImages() already
// reads this SSE format.
//
// Each gift emits two events:
//   { type: 'log', msg: '[images] <searchTerms> → <url | NULL (reason)>' }
//   { type: 'result', searchTerms, imageUrl }
//
// The log event appears in the dev panel so you can see exactly which product
// failed and what URL (if any) was selected — useful for diagnosing null images
// and image mismatches.

import { NextRequest } from 'next/server';
import { getProductImage } from '@/lib/product-images';

const MAX_GIFTS   = 50;
const CONCURRENCY = 8;

function sse(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, emit: (obj: object) => void) => Promise<R>,
  emit: (obj: object) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], emit);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(sse({ type: 'error', message: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  if (!Array.isArray(body.gifts)) {
    return new Response(sse({ type: 'error', message: 'gifts must be an array.' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const gifts = (body.gifts as unknown[]).filter(
    (g): g is { searchTerms: string } =>
      typeof g === 'object' &&
      g !== null &&
      typeof (g as Record<string, unknown>).searchTerms === 'string',
  );

  if (gifts.length > MAX_GIFTS) {
    return new Response(sse({ type: 'error', message: `Too many gifts (max ${MAX_GIFTS}).` }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: object) =>
        controller.enqueue(encoder.encode(sse(obj)));

      push({ type: 'log', msg: `[images] fetching for ${gifts.length} gifts` });

      let found = 0;
      let nullCount = 0;

      await mapConcurrent(
        gifts,
        CONCURRENCY,
        async (g, emit) => {
          let imageUrl: string | null = null;
          try {
            imageUrl = await getProductImage(g.searchTerms);
          } catch {
            imageUrl = null;
          }

          if (imageUrl) {
            found++;
            // Truncate URL for readability but keep enough to identify the host + path.
            const short = imageUrl.length > 80 ? imageUrl.slice(0, 77) + '…' : imageUrl;
            emit({ type: 'log', msg: `[images] ✓ ${g.searchTerms} → ${short}` });
          } else {
            nullCount++;
            emit({ type: 'log', msg: `[images] ✗ ${g.searchTerms} → null` });
          }

          emit({ type: 'result', searchTerms: g.searchTerms, imageUrl });
        },
        push,
      );

      push({ type: 'log', msg: `[images] done — ${found} found, ${nullCount} null` });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache, no-transform',
      'Connection':      'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
