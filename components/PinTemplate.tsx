// PinTemplate — renders one 1000×1500 Pinterest pin.
//
// Pure presentation component. Takes the title, an eyebrow string,
// a vibe slug (looked up in AESTHETICS for theming), and a flat list
// of products. No knowledge of SearchConfig or static-guide pipeline —
// the wizard's PinPreview wrapper does all the data shaping.
//
// Layout (top → bottom):
//   • Top product zone (~40% of remaining height): first ~40% of products
//   • Title band (auto): eyebrow + centered title in vibe display font
//   • Bottom product zone (~60% of remaining): remaining products
//   • Strix mark in bottom-right (small, low opacity)
//
// Theming: the active vibe's `cssOverrides` are inlined as CSS custom
// properties on the [data-pin-root] element. The template reads only
// from CSS variables.

import type { PinProduct } from '@/types';
import { getAesthetic } from '@/lib/aesthetics';

interface Props {
  title: string;                // e.g. "Coquette Birthday Gifts for Teen Girls"
  eyebrow?: string;             // e.g. "BIRTHDAY · TEEN GIRL" — already uppercased
  vibe?: string;                // slug from AESTHETICS, or undefined for default
  products: PinProduct[];
}

const PIN_WIDTH = 1000;
const PIN_HEIGHT = 1500;

// ── Justified-row layout ──────────────────────────────────────────────────
// Every row fills the full zone width. Items within a row share the same
// height, but heights vary row-to-row based on the aspect ratios of the
// items it contains — the "Flickr / justified gallery" look.
//
// Algorithm:
//   Pass 1 — greedy grouping: add items to a row until the next item would
//             overflow ZONE_W at TARGET_ROW_H.
//   Pass 2 — per-row height: solve h·ΣAR + (n−1)·gap = ZONE_W.
//             Items then have width = h·AR_i, summing to exactly ZONE_W.

const ZONE_W      = PIN_WIDTH - 112;  // 888px (56px side padding each side)
const ROW_GAP     = 4;               // px between rows and between items
const TARGET_ROW_H = 160;            // guide height for the grouping pass only

// Deterministic aspect ratios (width ÷ height). Prime length (13) so the
// pattern never aligns with common items-per-row counts (2–6).
const ITEM_ASPECTS = [1.0, 0.75, 1.33, 0.67, 1.2, 0.8, 1.5, 1.0, 0.67, 1.33, 0.75, 1.0, 0.9];

interface RowSpec {
  items: PinProduct[];
  height: number;   // exact px — all rows fill ZONE_W
  widths: number[]; // px per item, proportional to aspect ratio
}

// indexOffset threads the aspect pattern across zones so top and bottom
// halves don't accidentally start with the same sequence.
function buildJustifiedRows(products: PinProduct[], indexOffset: number): RowSpec[] {
  const rows: RowSpec[] = [];
  let i = 0;
  while (i < products.length) {
    let j = i;
    let sumAr = 0;
    while (j < products.length) {
      const ar = ITEM_ASPECTS[(indexOffset + j) % ITEM_ASPECTS.length];
      const n = j - i + 1;
      if ((sumAr + ar) * TARGET_ROW_H + (n - 1) * ROW_GAP > ZONE_W && j > i) break;
      sumAr += ar;
      j++;
    }
    const n      = j - i;
    const h      = (ZONE_W - (n - 1) * ROW_GAP) / sumAr;
    const availW = ZONE_W - (n - 1) * ROW_GAP;
    rows.push({
      items:  products.slice(i, j),
      height: h,
      widths: Array.from({ length: n }, (_, k) =>
        (ITEM_ASPECTS[(indexOffset + i + k) % ITEM_ASPECTS.length] / sumAr) * availW,
      ),
    });
    i = j;
  }
  return rows;
}

// Split products into "above title" and "below title" zones.
function splitProducts<T>(products: T[]): { top: T[]; bottom: T[] } {
  const topCount = Math.floor(products.length * 0.4);
  return {
    top:    products.slice(0, topCount),
    bottom: products.slice(topCount),
  };
}

