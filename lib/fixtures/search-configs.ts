// Hard-coded SearchConfig fixtures used during Milestone A/B of the
// Pinterest guide pipeline build-out, before the generator script and
// content-generation pipeline are wired up.
//
// One fixture per vibe is enough to validate the pin template + vibe
// CSS overlay system. Real records will eventually live in
// data/search-configs.csv and data/content/{slug}.json.

import type { SearchConfig, PinProduct } from '@/types';

interface FixtureRecord {
  config: SearchConfig;
  // Placeholder products for the pin grid. Replaced by real generated
  // content once the Anthropic content pipeline is hooked up.
  products: PinProduct[];
}

// Coquette Birthday Gifts for Teen Girls — Milestone A primary fixture.
// Pulled from plan Phase 1 research (highest-confidence P1 combo).
const coquetteBirthdayTeenGirls: FixtureRecord = {
  config: {
    id: 'fixture-coquette-birthday-teen-girl',
    demographic: 'teen-girl',
    occasion: 'Birthday',
    vibe: 'coquette',
    interests: [],
    title: 'Coquette Birthday Gifts for Teen Girls',
    slug: 'coquette-birthday-gifts-for-teen-girls',
    priority: 1,
    status: 'needs_review',
    pinImagePath: null,
    pageUrl: '/pin/coquette-birthday-gifts-for-teen-girls',
    pinterestPinId: null,
    generatedAt: null,
    postedAt: null,
    notes: 'Milestone A reference pin — locked design before scale-out.',
  },
  products: [
    { title: 'Pearl bow hair clips',          priceRange: '$14–$22' },
    { title: 'Lace-trim journal',              priceRange: '$24–$32' },
    { title: 'Vintage glass perfume jar',      priceRange: '$45–$60' },
    { title: 'Heart-cluster earrings',         priceRange: '$28–$38' },
    { title: 'Pink silk scrunchies set',       priceRange: '$18–$26' },
    { title: 'Mini gold heart locket',         priceRange: '$35–$48' },
    { title: 'Ribbon-print iPhone case',       priceRange: '$22–$32' },
    { title: 'Pastel pearl bracelet',          priceRange: '$32–$44' },
    { title: 'Bow-detail cardigan',            priceRange: '$85–$120' },
    { title: 'Blush Stanley tumbler',          priceRange: '$35–$45' },
    { title: 'Cherry Balm Dotcom',             priceRange: '$14–$18' },
    { title: 'Lana Del Rey vinyl',             priceRange: '$28–$40' },
    { title: 'Floral throw blanket',           priceRange: '$48–$75' },
    { title: 'Rose-water facial mist',         priceRange: '$24–$38' },
    { title: 'Mini pink Polaroid camera',      priceRange: '$99–$140' },
    { title: 'Silk pillowcase, blush',         priceRange: '$42–$68' },
    { title: 'Ballet pink polish set',         priceRange: '$22–$30' },
    { title: 'Vintage scallop hand mirror',    priceRange: '$32–$48' },
    { title: 'Heart-print pajama set',         priceRange: '$55–$80' },
    { title: 'Pearl pen with ribbon charm',    priceRange: '$18–$28' },
  ],
};

export const FIXTURES: readonly FixtureRecord[] = [
  coquetteBirthdayTeenGirls,
];

/**
 * Lookup a fixture by SearchConfig slug. Returns undefined if no match —
 * caller should 404.
 */
export function getFixtureBySlug(slug: string): FixtureRecord | undefined {
  return FIXTURES.find((f) => f.config.slug === slug);
}
