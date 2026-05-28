// Interest seed list for the static guide pipeline.
//
// These are the 24 interests from plan Table 11. They drive the long-tail
// dimension of the parameter matrix — every vibe × demographic combo can
// be sub-segmented by interest to produce highly-specific guide pages
// (e.g. "Cozy Christmas Gifts for Teen Girls Who Love Drawing").
//
// The list is intentionally finite at launch but expected to grow over
// time as the app surfaces more interests.

export interface Interest {
  slug: string;          // URL-safe key, e.g. 'gaming-console-pc'
  label: string;         // display string, e.g. 'Gaming (console/PC)'
  category: 'gaming-tech' | 'creative-arts' | 'outdoors-active' | 'lifestyle';
}

export const INTERESTS: readonly Interest[] = [
  // Gaming / Tech
  { slug: 'gaming',       label: 'Gaming (console/PC)', category: 'gaming-tech' },
  { slug: 'lego',         label: 'LEGO',                category: 'gaming-tech' },
  { slug: 'coding',       label: 'Coding / Robotics',   category: 'gaming-tech' },
  { slug: 'drones',       label: 'Drones',              category: 'gaming-tech' },
  { slug: 'vr-gadgets',   label: 'VR / Gadgets',        category: 'gaming-tech' },

  // Creative / Arts
  { slug: 'drawing',      label: 'Drawing / Art',           category: 'creative-arts' },
  { slug: 'reading',      label: 'Reading / Books',         category: 'creative-arts' },
  { slug: 'writing',      label: 'Writing / Journaling',    category: 'creative-arts' },
  { slug: 'crafting',     label: 'Crafting / DIY',          category: 'creative-arts' },
  { slug: 'dance-theater',label: 'Dance / Theater',         category: 'creative-arts' },

  // Outdoors / Active
  { slug: 'hiking',       label: 'Hiking / Camping',     category: 'outdoors-active' },
  { slug: 'sports',       label: 'Sports (general)',     category: 'outdoors-active' },
  { slug: 'biking',       label: 'Biking / Scooters',    category: 'outdoors-active' },
  { slug: 'fishing',      label: 'Fishing',              category: 'outdoors-active' },
  { slug: 'yoga-fitness', label: 'Yoga / Fitness',       category: 'outdoors-active' },

  // Lifestyle
  { slug: 'cooking',      label: 'Cooking / Baking',     category: 'lifestyle' },
  { slug: 'fashion',      label: 'Fashion / Style',      category: 'lifestyle' },
  { slug: 'plants',       label: 'Plants / Gardening',   category: 'lifestyle' },
  { slug: 'pets',         label: 'Pets / Animals',       category: 'lifestyle' },
  { slug: 'travel',       label: 'Travel',               category: 'lifestyle' },
  { slug: 'music',        label: 'Music',                category: 'lifestyle' },
];

export const INTEREST_SLUGS = INTERESTS.map((i) => i.slug);

/**
 * Lookup an interest by its `slug`. Returns undefined for unknown values.
 */
export function getInterest(slug: string): Interest | undefined {
  return INTERESTS.find((i) => i.slug === slug);
}