export default function PinTemplate({ title, eyebrow, vibe, products }: Props) {
  const aesthetic = vibe ? getAesthetic(vibe) : undefined;
  const { top, bottom } = splitProducts(products);

  // Inline CSS custom properties from the vibe overlay. React typings
  // don't model custom properties, so cast through CSSProperties.
  const vibeStyle: React.CSSProperties = {
    ...(aesthetic?.cssOverrides as React.CSSProperties),
  };

  return (
    <div
      data-pin-root
      data-vibe={vibe ?? 'broad'}
      style={{
        width: PIN_WIDTH,
        height: PIN_HEIGHT,
        // Default is dark so white product-image cards pop against it.
        // Vibe cssOverrides replace --pin-bg / --pin-text / --pin-text-soft
        // with their own palette (light vibes → pastel bg + dark text,
        // dark vibes → deep bg + light text). White tiles work in both cases.
        backgroundColor: 'var(--pin-bg, #16161e)',
        color: 'var(--pin-text, #f0f0f8)',
        fontFamily: 'inherit',
        display: 'grid',
        gridTemplateRows: '1fr auto 1.05fr',
        overflow: 'hidden',
        position: 'relative',
        ...vibeStyle,
      }}
    >
      {/* ── Top product zone ───────────────────────────────── */}
      <ProductGrid products={top} placement="top" indexOffset={0} />

      {/* ── Title band (vertically centered) ───────────────── */}
      <section
        style={{
          padding: '24px 56px',
          textAlign: 'center',
          // Colored band separates the product zones visually.
          // --pin-band-bg lets individual vibes override the band color;
          // falls back to --pin-accent, then a semi-transparent dark overlay
          // that reads on both light and dark --pin-bg values.
          backgroundColor: 'var(--pin-band-bg, var(--pin-accent, rgba(0,0,0,0.35)))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {eyebrow && (
          <p
            style={{
              margin: 0,
              fontSize: 17,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: 'var(--pin-text-soft, rgba(255,255,255,0.55))',
              fontWeight: 600,
            }}
          >
            {eyebrow}
          </p>
        )}

        <h1
          style={{
            margin: eyebrow ? '14px auto 0' : '0 auto',
            fontFamily: 'var(--font-display, inherit)',
            fontSize: 60,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.015em',
            color: 'var(--pin-text, #f0f0f8)',
            textAlign: 'center',
            maxWidth: '90%',
          }}
        >
          {title}
        </h1>
      </section>

      {/* ── Bottom product zone ────────────────────────────── */}
      <ProductGrid products={bottom} placement="bottom" indexOffset={top.length} />

      {/* ── Strix watermark ───────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          right: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'var(--pin-text-soft, rgba(255,255,255,0.4))',
          opacity: 0.7,
        }}
      >
        <span style={{ color: 'var(--pin-accent, var(--accent))' }}>✦</span>
        <span>strix.com</span>
      </div>
    </div>
  );
}

function ProductGrid({
  products,
  placement,
  indexOffset,
}: {
  products: PinProduct[];
  placement: 'top' | 'bottom';
  indexOffset: number;
}) {
  if (products.length === 0) return <div />;

  const rows = buildJustifiedRows(products, indexOffset);

  return (
    <section
      style={{
        padding:
          placement === 'top'
            ? '44px 56px 28px'
            : '28px 56px 70px', // bottom padding leaves room for the Strix watermark
        display: 'flex',
        flexDirection: 'column',
        gap: ROW_GAP,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            gap: ROW_GAP,
            height: row.height,
            flexShrink: 0,
          }}
        >
          {row.items.map((product, ii) => (
            <div
              key={ii}
              style={{
                width: row.widths[ii],
                height: '100%',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              <ProductCell product={product} />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function ProductCell({ product }: { product: PinProduct }) {
  const hasImage = Boolean(product.imageUrl);

  return (
    // No card background — products float directly on the pin's --pin-bg.
    // Images cut out against the background; text uses --pin-text so it
    // remains readable on both light and dark vibe backgrounds.
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 12px 10px',
        boxSizing: 'border-box',
      }}
    >
      {/* Image area fills available height; no fixed aspectRatio so it never
          overflows the grid row. */}
      <div
        style={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl as string}
            alt={product.title}
            style={{
              maxWidth: '92%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <PlaceholderBlob />
        )}
      </div>

      {/* Text uses --pin-text so it reads on whatever vibe background is behind it. */}
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 13,
          lineHeight: 1.25,
          textAlign: 'center',
          color: 'var(--pin-text, #f0f0f8)',
          fontWeight: 500,
          maxWidth: '95%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          flexShrink: 0,
        }}
      >
        {product.title}
      </p>
    </div>
  );
}

// Soft rounded blob shown when a product has no image yet.
function PlaceholderBlob() {
  return (
    <div
      style={{
        width: '78%',
        aspectRatio: '1 / 1',
        borderRadius: '40% 60% 55% 45% / 50% 45% 55% 50%',
        background:
          'radial-gradient(circle at 35% 30%, var(--pin-accent, var(--accent)) 0%, var(--accent-strong, var(--pin-accent, var(--accent))) 100%)',
        opacity: 0.55,
        boxShadow: '0 8px 18px rgba(0,0,0,0.08)',
      }}
    />
  );
}
