import { kv } from '@vercel/kv';
import sharp from 'sharp';
import type { GiftTheme, GiftIdea } from '@/types';

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

const BRAVE_ENDPOINT  = 'https://api.search.brave.com/res/v1/images/search';
const SERPER_ENDPOINT = 'https://google.serper.dev/images';
// Bumped to v5 alongside the searchTerms-normalization change. v4 keys
// used the raw lowercased searchTerms string; v5 keys use the normalized
// form (see normalizeSearchTerms below) so cosmetic variations of the
// same product name collapse to one cache entry. The two key formats
// don't conflict, but v4 entries become unreachable — leaving them in
// KV is harmless (small amount of wasted storage).
const CACHE_PREFIX = 'gift_img_v5:';
// Sentinel cached for products that returned NO usable image. Without this, a
// known-unfindable product re-queries the search API on every search it appears
// in — pure repeat waste. Short TTL so it can be retried later (a product may
// gain a clean image over time).
const NO_IMAGE_SENTINEL = '__no_image__';
const NO_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
// Reduced from 4000 — fail fast so a single bad search doesn't stall the pool.
const LOOKUP_TIMEOUT_MS = 2500;
// HEAD check timeout — shorter since we're only verifying a direct image URL.
const HEAD_TIMEOUT_MS = 1500;
// Download timeout for the corner-sample step. Larger than HEAD because we
// pull the full image bytes, but still tight so one slow image doesn't stall
// the whole concurrency pool.
const DOWNLOAD_TIMEOUT_MS = 2500;
// How many of Brave's ranked results we're willing to corner-sample before
// giving up. Each one costs an image download (cached forever in KV after
// first lookup, so this is paid once per unique searchTerms).
//
// Raised from 5 to 15 alongside the BRAVE_RESULT_COUNT bump from 5 to 20:
// the larger candidate pool exists so we can dig past lifestyle/editorial
// results at the top of Brave's rankings to find a genuine product cutout
// further down. Short-circuits at the first match, so this is only the
// worst-case cap when the top candidates all fail the white-background
// check.
const MAX_CUTOUT_CANDIDATES = 15;

// How many image results to ask Brave for per query. Brave bills per
// QUERY (not per result), so requesting 20 instead of 5 is free — we just
// get more candidates back in the same response. More candidates = higher
// odds of finding a cutout for product categories whose top-5 search
// results skew toward lifestyle / editorial photography.
const BRAVE_RESULT_COUNT = 20;
// Corner-sample tuning. Each corner is an NxN region in raw RGB; we accept
// the image only if every corner passes BOTH:
//   - mean R, G, and B are all >= WHITE_MEAN_THRESHOLD (250)
//   - the minimum value of any single pixel's R, G, or B in the region is
//     >= WHITE_MIN_THRESHOLD (240)
// The mean check rules out gray-sweep studio backgrounds (a typical Amazon
// product shot on a soft gray backdrop sits around 246–249, which 245 was
// letting through). The min check catches a single dark/colored pixel
// intruding into an otherwise-white corner. 250 is about the strictest
// practical mean — JPEG compression rarely renders pure white above 252,
// so going higher starts rejecting legitimate cutouts.
const SAMPLE_REGION         = 16;
const WHITE_MEAN_THRESHOLD  = 250;
const WHITE_MIN_THRESHOLD   = 240;

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

interface SerperImage {
  imageUrl?: string;
  thumbnailUrl?: string;
  link?: string;     // page the image lives on
  source?: string;
  domain?: string;
}

interface SerperImageResponse {
  images?: SerperImage[];
}

// Provider-agnostic candidate the rest of the pipeline (scoring, HEAD-check,
// corner-sample) operates on, regardless of which search API produced it.
interface ImageCandidate {
  imageUrl: string;  // direct image URL to verify + download
  pageUrl:  string;  // page the image lives on — used for scoring/demotion
}

// Which image-search provider to use. Serper (Google Images) is ~5-15x cheaper
// per query than Brave; Brave is kept as a drop-in fallback. Set
// IMAGE_SEARCH_PROVIDER=brave to switch back if Serper ever degrades.
type ImageProvider = 'serper' | 'brave';
export function imageProvider(): ImageProvider {
  return process.env.IMAGE_SEARCH_PROVIDER === 'brave' ? 'brave' : 'serper';
}

function braveConfigured(): boolean {
  return Boolean(process.env.BRAVE_API_KEY);
}

function serperConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY);
}

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function scoreResult(c: ImageCandidate): number {
  const pageUrl = (c.pageUrl || '').toLowerCase();
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

// ── Providers ────────────────────────────────────────────────────────────────
// Each returns a normalized ImageCandidate[]; both append the same cutout hint
// ("product white background") so the ranker surfaces clean product shots first.

async function braveSearch(query: string): Promise<ImageCandidate[]> {
  const tunedQuery = `${query} product white background`;
  const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(tunedQuery)}&count=${BRAVE_RESULT_COUNT}&safesearch=strict`;
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
  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .map((r) => ({
      imageUrl: r.properties?.url ?? r.thumbnail?.src ?? '',
      pageUrl:  r.url ?? '',
    }))
    .filter((c) => c.imageUrl);
}

async function serperSearch(query: string): Promise<ImageCandidate[]> {
  const res = await fetchWithTimeout(
    SERPER_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'X-API-KEY':    process.env.SERPER_API_KEY as string,
        'Content-Type': 'application/json',
      },
      // num is free to raise — Serper, like Brave, bills per query, not per result.
      body: JSON.stringify({ q: `${query} product white background`, num: BRAVE_RESULT_COUNT }),
    },
    LOOKUP_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Serper search returned ${res.status}`);
  const data = (await res.json()) as SerperImageResponse;
  const images = Array.isArray(data.images) ? data.images : [];
  return images
    .map((im) => ({
      imageUrl: im.imageUrl ?? im.thumbnailUrl ?? '',
      pageUrl:  im.link ?? (im.domain ? `https://${im.domain}` : ''),
    }))
    .filter((c) => c.imageUrl);
}

