// Bare pin render page — no nav, no chrome, just PinTemplate at 1000×1500.
//
// This is the URL Screenshotone visits to generate the Pinterest pin JPEG.
// It must render cleanly at exactly 1000×1500 viewport with no scroll.
//
// Access: /pin-render/{slug}
// Not linked anywhere in the app UI — internal use by /api/pin only.

import { notFound } from 'next/navigation';
import { getPageResult } from '@/lib/page-results';
import { selectAndEnrichGifts } from '@/lib/product-images';
import { flattenGifts, countGifts } from '@/lib/select-gifts';
import PinTemplate from '@/components/PinTemplate';
import type { PinProduct } from '@/types';

// No caching — always fetch fresh so image enrichment runs.
export const dynamic = 'force-dynamic';

interface Props {
  params: { slug: string };
}

export default async function PinRenderPage({ params }: Props) {
  const page = await getPageResult(params.slug);
  if (!page) notFound();

  // Selection-aware enrichment — same eligible-only, up-to-`count` lookup the
  // grid + public page use, so the pin shows the identical gifts. The wizard
  // already warmed the cache for these, so it's almost all cache hits.
  const selectedThemes = await selectAndEnrichGifts(
    page.themes,
    page.relatedness ?? 'adventurous',
    page.count ?? countGifts(page.themes),
  );

  const products: PinProduct[] = flattenGifts(selectedThemes).map((g) => ({
    title:      g.title,
    priceRange: g.priceRange,
    imageUrl:   typeof g.imageUrl === 'string' ? g.imageUrl : null,
  }));

  // Server-side observability (STRIX_RULES #6).
  console.log(`[pin-render/${params.slug}] published ${products.length} products (requested ${page.count ?? 'n/a'})`);
  if (page.count !== undefined && products.length < page.count) {
    console.error(`[pin-render/${params.slug}] SHORTFALL: ${products.length}/${page.count} products have images`);
  }

  return (
    <>
      {/* Force the viewport to exactly 1000×1500 with no margin or scroll.
          Screenshotone is called with viewport_width=1000, viewport_height=1500
          so this fills the capture area exactly. */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          width: 1000px;
          height: 1500px;
          overflow: hidden;
          background: white;
        }
      `}</style>
      <PinTemplate
        title={page.title}
        vibe={page.vibeSlug}
        products={products}
      />
    </>
  );
}
