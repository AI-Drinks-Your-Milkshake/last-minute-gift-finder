// Pinterest pin image generation endpoint.
//
// Renders a 1000×1500px JPEG suitable for Pinterest posting.
// Uses next/og (satori under the hood) — no Puppeteer or external
// browser needed. Runs on Vercel's Edge Runtime.
//
// URL pattern: /api/pin?slug=outdoorsy-fathers-day-gifts-for-dads
// Optional: &vibe=outdoorsy  (used as fallback if KV lookup misses)
//
// The slug is used to pull the stored StoredPageResult from KV, which
// gives us the title, occasion, vibe, and up to 6 product titles to
// render on the pin. Falls back gracefully to query-param values when
// KV is unavailable or the page hasn't been stored yet.

import { ImageResponse } from 'next/og';
import { getPageResult } from '@/lib/page-results';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

// ── Vibe color map ─────────────────────────────────────────────────────────
// Inlined so the edge function stays self-contained. Values mirror
// the cssOverrides in lib/aesthetics.ts.

type VibeColors = { bg: string; accent: string; text: string; textSoft: string };

const VIBE_COLORS: Record<string, VibeColors> = {
  'coquette':            { bg: '#FBE8EE', accent: '#E08CA1', text: '#4A2540', textSoft: '#8C5C75' },
  'cozy':                { bg: '#F4ECD8', accent: '#E8A85C', text: '#3A2E1F', textSoft: '#7A6852' },
  'dark-academia':       { bg: '#3A2F2A', accent: '#A04848', text: '#E8D9C0', textSoft: '#A89B86' },
  'cottagecore':         { bg: '#E8EFE2', accent: '#7B8E69', text: '#2F3D26', textSoft: '#6B7A5E' },
  'aesthetic':           { bg: '#F2EEE9', accent: '#E8724A', text: '#1F1F2A', textSoft: '#6F6F80' },
  'outdoorsy':           { bg: '#E5E8DD', accent: '#3F6B4A', text: '#1F2D1A', textSoft: '#536855' },
  'boho':                { bg: '#EDDFD0', accent: '#C8895F', text: '#3D2A1A', textSoft: '#7A604A' },
  'preppy':              { bg: '#F5F1E8', accent: '#1E3A5F', text: '#0F1F33', textSoft: '#5F6B7A' },
  'y2k':                 { bg: '#FFDDF1', accent: '#FF4FB4', text: '#3D0A2A', textSoft: '#8C4A75' },
  'sporty':              { bg: '#E5EEF8', accent: '#3D7DCC', text: '#0F1E33', textSoft: '#5A6E85' },
  'afrobohemian':        { bg: '#F4E5C8', accent: '#D4A14A', text: '#3D2A0F', textSoft: '#7A6442' },
  'lace':                { bg: '#F9E9E5', accent: '#C9A1A1', text: '#3D2522', textSoft: '#85605C' },
  'snail-mail':          { bg: '#F5EDD9', accent: '#A89060', text: '#3D2F14', textSoft: '#85714A' },
  'grandma-classic':     { bg: '#F0E8F2', accent: '#9A7DA8', text: '#2F1F33', textSoft: '#6B5A75' },
  'gamer-aesthetic':     { bg: '#1F1F33', accent: '#A050E0', text: '#E8E0F2', textSoft: '#9A85B5' },
  'coastal-grandmother': { bg: '#E8F0F2', accent: '#6892AE', text: '#1A2E33', textSoft: '#5A7585' },
};

const DEFAULT_COLORS: VibeColors = { bg: '#F2EEE9', accent: '#E8724A', text: '#1F1F2A', textSoft: '#6F6F80' };

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug    = searchParams.get('slug') ?? '';
  const vibeKey = searchParams.get('vibe') ?? '';

  // Pull stored page data from KV — gives us the real title and product list.
  const page = slug ? await getPageResult(slug) : null;

  const title    = page?.title    ?? searchParams.get('title')    ?? 'Gift Guide';
  const occasion = page?.occasion ?? searchParams.get('occasion') ?? '';
  const vibeLabel = page?.vibeLabel ?? (vibeKey ? vibeKey.charAt(0).toUpperCase() + vibeKey.slice(1).replace(/-/g, ' ') : '');

  // Collect up to 6 product titles across all themes.
  const products: string[] = [];
  if (page?.themes) {
    for (const theme of page.themes) {
      for (const gift of theme.gifts) {
        if (products.length < 6) products.push(gift.title);
        else break;
      }
      if (products.length >= 6) break;
    }
  }

  const c = VIBE_COLORS[vibeKey] ?? DEFAULT_COLORS;
  const titleSize = title.length > 50 ? 54 : title.length > 35 ? 64 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: c.bg,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* ── Header band ── */}
        <div
          style={{
            backgroundColor: c.accent,
            padding: '36px 52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#fff', fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
            ✦ Strix
          </span>
          {vibeLabel ? (
            <span
              style={{
                color: '#fff',
                fontSize: 20,
                fontWeight: 500,
                backgroundColor: 'rgba(0,0,0,0.18)',
                borderRadius: 24,
                padding: '8px 22px',
                letterSpacing: '0.01em',
              }}
            >
              {vibeLabel}
            </span>
          ) : null}
        </div>

        {/* ── Title zone ── */}
        <div style={{ padding: '56px 52px 36px', display: 'flex', flexDirection: 'column' }}>
          {occasion ? (
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: c.accent,
                marginBottom: 20,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {occasion}
            </p>
          ) : null}
          <h1
            style={{
              fontSize: titleSize,
              fontWeight: 800,
              color: c.text,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            {title}
          </h1>
        </div>

        {/* ── Product list ── */}
        {products.length > 0 ? (
          <div
            style={{
              flex: 1,
              padding: '0 52px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {products.map((name, i) => (
              <div
                key={i}
                style={{
                  backgroundColor:
                    c.bg === '#1F1F33'
                      ? 'rgba(255,255,255,0.07)'
                      : 'rgba(0,0,0,0.05)',
                  borderRadius: 18,
                  padding: '18px 28px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: c.accent,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 22, color: c.text, fontWeight: 500, lineHeight: 1.2 }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* ── Footer CTA ── */}
        <div
          style={{
            backgroundColor: c.accent,
            padding: '36px 52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#fff', fontSize: 26, fontWeight: 600 }}>
            See all picks →
          </span>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 22 }}>
            strix.com
          </span>
        </div>
      </div>
    ),
    { width: 1000, height: 1500 },
  );
}
