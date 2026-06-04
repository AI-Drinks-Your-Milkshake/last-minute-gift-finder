'use client';

import { useState } from 'react';
import type { GiftIdea } from '@/types';

interface Props {
  gift: GiftIdea;
}

function buildAmazonLink(searchTerms: string): string {
  const tag = process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG;
  const query = encodeURIComponent(searchTerms);
  const url = `https://www.amazon.com/s?k=${query}`;
  return tag ? `${url}&tag=${encodeURIComponent(tag)}` : url;
}

type PriceTier = 'budget' | 'mid' | 'splurge';

function getPriceTier(priceRange: string): PriceTier {
  const match = priceRange.match(/\$(\d+)/);
  if (!match) return 'mid';
  const lower = parseInt(match[1], 10);
  if (lower < 75) return 'budget';
  if (lower < 300) return 'mid';
  return 'splurge';
}

const BADGE: Record<PriceTier, { label: string; bg: string; color: string }> = {
  budget:  { label: 'Budget pick', bg: 'var(--tier-budget-bg)',  color: 'var(--tier-budget-text)' },
  mid:     { label: 'Mid-range',   bg: 'var(--tier-mid-bg)',     color: 'var(--tier-mid-text)' },
  splurge: { label: 'Splurge',     bg: 'var(--tier-splurge-bg)', color: 'var(--tier-splurge-text)' },
};

export default function GiftCard({ gift }: Props) {
  const amazonUrl = buildAmazonLink(gift.searchTerms);
  const tier = getPriceTier(gift.priceRange);
  const { label, bg, color } = BADGE[tier];

  // Track browser-side load failure separately from the server-side null.
  const [imageBroken, setImageBroken] = useState(false);

  const imageLoading = gift.imageUrl === undefined;
  const showImage    = typeof gift.imageUrl === 'string' && !imageBroken;

  return (
    <div
      className="card-in group flex flex-col overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-1"
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-raise)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          '0 10px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(232,114,74,0.18)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.35)';
      }}
    >
      {/* ── Image / shimmer header ─────────────────────────────────────── */}

      {/* Shimmer skeleton while images are loading from /api/images */}
      {imageLoading && (
        <div
          className="animate-pulse"
          style={{ aspectRatio: '4 / 3', backgroundColor: '#1a1a24' }}
        />
      )}

      {/* Product image — only shown when we have a URL that loads successfully */}
      {showImage && (
        <div
          className="flex items-center justify-center bg-white"
          style={{ aspectRatio: '4 / 3' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gift.imageUrl as string}
            alt={gift.title}
            loading="lazy"
            onError={() => setImageBroken(true)}
            style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
          />
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col items-center p-6 text-center">
        {/* Title */}
        <h3
          className="mb-2 text-sm font-bold leading-snug"
          style={{ color: '#e0e0f0' }}
        >
          {gift.title}
        </h3>

        {/* Price + tier badge */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>
            {gift.priceRange}
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: bg, color }}
          >
            {label}
          </span>
        </div>

        {/* Description */}
        <p className="flex-1 text-sm leading-relaxed" style={{ color: '#7a7a92' }}>
          {gift.description}
        </p>
      </div>

      {/* Amazon CTA */}
      <div className="px-5 pb-5">
        <a
          href={amazonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Search on Amazon
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 10L10 2M10 2H4.5M10 2V7.5" />
          </svg>
        </a>
      </div>
    </div>
  );
}
