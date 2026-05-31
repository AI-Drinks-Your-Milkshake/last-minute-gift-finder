// Trending-product retrieval via Brave Web Search.
//
// Claude's training cutoff is several months behind the current date; for a
// gift recommender that's fatal — the model recommends evergreen-but-stale
// products instead of what's actually trending. We patch that by running a
// short Brave search before the main Claude call and inlining 5–10 currently-
// trending product names as in-context examples.
//
// This module follows the same defensive shape as `product-images.ts`:
//  - Returns an empty list if the API key isn't configured
//  - Bounded timeout, never throws
//  - Failures degrade silently — the main Claude call still runs

const BRAVE_WEB_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
// Reduced from 3500 — trends feed into Claude so every ms here adds to TTFB.
const LOOKUP_TIMEOUT_MS = 2000;
const MAX_PRODUCTS = 10;

interface BraveWebResult {
  title?: string;
  description?: string;
}

interface BraveWebResponse {
  web?: { results?: BraveWebResult[] };
}

function braveConfigured(): boolean {
  return Boolean(process.env.BRAVE_API_KEY);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

interface BuildQueryParams {
  recipient: string;
  occasion: string;
  interests: string;
  vibes?: string[];
}

/**
 * Build a search query that biases toward freshly-published gift round-ups.
 * Including the current year + "best" / "trending" surfaces recent gift guide
 * articles, which is where current product names live.
 */
function buildQuery({ recipient, occasion, interests, vibes }: BuildQueryParams): string {
  const year = new Date().getFullYear();
  const parts: string[] = [];

  parts.push(`best ${year} gifts`);
  if (recipient) parts.push(`for ${recipient.toLowerCase()}`);
  if (occasion && occasion.toLowerCase() !== 'just because' && occasion.toLowerCase() !== 'other') {
    parts.push(occasion.toLowerCase());
  }
  // First ~50 chars of interests captures the main subject without overfitting
  if (interests) {
    const snippet = interests.slice(0, 60).trim();
    parts.push(snippet);
  }
  if (vibes && vibes.length > 0) {
    parts.push(vibes.join(' '));
  }
  parts.push('trending');
  return parts.join(' ');
}

/**
 * Pull product-name candidates out of search result titles/descriptions.
 *
 * Heuristic: gift-guide articles list products as proper-noun phrases in the
 * description text, often capitalized. We extract sequences of 1–4 capitalized
 * words and dedupe. This is intentionally cheap — a noisy candidate list is
 * fine because Claude will only use ones that fit the recipient.
 */
function extractProductCandidates(results: BraveWebResult[]): string[] {
  const candidates = new Set<string>();

  // Words to drop — common false positives in titles
  const STOPWORDS = new Set([
    'Best', 'Top', 'Gift', 'Gifts', 'Guide', 'Holiday', 'Christmas', 'Mother', 'Mothers',
    'Father', 'Fathers', 'Day', 'Year', 'Birthday', 'Anniversary', 'Wedding', 'Valentine',
    'The', 'A', 'An', 'For', 'Of', 'And', 'Or', 'In', 'On', 'At', 'To', 'From',
    'Amazon', 'Walmart', 'Target', 'Costco', 'Best Buy', 'Etsy',
    'Ultimate', 'Perfect', 'Unique', 'Amazing', 'New', 'Cool', 'Great', 'Awesome',
    'Ideas', 'Idea', 'Picks', 'Pick', 'List', 'Lists', 'CNN', 'Underscored',
    'Reviews', 'Review', 'Buy', 'Shop',
  ]);

  const phraseRe = /\b([A-Z][a-zA-Z0-9'’]+(?:\s+[A-Z][a-zA-Z0-9'’]+){0,3})\b/g;

  for (const r of results) {
    const text = `${r.title ?? ''} . ${r.description ?? ''}`;
    let m: RegExpExecArray | null;
    while ((m = phraseRe.exec(text)) !== null) {
      const phrase = m[1].trim();
      if (phrase.length < 3) continue;
      // Skip if every word is a stopword
      const words = phrase.split(/\s+/);
      if (words.every((w) => STOPWORDS.has(w))) continue;
      // Skip pure-year phrases like "2025"
      if (/^\d{4}$/.test(phrase)) continue;
      candidates.add(phrase);
      if (candidates.size >= MAX_PRODUCTS * 3) break;
    }
    if (candidates.size >= MAX_PRODUCTS * 3) break;
  }

  // Take the first MAX_PRODUCTS — they roughly correlate with relevance
  // since Brave already ranked results
  return Array.from(candidates).slice(0, MAX_PRODUCTS);
}

/**
 * Fetch a list of currently-trending product names for the given gift context.
 * Returns an empty array on any failure or missing API key — callers should
 * treat empty list as "no trending hint available" and proceed normally.
 */
export async function getTrendingProducts(params: BuildQueryParams): Promise<string[]> {
  if (!braveConfigured()) return [];

  const query = buildQuery(params);
  const url = `${BRAVE_WEB_ENDPOINT}?q=${encodeURIComponent(query)}&count=8&safesearch=strict&freshness=py`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY as string,
        },
      },
      LOOKUP_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.error('[trends] Brave search returned', res.status);
      return [];
    }
    const data = (await res.json()) as BraveWebResponse;
    const results = data.web?.results ?? [];
    return extractProductCandidates(results);
  } catch (err) {
    console.error('[trends] Brave search failed:', err);
    return [];
  }
}
