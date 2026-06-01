import { NextRequest } from 'next/server';
import { streamGiftThemes } from '@/lib/anthropic';
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
import type { GiftTheme } from '@/types';

// Ensure Next.js never statically optimises this route.
export const dynamic = 'force-dynamic';

const COUNT_MIN = 3;
const COUNT_MAX = 30;
const VALID_LEVELS = ['casual', 'interested', 'enthusiast'] as const;
const VALID_RELATEDNESS = ['similar', 'mixed', 'adventurous'] as const;
const MAX_VIBES = 2;
const TRENDS_TIMEOUT_MS = 2000;

type Level = (typeof VALID_LEVELS)[number];
type Relatedness = (typeof VALID_RELATEDNESS)[number];

function sseError(message: string): string {
  return `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(sseError('Invalid request body.'), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const recipient  = typeof body.recipient  === 'string' ? body.recipient.trim()  : '';
  const age        = typeof body.age        === 'string' ? body.age.trim()        : '';
  const occasion   = typeof body.occasion   === 'string' ? body.occasion.trim()   : '';
  const interests  = typeof body.interests  === 'string' ? body.interests.trim()  : '';

  if (!recipient || !age || !occasion) {
    return new Response(sseError('Recipient, age, and occasion are required.'), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const count = body.count;
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < COUNT_MIN ||
    count > COUNT_MAX
  ) {
    return new Response(
      sseError(`Invalid count. Must be an integer between ${COUNT_MIN} and ${COUNT_MAX}.`),
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const priceMin = body.priceMin;
  const priceMax = body.priceMax;
  if (
    typeof priceMin !== 'number' || !Number.isFinite(priceMin) ||
    typeof priceMax !== 'number' || !Number.isFinite(priceMax) ||
    priceMin < 0 || priceMax > 1500 || priceMin > priceMax
  ) {
    return new Response(sseError('Invalid price range.'), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const level = body.level;
  if (typeof level !== 'string' || !VALID_LEVELS.includes(level as Level)) {
    return new Response(sseError('Invalid level.'), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  let relatedness: Relatedness = 'adventurous';
  if (body.relatedness !== undefined) {
    if (
      typeof body.relatedness !== 'string' ||
      !VALID_RELATEDNESS.includes(body.relatedness as Relatedness)
    ) {
      return new Response(sseError('Invalid relatedness value.'), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    relatedness = body.relatedness as Relatedness;
  }

  let vibes: string[] | undefined;
  if (body.vibes !== undefined) {
    if (!Array.isArray(body.vibes)) {
      return new Response(sseError('Invalid vibes — must be an array.'), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    if (body.vibes.length > MAX_VIBES) {
      return new Response(sseError(`Too many vibes selected. Max ${MAX_VIBES}.`), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    if (!body.vibes.every((v) => typeof v === 'string' && AESTHETIC_VALUES.includes(v))) {
      return new Response(sseError('Invalid vibe value.'), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    vibes = body.vibes as string[];
  }

  // All validation passed — build the streaming response.
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // Cap trending wait at 2 s so Claude isn't delayed longer.
        const trendingPromise = getTrendingProducts({ recipient, occasion, interests, vibes });
        const trendingProducts = await Promise.race([
          trendingPromise,
          new Promise<string[]>((resolve) => setTimeout(() => resolve([]), TRENDS_TIMEOUT_MS)),
        ]);

        // Buffer 15% above requested count — images now load client-side so a
        // large buffer is unnecessary. Cap at 35.
        const bufferedCount = Math.min(35, Math.ceil(count * 1.15));

        const themes: GiftTheme[] = [];

        // Stream each theme to the client as Claude generates it.
        // First theme typically arrives within 5–10 s, so cards appear fast.
        for await (const theme of streamGiftThemes({
          recipient, age, occasion, interests,
          count: bufferedCount,
          priceMin, priceMax,
          level: level as Level,
          relatedness, vibes,
          trendingProducts,
        })) {
          themes.push(theme);
          emit({ type: 'theme', theme });
        }

        if (themes.length === 0) {
          emit({ type: 'error', message: 'No gift ideas could be generated. Please try again.' });
          controller.close();
          return;
        }

        // Build and emit the page slug so the client can show the preview link.
        const recipientPlural = pluralizeRecipient(recipient);
        const vibeLabel       = vibes?.[0] ? getAesthetic(vibes[0])?.label : undefined;
        const primaryInterest = extractPrimaryInterest(interests);
        const pageTitle       = buildPinTitle({ vibeLabel, occasion, recipientPlural, primaryInterest: primaryInterest ?? undefined });
        const pageSlug        = buildSlug(pageTitle);

        const pinImageUrl = `/api/pin?slug=${encodeURIComponent(pageSlug)}${vibes?.[0] ? `&vibe=${encodeURIComponent(vibes[0])}` : ''}`;
        emit({ type: 'done', pageSlug, pinImageUrl });

        // Fire-and-forget background writes — the stream is already closed from
        // the client's perspective so these don't affect perceived latency.
        savePageResult(pageSlug, {
          title: pageTitle, recipient, recipientPlural, occasion, age,
          vibeLabel, primaryInterest: primaryInterest ?? undefined,
          themes, createdAt: Date.now(),
        }).catch((err) => console.error('[route] page-results write failed:', err));

        addRecentSearch({ recipient, occasion, timestamp: Date.now() })
          .catch((err) => console.error('Failed to save recent search:', err));

      } catch (err) {
        console.error('Gift search error:', err);
        emit({ type: 'error', message: 'Something went wrong generating gift ideas. Please try again.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache, no-transform',
      'Connection':      'keep-alive',
      // Prevent nginx / Vercel edge from buffering the stream.
      'X-Accel-Buffering': 'no',
    },
  });
}
