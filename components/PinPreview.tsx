// PinPreview — wraps PinTemplate with the data shaping needed to turn
// live wizard state into a Pinterest pin render.
//
// Inputs are the same primitives the wizard already has (recipient,
// age, occasion, vibes, themes). The component derives the pin's
// title, eyebrow, and flat product list, then renders PinTemplate
// scaled down to fit inside the results page.
//
// This is the iteration tool: every search regenerates the preview,
// so Jason can stress-test the pin layout across vibes, demographics,
// and occasions just by running the wizard.

'use client';

import { useState } from 'react';
import type { GiftTheme, PinProduct } from '@/types';
import { getAesthetic } from '@/lib/aesthetics';
import PinTemplate from './PinTemplate';

interface Props {
  recipient: string;     // wizard `recipient` (e.g. "Teen Girl")
  occasion: string;      // wizard `occasion` (e.g. "Birthday")
  vibes: string[];       // wizard `vibes` — 0, 1, or 2 entries
  themes: GiftTheme[];   // current visible themes from the wizard
  // How wide to render the preview (px). Pin is natively 1000×1500;
  // we scale it to this width. 400px ≈ 0.4 scale, fits comfortably
  // alongside results.
  targetWidth?: number;
  // When true, omits the outer section wrapper and collapse toggle —
  // intended for use inside a dedicated right-column panel where the
  // column itself provides the visual container.
  minimal?: boolean;
}

const NATIVE_WIDTH = 1000;
const NATIVE_HEIGHT = 1500;
const MAX_PRODUCTS = 20;  // cap for the pin grid

// Special-case plurals for recipients that don't take a naive "+s".
// Keep this short — list grows organically as edge cases turn up.
const PLURAL_OVERRIDES: Record<string, string> = {
  Wife: 'Wives',
  Boss: 'Bosses',
  'Mother-in-law': 'Mothers-in-law',
  'Father-in-law': 'Fathers-in-law',
  'Sister-in-law': 'Sisters-in-law',
  'Brother-in-law': 'Brothers-in-law',
  'Fiancé(e)': 'Fiancés',
  Child: 'Children',
  Stepchild: 'Stepchildren',
};

// Strip parentheticals ("Kid (5–8)" → "Kid") then pluralize. Used for
// the pin title; the eyebrow uses the raw recipient string.
function pluralize(recipient: string): string {
  const base = recipient.replace(/\s*\([^)]*\)\s*/g, '').trim();
  if (PLURAL_OVERRIDES[base]) return PLURAL_OVERRIDES[base];
  if (base.endsWith('s')) return base;
  if (base.endsWith('y') && !'aeiou'.includes(base[base.length - 2])) {
    return base.slice(0, -1) + 'ies';
  }
  return base + 's';
}

// Flatten the wizard's themed structure into a single PinProduct list.
// Themes preserve order (direct → adjacent → exploratory), so the most
// on-topic products end up at the top of the pin grid.
function themesToProducts(themes: GiftTheme[]): PinProduct[] {
  const flat: PinProduct[] = [];
  for (const t of themes) {
    for (const g of t.gifts) {
      flat.push({
        title: g.title,
        priceRange: g.priceRange,
        imageUrl: g.imageUrl,
      });
      if (flat.length >= MAX_PRODUCTS) return flat;
    }
  }
  return flat;
}

export default function PinPreview({
  recipient,
  occasion,
  vibes,
  themes,
  targetWidth = 400,
  minimal = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // First selected vibe drives the theme (CSS overrides + display font).
  // Multi-vibe gifts blend semantically in the LLM prompt, but visually
  // the pin can only carry one vibe identity.
  const vibeSlug = vibes[0];
  const vibe = vibeSlug ? getAesthetic(vibeSlug) : undefined;

  const vibeLabel = vibe?.label;
  const recipientPlural = pluralize(recipient);

  // Title formula. Vibe present: "Coquette Birthday Gifts for Teen Girls".
  // Vibe absent: "Birthday Gifts for Teen Girls" (broad).
  const title = vibeLabel
    ? `${vibeLabel} ${occasion} Gifts for ${recipientPlural}`
    : `${occasion} Gifts for ${recipientPlural}`;

  const eyebrow = `${occasion} · ${recipient}`;

  const products = themesToProducts(themes);

  const scale = targetWidth / NATIVE_WIDTH;
  const scaledHeight = NATIVE_HEIGHT * scale;

  // ── Minimal / column layout ────────────────────────────────────────────
  // Used when the pin is rendered in a dedicated right-column panel.
  // No outer wrapper, no collapse toggle — just the status line + canvas.
  if (minimal) {
    return (
      <>
        <p style={{ fontSize: 12, color: '#8888a2', marginBottom: 12, lineHeight: 1.5 }}>
          {products.length > 0
            ? `${products.length} of ${MAX_PRODUCTS} slots filled · scaled to ${Math.round(scale * 100)}%`
            : 'No gifts yet — run a search to populate the pin.'}
        </p>
        {products.length > 0 && (
          <div
            style={{
              width: targetWidth,
              height: scaledHeight,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                width: NATIVE_WIDTH,
                height: NATIVE_HEIGHT,
              }}
            >
              <PinTemplate
                title={title}
                eyebrow={eyebrow}
                vibe={vibeSlug}
                products={products}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <section
      style={{
        marginBottom: 32,
        padding: '20px',
        background: '#16161e',
        border: '1px solid #22222e',
        borderRadius: 16,
      }}
    >
      {/* Header: label + collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: collapsed ? 0 : 16,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 10,
              color: '#44445a',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
              fontWeight: 600,
            }}
          >
            Pin preview
          </p>
          <p style={{ fontSize: 13, color: '#8888a2' }}>
            {products.length > 0
              ? `${products.length} of ${MAX_PRODUCTS} slots filled · scaled to ${Math.round(scale * 100)}%`
              : 'No gifts yet — run a search to populate the pin.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: 'transparent',
            border: '1px solid #22222e',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            color: '#8888a2',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {/* Scaled pin canvas */}
      {!collapsed && products.length > 0 && (
        <div
          style={{
            // Outer wrapper holds the scaled-down space so the rest of
            // the page lays out correctly; inner div renders at native
            // resolution and is shrunk via transform.
            width: targetWidth,
            height: scaledHeight,
            overflow: 'hidden',
            position: 'relative',
            margin: '0 auto',
            // Subtle drop shadow gives the pin presence on the dark
            // wizard surface without competing with its own styling.
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: NATIVE_WIDTH,
              height: NATIVE_HEIGHT,
            }}
          >
            <PinTemplate
              title={title}
              eyebrow={eyebrow}
              vibe={vibeSlug}
              products={products}
            />
          </div>
        </div>
      )}
    </section>
  );
}
