// PinTemplate — renders one 1000×1500 Pinterest pin for a SearchConfig.
//
// Design philosophy: Pinterest pins live in their own visual context,
// distinct from the dark Strix app. Reference research (May 2026) shows
// the dominant format for teen-girl / aesthetic gift-guide pins is a
// soft tinted background with a dense product flatlay AROUND a title
// that sits in the vertical middle of the canvas. We match that — the
// title is the visual anchor, products frame it top and bottom.
//
// Layout (top → bottom):
//   • Top product zone (~37%): first ~40% of products in a grid
//   • Title band (~26%): eyebrow + centered title in vibe display font
//   • Bottom product zone (~37%): remaining products
//   • Strix mark in bottom-right (small, low opacity)
//
// Theming: the active vibe's `cssOverrides` are inlined as CSS custom
// properties on the [data-pin-root] element. The template reads only
// from CSS variables.
//
// Server component — no hooks, no hydration. Puppeteer targets the
// [data-pin-root] element via element-screenshot.

import type { SearchConfig, PinProduct } from '@/types';
import { getAesthetic } from '@/lib/aesthetics';
import { getDemographic } from '@/lib/demographics';

interface Props {
  config: SearchConfig;
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
// bias toward the bottom feels more visually grounded — the eye reads
// title → products below as the actionable list. Floor-on-top puts
// fewer items in the top zone, more in the bottom.
function splitProducts<T>(products: T[]): { top: T[]; bottom: T[] } {
  const topCount = Math.floor(products.length * 0.4);
  return {
    top: products.slice(0, topCount),
    bottom: products.slice(topCount),
  };
}

export default function PinTemplate({ config, products }: Props) {
  const vibe = config.vibe ? getAesthetic(config.vibe) : undefined;
  const demo = getDemographic(config.demographic);
  const { top, bottom } = splitProducts(products);

  // Inline CSS custom properties from the vibe overlay. React typings
  // don't model custom properties, so cast through CSSProperties.
  const vibeStyle: React.CSSProperties = {
    ...(vibe?.cssOverrides as React.CSSProperties),
  };

  return (
    <div
      data-pin-root
      data-vibe={config.vibe ?? 'broad'}
      style={{
        width: PIN_WIDTH,
        height: PIN_HEIGHT,
        backgroundColor: 'var(--pin-bg, #f0eee5)',
        color: 'var(--pin-text, #1f1f2a)',
        fontFamily: 'inherit',
        display: 'grid',
        // Three vertical zones. Title gets `auto` height so it sizes
        // to content; the two product zones share the remainder.
        // Bottom zone gets a slight bias (1.05) — eye reads the title
        // as anchored to the upper-middle rather than dead-center,
        // which feels more intentional.
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
          // Two subtle hairlines anchor the title between the product
          // zones without competing with the typography. Muted text
          // color keeps them quiet relative to the vibe accent.
          borderTop: '1px solid var(--pin-text-soft, #6a6a7a)',
          borderBottom: '1px solid var(--pin-text-soft, #6a6a7a)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 17,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--pin-text-soft, #6a6a7a)',
            fontWeight: 600,
          }}
        >
          {config.occasion}
          {demo && (
            <>
              {' '}<span style={{ opacity: 0.5 }}>·</span>{' '}
              {demo.label.replace(/\s*\(.*\)\s*/, '')}
            </>
          )}
        </p>

        <h1
          style={{
            margin: '14px auto 0',
            fontFamily: 'var(--font-display, inherit)',
            fontSize: 60,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.015em',
            color: 'var(--pin-text, #1f1f2a)',
            textAlign: 'center',
            maxWidth: '90%',
          }}
        >
          {config.title}
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
          color: 'var(--pin-text-soft, #6a6a7a)',
          opacity: 0.7,
        }}
      >
        <span style={{ color: 'var(--pin-accent, var(--accent))' }}>✦</span>
        <span>strix.com</span>
      </div>
    </div>
  );
}

// One product zone — top or bottom of the title. Both zones use the
// same column algorithm, but the bottom zone reserves space at the
// right edge for the Strix watermark so products don't overlap it.
function ProductGrid({
  products,
  placement,
}: {
  products: PinProduct[];
  placement: 'top' | 'bottom';
}) {
  if (products.length === 0) return <div />;

  const cols = gridCols(products.length);

  return (
    <section
      style={{
        padding:
          placement === 'top'
            ? '44px 56px 28px'
            : '28px 56px 70px', // bottom padding leaves room for Strix mark
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 24,
        alignContent: 'center',
      }}
    >
      {products.map((p, i) => (
        <ProductCell key={i} product={p} />
      ))}
    </section>
  );
}

// Product cell — image when present, otherwise a tinted blob with the
// product name as small caption. No rectangular card chrome — products
// float on the soft pin background, matching the flatlay reference look.
function ProductCell({ product }: { product: PinProduct }) {
  const hasImage = Boolean(product.imageUrl);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 10,
        minHeight: 0, // grid track flex fix
      }}
    >
      <div
        style={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          aspectRatio: '1 / 1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl as string}
            alt={product.title}
            style={{
              maxWidth: '92%',
              maxHeight: '92%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.08))',
            }}
          />
        ) : (
          <PlaceholderBlob />
        )}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.25,
          textAlign: 'center',
          color: 'var(--pin-text-soft, #6a6a7a)',
          fontWeight: 500,
          maxWidth: '92%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {product.title}
      </p>
    </div>
  );
}

// Placeholder for products without a real image yet. Soft rounded blob
// in the vibe accent color, slightly darker than the pin background.
// Reads as "product silhouette" rather than "missing data".
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
