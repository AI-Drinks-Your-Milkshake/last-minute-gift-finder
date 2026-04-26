'use client';

import { useEffect, useState } from 'react';
import type { RecentSearch } from '@/types';

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function RecentSearches({ refreshKey }: { refreshKey: number }) {
  const [searches, setSearches] = useState<RecentSearch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/recent-searches')
      .then((r) => r.json())
      .then((data) => setSearches(data.searches ?? []))
      .catch(() => setSearches([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 py-0.5">
        <span className="shrink-0 text-xs font-medium" style={{ color: 'rgba(180,200,240,0.5)' }}>
          Recent:
        </span>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-6 animate-pulse rounded-full shrink-0"
            style={{ width: `${68 + i * 18}px`, backgroundColor: 'rgba(255,255,255,0.08)' }}
          />
        ))}
      </div>
    );
  }

  if (searches.length === 0) {
    return (
      <p className="py-0.5 text-xs" style={{ color: 'rgba(180,200,240,0.4)' }}>
        No recent searches yet — be the first!
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2.5 overflow-x-auto hide-scrollbar py-0.5">
      <span className="shrink-0 text-xs font-medium" style={{ color: 'rgba(180,200,240,0.55)' }}>
        Recent:
      </span>
      {searches.slice(0, 5).map((s) => (
        <span
          key={s.id}
          title={timeAgo(s.timestamp)}
          className="shrink-0 cursor-default whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'rgba(255,255,255,0.09)',
            borderColor: 'rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          {s.recipient} · {s.occasion}
        </span>
      ))}
    </div>
  );
}
