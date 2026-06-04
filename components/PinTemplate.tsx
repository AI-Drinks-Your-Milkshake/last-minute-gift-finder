// PinTemplate — renders one 1000×1500 Pinterest pin.
//
// Pure presentation component. Takes the title, a vibe slug (looked up
// in AESTHETICS for theming), and a flat list of products. No knowledge
// of SearchConfig or static-guide pipeline — the wizard's PinPreview
// wrapper does all the data shaping.
//
// Layout (top → bottom):
//   • Top product zone (≈ half remaining height) — white background,
//     items packed into a 5-column brick-staggered grid.
//   • Title band (~160px) — colored background driven by the active
//     vibe, just the page title (no eyebrow).
//   • Bottom product zone (≈ half remaining height) — same brick grid,
//     continuing the aspect-ratio sequence from the top.
//   • No brand watermark — pins are left unbranded.
//
// Theming: the active vibe's `cssOverrides` are inlined as CSS custom
// properties on the [data-pin-root] element. Product zones are always
// white (cutout product photos read against white reliably across all
// vibes), so vibe colors only affect the title band, accents, and the
// optional `--pin-band-bg` / `--pin-accent` fallbacks the band reads.

import type { PinProduct } from '@/types';
import { getAesthetic } from '@/lib/aesthetics';

interface Props {
  title:   string;            // e.g. "Coquette Birthday Gifts for Teen Girls"
  /** Eyebrow text. Currently unrendered — kept in the interface so callers
   *  don't break, but the pin no longer shows an eyebrow above the title. */
  eyebrow?: string;
  vibe?:   string;            // slug from AESTHETICS, or undefined for default
  products: PinProduct[];
}

const PIN_WIDTH  = 1000;
const PIN_HEIGHT = 1500;

// ── Brick-staggered grid layout ──────────────────────────────────────────
// Items are distributed round-robin across NUM_COLUMNS so every column
// gets the same item count. Alternating columns are offset downward by
// COL_OFFSET pixels, creating a subtle brick stagger — the columns no
// longer all start at the same y, which is what makes a Pinterest board
// read as a puzzle rather than a grid.
//
// Each column's image heights are then scaled so the column total +
// captions + gaps fills the (zone height − max column offset) exactly.
// All columns share the same effective inner height, so items are
// roughly uniform in size across columns; the stagger comes purely
// from each column's starting y-offset.

const NUM_COLUMNS   = 5;
const ZONE_SIDE_PAD = 20;
const ZONE_PAD_V    = 8;
const GRID_GAP      = 5;
const CAPTION_H     = 26;   // 2 lines at ~11px font + small bottom padding

// Alternating brick offset: cols 1 and 3 start ~30px below cols 0/2/4.
// Subtle enough to feel organic but big enough to read as stagger.
const COL_OFFSETS = [0, 30, 0, 30, 0];
const MAX_COL_OFFSET = Math.max(...COL_OFFSETS);

