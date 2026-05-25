import { kv } from '@vercel/kv';
import type { GiftTheme } from '@/types';

/**
 * Server-side product-image enrichment.
 *
 * Flow per gift:
 *   1. Check Vercel KV for a cached image URL (keyed by lowercased searchTerms).
 *   2. On miss, call Brave Image Search.
 *   3. Score the top results, demoting Pinterest/Etsy/eBay/marketplace listings
 *      and preferring manufacturer / major-retailer product pages.
 *   4. Fetch the winning page's HTML and pull <meta property="og:image"> —
 *      almost always a higher-quality hero shot than the image-search thumbnail.
 *      Fall back to Brave's own image URL if og:image isn't present.
 *   5. Cache the result in KV (no expiry — product photos don't change).
 *
 * All failures degrade gracefully: lookup errors, timeouts, missing API key,
 * missing KV — every path returns null rather than throwing, so image
 * enrichment never blocks a search response.
 */

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/images/search';
const CACHE_PREFIX = 'gift_img:';
const LOOKUP_TIMEOUT_MS = 4000;

// Hosts whose images are usually low-signal: thumbnails, lifestyle shots,
// listings with text overlays, or just frequently the wrong product.
const DEMOTED_HOSTS = [
  'pinterest.com',
  'pinimg.com',
  'etsy.com',
  'ebay.com',
  'aliexpress.com',
  'redbubble.com',
  'mercari.com',
  'poshmark.com',
];

// Substrings that signal a real product page (manufacturer or major retailer).
// These are cheap hints, not a comprehensive list — the goal is to push clean
// product shots up the ranking, not to enumerate every legitimate source.
const PREFERRED_HINTS = [
  '/products/', '/product/', '/p/', '/dp/',
  'amazon.com', 'rei.com', 'bestbuy.com', 'target.com',
  'crateandbarrel.com', 'westelm.com', 'bhphotovideo.com',
  'apple.com', 'garmin.com', 'sony.com', 'lego.com', 'fender.com',
];

interface BraveImageResult {
  url?: string;                       // page URL (where the image lives)
  source?: string;
  thumbnail?: { src?: string };
  properties?: { url?: string };
}

interface BraveImageResponse {
  results?: BraveImageResult[];
}

function braveConfigured(): boolean {
  return Boolean(process.env.BRAVE_API_KEY);
}

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function scoreResult(r: BraveImageResult): number {
  const pageUrl = (r.url || '').toLowerCase();
  if (!pageUrl) return -100;
  let score = 0;
  for (const host of DEMOTED_HOSTS) {
    if (pageUrl.includes(host)) score -= 10;
  }
  for (const hint of PREFERRED_HINTS) {
    if (pageUrl.includes(hint)) score += 5;
  }
  if (pageUrl.startsWith('https://')) score += 1;
  return score;
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

async function braveSearch(query: string): Promise<BraveImageResult[]> {
  const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=5&safesearch=strict`;
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
  if (!res.ok) throw new Error(`Brave search returned ${res.status}`);
  const data = (await res.json()) as BraveImageResponse;
  return Array.isArray(data.results) ? data.results : [];
}

async function extractOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      pageUrl,
      {
        headers: {
          // Bare-bones UA — some sites 403 default fetch User-Agent.
          'User-Agent':
            'Mozilla/5.0 (compatible; LastMinuteGiftFinder/1.0; +https://github.com)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      },
      LOOKUP_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const html = await res.text();
    // og:image is in <head>; truncate to avoid scanning huge bodies
    const head = html.split('</head>')[0] ?? html.slice(0, 200_000);
    // Match property/content in either order
    const m =
      head.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return null;
    const candidate = m[1];
    // Must be an absolute https/http URL
    if (!/^https?:\/\//i.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

async function lookupImage(searchTerms: string): Promise<string | null> {
  let results: BraveImageResult[];
  try {
    results = await braveSearch(searchTerms);
  } catch (err) {
    console.error('[product-images] Brave search failed:', err);
    return null;
  }
  if (results.length === 0) return null;

  const ranked = [...results].sort((a, b) => scoreResult(b) - scoreResult(a));
  const top = ranked[0];

  // og:image second hop — much higher quality than the search thumbnail
  if (top.url) {
    const og = await extractOgImage(top.url);
    if (og) return og;
  }

  // Fall back to whatever Brave returned directly
  return top.properties?.url ?? top.thumbnail?.src ?? null;
}

/**
 * Fetch a product image URL for a single gift, using KV cache when available.
 * Returns null on any failure — callers should treat null as "no image".
 */
export async function getProductImage(searchTerms: string): Promise<string | null> {
  if (!braveConfigured()) return null;
  const key = `${CACHE_PREFIX}${searchTerms.toLowerCase().trim()}`;

  if (kvConfigured()) {
    try {
      const cached = await kv.get<string>(key);
      if (cached) return cached;
    } catch (err) {
      console.error('[product-images] KV read failed:', err);
    }
  }

  const url = await lookupImage(searchTerms);

  if (url && kvConfigured()) {
    try {
      // No expiry — product photos don't meaningfully change
      await kv.set(key, url);
    } catch (err) {
      console.error('[product-images] KV write failed:', err);
    }
  }

  return url;
}

/**
 * Enrich every gift across every theme with an imageUrl. Runs lookups in
 * parallel and mutates the gifts in place. Never throws — individual
 * lookup failures set imageUrl to null and the request continues.
 */
export async function enrichThemesWithImages(themes: GiftTheme[]): Promise<void> {
  const tasks: Array<Promise<void>> = [];
  for (const theme of themes) {
    for (const gift of theme.gifts) {
      tasks.push(
        getProductImage(gift.searchTerms)
          .then((url) => {
            gift.imageUrl = url;
          })
          .catch(() => {
            gift.imageUrl = null;
          }),
      );
    }
  }
  await Promise.allSettled(tasks);
}
