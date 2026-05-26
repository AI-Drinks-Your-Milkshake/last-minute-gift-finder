// Aesthetic / vibe options for the optional vibe step in the wizard.
//
// Named "aesthetics" in code (not "vibes") to avoid collision with the
// existing `VIBES` constant in GiftFinderWizard.tsx, which actually
// represents the relatedness / adventurousness control. On the API and in
// the user-facing copy the field is still called "vibe".

export interface Aesthetic {
  value: string;       // canonical key sent to API and used in prompt
  label: string;       // chip text shown to user
  // Brand anchors the prompt will reference when this aesthetic is selected.
  // Concrete brand names anchor an otherwise-abstract vibe word so the model
  // produces visibly different picks per aesthetic.
  brandAnchors: string;
}

export const AESTHETICS: readonly Aesthetic[] = [
  { value: 'aesthetic',  label: 'Aesthetic',  brandAnchors: 'Stanley, Owala, Drunk Elephant, Rhode, Lululemon Align' },
  { value: 'cozy',       label: 'Cozy',       brandAnchors: 'Barefoot Dreams, Brooklinen, Boy Smells, Snowe' },
  { value: 'luxe',       label: 'Luxe',       brandAnchors: 'Hermès, Loro Piana, Aesop, Le Labo, Diptyque' },
  { value: 'trendy',     label: 'Trendy',     brandAnchors: 'Sol de Janeiro, Glow Recipe, Glossier, Skims' },
  { value: 'minimalist', label: 'Minimalist', brandAnchors: 'Muji, Aesop, Hay, Fellow, Rains' },
  { value: 'outdoorsy',  label: 'Outdoorsy',  brandAnchors: 'Patagonia, Yeti, REI, Filson, Topo Designs' },
  { value: 'techy',      label: 'Techy',      brandAnchors: 'Apple, DJI, Anker, Sony, Logitech' },
  { value: 'classic',    label: 'Classic',    brandAnchors: 'L.L.Bean, Coach, Le Creuset, Levi\'s' },
  { value: 'playful',    label: 'Playful',    brandAnchors: 'Lego, Smiski, Casetify, Areaware' },
  { value: 'edgy',       label: 'Edgy',       brandAnchors: 'Acne Studios, Vans, Byredo, Carhartt WIP' },
  { value: 'boho',       label: 'Boho',       brandAnchors: 'Free People, Doen, Anthropologie, Madewell' },
  { value: 'preppy',     label: 'Preppy',     brandAnchors: 'J.Crew, Lacoste, Polo Ralph Lauren, Tory Burch' },
];

export const AESTHETIC_VALUES = AESTHETICS.map((a) => a.value);

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
