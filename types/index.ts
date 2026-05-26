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
