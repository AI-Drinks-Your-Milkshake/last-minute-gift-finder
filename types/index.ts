export interface GiftIdea {
  title: string;
  description: string;
  priceRange: string;
  searchTerms: string;
  emoji: string;
}

export interface SearchFormData {
  recipient: string; // e.g. "Mom", "Son", "Friend" — from dropdown
  age: string;
  occasion: string;
  interests: string;
}

export interface RecentSearch {
  id: string;
  recipient: string;
  occasion: string;
  timestamp: number;
}
