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
import { MODEL } from '@/lib/models';
import type { GiftTheme } from '@/types';

// Ensure Next.js never statically optimises this route.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// A gift search streams for ~12-50s. Without this, the function inherits
// Vercel's short default timeout (~10-15s) and gets KILLED mid-stream before
// the first theme arrives — which surfaces as "Something went wrong" with no
// server error logged (a kill is not a catchable exception). 60s is the Hobby
// ceiling and ample for Haiku; raise to 300 on Pro if running Sonnet at count=30.
export const maxDuration = 60;

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
      // Guard every controller op: once the client disconnects (or the stream
      // closes), the controller is torn down and enqueue/close throw
      // ERR_INVALID_STATE ("failed to pipe response"). Track closed state and
      // no-op instead, so a disconnect can't crash the handler.
      let closed = false;
      const emit = (obj: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already torn down */ }
      };

      try {
        // Cap trending wait at 2 s so Claude isn't delayed longer.
        const trendingPromise = getTrendingProducts({ recipient, occasion, interests, vibes });
        const trendingProducts = await Promise.race([
          trendingPromise,
          new Promise<string[]>((resolve) => setTimeout(() => resolve([]), TRENDS_TIMEOUT_MS)),
        ]);

        // Generate a generous spare margin so image-lookup failures (and the
        // occasional under-filled/dropped theme) can be backfilled WITHOUT a
        // second model call. Generation is cheap (~output tokens only) and we
        // only image-lookup what we display, so extra gifts here cost almost
        // nothing. Cap at 50 to stay well under max_tokens.
        const bufferedCount = Math.min(50, count + Math.max(5, Math.ceil(count * 0.30)));

        const themes: GiftTheme[] = [];

        emit({ type: 'log', msg: `[model] haiku (${MODEL})` });

        // Heartbeat: emit a keep-alive log every 2s until the first theme
        // arrives. The first theme can take 3-12s to generate, during which we
        // otherwise send NO bytes to the client — and an idle streaming
        // response gets closed by the platform/proxy. These periodic events
        // keep the pipe active, and also reveal in the panel exactly how long
        // the wait actually is.
        const genStart = Date.now();
        let firstThemeAt = 0;
        const heartbeat = setInterval(() => {
          if (firstThemeAt) return;
          try {
            emit({ type: 'log', msg: `[wait] awaiting first theme — ${((Date.now() - genStart) / 1000).toFixed(0)}s` });
          } catch { /* controller already closed */ }
        }, 2000);

        // Stream each theme to the client as Claude generates it.
        try {
          for await (const theme of streamGiftThemes({
            recipient, age, occasion, interests,
            count: bufferedCount,
            priceMin, priceMax,
            level: level as Level,
            relatedness, vibes,
            trendingProducts,
            model: MODEL,
            onLog: (msg) => emit({ type: 'log', msg }),
          })) {
            if (!firstThemeAt) {
              firstThemeAt = Date.now();
              clearInterval(heartbeat);
              emit({ type: 'log', msg: `[anthropic] first theme after ${((firstThemeAt - genStart) / 1000).toFixed(1)}s` });
            }
            themes.push(theme);
            emit({ type: 'theme', theme });
          }
        } finally {
          clearInterval(heartbeat);
        }

        emit({ type: 'log', msg: `[anthropic] stream complete — ${themes.length} themes parsed` });

        if (themes.length === 0) {
          emit({ type: 'error', message: 'No gift ideas could be generated. Please try again.' });
          safeClose();
          return;
        }

        // Build and emit the page slug so the client can show the preview link.
        const recipientPlural = pluralizeRecipient(recipient);
        const vibeLabel       = vibes?.[0] ? getAesthetic(vibes[0])?.label : undefined;
        const primaryInterest = extractPrimaryInterest(interests);
        const pageTitle       = buildPinTitle({ vibeLabel, occasion, recipientPlural, primaryInterest: primaryInterest ?? undefined });
        // Append a short base-36 timestamp so every search produces a unique
        // slug and KV entry. Without this, re-running the same search overwrites
        // the previous page result, causing the public page and pin image to
        // show the new products while the wizard still shows the old ones.
        const pageSlug        = `${buildSlug(pageTitle)}-${Date.now().toString(36)}`;

        const pinImageUrl = `/api/pin?slug=${encodeURIComponent(pageSlug)}${vibes?.[0] ? `&vibe=${encodeURIComponent(vibes[0])}` : ''}`;
        emit({ type: 'done', pageSlug, pinImageUrl });

        // Fire-and-forget background writes — the stream is already closed from
        // the client's perspective so these don't affect perceived latency.
        savePageResult(pageSlug, {
          title: pageTitle, recipient, recipientPlural, occasion, age,
          vibeLabel, vibeSlug: vibes?.[0] ?? undefined,
          primaryInterest: primaryInterest ?? undefined,
          // Persist the exact-N contract + relatedness so the public page and
          // pin image apply the same selection the wizard grid does.
          themes, count, relatedness, createdAt: Date.now(),
        }).catch((err) => console.error('[route] page-results write failed:', err));

        addRecentSearch({ recipient, occasion, timestamp: Date.now() })
          .catch((err) => console.error('Failed to save recent search:', err));

      } catch (err) {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error('[api/search] generation error:', err);
        // Surface the real reason in the dev panel (a 'log' event), while the
        // user-facing banner stays friendly (the 'error' event).
        emit({ type: 'log', msg: `[error] ${detail}` });
        emit({ type: 'error', message: 'Something went wrong generating gift ideas. Please try again.' });
      } finally {
        safeClose();
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
