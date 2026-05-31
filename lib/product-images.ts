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
 *   4. HEAD-check the best Brave image URL directly — no og:image second hop.
 *      Dropping the HTML page fetch removes 2 of 3 HTTP round-trips per gift.
 *   5. Cache the result in KV (no expiry — product photos don't change).
 *
 * All failures degrade gracefully: lookup errors, timeouts, missing API key,
 * missing KV — every path returns null rather than throwing.
 */

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/images/search';
const CACHE_PREFIX = 'gift_img:';
// Reduced from 4000 — fail fast so a single bad search doesn't stall the pool.
const LOOKUP_TIMEOUT_MS = 2500;
// HEAD check timeout — shorter since we're only verifying a direct image URL.
const HEAD_TIMEOUT_MS = 1500;

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

/**
 * Verify that a candidate image URL actually loads in a browser context:
 * - HTTP 200 (no 403 hotlink block or 404)
 * - Content-Type starts with "image/" (rules out HTML login walls etc.)
 */
async function isImageAccessible(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; LastMinuteGiftFinder/1.0; +https://github.com)',
        },
      },
      HEAD_TIMEOUT_MS,
    );
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return ct.startsWith('image/');
  } catch {
    return false;
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

  // Use Brave's direct image URL — no og:image second hop.
  // This cuts the per-gift round-trips from 3 down to 2 (search + HEAD check).
  for (const candidate of ranked) {
    const rawUrl = candidate.properties?.url ?? candidate.thumbnail?.src ?? null;
    if (rawUrl && await isImageAccessible(rawUrl)) return rawUrl;
  }

  return null;
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
