// KV storage for public gift guide pages.
//
// Each page is keyed by its SEO slug (e.g. "outdoorsy-graduation-gifts-for-teen-boys")
// and stored for 30 days. Writes are fire-and-forget — a KV failure never
// blocks the search response; the page simply won't exist until the next
// successful search with the same slug overwrites it.

import { kv } from '@vercel/kv';
import type { GiftTheme } from '@/types';

const PAGE_PREFIX   = 'gift_page:';
const TTL_SECONDS   = 30 * 24 * 60 * 60; // 30 days

export interface StoredPageResult {
  /** Full display title, e.g. "Outdoorsy Graduation Gifts for Teen Boys who love Camping" */
  title: string;
  /** Raw wizard value, e.g. "Teen Boy" */
  recipient: string;
  /** Pluralised form, e.g. "Teen Boys" */
  recipientPlural: string;
  /** e.g. "Graduation" */
  occasion: string;
  /** e.g. "mid-teens" */
  age: string;
  /** Vibe label, e.g. "Outdoorsy" — absent when no vibe selected */
  vibeLabel?: string;
  /** Extracted from interests field, e.g. "Camping" */
  primaryInterest?: string;
  /** Full themed gift results */
  themes: GiftTheme[];
  /** Unix ms timestamp */
  createdAt: number;
}

function isConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Persist a page result under the given slug. Silent on KV errors —
 * a write failure is non-fatal; the search response proceeds without it.
 */
export async function savePageResult(
  slug: string,
  data: StoredPageResult,
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await kv.set(`${PAGE_PREFIX}${slug}`, data, { ex: TTL_SECONDS });
  } catch (err) {
    console.error('[page-results] KV write failed:', err);
  }
}

/**
 * Retrieve a stored page result by slug. Returns null on miss or error.
 */
export async function getPageResult(slug: string): Promise<StoredPageResult | null> {
  if (!isConfigured()) return null;
  try {
    return await kv.get<StoredPageResult>(`${PAGE_PREFIX}${slug}`);
  } catch {
    return null;
  }
}
