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
  budget:  { label: 'Budget pick', bg: '#dcfce7', color: '#15803d' },
  mid:     { label: 'Mid-range',   bg: '#fef3c7', color: '#b45309' },
  splurge: { label: 'Splurge',     bg: '#fee2e2', color: '#c2410c' },
};

export default function GiftCard({ gift }: Props) {
  const amazonUrl = buildAmazonLink(gift.searchTerms);
  const tier = getPriceTier(gift.priceRange);
  const { label, bg, color } = BADGE[tier];

  return (
    <div
      className="group flex flex-col rounded-2xl bg-white transition-all duration-200 hover:-translate-y-1"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.12)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)';
      }}
    >
      {/* Body */}
      <div className="flex flex-1 flex-col items-center p-6 text-center">
        {/* Category emoji */}
        <div className="mb-4 text-5xl leading-none select-none">{gift.emoji || '🎁'}</div>

        {/* Title */}
        <h3 className="mb-2 text-sm font-bold leading-snug text-gray-900">{gift.title}</h3>

        {/* Price + tier badge */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{gift.priceRange}</span>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: bg, color }}
          >
            {label}
          </span>
        </div>

        {/* Description */}
        <p className="flex-1 text-sm leading-relaxed text-gray-500">{gift.description}</p>
      </div>

      {/* Amazon CTA */}
      <div className="px-5 pb-5">
        <a
          href={amazonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: 'linear-gradient(135deg, #e8724a 0%, #c85e35 100%)' }}
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