const ZONE_W = PIN_WIDTH - 2 * ZONE_SIDE_PAD;
const COL_W  = (ZONE_W - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

// Title-band height — title only, no eyebrow. Sized to fit a 2-line h1
// + tight padding. Shorter than the previous 220px band, giving each
// product zone an extra ~30px of vertical room.
const BAND_H = 160;

// Reserve a small strip at the very bottom of the bottom zone as breathing
// room so products never sit flush against the pin's bottom edge.
const WATERMARK_RESERVED = 36;

const ZONE_OUTER_H    = (PIN_HEIGHT - BAND_H) / 2;
const TOP_ZONE_INNER  = ZONE_OUTER_H - 2 * ZONE_PAD_V;
const BOT_ZONE_INNER  = ZONE_OUTER_H - ZONE_PAD_V - WATERMARK_RESERVED;

// Low-variance aspect ratios (height ÷ width). Length 11 (prime) so the
// pattern never aligns with NUM_COLUMNS. The per-column scaler will adjust
// these so the column fills the available height; these values just set
// the relative size ratios between items within each column.
const ITEM_ASPECTS = [0.85, 0.92, 0.78, 1.0, 0.82, 0.88, 0.95, 0.8, 0.9, 0.83, 0.97];

// White zones — hardcoded so vibe overrides can't accidentally repaint them.
// Cutout product photos rely on the contrast against white.
const PRODUCT_ZONE_BG    = '#FFFFFF';
const PRODUCT_TEXT_COLOR = '#1F1F2A';

interface CellData {
  product: PinProduct;
  imgH:    number;   // image area height in px, after per-column scaling
}

interface ColumnData {
  items:     CellData[];
  offsetTop: number;
}

function packBricks(
  products: PinProduct[],
  indexOffset: number,
  zoneInnerH: number,
): ColumnData[] {
  if (products.length === 0) {
    return Array.from({ length: NUM_COLUMNS }, () => ({ items: [], offsetTop: 0 }));
  }

  // Round-robin distribute — keeps column item counts within ±1 of each
  // other so the per-column scaler produces items of similar sizes.
  const buckets: { product: PinProduct; aspect: number }[][] =
    Array.from({ length: NUM_COLUMNS }, () => []);

  products.forEach((product, i) => {
    const aspect = ITEM_ASPECTS[(indexOffset + i) % ITEM_ASPECTS.length];
    buckets[i % NUM_COLUMNS].push({ product, aspect });
  });

  // All columns share the same effective vertical content area
  // (zoneInnerH − MAX_COL_OFFSET) so item sizes stay consistent across
  // columns even though each column starts at a different y.
  const sharedAvail = zoneInnerH - MAX_COL_OFFSET;

  return buckets.map((items, colIdx) => {
    if (items.length === 0) return { items: [], offsetTop: COL_OFFSETS[colIdx] };
    const naturalImgH = items.reduce((sum, x) => sum + COL_W * x.aspect, 0);
    const overhead    = items.length * CAPTION_H + Math.max(0, items.length - 1) * GRID_GAP;
    const availImgH   = Math.max(50, sharedAvail - overhead);
    const scale       = availImgH / naturalImgH;
    return {
      items: items.map(({ product, aspect }) => ({
        product,
        imgH: COL_W * aspect * scale,
      })),
      offsetTop: COL_OFFSETS[colIdx],
    };
  });
}

// 50/50 split. Pairs with NUM_COLUMNS=5 and 30 products to give exactly
// 3 items per column in each zone — clean rows for the brick stagger.
function splitProducts<T>(products: T[]): { top: T[]; bottom: T[] } {
  const topCount = Math.ceil(products.length / 2);
  return {
    top:    products.slice(0, topCount),
    bottom: products.slice(topCount),
  };
}

export default function PinTemplate({ title, vibe, products }: Props) {
  const aesthetic = vibe ? getAesthetic(vibe) : undefined;
  const { top, bottom } = splitProducts(products);

  // Inline CSS custom properties from the vibe overlay. React typings don't
  // model custom properties, so cast through CSSProperties.
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
        // Pin root is white so product zones inherit it. The title band paints
        // its own colored background on top, taking the vibe's accent or
        // explicit --pin-band-bg / --pin-bg as the fallback chain.
        backgroundColor: PRODUCT_ZONE_BG,
        color: PRODUCT_TEXT_COLOR,
        fontFamily: 'inherit',
        display: 'grid',
        gridTemplateRows: `${ZONE_OUTER_H}px ${BAND_H}px ${ZONE_OUTER_H}px`,
        overflow: 'hidden',
        position: 'relative',
        ...vibeStyle,
      }}
    >
      {/* ── Top product zone ───────────────────────────────── */}
      <ProductGrid products={top} placement="top" indexOffset={0} zoneInnerH={TOP_ZONE_INNER} />

      {/* ── Title band ─────────────────────────────────────── */}
      <section
        style={{
          padding: '20px 56px',
          textAlign: 'center',
          // Colored band separates the product zones visually. The band keeps
          // its colored background even though product zones are white —
          // --pin-band-bg lets vibes override; falls back to --pin-accent,
          // then --pin-bg, then a dark overlay.
          backgroundColor:
            'var(--pin-band-bg, var(--pin-accent, var(--pin-bg, rgba(0,0,0,0.35))))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: BAND_H,
          boxSizing: 'border-box',
        }}
      >
        <h1
          style={{
            margin: '0 auto',
            fontFamily: 'var(--font-display, inherit)',
            fontSize: 54,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: '-0.015em',
            color: 'var(--pin-text, #f0f0f8)',
            textAlign: 'center',
            maxWidth: '94%',
          }}
        >
          {title}
        </h1>
      </section>

      {/* ── Bottom product zone ───────────────────────────── */}
      <ProductGrid products={bottom} placement="bottom" indexOffset={top.length} zoneInnerH={BOT_ZONE_INNER} />

    </div>
  );
}

function ProductGrid({
  products,
  placement,
  indexOffset,
  zoneInnerH,
}: {
  products:    PinProduct[];
  placement:   'top' | 'bottom';
  indexOffset: number;
  zoneInnerH:  number;
}) {
  if (products.length === 0) {
    return <div style={{ backgroundColor: PRODUCT_ZONE_BG }} />;
  }

  const columns = packBricks(products, indexOffset, zoneInnerH);

  return (
    <section
      style={{
        backgroundColor: PRODUCT_ZONE_BG,
        padding: placement === 'top'
          ? `${ZONE_PAD_V}px ${ZONE_SIDE_PAD}px ${ZONE_PAD_V}px`
          : `${ZONE_PAD_V}px ${ZONE_SIDE_PAD}px ${WATERMARK_RESERVED}px`,
        display: 'flex',
        gap: GRID_GAP,
        boxSizing: 'border-box',
        overflow: 'hidden',
        height: '100%',
        alignItems: 'flex-start', // so each col starts at the top, then we
                                  // push down via marginTop for the offset
      }}
    >
      {columns.map((col, ci) => (
        <div
          key={ci}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: GRID_GAP,
            minWidth: 0,
            marginTop: col.offsetTop,
          }}
        >
          {col.items.map((item, ii) => (
            <ProductCell key={ii} product={item.product} imgHeight={item.imgH} />
          ))}
        </div>
      ))}
    </section>
  );
}

function ProductCell({
  product,
  imgHeight,
}: {
  product:   PinProduct;
  imgHeight: number;
}) {
  const hasImage = Boolean(product.imageUrl);

  return (
    // No card chrome — products float directly on the white zone background.
    // Cutout product photos sit cleanly on white in every vibe.
    <div
      style={{
        backgroundColor: PRODUCT_ZONE_BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <div
        style={{
          width: '100%',
          height: imgHeight,
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
              maxWidth: '100%',
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

      {/* Caption uses a fixed dark color since the zone is always white. */}
      <p
        style={{
          margin: 0,
          fontSize: 11,
          lineHeight: 1.15,
          textAlign: 'center',
          color: PRODUCT_TEXT_COLOR,
          fontWeight: 500,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          flexShrink: 0,
          padding: '0 2px',
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
