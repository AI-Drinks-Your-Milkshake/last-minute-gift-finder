import { kv } from '@vercel/kv';
import type { RecentSearch, BetaSignup } from '@/types';

const RECENT_SEARCHES_KEY = 'recent_searches';
const SIGNUPS_KEY         = 'signups';
const MAX_RECENT = 20;

function isConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function isKvConfigured(): boolean {
  return isConfigured();
}

export async function addRecentSearch(
  search: Omit<RecentSearch, 'id'>,
): Promise<void> {
  if (!isConfigured()) return;

  const entry: RecentSearch = {
    ...search,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };

  await kv.lpush(RECENT_SEARCHES_KEY, entry);
  await kv.ltrim(RECENT_SEARCHES_KEY, 0, MAX_RECENT - 1);
}

export async function getRecentSearches(): Promise<RecentSearch[]> {
  if (!isConfigured()) return [];

  const results = await kv.lrange<RecentSearch>(RECENT_SEARCHES_KEY, 0, MAX_RECENT - 1);
  return results;
}

// ── Beta signups ─────────────────────────────────────────────────────────
// Stored as a Redis list under SIGNUPS_KEY. Each entry is a JSON object
// { email, ts } so we keep the timestamp alongside the address. Appending
// with rpush keeps the list in chronological order (oldest first); the
// /app/signups page reverses it for display.

export async function addSignup(email: string): Promise<void> {
  if (!isConfigured()) return;

  const entry: BetaSignup = {
    email,
    ts: Date.now(),
  };

  await kv.rpush(SIGNUPS_KEY, entry);
}

export async function getSignups(): Promise<BetaSignup[]> {
  if (!isConfigured()) return [];

  // 0..-1 = entire list
  const results = await kv.lrange<BetaSignup>(SIGNUPS_KEY, 0, -1);
  return results;
}
