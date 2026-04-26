import { kv } from '@vercel/kv';
import type { RecentSearch } from '@/types';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT = 20;

function isConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
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
