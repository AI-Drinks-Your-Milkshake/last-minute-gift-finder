import { NextResponse } from 'next/server';
import { getRecentSearches } from '@/lib/kv';

export async function GET() {
  console.log('[recent-searches] KV_REST_API_URL set:', Boolean(process.env.KV_REST_API_URL));
  console.log('[recent-searches] KV_REST_API_TOKEN set:', Boolean(process.env.KV_REST_API_TOKEN));

  try {
    const searches = await getRecentSearches();
    console.log('[recent-searches] returned', searches.length, 'items');
    return NextResponse.json({ searches });
  } catch (err) {
    console.error('[recent-searches] fetch failed:', err);
    return NextResponse.json({ searches: [] });
  }
}
