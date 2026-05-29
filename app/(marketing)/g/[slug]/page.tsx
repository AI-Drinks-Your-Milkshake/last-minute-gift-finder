// Public gift guide page — no auth required.
//
// URL pattern: /g/outdoorsy-graduation-gifts-for-teen-boys
//
// The slug is generated server-side in route.ts from the pin title formula
// and stored in KV alongside the full search results. This page reads from
// KV and renders the same gift grid the in-app results panel uses, wrapped
// in a minimal Strix chrome (nav + footer). No wizard, no sidebars — just
// the results, clean and shareable.
//
// This is the page a Pinterest pin would link to. Design is intentionally
// identical to the app's results panel so there's no new visual language
// to maintain — it's purely the existing GiftThemeSection grid + chrome.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPageResult } from '@/lib/page-results';
import GiftThemeSection from '@/components/GiftThemeSection';

interface Props {
  params: { slug: string };
}

// Generate <title> and OG tags from the stored page data.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPageResult(params.slug);
  if (!page) return { title: 'Gift Guide · Strix' };

  return {
    title: `${page.title} · Strix`,
    description: `Curated gift ideas: ${page.title}. AI-powered recommendations tailored to the recipient.`,
    openGraph: {
      title: page.title,
      description: `Curated gift ideas for ${page.recipient} — ${page.occasion}.`,
      type: 'website',
    },
  };
}

const C = {
  bg:        '#0d0d11',
  surface:   '#16161e',
  border:    '#22222e',
  accent:    '#e8724a',
  textPri:   '#f2f2f8',
  textSec:   '#8888a2',
  textMuted: '#44445a',
};

export default async function GiftGuidePage({ params }: Props) {
  const page = await getPageResult(params.slug);
  if (!page) notFound();

  const totalGifts = page.themes.reduce((acc, t) => acc + t.gifts.length, 0);

  return (
    <div
      style={{
        backgroundColor: C.bg,
        color: C.textPri,
        minHeight: '100vh',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 24px',
          borderBottom: `1px solid ${C.surface}`,
          backgroundColor: C.bg,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <a
          href="/"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: C.textPri,
            textDecoration: 'none',
          }}
        >
          <span style={{ color: C.accent }}>✦</span> Strix
        </a>
        <a
          href="/app"
          style={{
            fontSize: 12,
            color: C.textMuted,
            textDecoration: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: '4px 12px',
          }}
        >
          Find gifts →
        </a>
      </nav>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Page title block */}
        <div style={{ maxWidth: 720, marginBottom: 40 }}>
          <p
            style={{
              fontSize: 10,
              color: C.textMuted,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            Gift Guide
          </p>
          <h1
            style={{
              fontSize: 'clamp(26px, 4vw, 40px)',
              fontWeight: 500,
              color: C.textPri,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              margin: '0 0 12px',
            }}
          >
            {page.title}
          </h1>
          <p style={{ fontSize: 14, color: C.textSec, margin: 0, lineHeight: 1.5 }}>
            {page.occasion}
            {page.age ? ` · ${page.age}` : ''}
            {' · '}
            <span style={{ color: C.textMuted }}>{totalGifts} ideas</span>
          </p>
        </div>

        {/* Gift results — same component used in the app */}
        <div>
          {page.themes.map((theme) => (
            <GiftThemeSection key={theme.id} theme={theme} cols={4} />
          ))}
        </div>

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: `1px solid ${C.surface}`,
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
          Powered by Claude AI ·{' '}
          <a href="/app" style={{ color: C.textSec, textDecoration: 'none' }}>
            Find your own gift ideas at Strix
          </a>
          {' · '}
          Amazon links may include affiliate tags
        </p>
      </footer>
    </div>
  );
}
