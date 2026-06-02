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
import { selectAndEnrichGifts, imageProvider } from '@/lib/product-images';
import type { GiftTheme } from '@/types';

// Image enrichment streams while it fans out Brave lookups + corner-sampling
// (sharp), which can run 15-30s for 36 gifts. Same timeout exposure as the
// search route — pin it so the function isn't killed mid-stream.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_GIFTS   = 50;
const CONCURRENCY = 8;

function sse(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

type Relatedness = 'similar' | 'mixed' | 'adventurous';

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

  if (!Array.isArray(body.themes)) {
    return new Response(sse({ type: 'error', message: 'themes must be an array.' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const themes = body.themes as GiftTheme[];
  const relatedness: Relatedness =
    body.relatedness === 'similar' || body.relatedness === 'adventurous'
      ? body.relatedness
      : 'mixed';
  const totalGifts = themes.reduce(
    (n, t) => n + (Array.isArray(t.gifts) ? t.gifts.length : 0),
    0,
  );
  // Only enrich up to `count` displayed gifts (default: all, for back-compat).
  const count =
    typeof body.count === 'number' && Number.isFinite(body.count)
      ? Math.max(1, Math.min(MAX_GIFTS, Math.floor(body.count)))
      : totalGifts;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (obj: object) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(sse(obj))); } catch { closed = true; }
      };

      push({ type: 'log', msg: `[images] enriching up to ${count} of ${totalGifts} gifts via ${imageProvider()} (lazy, eligible-only)` });

      let found = 0;
      let nullCount = 0;

      // Selection-aware: looks up only eligible gifts, only until `count` have
      // images (backfilling failures). Non-eligible themes are never queried.
      await selectAndEnrichGifts(
        themes,
        relatedness,
        count,
        (r) => {
          if (r.imageUrl) {
            found++;
            const short = r.imageUrl.length > 80 ? r.imageUrl.slice(0, 77) + '…' : r.imageUrl;
            push({ type: 'log', msg: `[images] ✓ ${r.searchTerms} → ${short}` });
          } else {
            nullCount++;
            push({ type: 'log', msg: `[images] ✗ ${r.searchTerms} → null` });
          }
          push({ type: 'result', searchTerms: r.searchTerms, imageUrl: r.imageUrl });
        },
        CONCURRENCY,
      );

      push({ type: 'log', msg: `[images] done — ${found} found, ${nullCount} null (${found + nullCount} queries)` });
      if (!closed) { closed = true; try { controller.close(); } catch { /* torn down */ } }
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
