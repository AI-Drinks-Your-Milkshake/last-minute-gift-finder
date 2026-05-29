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

// Best column count for a flatlay grid of N products. Pinterest pins
// are vertical (1000×1500), so we prefer cell-aspect close to square
// — meaning more rows than columns when count gets large.
function gridCols(count: number): number {
  if (count <= 2) return Math.max(count, 1);
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 12) return 4;
  return 5;
}

// Split products into "above title" and "below title" zones. Slight
// bias toward the bottom feels visually grounded — title → list flows
// downward.
function splitProducts<T>(products: T[]): { top: T[]; bottom: T[] } {
  const topCount = Math.floor(products.length * 0.4);
  return {
    top: products.slice(0, topCount),
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
      <ProductGrid products={top} placement="top" />

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
      <ProductGrid products={bottom} placement="bottom" />

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
}: {
  products: PinProduct[];
  placement: 'top' | 'bottom';
}) {
  if (products.length === 0) return <div />;

  const cols = gridCols(products.length);
  // Explicit row count lets gridTemplateRows distribute height evenly so
  // cells never overflow their allocated zone.
  const rows = Math.ceil(products.length / cols);

  return (
    <section
      style={{
        padding:
          placement === 'top'
            ? '44px 56px 28px'
            : '28px 56px 70px', // leaves room for the Strix watermark
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        // Each row gets an equal share of the available zone height.
        // Without this, `aspectRatio: 1/1` on cells can exceed row height
        // and push content out of the pin frame.
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 24,
        height: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {products.map((p, i) => (
        <ProductCell key={i} product={p} />
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
