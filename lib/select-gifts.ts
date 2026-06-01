// Single source of truth for "which gifts does the user actually see."
//
// Every surface — the results grid, the pin preview, the public /g/[slug]
// page, and the /pin-render pin image — must show the SAME gifts, and exactly
// as many as the user requested (STRIX_RULES #1, #2). They diverged before
// because each surface filtered/truncated on its own. Now they all call this.
//
// Rules (decided with product):
//   • Relatedness bounds which THEMES are eligible (grid rules win):
//       similar     → level 1 only
//       mixed       → levels 1–2
//       adventurous → levels 1–3
//   • Within the eligible themes we take the first `count` gifts that have a
//     usable image, in theme-then-gift order. We do NOT try to preserve a
//     per-theme distribution — the contract is "N for the whole search."
//   • A gift with no product image is never shown on any surface. Dropping the
//     imageless ones BEFORE truncating (not after) is what keeps the count
//     exact and identical everywhere.
//   • If the eligible themes can't supply N gifts-with-images, that's a
//     shortfall — oversampling is supposed to prevent it. Callers detect it via
//     countGifts(result) < count and log it as an error so we can measure how
//     often it really happens.

import type { GiftTheme, GiftIdea } from '@/types';

export type Relatedness = 'similar' | 'mixed' | 'adventurous';

function eligibleCeiling(relatedness: Relatedness): 1 | 2 | 3 {
  if (relatedness === 'similar') return 1;
  if (relatedness === 'mixed') return 2;
  return 3;
}

// strict = true  → only a confirmed image URL (string) counts. Used by surfaces
//                  whose images are already resolved (server pages) or that
//                  can't render a loading state (the pin).
// strict = false → a gift whose image is still loading (undefined) also counts,
//                  so the results grid can render shimmer cards immediately and
//                  converge to exactly N as images resolve. A confirmed-missing
//                  image (null) is always excluded.
function hasUsableImage(g: GiftIdea, strict: boolean): boolean {
  if (typeof g.imageUrl === 'string') return true;
  return !strict && g.imageUrl === undefined;
}

export interface SelectOptions {
  strict: boolean;
}

/**
 * The canonical selection. Returns themes (in original order, with original
 * labels) holding exactly `count` gifts when that many usable gifts exist in
 * the eligible themes — fewer only on a shortfall.
 */
export function selectThemesForDisplay(
  themes: GiftTheme[],
  relatedness: Relatedness,
  count: number,
  opts: SelectOptions,
): GiftTheme[] {
  const ceiling = eligibleCeiling(relatedness);

  // Flatten eligible gifts in theme-then-gift order, remembering which theme
  // each came from so we can regroup after truncating.
  const picked: Array<{ themeIdx: number; gift: GiftIdea }> = [];
  themes.forEach((theme, themeIdx) => {
    if (theme.relatednessLevel > ceiling) return; // relatedness boundary
    for (const gift of theme.gifts) {
      if (hasUsableImage(gift, opts.strict)) picked.push({ themeIdx, gift });
    }
  });

  const taken = picked.slice(0, Math.max(0, count));

  // Regroup into themes, preserving original theme + gift order.
  const giftsByTheme = new Map<number, GiftIdea[]>();
  for (const { themeIdx, gift } of taken) {
    const arr = giftsByTheme.get(themeIdx);
    if (arr) arr.push(gift);
    else giftsByTheme.set(themeIdx, [gift]);
  }

  const out: GiftTheme[] = [];
  themes.forEach((theme, themeIdx) => {
    const gifts = giftsByTheme.get(themeIdx);
    if (gifts && gifts.length > 0) out.push({ ...theme, gifts });
  });
  return out;
}

/** Total gift count across themes. */
export function countGifts(themes: GiftTheme[]): number {
  return themes.reduce((n, t) => n + t.gifts.length, 0);
}

/** Flatten themes back into a single ordered gift list (for the pin grid). */
export function flattenGifts(themes: GiftTheme[]): GiftIdea[] {
  return themes.flatMap((t) => t.gifts);
}
