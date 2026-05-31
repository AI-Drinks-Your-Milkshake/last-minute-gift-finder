import { kv } from '@vercel/kv';
import sharp from 'sharp';
import type { GiftTheme } from '@/types';

/**
 * Server-side product-image enrichment.
 *
 * Flow per gift:
 *   1. Check Vercel KV for a cached image URL (keyed by lowercased searchTerms).
 *   2. On miss, call Brave Image Search.
 *   3. Score the top results, demoting Pinterest/Etsy/eBay/marketplace listings
 *      and preferring manufacturer / major-retailer product pages.
 *   4. HEAD-check the candidate URL (accessible + image content-type).
 *   5. Download bytes and sample 4 corner regions — accept only if every
 *      corner is near-white. This filters out lifestyle / on-location photos
 *      whose colored backgrounds wreck the pin layout.
 *   6. Walk down the ranked list until one candidate passes, otherwise null.
 *   7. Cache the result in KV (no expiry — product photos don't change).
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
// Download timeout for the corner-sample step. Larger than HEAD because we
// pull the full image bytes, but still tight so one slow image doesn't stall
// the whole concurrency pool.
const DOWNLOAD_TIMEOUT_MS = 2500;
// How many of Brave's top-ranked results we're willing to corner-sample
// before giving up. Each one costs a download; 5 keeps the cold-cache
// tail latency bounded.
const MAX_CUTOUT_CANDIDATES = 5;
// Corner-sample tuning. Each corner is an NxN region in raw RGB; we accept
// the image only if every corner's mean R, G, and B are all >= the threshold.
// 232/255 catches typical "white" product backgrounds (which are rarely pure
// 255,255,255 due to JPEG compression and slight studio lighting tint).
const SAMPLE_REGION    = 8;
const WHITE_THRESHOLD  = 232;

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

/**
 * Fetch the full image bytes. Returns null on any failure (timeout, non-200,
 * unexpected content-type). Capped by DOWNLOAD_TIMEOUT_MS so a slow CDN can't
 * block the concurrency pool.
 */
async function downloadImageBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; LastMinuteGiftFinder/1.0; +https://github.com)',
        },
      },
      DOWNLOAD_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Corner-sample test: decode the image, read SAMPLE_REGION × SAMPLE_REGION
 * pixel blocks at each of the four corners, and accept only if every
 * corner's mean R, G, and B are all >= WHITE_THRESHOLD.
 *
 * This is the canonical white-background check — it directly measures the
 * thing we care about (is the background actually white?) rather than
 * approximating via URL patterns or filename hints.
 *
 * Returns false on any decode error so a corrupt image is rejected.
 */
async function hasWhiteBackground(bytes: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(bytes).metadata();
    const W = meta.width;
    const H = meta.height;
    if (!W || !H) return false;
    // Too small to meaningfully sample — reject so we don't accept a
    // pathological thumbnail.
    if (W < SAMPLE_REGION * 3 || H < SAMPLE_REGION * 3) return false;

    const corners: { left: number; top: number }[] = [
      { left: 0,                 top: 0                 },
      { left: W - SAMPLE_REGION, top: 0                 },
      { left: 0,                 top: H - SAMPLE_REGION },
      { left: W - SAMPLE_REGION, top: H - SAMPLE_REGION },
    ];

    for (const { left, top } of corners) {
      // Re-create the sharp instance per extract — sharp pipelines are
      // single-use, so reusing the same instance across multiple .extract()
      // calls throws.
      const { data, info } = await sharp(bytes)
        // Flatten any alpha channel against white so PNGs with transparent
        // corners (which are also "white background" for our purposes)
        // sample as white instead of as the underlying pixel.
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .extract({ left, top, width: SAMPLE_REGION, height: SAMPLE_REGION })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const channels = info.channels;
      const pixelCount = SAMPLE_REGION * SAMPLE_REGION;
      let rSum = 0, gSum = 0, bSum = 0;
      for (let i = 0; i < pixelCount; i++) {
        const o = i * channels;
        rSum += data[o];
        gSum += data[o + 1];
        bSum += data[o + 2];
      }
      const rAvg = rSum / pixelCount;
      const gAvg = gSum / pixelCount;
      const bAvg = bSum / pixelCount;

      if (rAvg < WHITE_THRESHOLD || gAvg < WHITE_THRESHOLD || bAvg < WHITE_THRESHOLD) {
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('[product-images] corner-sample decode failed:', err);
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

  // Walk the top MAX_CUTOUT_CANDIDATES in rank order. Each candidate must:
  //   1. Have a usable image URL.
  //   2. HEAD-check OK (accessible, image content-type).
  //   3. Download successfully within DOWNLOAD_TIMEOUT_MS.
  //   4. Pass the corner-sample white-background check.
  // First one to pass wins. Otherwise null → emoji-only card on the client.
  let checked = 0;
  for (const candidate of ranked) {
    if (checked >= MAX_CUTOUT_CANDIDATES) break;
    const rawUrl = candidate.properties?.url ?? candidate.thumbnail?.src ?? null;
    if (!rawUrl) continue;
    checked++;

    if (!(await isImageAccessible(rawUrl))) continue;

    const bytes = await downloadImageBytes(rawUrl);
    if (!bytes) continue;

    if (await hasWhiteBackground(bytes)) return rawUrl;
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
