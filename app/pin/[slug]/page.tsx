// /pin/[slug] — renders a single Pinterest pin from a SearchConfig
// fixture for design review (Milestone A/B).
//
// Server component: no client hooks, no hydration delay. This is the
// page Puppeteer will eventually screenshot to produce the actual JPEG
// posted to Pinterest.
//
// Fixtures live in lib/fixtures/search-configs.ts during Milestone A/B.
// Once the generator script and persistence layer are in, this will
// read from the CSV + content JSON files instead.

import { notFound } from 'next/navigation';
import PinTemplate from '@/components/PinTemplate';
import { getFixtureBySlug, FIXTURES } from '@/lib/fixtures/search-configs';
import { getAesthetic } from '@/lib/aesthetics';

interface PageProps {
  params: { slug: string };
}

// Static-generate every fixture route at build time. Cheap (we only have
// a handful) and means the pages are immediately Puppeteer-targetable.
export function generateStaticParams() {
  return FIXTURES.map((f) => ({ slug: f.config.slug }));
}

export const dynamic = 'force-static';

export default function PinPage({ params }: PageProps) {
  const fixture = getFixtureBySlug(params.slug);
  if (!fixture) {
    notFound();
  }

  const { config, products } = fixture;
  const vibe = config.vibe ? getAesthetic(config.vibe) : undefined;

  return (
    <>
      {/* Metadata strip — reviewer-only, never makes it into the
          captured pin image (Puppeteer targets [data-pin-root]). */}
      <div
        style={{
          maxWidth: 1000,
          width: '100%',
          marginBottom: 24,
          padding: '14px 20px',
          borderRadius: 10,
          backgroundColor: '#22222a',
          color: '#b0b0c8',
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <span>
          <strong style={{ color: '#f2f2f8' }}>slug</strong> {config.slug}
        </span>
        <span>
          <strong style={{ color: '#f2f2f8' }}>vibe</strong>{' '}
          {vibe?.label ?? '(broad — no vibe)'}
        </span>
        <span>
          <strong style={{ color: '#f2f2f8' }}>tier</strong>{' '}
          {vibe?.guideTier ?? 'n/a'}
        </span>
        <span>
          <strong style={{ color: '#f2f2f8' }}>priority</strong> P{config.priority}
        </span>
        <span>
          <strong style={{ color: '#f2f2f8' }}>status</strong> {config.status}
        </span>
      </div>

      <PinTemplate config={config} products={products} />
    </>
  );
}
