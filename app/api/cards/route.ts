// POST /api/cards — streams COMPLETE gift cards (text + image together).
//
// The upgrade over /api/search: it streams the model ONE GIFT AT A TIME and
// looks up each gift's product image the moment that gift is written, so a
// fully-formed card (no text-only state) can appear in ~5-7s instead of ~30s.
//
// Cards are emitted in STRICT top-to-bottom order: card[i] is sent once it and
// all earlier cards are resolved; gifts whose image lookup fails are skipped and
// backfilled from later gifts, so exactly `count` complete cards stream out.
//
// SSE events:
//   { type:'log', msg }                                   — dev panel
//   { type:'card', card:{…, imageUrl} }                   — one complete card
//   { type:'progress', emitted, target }                  — N of count done
//   { type:'done', pageSlug, pinImageUrl }                — finished + stored
//   { type:'error', message }

import { NextRequest } from 'next/server';
import { streamGifts, type StreamedGift } from '@/lib/anthropic';
import { getTrendingProducts } from '@/lib/trends';
import { getAesthetic, AESTHETIC_VALUES } from '@/lib/aesthetics';
import {
  pluralizeRecipient,
  extractPrimaryInterest,
  buildPinTitle,
  buildSlug,
} from '@/lib/pin-title';
import { savePageResult } from '@/lib/page-results';
import { getProductImage } from '@/lib/product-images';
import { addRecentSearch } from '@/lib/kv';
import { MODEL } from '@/lib/models';
import type { GiftTheme } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COUNT_MIN = 3;
const COUNT_MAX = 30;
const TRENDS_TIMEOUT_MS = 2000;
const MAX_INFLIGHT = 8;   // concurrent image lookups
const LOOKAHEAD = 6;      // how far past the next-to-emit card we prefetch images

type Relatedness = 'similar' | 'mixed' | 'adventurous';
type Level = 'casual' | 'interested' | 'enthusiast';

function eligibleCeiling(r: Relatedness): 1 | 2 | 3 {
  if (r === 'similar') return 1;
  if (r === 'mixed') return 2;
  return 3;
}

