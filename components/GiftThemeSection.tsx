import type { GiftTheme } from '@/types';
import GiftCard from './GiftCard';

interface Props {
  theme: GiftTheme;
  cols?: number;
}

export default function GiftThemeSection({ theme, cols = 2 }: Props) {
  // Filter out gifts where the server confirmed there's no valid image URL.
  // This keeps the grid clean — every visible card will have a product photo.
  // (Browser-side broken images are handled separately in GiftCard.)
  const visibleGifts = theme.gifts.filter((g) => g.imageUrl != null);
  if (visibleGifts.length === 0) return null;

  const isDirect = theme.relatednessLevel === 1;

  return (
    <section className="mb-10 last:mb-0">
      {isDirect ? (
        <h3
          className="mb-4 text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {theme.label}
        </h3>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor:
                theme.relatednessLevel === 2 ? 'var(--tier-mid-bg)' : 'var(--tier-splurge-bg)',
              color:
                theme.relatednessLevel === 2 ? 'var(--tier-mid-text)' : 'var(--tier-splurge-text)',
            }}
          >
            {theme.relatednessLevel === 2 ? 'Adjacent' : 'Wildcard'}
          </span>
          <h3
            className="text-base font-medium italic"
            style={{ color: 'var(--text-soft)' }}
          >
            {theme.label}
          </h3>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16 }}>
        {visibleGifts.map((gift, i) => (
          <GiftCard key={`${theme.id}-${i}`} gift={gift} />
        ))}
      </div>
    </section>
  );
}
