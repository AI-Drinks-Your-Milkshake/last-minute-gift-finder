'use client';

import { useRef, useState } from 'react';
import SearchForm from '@/components/SearchForm';
import GiftCard from '@/components/GiftCard';
import RecentSearches from '@/components/RecentSearches';
import type { GiftIdea, SearchFormData } from '@/types';

export default function Home() {
  const [gifts, setGifts] = useState<GiftIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<SearchFormData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const resultsRef = useRef<HTMLDivElement>(null);

  function handleSearchStart() {
    setGifts([]);
    setError(null);
    setLoading(true);
  }

  function handleResults(newGifts: GiftIdea[], formData: SearchFormData) {
    setLoading(false);
    setGifts(newGifts);
    setQuery(formData);
    setError(null);
    setRefreshKey((k) => k + 1);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function handleError(message: string) {
    setLoading(false);
    setError(message);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fdf8f2' }}>

      {/* ── Hero header ── */}
      <header
        className="text-white"
        style={{ background: 'linear-gradient(140deg, #1a2744 0%, #1f3461 60%, #1a3060 100%)' }}
      >
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <div className="mb-3 text-5xl select-none">🎁</div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Last Minute Gift Finder
          </h1>
          <p className="mt-3 text-lg" style={{ color: 'rgba(180,210,255,0.82)' }}>
            Tell us a little about them. We'll handle the rest.
          </p>
        </div>
      </header>

      {/* ── Recent searches strip ── */}
      <div
        className="border-b"
        style={{
          backgroundColor: '#131c36',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <div className="mx-auto max-w-3xl px-6 py-2.5">
          <RecentSearches refreshKey={refreshKey} />
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="mx-auto max-w-[680px] px-4 py-10">

        {/* Search form card */}
        <section
          className="rounded-2xl bg-white p-6 sm:p-8"
          style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.07)', border: '1px solid rgba(232,114,74,0.1)' }}
        >
          <h2 className="mb-6 text-lg font-semibold text-gray-900">Tell us about them</h2>
          <SearchForm
            onSearchStart={handleSearchStart}
            onResults={handleResults}
            onError={handleError}
          />
        </section>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Skeleton loaders — 2-col grid to match results */}
        {loading && (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl bg-white p-6"
                style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}
              >
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-gray-100" />
                <div className="mx-auto mb-2 h-4 w-3/4 rounded bg-gray-100" />
                <div className="mx-auto mb-4 h-3 w-1/3 rounded bg-gray-100" />
                <div className="mb-2 h-3 w-full rounded bg-gray-100" />
                <div className="mb-2 h-3 w-5/6 rounded bg-gray-100" />
                <div className="mt-5 h-9 w-full rounded-xl bg-gray-100" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {gifts.length > 0 && !loading && (
          <section ref={resultsRef} className="mt-8">
            <h2 className="mb-5 text-sm font-semibold text-gray-500">
              Gift ideas for{' '}
              <span className="text-gray-900">{query?.recipient}</span>
              {query?.occasion && (
                <>
                  {' '}·{' '}
                  <span className="text-gray-700">{query.occasion}</span>
                </>
              )}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {gifts.map((gift, i) => (
                <GiftCard key={i} gift={gift} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="pb-10 pt-6 text-center text-xs text-gray-400">
        Powered by GPT-4o mini &nbsp;·&nbsp; Amazon links may include affiliate tags
      </footer>
    </div>
  );
}