function sseError(message: string): Response {
  return new Response(`data: ${JSON.stringify({ type: 'error', message })}\n\n`, {
    status: 400,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return sseError('Invalid request body.');
  }

  const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
  const age       = typeof body.age === 'string' ? body.age.trim() : '';
  const occasion  = typeof body.occasion === 'string' ? body.occasion.trim() : '';
  const interests = typeof body.interests === 'string' ? body.interests.trim() : '';
  if (!recipient || !age || !occasion) return sseError('Recipient, age, and occasion are required.');

  const rawCount = body.count;
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < COUNT_MIN || rawCount > COUNT_MAX) {
    return sseError(`Invalid count (must be ${COUNT_MIN}-${COUNT_MAX}).`);
  }
  const count = rawCount;

  let priceMin = typeof body.priceMin === 'number' ? body.priceMin : 0;
  let priceMax = typeof body.priceMax === 'number' ? body.priceMax : 1500;
  if (!Number.isFinite(priceMin) || priceMin < 0) priceMin = 0;
  if (!Number.isFinite(priceMax) || priceMax > 1500) priceMax = 1500;
  if (priceMin > priceMax) { priceMin = 0; priceMax = 1500; }

  const level: Level = ['casual', 'interested', 'enthusiast'].includes(body.level as string)
    ? (body.level as Level) : 'interested';
  const relatedness: Relatedness = ['similar', 'mixed', 'adventurous'].includes(body.relatedness as string)
    ? (body.relatedness as Relatedness) : 'mixed';

  let vibes: string[] | undefined;
  if (Array.isArray(body.vibes)) {
    const v = body.vibes.filter((x): x is string => typeof x === 'string' && AESTHETIC_VALUES.includes(x)).slice(0, 2);
    vibes = v.length ? v : undefined;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (obj: object) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); }
        catch { closed = true; }
      };
      const safeClose = () => { if (closed) return; closed = true; try { controller.close(); } catch { /* torn down */ } };

      const ceiling = eligibleCeiling(relatedness);
      const target = count;
      // Generate a generous spare margin (cheap output tokens) so image-lookup
      // misses can be backfilled and we still hit exactly `count`. We only look
      // up images for what we emit, so the extras cost ~nothing in image queries.
      const bufferedCount = Math.min(50, count + Math.max(5, Math.ceil(count * 0.30)));

      // ── Ordered streaming + lazy windowed image lookup ──────────────────
      interface Slot { sg: StreamedGift; settled: boolean; url: string | null }
      const slots: Slot[] = [];
      const selectedInOrder: StreamedGift[] = [];
      let started = 0, inFlight = 0, settledNulls = 0;
      let emitCursor = 0, emitted = 0;
      let streamDone = false, finished = false;

      const genStart = Date.now();

      const drainEmit = () => {
        while (emitCursor < slots.length && slots[emitCursor].settled && emitted < target) {
          const s = slots[emitCursor];
          emitCursor++;
          if (s.url) {
            s.sg.gift.imageUrl = s.url;
            selectedInOrder.push(s.sg);
            emitted++;
            emit({
              type: 'card',
              card: {
                key: `${s.sg.themeId}::${s.sg.gift.searchTerms}`,
                themeId: s.sg.themeId,
                themeLabel: s.sg.themeLabel,
                relatednessLevel: s.sg.relatednessLevel,
                title: s.sg.gift.title,
                description: s.sg.gift.description,
                priceRange: s.sg.gift.priceRange,
                priceMin: s.sg.gift.priceMin,
                priceMax: s.sg.gift.priceMax,
                searchTerms: s.sg.gift.searchTerms,
                imageUrl: s.url,
              },
            });
            if (emitted === 1) emit({ type: 'log', msg: `[cards] first complete card after ${((Date.now() - genStart) / 1000).toFixed(1)}s` });
            emit({ type: 'progress', emitted, target });
          }
          // null → skip (backfill: cursor already advanced to next slot)
        }
      };

      const finalize = async () => {
        if (finished) return;
        finished = true;
        drainEmit();

        emit({ type: 'log', msg: `[cards] done — ${emitted}/${target} complete cards` });
        if (emitted < target) emit({ type: 'log', msg: `[cards] ⚠ shortfall: ${emitted}/${target}` });

        // Assemble the emitted gifts back into themes (in order) for storage.
        const themes: GiftTheme[] = [];
        for (const sg of selectedInOrder) {
          const last = themes[themes.length - 1];
          if (!last || last.id !== sg.themeId) {
            themes.push({ id: sg.themeId, label: sg.themeLabel, relatednessLevel: sg.relatednessLevel, gifts: [sg.gift] });
          } else {
            last.gifts.push(sg.gift);
          }
        }

        const recipientPlural = pluralizeRecipient(recipient);
        const vibeLabel       = vibes?.[0] ? getAesthetic(vibes[0])?.label : undefined;
        const primaryInterest = extractPrimaryInterest(interests);
        const pageTitle       = buildPinTitle({ vibeLabel, occasion, recipientPlural, primaryInterest: primaryInterest ?? undefined });
        const pageSlug        = `${buildSlug(pageTitle)}-${Date.now().toString(36)}`;
        const origin          = new URL(request.url).origin;
        const pinImageUrl     = `${origin}/api/pin?slug=${encodeURIComponent(pageSlug)}${vibes?.[0] ? `&vibe=${encodeURIComponent(vibes[0])}` : ''}`;

        emit({ type: 'done', pageSlug, pinImageUrl });

        // Fire-and-forget persistence — the client already has its cards.
        savePageResult(pageSlug, {
          title: pageTitle, recipient, recipientPlural, occasion, age,
          vibeLabel, vibeSlug: vibes?.[0] ?? undefined,
          primaryInterest: primaryInterest ?? undefined,
          themes, count, relatedness, createdAt: Date.now(),
        }).catch((err) => console.error('[cards] savePageResult failed:', err));
        addRecentSearch({ recipient, occasion, timestamp: Date.now() }).catch(() => {});

        safeClose();
      };

      const maybeFinish = () => {
        if (finished) return;
        if (emitted >= target) { void finalize(); return; }
        if (streamDone && inFlight === 0 && started >= slots.length) { void finalize(); return; }
      };

      // Start image lookups in order, with a bounded lookahead window so we
      // never look up far more than we'll show (cost) but always keep the
      // pipeline fed (speed).
      const pump = () => {
        while (
          !finished &&
          emitted < target &&
          started < slots.length &&
          inFlight < MAX_INFLIGHT &&
          started < emitCursor + LOOKAHEAD
        ) {
          const idx = started++;
          inFlight++;
          getProductImage(slots[idx].sg.gift.searchTerms)
            .then((u) => { slots[idx].url = u; })
            .catch(() => { slots[idx].url = null; })
            .finally(() => {
              if (!slots[idx].url) settledNulls++;
              slots[idx].settled = true;
              inFlight--;
              drainEmit();
              pump();
              maybeFinish();
            });
        }
      };

      try {
        // Trending products (best-effort, capped).
        const trendingProducts = await Promise.race([
          getTrendingProducts({ recipient, occasion, interests, vibes }),
          new Promise<string[]>((resolve) => setTimeout(() => resolve([]), TRENDS_TIMEOUT_MS)),
        ]);

        for await (const sg of streamGifts({
          recipient, age, occasion, interests,
          count: bufferedCount, priceMin, priceMax, level, relatedness, vibes,
          trendingProducts, model: MODEL,
          onLog: (msg) => emit({ type: 'log', msg }),
        })) {
          if (finished) break;
          if (sg.relatednessLevel > ceiling) continue; // non-eligible theme: skip, no image cost
          slots.push({ sg, settled: false, url: null });
          pump();
        }
        streamDone = true;
        pump();
        maybeFinish();
        // If lookups are still in flight, their .finally() will finalize.
      } catch (err) {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error('[cards] error:', err);
        emit({ type: 'log', msg: `[error] ${detail}` });
        emit({ type: 'error', message: 'Something went wrong generating gift ideas. Please try again.' });
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
