'use client';

import { useMemo, useRef, useState } from 'react';
import SearchForm from '@/components/SearchForm';
import GiftThemeSection from '@/components/GiftThemeSection';
import RecentSearches from '@/components/RecentSearches';
import type { GiftTheme, SearchFormData } from '@/types';

export default function Home() {
  const [themes, setThemes] = useState<GiftTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<SearchFormData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const resultsRef = useRef<HTMLDivElement>(null);

  function handleSearchStart() {
    setThemes([]);
    setError(null);
    setLoading(true);
  }

  function handleResults(newThemes: GiftTheme[], formData: SearchFormData) {
    setLoading(false);
    setThemes(newThemes);
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

  const visibleThemes = useMemo<GiftTheme[]>(() => {
    if (!query) return themes;
    const { relatedness, priceMin, priceMax } = query;

    return themes
      .filter((t) => {
        if (relatedness === 'similar') return t.relatednessLevel === 1;
        if (relatedness === 'mixed') return t.relatednessLevel <= 2;
        return true; // adventurous
      })
      .map((t) => ({
        ...t,
        gifts: t.gifts.filter(
          (g) => g.priceMin <= priceMax && g.priceMax >= priceMin,
        ),
      }))
      .filter((t) => t.gifts.length > 0);
  }, [themes, query]);

  const totalVisible = visibleThemes.reduce((acc, t) => acc + t.gifts.length, 0);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── Hero header ── */}
      <header
        style={{
          backgroundColor: 'var(--bg)',
          borderBottom: '1px solid var(--border-raise)',
        }}
      >
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center text-3xl select-none"
            style={{
              backgroundColor: 'var(--accent)',
              borderRadius: 16,
              boxShadow: '0 8px 24px rgba(232,114,74,0.35)',
            }}
          >
            🎁
          </div>
          <h1
            className="text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: 'var(--text-primary)' }}
          >
            Find the perfect gift.
          </h1>
          <p
            className="mt-3 text-base"
            style={{ color: 'var(--text-muted)' }}
          >
            Tell us a little about them. We&apos;ll handle the rest.
          </p>
        </div>
      </header>

      {/* ── Recent searches strip ── */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border-raise)',
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
          className="rounded-2xl p-6 sm:p-8"
          style={{
            backgroundColor: 'var(--surface-raise)',
            border: '1px solid var(--border-raise)',
            boxShadow: '0 2px 20px rgba(0,0,0,0.4)',
          }}
        >
          <h2
            className="mb-6 text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Tell us about them
          </h2>
          <SearchForm
            onSearchStart={handleSearchStart}
            onResults={handleResults}
            onError={handleError}
          />
        </section>

        {/* Error */}
        {error && (
          <div
            className="mt-6 rounded-xl px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(232,75,75,0.10)',
              border: '1px solid rgba(232,75,75,0.30)',
              color: '#f6a8a8',
            }}
          >
            {error}
          </div>
        )}

        {/* Skeleton loaders — 3 section-shaped skeletons */}
        {loading && (
          <div className="mt-8 space-y-10">
            {Array.from({ length: 3 }).map((_, sectionIdx) => (
              <div key={sectionIdx}>
                <div
                  className="mb-4 h-5 w-1/3 animate-pulse rounded"
                  style={{ backgroundColor: 'var(--border-raise)' }}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded-2xl p-6"
                      style={{
                        backgroundColor: 'var(--surface-card)',
                        border: '1px solid var(--border-raise)',
                      }}
                    >
                      <div
                        className="mx-auto mb-4 h-12 w-12 rounded-full"
                        style={{ backgroundColor: 'var(--border)' }}
                      />
                      <div
                        className="mx-auto mb-2 h-4 w-3/4 rounded"
                        style={{ backgroundColor: 'var(--border)' }}
                      />
                      <div
                        className="mx-auto mb-4 h-3 w-1/3 rounded"
                        style={{ backgroundColor: 'var(--border)' }}
                      />
                      <div
                        className="mb-2 h-3 w-full rounded"
                        style={{ backgroundColor: 'var(--border)' }}
                      />
                      <div
                        className="mb-2 h-3 w-5/6 rounded"
                        style={{ backgroundColor: 'var(--border)' }}
                      />
                      <div
                        className="mt-5 h-9 w-full rounded-lg"
                        style={{ backgroundColor: 'var(--border)' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {themes.length > 0 && !loading && (
          <section ref={resultsRef} className="mt-8">
            <h2
              className="mb-5 text-sm font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              Gift ideas for{' '}
              <span style={{ color: 'var(--text-primary)' }}>{query?.recipient}</span>
              {query?.occasion && (
                <>
                  {' '}·{' '}
                  <span style={{ color: 'var(--text-soft)' }}>{query.occasion}</span>
                </>
              )}
              {totalVisible > 0 && (
                <span className="ml-2" style={{ color: 'var(--text-muted)' }}>
                  ({totalVisible} {totalVisible === 1 ? 'idea' : 'ideas'})
                </span>
              )}
            </h2>

            {visibleThemes.length > 0 ? (
              visibleThemes.map((theme) => (
                <GiftThemeSection key={theme.id} theme={theme} />
              ))
            ) : (
              <p
                className="rounded-xl px-4 py-6 text-center text-sm"
                style={{
                  backgroundColor: 'var(--surface-card)',
                  border: '1px solid var(--border-raise)',
                  color: 'var(--text-secondary)',
                }}
              >
                No gifts match the current filters. Try widening the price range or relatedness.
              </p>
            )}
          </section>
        )}
      </main>

      <footer
        className="pb-10 pt-6 text-center text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        Powered by GPT-4o mini &nbsp;·&nbsp; Amazon links may include affiliate tags
      </footer>
    </div>
  );
}
