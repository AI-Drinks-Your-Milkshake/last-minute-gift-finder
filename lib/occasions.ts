// Canonical occasion list. Expanded from the original 13 to cover
// non-Christian holidays, life-event milestones, and a few sympathy/celebration
// occasions that drive a lot of gift-buying.
//
// Per product decision: no days-until / "when do they need it" complexity.
// This is just a richer chip list.

export const OCCASIONS: readonly string[] = [
  // Everyday gifting
  'Birthday',
  'Anniversary',
  'Just Because',
  'Thank You',

  // Major Western holidays
  'Holiday / Christmas',
  "Valentine's Day",
  "Mother's Day",
  "Father's Day",
  'Easter',

  // Faith & cultural
  'Hanukkah',
  'Diwali',
  'Lunar New Year',
  'Eid',

  // Life milestones
  'Graduation',
  'Wedding',
  'Engagement',
  'Bridal Shower',
  'Baby Shower',
  'Quinceañera',
  'Sweet 16',
  'Bar/Bat Mitzvah',
  'Housewarming',
  'New Home',
  'New Job',
  'Promotion',
  'Retirement',
  'Pet Adoption',

  // Care
  'Get Well',
  'Sympathy',

  // Fallback
  'Other',
];
