export type GiftCategory =
  | 'Tech'
  | 'Fashion'
  | 'Beauty'
  | 'Home'
  | 'Outdoors'
  | 'Food'
  | 'Wellness'
  | 'Experience'
  | 'Snack'
  | 'Stocking Stuffer'
  | 'Other';

export const GIFT_CATEGORIES: readonly GiftCategory[] = [
  'Tech', 'Fashion', 'Beauty', 'Home', 'Outdoors',
  'Food', 'Wellness', 'Experience', 'Snack', 'Stocking Stuffer', 'Other',
];

export interface GiftIdea {
  title: string;
  description: string;
  priceRange: string;   // human-readable, e.g. "$75–$300"
  priceMin: number;     // numeric lower bound for filtering
  priceMax: number;     // numeric upper bound for filtering
  searchTerms: string;
  emoji: string;
  category: GiftCategory; // what kind of object — for the per-card chip
  // Populated server-side after Claude returns, via Brave Image Search.
  // null = lookup ran but found nothing or failed; undefined = enrichment not yet run.
  imageUrl?: string | null;
}

export interface GiftTheme {
  id: string;                       // slug, used as React key
  label: string;                    // display header, e.g. "For e-scooter fans"
  relatednessLevel: 1 | 2 | 3;      // 1 = direct, 2 = adjacent, 3 = exploratory
  gifts: GiftIdea[];
}

// What the API receives. This is the ONLY thing serialized to /api/search.
export interface SearchApiRequest {
  recipient: string;
  age: string;
  occasion: string;
  interests: string;
  count: number;
  priceMin: number;
  priceMax: number;
  level: 'casual' | 'interested' | 'enthusiast';
  // Optional aesthetic / vibe selections from the wizard. 0–2 entries.
  // Values come from `lib/aesthetics.ts` (AESTHETIC_VALUES).
  vibes?: string[];
}

// Frontend-only display preferences. NOT sent to the API.
export interface DisplayPrefs {
  relatedness: 'similar' | 'mixed' | 'adventurous';
}

// Full form state = API request + display prefs.
export type SearchFormData = SearchApiRequest & DisplayPrefs;

export interface RecentSearch {
  id: string;
  recipient: string;
  occasion: string;
  timestamp: number;
}

export interface BetaSignup {
  email: string;
  ts:    number;   // ms epoch — when the signup landed
}

// ──────────────────────────────────────────────────────────────────────
// Static guide pipeline (Pinterest brand-search initiative)
// ──────────────────────────────────────────────────────────────────────
//
// A SearchConfig is one row in the parameter matrix. It uniquely
// identifies a guide page (e.g. "Coquette Birthday Gifts for Teen
// Girls") and carries everything needed to render the page, the
// Pinterest pin, and the eventual API call to post it.
//
// Status lifecycle:
//   'shell'             — generator created the row; no content yet
//   'needs_review'      — content + pin image generated; awaiting Jason
//   'needs_design_fix'  — sent back; template or vibe tweak required
//   'approved'          — Jason signed off; eligible for posting
//   'posted'            — live on Pinterest
//
// Persistence lives in data/search-configs.csv at the project root.
// The CSV is the source of truth for status and human-edited metadata;
// generated content (the GiftTheme[] for each guide) lives alongside
// at data/content/{slug}.json.

export type SearchConfigStatus =
  | 'shell'
  | 'needs_review'
  | 'needs_design_fix'
  | 'approved'
  | 'posted';

export interface SearchConfig {
  id: string;                          // uuid
  demographic: string;                 // slug from lib/demographics.ts
  occasion: string;                    // matches lib/occasions.ts value
  vibe: string | null;                 // slug from lib/aesthetics.ts; null = broad guide
  interests: string[];                 // slugs from lib/interests.ts; [] = broad guide
  title: string;                       // e.g. "Coquette Birthday Gifts for Teen Girls"
  slug: string;                        // URL-safe, derived from title
  priority: 1 | 2 | 3 | 4;             // P1-P4 from research
  status: SearchConfigStatus;
  pinImagePath: string | null;         // local file path to Puppeteer JPEG
  pageUrl: string | null;              // resolved /gifts/... URL
  pinterestPinId: string | null;       // populated after Pinterest API post
  generatedAt: string | null;          // ISO timestamp; content generation
  postedAt: string | null;             // ISO timestamp; Pinterest post
  notes: string;                       // free-form, reviewer-edited
}

// Pin-grid product entry. Placeholder shape used by the pin template
// before real content is wired in via lib/anthropic.ts.
export interface PinProduct {
  title: string;
  priceRange: string;
  imageUrl?: string | null;            // optional; renders gradient placeholder if absent
}
