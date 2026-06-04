// Canonical recipient list for the gift finder.
// Grouped for the wizard's chip layout. Both the wizard and (legacy) SearchForm
// import from here so the list lives in one place.

export interface RecipientGroup {
  id: string;
  label: string;          // section header rendered in the wizard
  recipients: string[];
}

export const RECIPIENT_GROUPS: readonly RecipientGroup[] = [
  {
    id: 'kids',
    label: 'Kids',
    recipients: [
      'Baby', 'Toddler', 'Kid (5–8)', 'Tween Boy', 'Tween Girl',
      'Teen Boy', 'Teen Girl',
    ],
  },
  {
    id: 'family',
    label: 'Family',
    recipients: [
      'Son', 'Daughter', 'Mom', 'Dad', 'Sister', 'Brother',
      'Grandma', 'Grandpa', 'Aunt', 'Uncle', 'Niece', 'Nephew', 'Cousin',
    ],
  },
  {
    id: 'romantic',
    label: 'Romantic',
    recipients: ['Wife', 'Husband', 'Girlfriend', 'Boyfriend', 'Partner', 'Fiancé(e)'],
  },
  {
    id: 'blended',
    label: 'Extended & blended',
    recipients: [
      'Stepmom', 'Stepdad', 'Stepchild',
      'Mother-in-law', 'Father-in-law', 'Sister-in-law', 'Brother-in-law',
      'Godchild',
    ],
  },
  {
    id: 'friends',
    label: 'Friends & social',
    recipients: ['Friend', 'Best Friend', 'Roommate', 'Neighbor'],
  },
  {
    id: 'work',
    label: 'Work & school',
    recipients: ['Coworker', 'Boss', 'Client', 'Teacher', 'Mentor'],
  },
  {
    id: 'pets',
    label: 'Pets',
    recipients: ['Dog', 'Cat'],
  },
];

// Flat list of every chip — kept for backward-compat with anything that
// iterates recipients as a single array.
export const ALL_RECIPIENTS: readonly string[] = RECIPIENT_GROUPS.flatMap(
  (g) => g.recipients,
);

// The most-common relationships, shown as a single "Common" cluster by default
// in the wizard's Who step. The full grouped list is revealed behind a
// "More people" toggle. Recipient is a required field, so this set is kept
// generous enough to cover most searches without a click. Values must match
// entries in RECIPIENT_GROUPS exactly.
export const COMMON_RECIPIENTS: readonly string[] = [
  'Mom', 'Dad', 'Sister', 'Brother', 'Son', 'Daughter',
  'Wife', 'Husband', 'Girlfriend', 'Boyfriend', 'Friend', 'Kid (5–8)',
];