// Dispatch to the configured provider, falling back to whichever has a key so a
// missing key for the selected provider never silently kills enrichment.
async function searchImages(query: string): Promise<ImageCandidate[]> {
  const provider = imageProvider();
  if (provider === 'serper' && serperConfigured()) return serperSearch(query);
  if (provider === 'brave'  && braveConfigured())  return braveSearch(query);
  if (serperConfigured()) return serperSearch(query);
  if (braveConfigured())  return braveSearch(query);
  return [];
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
      let rMin = 255, gMin = 255, bMin = 255;
      for (let i = 0; i < pixelCount; i++) {
        const o = i * channels;
        const r = data[o], g = data[o + 1], b = data[o + 2];
        rSum += r; gSum += g; bSum += b;
        if (r < rMin) rMin = r;
        if (g < gMin) gMin = g;
        if (b < bMin) bMin = b;
      }
      const rAvg = rSum / pixelCount;
      const gAvg = gSum / pixelCount;
      const bAvg = bSum / pixelCount;

      // Mean check: rules out uniform light-gray / beige backgrounds.
      if (rAvg < WHITE_MEAN_THRESHOLD || gAvg < WHITE_MEAN_THRESHOLD || bAvg < WHITE_MEAN_THRESHOLD) {
        return false;
      }
      // Min check: a single dark/colored pixel pulls min down without
      // moving the mean much. Catches "white background with a corner of
      // product or shadow intruding".
      if (rMin < WHITE_MIN_THRESHOLD || gMin < WHITE_MIN_THRESHOLD || bMin < WHITE_MIN_THRESHOLD) {
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
  let results: ImageCandidate[];
  try {
    results = await searchImages(searchTerms);
  } catch (err) {
    console.error('[product-images] image search failed:', err);
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
    const rawUrl = candidate.imageUrl;
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
 * Canonicalize a searchTerms string for use as a KV cache key.
 *
 * Claude generates slightly different product names across runs even for
 * identical products — "Stanley Quencher H2.0 30oz Tumbler" vs "Stanley
 * 30oz Quencher Tumbler" vs "Stanley H2.0 Quencher 30 oz Tumbler". Each
 * variation would otherwise hash to a different cache key and trigger a
 * fresh Brave query for the same image.
 *
 * Normalization collapses cosmetic variations to a single canonical form:
 *   1. Lowercase
 *   2. Replace any non-alphanumeric run with a single space (kills
 *      punctuation, hyphens, ampersands, etc. — "L.L.Bean" → "l l bean",
 *      "WH-1000XM5" → "wh 1000xm5")
 *   3. Tokenize on whitespace
 *   4. Drop empty tokens and common stopwords (articles, prepositions,
 *      generic connectors) — these add noise without changing identity
 *   5. Sort alphabetically — word order shouldn't matter for cache hits
 *   6. Join with single space
 *
 * Distinguishing tokens (sizes, colors, model numbers, version suffixes)
 * are preserved deliberately — "iPhone 15" and "iPhone 16" must hash to
 * different keys.
 */
const SEARCHTERMS_STOPWORDS = new Set([
  'a', 'an', 'the',
  'and', 'or',
  'with', 'for', 'by', 'in', 'on', 'of', 'to', 'at', 'plus',
]);

export function normalizeSearchTerms(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SEARCHTERMS_STOPWORDS.has(t))
    .sort()
    .join(' ');
}

/**
 * Fetch a product image URL for a single gift, using KV cache when available.
 * Returns null on any failure — callers should treat null as "no image".
 *
 * Important: the KV cache key uses the NORMALIZED searchTerms (see above) and
 * is namespaced by provider, so switching IMAGE_SEARCH_PROVIDER does a clean
 * re-fetch (a Brave-found URL can't mask a Serper test, and vice versa). The
 * actual search still uses the original natural-language string — the ranker
 * benefits from natural phrasing; only the cache key needs to be canonical.
 */
export async function getProductImage(searchTerms: string): Promise<string | null> {
  if (!serperConfigured() && !braveConfigured()) return null;
  const normalized = normalizeSearchTerms(searchTerms);
  // Defensive: an empty normalized string (e.g. searchTerms was just
  // stopwords) shouldn't hash to a useful cache key — bail to a fresh
  // lookup without caching the result.
  if (!normalized) return await lookupImage(searchTerms);
  const key = `${CACHE_PREFIX}${imageProvider()}:${normalized}`;

  if (kvConfigured()) {
    try {
      const cached = await kv.get<string>(key);
      if (cached === NO_IMAGE_SENTINEL) return null; // known-unfindable — don't re-query
      if (cached) return cached;
    } catch (err) {
      console.error('[product-images] KV read failed:', err);
    }
  }

  const url = await lookupImage(searchTerms);

  if (kvConfigured()) {
    try {
      if (url) {
        await kv.set(key, url); // success: no expiry — product photos don't change
      } else {
        // Cache the miss (short TTL) so we stop re-querying this product.
        await kv.set(key, NO_IMAGE_SENTINEL, { ex: NO_IMAGE_TTL_SECONDS });
      }
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

// ── Selection-aware lazy enrichment ──────────────────────────────────────────
// Cost control: each image lookup is one paid search query, so we look up ONLY
// the gifts we'll actually display, and only as many as needed.

type Relatedness = 'similar' | 'mixed' | 'adventurous';
function eligibleCeiling(relatedness: Relatedness): 1 | 2 | 3 {
  if (relatedness === 'similar') return 1;
  if (relatedness === 'mixed') return 2;
  return 3;
}

export interface EnrichResult {
  searchTerms: string;
  imageUrl: string | null;
}

// Run an async fn over items with a concurrency cap.
async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Walk the eligible-theme gifts in order and look up images ONLY until `count`
 * of them have one — backfilling failures from later eligible gifts instead of
 * enriching everything. Returns the selected themes (gifts' imageUrl set).
 *
 *   • Non-eligible themes (e.g. theme 3 for "mixed") are never looked up.
 *   • Total image queries = count + failures, not "every gift generated."
 *   • onResult streams each lookup result (used by the SSE /api/images route).
 *
 * Mutates gift.imageUrl in place. Never throws.
 */
export async function selectAndEnrichGifts(
  themes: GiftTheme[],
  relatedness: Relatedness,
  count: number,
  onResult?: (r: EnrichResult) => void,
  concurrency = 8,
): Promise<GiftTheme[]> {
  const ceiling = eligibleCeiling(relatedness);

  // Eligible gifts in theme-then-gift order, remembering theme index for regroup.
  const eligible: Array<{ themeIdx: number; gift: GiftIdea }> = [];
  themes.forEach((theme, themeIdx) => {
    if (theme.relatednessLevel > ceiling) return;
    for (const gift of theme.gifts) eligible.push({ themeIdx, gift });
  });

  // Enrich in waves: each wave covers the shortfall (count − found), in
  // parallel. Failures trigger another wave from the next eligible gifts until
  // `count` have images or we run out of eligible candidates.
  let cursor = 0;
  let found = 0;
  while (found < count && cursor < eligible.length) {
    const need = count - found;
    const batch = eligible.slice(cursor, cursor + need);
    cursor += batch.length;
    await mapPool(batch, concurrency, async ({ gift }) => {
      let url: string | null = null;
      try {
        url = await getProductImage(gift.searchTerms);
      } catch {
        url = null;
      }
      gift.imageUrl = url;
      onResult?.({ searchTerms: gift.searchTerms, imageUrl: url });
      if (url) found++;
    });
  }

  // Regroup the chosen gifts (first `count` eligible WITH images) into themes.
  const chosen = eligible
    .filter((e) => typeof e.gift.imageUrl === 'string')
    .slice(0, count);
  const byTheme = new Map<number, GiftIdea[]>();
  for (const { themeIdx, gift } of chosen) {
    const arr = byTheme.get(themeIdx);
    if (arr) arr.push(gift);
    else byTheme.set(themeIdx, [gift]);
  }
  const out: GiftTheme[] = [];
  themes.forEach((theme, themeIdx) => {
    const gifts = byTheme.get(themeIdx);
    if (gifts && gifts.length > 0) out.push({ ...theme, gifts });
  });
  return out;
}
