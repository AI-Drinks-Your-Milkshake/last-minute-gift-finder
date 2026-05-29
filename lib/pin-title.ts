// Shared pin-title utilities — used by both the server (route.ts, page-results.ts)
// and the client (PinPreview.tsx). Keep this module free of browser-only or
// Next.js server-only imports so it can run in either context.

// ── Pluralization ──────────────────────────────────────────────────────────

const PLURAL_OVERRIDES: Record<string, string> = {
  Wife:              'Wives',
  Boss:              'Bosses',
  'Mother-in-law':   'Mothers-in-law',
  'Father-in-law':   'Fathers-in-law',
  'Sister-in-law':   'Sisters-in-law',
  'Brother-in-law':  'Brothers-in-law',
  'Fiancé(e)':       'Fiancés',
  Child:             'Children',
  Stepchild:         'Stepchildren',
};

/**
 * Strip parentheticals ("Kid (5–8)" → "Kid") then return the plural form.
 * Used for the pin title; the eyebrow uses the raw recipient string.
 */
export function pluralizeRecipient(recipient: string): string {
  const base = recipient.replace(/\s*\([^)]*\)\s*/g, '').trim();
  if (PLURAL_OVERRIDES[base]) return PLURAL_OVERRIDES[base];
  if (base.endsWith('s')) return base;
  if (base.endsWith('y') && !'aeiou'.includes(base[base.length - 2])) {
    return base.slice(0, -1) + 'ies';
  }
  return base + 's';
}

// ── Primary interest extraction ────────────────────────────────────────────

// Filler phrases to strip from the start of an interests entry so the
// remaining text is a clean noun or short noun phrase.
const FILLER_PREFIX = /^(obsessed with|loves?|really into|passionate about|into|enjoys?|big fan of|huge fan of|great at|a big fan of)\s+/i;
const ARTICLE_PREFIX = /^(an?\s+)/i;

/**
 * Extract a short, clean primary interest from the freeform interests string.
 * Returns null if the interests field is empty or produces something too long
 * (> 3 words) to fit naturally in "who love [Interest]".
 *
 * Examples:
 *   "camping, hiking, outdoor adventures"  → "Camping"
 *   "obsessed with cooking and craft beer" → "Cooking and craft beer"  (5 words → null)
 *   "loves woodworking"                    → "Woodworking"
 */
export function extractPrimaryInterest(interests: string): string | null {
  if (!interests.trim()) return null;

  // Take the first comma- or semicolon-delimited segment.
  const first = interests.split(/[,;]/)[0].trim();

  // Strip common filler openers.
  const stripped = first
    .replace(FILLER_PREFIX, '')
    .replace(ARTICLE_PREFIX, '')
    .trim();

  if (!stripped) return null;

  // Keep only if it's short enough to read naturally in the title.
  if (stripped.split(/\s+/).length > 3) return null;

  // Capitalise first letter.
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// ── Title builder ──────────────────────────────────────────────────────────

export interface PinTitleOpts {
  vibeLabel?: string;        // e.g. "Outdoorsy" — absent when no vibe selected
  occasion: string;          // e.g. "Graduation"
  recipientPlural: string;   // e.g. "Teen Boys"
  primaryInterest?: string;  // e.g. "Camping" — appended as "who love Camping"
}

/**
 * Build the canonical pin / page title from its constituent parts.
 *
 * Formula:
 *   With vibe:     "{Vibe} {Occasion} Gifts for {Recipients} [who love {Interest}]"
 *   Without vibe:  "{Occasion} Gifts for {Recipients} [who love {Interest}]"
 *
 * The interest suffix is omitted when primaryInterest is falsy.
 */
export function buildPinTitle(opts: PinTitleOpts): string {
  const base = opts.vibeLabel
    ? `${opts.vibeLabel} ${opts.occasion} Gifts for ${opts.recipientPlural}`
    : `${opts.occasion} Gifts for ${opts.recipientPlural}`;
  return opts.primaryInterest ? `${base} who love ${opts.primaryInterest}` : base;
}

// ── Slug builder ───────────────────────────────────────────────────────────

/**
 * Convert a pin title into a URL-safe slug.
 * "Outdoorsy Graduation Gifts for Teen Boys" → "outdoorsy-graduation-gifts-for-teen-boys"
 */
export function buildSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
