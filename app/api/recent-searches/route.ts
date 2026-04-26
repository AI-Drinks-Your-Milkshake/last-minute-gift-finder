import { NextResponse } from 'next/server';
import { getRecentSearches } from '@/lib/kv';

export async function GET() {
  try {
    const searches = await getRecentSearches();
    return NextResponse.json({ searches });
  } catch (err) {
    console.error('Recent searches fetch failed:', err);
    return NextResponse.json({ searches: [] });
  }
}
