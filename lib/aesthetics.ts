// Aesthetic / vibe options.
//
// Two consumers:
//   1) The runtime wizard (lib/anthropic.ts) — uses `value`, `label`,
//      and `brandAnchors` to shape gift recommendations.
//   2) The static guide pipeline (Pinterest brand-search initiative) —
//      uses the optional `guide*` fields below to (a) enumerate the
//      parameter matrix, (b) generate Pinterest pin titles/descriptions,
//      and (c) drive per-vibe CSS overrides on pin/page renders.
//
// A vibe with `guideTier: null` is wizard-only — it's available as a chip
// in the search wizard but won't be used to generate static guide pages.
// Flip its tier to LAUNCH / BATCH_2 / P1_EARLY / BATCH_3 when you want to
// pull it into the guide pipeline.
//
// Named "aesthetics" in code (not "vibes") to avoid collision with the
// existing `VIBES` constant in GiftFinderWizard.tsx, which represents
// the relatedness / adventurousness control. On the API and in user-facing
// copy the field is still called "vibe".

export type GuideTier =
  | 'LAUNCH'    // Tier 1 — highest search volume, ship first
  | 'BATCH_2'   // Tier 2 — strong performers, second batch
  | 'P1_EARLY'  // Tier 3 — Pinterest Predicts 2026, first-mover opportunity
  | 'BATCH_3'   // Tier 4 — experimental / niche
  | null;       // Wizard-only, not in guide pipeline

export interface VibeCssOverrides {
  // Each entry is a CSS custom-property name -> value. Applied as inline
  // CSS custom properties on the pin/page root element so they cascade
  // down to all child elements. Keep the list short and aligned with
  // what the templates actually consume.

  // ── App-context variables (override globals.css :root) ──
  // Used when a vibe needs to retint the dark app theme too.
  '--accent'?: string;
  '--accent-strong'?: string;
  '--font-display'?: string;
  '--card-radius'?: string;
  '--surface-card'?: string;
  '--bg-texture'?: string;

  // ── Pin-context variables (used only by PinTemplate) ──
  // Pinterest pins live in their own visual context — a soft tinted
  // backdrop with vibe-appropriate text colors, not the dark app theme.
  // These are NOT used on the live guide page or the wizard.
  '--pin-bg'?: string;
  '--pin-text'?: string;
  '--pin-text-soft'?: string;
  '--pin-accent'?: string;     // optional override; falls back to --accent
  '--pin-band-bg'?: string;    // title-band background; falls back to --pin-accent then rgba(0,0,0,0.35)
}

export interface Aesthetic {
  value: string;       // canonical key sent to API and used in prompt
  label: string;       // chip text shown to user
  // Brand anchors the prompt will reference when this aesthetic is selected.
  // Concrete brand names anchor an otherwise-abstract vibe word so the model
  // produces visibly different picks per aesthetic.
  brandAnchors: string;

  // ── Static-guide pipeline fields (optional) ──
  // Phrases Pinterest users actually search. Drives pin titles, page H1s,
  // and Pinterest description hashtags. Empty array if guideTier is null.
  pinterestSearchTerms?: string[];
  // Demographic slugs this vibe targets most strongly. Used by the
  // parameter-matrix generator to prioritize vibe × demographic combos.
  primarySegment?: string[];
  // Which batch this vibe ships in, or null for wizard-only vibes.
  guideTier?: GuideTier;
  // Short note explaining the tier assignment — comes from Phase 1 research.
  evidence?: string;
  // CSS custom-property overrides applied via [data-vibe="<value>"].
  cssOverrides?: VibeCssOverrides;
}

