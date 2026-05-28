// Demographic presets for the static guide pipeline.
//
// This is the plan's 14-preset list (age × gender). Distinct from
// lib/recipients.ts, which groups recipients by relationship type and
// drives the runtime wizard. The two lists overlap (Teen Boy, Teen Girl,
// Grandma, Grandpa appear in both) but are not 1:1 — recipients.ts has
// no notion of age range, and demographics here have no notion of
// relationship.
//
// Reconciliation is a deliberate open question. For now both lists live
// side by side; the guide pipeline reads from this file and the wizard
// reads from recipients.ts.

export interface Demographic {
  slug: string;          // URL segment and matrix key, e.g. 'teen-girl'
  label: string;         // human-readable, e.g. 'Teen Girl (14-17)'
  gender: 'boys' | 'girls' | 'men' | 'women' | 'mixed';
  ageGroup:
    | 'young'      // 5-9
    | 'tween'      // 10-13
    | 'teen'       // 14-17
    | 'young-adult'// 18-24
    | 'adult'      // 25-44
    | 'middle'     // 45-64
    | 'senior';    // 65+
  // Two-segment URL fragment matching the plan's URL structure:
  //   strix.com/gifts/{gender}/{age-group}/{occasion}/{slug}
  urlGender: string;
  urlAge: string;
}

export const DEMOGRAPHICS: readonly Demographic[] = [
  // ── Kids ──
  { slug: 'young-boy',   label: 'Young Boy (5-9)',    gender: 'boys',  ageGroup: 'young',  urlGender: 'boys',  urlAge: 'young' },
  { slug: 'tween-boy',   label: 'Tween Boy (10-13)',  gender: 'boys',  ageGroup: 'tween',  urlGender: 'boys',  urlAge: 'tween' },
  { slug: 'young-girl',  label: 'Young Girl (5-9)',   gender: 'girls', ageGroup: 'young',  urlGender: 'girls', urlAge: 'young' },
  { slug: 'tween-girl',  label: 'Tween Girl (10-13)', gender: 'girls', ageGroup: 'tween',  urlGender: 'girls', urlAge: 'tween' },

  // ── Teens & young adults ──
  { slug: 'teen-boy',    label: 'Teen Boy (14-17)',    gender: 'boys',  ageGroup: 'teen',        urlGender: 'boys',  urlAge: 'teen' },
  { slug: 'teen-girl',   label: 'Teen Girl (14-17)',   gender: 'girls', ageGroup: 'teen',        urlGender: 'girls', urlAge: 'teen' },
  { slug: 'young-man',   label: 'Young Man (18-24)',   gender: 'men',   ageGroup: 'young-adult', urlGender: 'men',   urlAge: 'young-adult' },
  { slug: 'young-woman', label: 'Young Woman (18-24)', gender: 'women', ageGroup: 'young-adult', urlGender: 'women', urlAge: 'young-adult' },

  // ── Adults ──
  { slug: 'adult-woman', label: 'Adult Woman (25-44)', gender: 'women', ageGroup: 'adult',  urlGender: 'women', urlAge: 'adult' },
  { slug: 'adult-man',   label: 'Adult Man (25-44)',   gender: 'men',   ageGroup: 'adult',  urlGender: 'men',   urlAge: 'adult' },
  { slug: 'woman-45-64', label: 'Woman (45-64)',       gender: 'women', ageGroup: 'middle', urlGender: 'women', urlAge: 'middle' },
  { slug: 'man-45-64',   label: 'Man (45-64)',         gender: 'men',   ageGroup: 'middle', urlGender: 'men',   urlAge: 'middle' },

  // ── Seniors ──
  { slug: 'grandma',     label: 'Grandma (65+)',       gender: 'women', ageGroup: 'senior', urlGender: 'women', urlAge: 'senior' },
  { slug: 'grandpa',     label: 'Grandpa (65+)',       gender: 'men',   ageGroup: 'senior', urlGender: 'men',   urlAge: 'senior' },
];

export const DEMOGRAPHIC_SLUGS = DEMOGRAPHICS.map((d) => d.slug);

/**
 * Lookup a demographic by its `slug`. Returns undefined for unknown values.
 */
export function getDemographic(slug: string): Demographic | undefined {
  return DEMOGRAPHICS.find((d) => d.slug === slug);
}

/**
 * Resolve a demographic from the (urlGender, urlAge) pair used in URLs.
 * Returns undefined if no match — caller is responsible for 404.
 */
export function getDemographicFromUrl(
  urlGender: string,
  urlAge: string,
): Demographic | undefined {
  return DEMOGRAPHICS.find(
    (d) => d.urlGender === urlGender && d.urlAge === urlAge,
  );
}