// Vibes are ordered: existing wizard vibes first (preserving original order),
// then new vibes added for the guide pipeline. Existing-wizard vibes that
// overlap with plan vibes have been enriched with guide fields in place.
//
// Plan Table 14 enumerates 16 named vibes across 4 tiers; the plan text
// refers to "18 vibes" — the remaining 2 are placeholders that will be
// named as research surfaces them.
export const AESTHETICS: readonly Aesthetic[] = [
  // ── Existing wizard vibes (preserved) ──
  {
    value: 'aesthetic',
    label: 'Aesthetic',
    brandAnchors: 'Stanley, Owala, Drunk Elephant, Rhode, Lululemon Align',
    // Maps to plan's "Aesthetic / Minimalist" Tier 1.
    pinterestSearchTerms: ['aesthetic gifts', 'clean girl gifts', 'minimal gifts'],
    primarySegment: ['teen-girl', 'adult-woman'],
    guideTier: 'LAUNCH',
    evidence: 'Broad catch-all; high volume but lower conversion than sub-aesthetics.',
    cssOverrides: {
      '--accent': '#E8724A', // brand orange
      '--pin-bg': '#F2EEE9',
      '--pin-text': '#1F1F2A',
      '--pin-text-soft': '#6F6F80',
    },
  },
  {
    value: 'cozy',
    label: 'Cozy',
    brandAnchors: 'Barefoot Dreams, Brooklinen, Boy Smells, Snowe',
    pinterestSearchTerms: ['cozy gifts', 'hygge gifts', 'warm gifts'],
    primarySegment: ['adult-woman', 'grandma', 'teen-girl'],
    guideTier: 'LAUNCH',
    evidence: 'Top-performing search term across all demos.',
    cssOverrides: {
      '--accent': '#E8A85C',
      '--accent-strong': '#C68843',
      '--card-radius': '1rem',
      '--pin-bg': '#F4ECD8',
      '--pin-text': '#3A2E1F',
      '--pin-text-soft': '#7A6852',
    },
  },
  {
    value: 'luxe',
    label: 'Luxe',
    brandAnchors: 'Hermès, Loro Piana, Aesop, Le Labo, Diptyque',
    guideTier: null, // wizard-only for now
  },
  {
    value: 'trendy',
    label: 'Trendy',
    brandAnchors: 'Sol de Janeiro, Glow Recipe, Glossier, Skims',
    guideTier: null,
  },
  {
    value: 'minimalist',
    label: 'Minimalist',
    brandAnchors: 'Muji, Aesop, Hay, Fellow, Rains',
    guideTier: null, // overlaps with 'aesthetic' in guide pipeline
  },
  {
    value: 'outdoorsy',
    label: 'Outdoorsy',
    brandAnchors: 'Patagonia, Yeti, REI, Filson, Topo Designs',
    pinterestSearchTerms: ['outdoorsy gifts', 'adventure gifts', 'rugged gifts'],
    primarySegment: ['teen-boy', 'adult-man', 'grandpa'],
    guideTier: 'BATCH_2',
    evidence: 'Primary male vibe tier; complements outdoor interests.',
    cssOverrides: {
      '--accent': '#3F6B4A',
      '--accent-strong': '#2E5238',
      '--pin-bg': '#E5E8DD',
      '--pin-text': '#1F2D1A',
      '--pin-text-soft': '#536855',
    },
  },
  {
    value: 'techy',
    label: 'Techy',
    brandAnchors: 'Apple, DJI, Anker, Sony, Logitech',
    guideTier: null,
  },
  {
    value: 'classic',
    label: 'Classic',
    brandAnchors: 'L.L.Bean, Coach, Le Creuset, Levi\'s',
    guideTier: null, // overlaps with 'preppy' in guide pipeline
  },
  {
    value: 'playful',
    label: 'Playful',
    brandAnchors: 'Lego, Smiski, Casetify, Areaware',
    guideTier: null,
  },
  {
    value: 'edgy',
    label: 'Edgy',
    brandAnchors: 'Acne Studios, Vans, Byredo, Carhartt WIP',
    guideTier: null,
  },
  {
    value: 'boho',
    label: 'Boho',
    brandAnchors: 'Free People, Doen, Anthropologie, Madewell',
    pinterestSearchTerms: ['boho gifts', 'earthy gifts', 'nature gifts', 'earthy aesthetic'],
    primarySegment: ['adult-woman', 'woman-45-64'],
    guideTier: 'BATCH_2',
    evidence: 'Consistent performer for older female demos.',
    cssOverrides: {
      '--accent': '#C8895F',
      '--accent-strong': '#A66E47',
      '--pin-bg': '#EDDFD0',
      '--pin-text': '#3D2A1A',
      '--pin-text-soft': '#7A604A',
    },
  },
  {
    value: 'preppy',
    label: 'Preppy',
    brandAnchors: 'J.Crew, Lacoste, Polo Ralph Lauren, Tory Burch',
    pinterestSearchTerms: ['preppy gifts', 'classic gifts', 'old money gifts', 'timeless gifts'],
    primarySegment: ['young-woman', 'adult-woman', 'grandma'],
    guideTier: 'BATCH_2',
    evidence: 'Old Money trend sustaining into 2026.',
    cssOverrides: {
      '--accent': '#1E3A5F',
      '--accent-strong': '#142944',
      '--pin-bg': '#F5F1E8',
      '--pin-text': '#0F1F33',
      '--pin-text-soft': '#5F6B7A',
    },
  },

  // ── New vibes added for the guide pipeline ──
  {
    value: 'coquette',
    label: 'Coquette',
    brandAnchors: 'Sandy Liang, Mejuri, Glossier, Selkie, Lirika Matoshi',
    pinterestSearchTerms: ['coquette gifts', 'bow gifts', 'pink aesthetic gifts'],
    primarySegment: ['teen-girl', 'young-woman'],
    guideTier: 'LAUNCH',
    evidence: 'Dominant teen-girl sub-aesthetic on Pinterest 2024-26.',
    cssOverrides: {
      '--accent': '#E08CA1',
      '--accent-strong': '#C46E84',
      '--font-display': '"Playfair Display", Georgia, serif',
      '--card-radius': '1rem',
      '--surface-card': '#1c1620',
      '--pin-bg': '#FBE8EE',
      '--pin-text': '#4A2540',
      '--pin-text-soft': '#8C5C75',
    },
  },
  {
    value: 'cottagecore',
    label: 'Cottagecore',
    brandAnchors: 'Doen, Hill House Home, Christy Dawn, Son de Flor',
    pinterestSearchTerms: ['cottagecore gifts', 'cottage aesthetic gifts', 'whimsical gifts'],
    primarySegment: ['teen-girl', 'adult-woman', 'grandma'],
    guideTier: 'LAUNCH',
    evidence: 'High board density, strong gifting overlap.',
    cssOverrides: {
      '--accent': '#7B8E69',
      '--accent-strong': '#5A6E48',
      '--font-display': '"Cormorant Garamond", Georgia, serif',
      '--pin-bg': '#E8EFE2',
      '--pin-text': '#2F3D26',
      '--pin-text-soft': '#6B7A5E',
    },
  },
  {
    value: 'dark-academia',
    label: 'Dark Academia',
    brandAnchors: 'Massimo Dutti, Filson, Smythson, J.Crew Cashmere',
    pinterestSearchTerms: ['dark academia gifts', 'literary gifts', 'moody aesthetic gifts'],
    primarySegment: ['teen-girl', 'young-woman', 'young-man'],
    guideTier: 'LAUNCH',
    evidence: 'Strong crossover with Books/Reading interest.',
    cssOverrides: {
      '--accent': '#A04848',
      '--accent-strong': '#7A3232',
      '--font-display': '"EB Garamond", Georgia, serif',
      '--surface-card': '#181014',
      '--pin-bg': '#3A2F2A',
      '--pin-text': '#E8D9C0',
      '--pin-text-soft': '#A89B86',
    },
  },
  {
    value: 'y2k',
    label: 'Y2K / Retro',
    brandAnchors: 'I.AM.GIA, Heaven by Marc Jacobs, Juicy Couture, Crocs',
    pinterestSearchTerms: ['Y2K gifts', 'retro gifts', '2000s aesthetic gifts'],
    primarySegment: ['teen-girl', 'young-woman'],
    guideTier: 'LAUNCH',
    evidence: 'Nostalgia trend sustained since 2023.',
    cssOverrides: {
      '--accent': '#FF4FB4',
      '--accent-strong': '#E03A9C',
      '--font-display': '"Space Grotesk", system-ui, sans-serif',
      '--card-radius': '1.5rem',
      '--pin-bg': '#FFDDF1',
      '--pin-text': '#3D0A2A',
      '--pin-text-soft': '#8C4A75',
    },
  },
  {
    value: 'sporty',
    label: 'Sporty',
    brandAnchors: 'Nike, Alo Yoga, Lululemon, On Running, Gymshark',
    pinterestSearchTerms: ['sporty gifts', 'athletic gifts', 'gym gifts'],
    primarySegment: ['teen-boy', 'teen-girl', 'young-man', 'young-woman'],
    guideTier: 'BATCH_2',
    evidence: 'Consistent volume; pairs well with Fitness interest.',
    cssOverrides: {
      '--accent': '#3D7DCC',
      '--accent-strong': '#2962A8',
      '--pin-bg': '#E5EEF8',
      '--pin-text': '#0F1E33',
      '--pin-text-soft': '#5A6E85',
    },
  },
  {
    value: 'grandma-classic',
    label: 'Grandma Classic',
    brandAnchors: 'L.L.Bean, Talbots, Pendleton, Lands\' End, Vera Bradley',
    pinterestSearchTerms: ['cozy grandma gifts', 'grandma aesthetic gifts', 'warm gifts for grandma'],
    primarySegment: ['grandma', 'woman-45-64'],
    guideTier: 'BATCH_2',
    evidence: 'Underserved segment with high purchase intent.',
    cssOverrides: {
      '--accent': '#9A7DA8',
      '--accent-strong': '#7C5F8C',
      '--pin-bg': '#F0E8F2',
      '--pin-text': '#2F1F33',
      '--pin-text-soft': '#6B5A75',
    },
  },
  {
    value: 'afrobohemian',
    label: 'Afrobohemian',
    brandAnchors: 'Brother Vellies, Studio 189, Hanifa, Andrea Iyamah',
    pinterestSearchTerms: ['afrobohemian gifts', 'afroboho aesthetic', 'afrocentric boho gifts'],
    primarySegment: ['young-woman', 'adult-woman'],
    guideTier: 'P1_EARLY',
    evidence: 'Pinterest Predicts 2026: +220% YoY. Nearly zero gift-guide competition now.',
    cssOverrides: {
      '--accent': '#D4A14A',
      '--accent-strong': '#B8852E',
      '--pin-bg': '#F4E5C8',
      '--pin-text': '#3D2A0F',
      '--pin-text-soft': '#7A6442',
    },
  },
  {
    value: 'lace',
    label: 'Lace / Romantic',
    brandAnchors: 'For Love & Lemons, Selkie, Sandy Liang, Hill House Home',
    pinterestSearchTerms: ['lace aesthetic gifts', 'romantic gifts', 'soft feminine gifts'],
    primarySegment: ['teen-girl', 'young-woman', 'adult-woman'],
    guideTier: 'P1_EARLY',
    evidence: 'Pinterest Predicts 2026: +215% YoY. Overlaps with Coquette but broader appeal.',
    cssOverrides: {
      '--accent': '#C9A1A1',
      '--accent-strong': '#AC8585',
      '--font-display': '"Cormorant Garamond", Georgia, serif',
      '--pin-bg': '#F9E9E5',
      '--pin-text': '#3D2522',
      '--pin-text-soft': '#85605C',
    },
  },
  {
    value: 'snail-mail',
    label: 'Snail Mail / Penpal',
    brandAnchors: 'Papier, Rifle Paper Co, Smythson, Moleskine',
    pinterestSearchTerms: ['snail mail gifts', 'penpal gifts', 'stationery gifts', 'letter writing gifts'],
    primarySegment: ['teen-girl', 'young-woman'],
    guideTier: 'P1_EARLY',
    evidence: 'Pinterest Predicts 2026: +110% YoY. Strong crossover with Writing/Journaling interest.',
    cssOverrides: {
      '--accent': '#A89060',
      '--accent-strong': '#8C7548',
      '--font-display': '"Caveat", "Comic Sans MS", cursive',
      '--pin-bg': '#F5EDD9',
      '--pin-text': '#3D2F14',
      '--pin-text-soft': '#85714A',
    },
  },
  {
    value: 'gamer-aesthetic',
    label: 'Gamer Aesthetic',
    brandAnchors: 'Razer, Govee, Secretlab, Logitech G, Hyperx',
    pinterestSearchTerms: ['gamer gifts', 'gaming room aesthetic gifts', 'RGB gifts'],
    primarySegment: ['teen-boy', 'young-man'],
    guideTier: 'BATCH_3',
    evidence: 'Complements Gaming interest for male demos.',
    cssOverrides: {
      '--accent': '#A050E0',
      '--accent-strong': '#8038BB',
      '--surface-card': '#10101a',
      '--pin-bg': '#1F1F33',
      '--pin-text': '#E8E0F2',
      '--pin-text-soft': '#9A85B5',
    },
  },
  {
    value: 'coastal-grandmother',
    label: 'Coastal Grandmother',
    brandAnchors: 'Jenni Kayne, Brochu Walker, Frank & Eileen, La Ligne',
    pinterestSearchTerms: ['coastal grandmother gifts', 'coastal chic gifts', 'linen aesthetic gifts'],
    primarySegment: ['woman-45-64', 'grandma'],
    guideTier: 'BATCH_3',
    evidence: 'Peaked 2022-23 but has long tail in older female demos.',
    cssOverrides: {
      '--accent': '#6892AE',
      '--accent-strong': '#4F758F',
      '--pin-bg': '#E8F0F2',
      '--pin-text': '#1A2E33',
      '--pin-text-soft': '#5A7585',
    },
  },
];

export const AESTHETIC_VALUES = AESTHETICS.map((a) => a.value);

// Subset used by the static-guide pipeline. Skip wizard-only vibes
// (guideTier === null) so the parameter-matrix generator only iterates
// over vibes intended for Pinterest publication.
export const GUIDE_VIBES: readonly Aesthetic[] = AESTHETICS.filter(
  (a) => a.guideTier != null,
);

/**
 * Lookup a vibe by its `value` slug. Returns undefined for unknown values.
 */
export function getAesthetic(value: string): Aesthetic | undefined {
  return AESTHETICS.find((a) => a.value === value);
}

/**
 * Build the prompt fragment for the selected aesthetics. Returns an empty
 * string when nothing is selected so the prompt stays clean.
 */
export function aestheticPromptFragment(selected: string[]): string {
  if (!selected || selected.length === 0) return '';

  const picked = AESTHETICS.filter((a) => selected.includes(a.value));
  if (picked.length === 0) return '';

  const labels = picked.map((a) => a.label.toLowerCase()).join(' + ');
  const anchors = picked.map((a) => a.brandAnchors).join('; ');

  return `Lean toward items whose look, packaging, and brand positioning fit this aesthetic: ${labels}. Brand examples in this aesthetic: ${anchors}. Reference these as inspiration; only recommend a specific brand if it actually fits the recipient.`;
}
