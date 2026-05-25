'use client';

import { useState, FormEvent } from 'react';
import type { SearchFormData, GiftTheme } from '@/types';

const RECIPIENTS = [
  'Son', 'Daughter', 'Mom', 'Dad', 'Husband', 'Wife',
  'Boyfriend', 'Girlfriend', 'Brother', 'Sister', 'Friend',
  'Coworker', 'Boss', 'Grandma', 'Grandpa', 'Teacher',
  'Baby', 'Toddler', 'Teen Boy', 'Teen Girl',
];

const OCCASIONS = [
  'Birthday',
  'Holiday / Christmas',
  'Anniversary',
  "Valentine's Day",
  "Mother's Day",
  "Father's Day",
  'Graduation',
  'Wedding',
  'Baby Shower',
  'Housewarming',
  'Thank You',
  'Just Because',
  'Other',
];

const COUNT_OPTIONS = [6, 9, 12] as const;
const LEVEL_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'interested', label: 'Interested' },
  { value: 'enthusiast', label: 'Enthusiast' },
] as const;
const RELATEDNESS_OPTIONS = [
  { value: 'similar', label: 'Just Like This' },
  { value: 'mixed', label: 'Mix It Up' },
  { value: 'adventurous', label: 'Surprise Me' },
] as const;

const PRICE_MIN = 0;
const PRICE_MAX = 1500;
const PRICE_STEP = 25;

interface Props {
  onSearchStart: () => void;
  onResults: (themes: GiftTheme[], formData: SearchFormData) => void;
  onError: (message: string) => void;
}

const ChevronDown = () => (
  <svg
    className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
    style={{ color: 'var(--text-muted)' }}
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

function formatPrice(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
}

export default function SearchForm({ onSearchStart, onResults, onError }: Props) {
  const [form, setForm] = useState<SearchFormData>({
    recipient: '',
    age: '',
    occasion: '',
    interests: '',
    count: 9,
    priceMin: 0,
    priceMax: 1500,
    level: 'interested',
    relatedness: 'mixed',
  });
  const [loading, setLoading] = useState(false);

  function update<K extends keyof SearchFormData>(field: K, value: SearchFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updatePriceMin(raw: number) {
    const clamped = Math.min(raw, form.priceMax - PRICE_STEP);
    update('priceMin', Math.max(PRICE_MIN, clamped));
  }

  function updatePriceMax(raw: number) {
    const clamped = Math.max(raw, form.priceMin + PRICE_STEP);
    update('priceMax', Math.min(PRICE_MAX, clamped));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.recipient || !form.age.trim() || !form.occasion || !form.interests.trim()) {
      onError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    onSearchStart();

    try {
      const { relatedness: _relatedness, ...apiBody } = form;

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
      });

      const data = await res.json();

      if (!res.ok) {
        onError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      onResults(data.themes, form);
    } catch {
      onError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // Input style — dark surface with subtle border
  const fieldStyle: React.CSSProperties = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };
  const fieldClass =
    'w-full rounded-xl px-4 py-3 text-sm transition-colors placeholder:text-[#44445a] focus:outline-none focus:ring-2 focus:ring-[#e8724a]/35 focus:border-[#e8724a]';

  // Segmented chip-style toggle (mirrors design-rev.md chip pattern):
  // selected = white fill + dark text; default = surface bg + secondary text.
  function ChipButton({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium transition-all"
        style={
          active
            ? {
                backgroundColor: 'var(--chip-selected-bg)',
                color: 'var(--chip-selected-text)',
                border: '1px solid var(--chip-selected-bg)',
                fontWeight: 700,
              }
            : {
                backgroundColor: 'var(--surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }
        }
      >
        {children}
      </button>
    );
  }

  // Compute slider track gradient (highlighted between thumbs)
  const minPct = ((form.priceMin - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
  const maxPct = ((form.priceMax - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;

  const labelStyle: React.CSSProperties = { color: 'var(--text-soft)' };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Row: Who + Age */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="recipient" className="mb-1.5 block text-sm font-medium" style={labelStyle}>
            Who is this for? <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <div className="relative">
            <select
              id="recipient"
              value={form.recipient}
              onChange={(e) => update('recipient', e.target.value)}
              required
              className={`${fieldClass} appearance-none`}
              style={fieldStyle}
            >
              <option value="">Select…</option>
              {RECIPIENTS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </div>

        <div>
          <label htmlFor="age" className="mb-1.5 block text-sm font-medium" style={labelStyle}>
            Age <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input
            id="age"
            type="text"
            placeholder="e.g. 35, mid-40s, 8"
            value={form.age}
            onChange={(e) => update('age', e.target.value)}
            required
            className={fieldClass}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* Occasion */}
      <div>
        <label htmlFor="occasion" className="mb-1.5 block text-sm font-medium" style={labelStyle}>
          Occasion <span style={{ color: 'var(--accent)' }}>*</span>
        </label>
        <div className="relative">
          <select
            id="occasion"
            value={form.occasion}
            onChange={(e) => update('occasion', e.target.value)}
            required
            className={`${fieldClass} appearance-none`}
            style={fieldStyle}
          >
            <option value="">Select an occasion…</option>
            {OCCASIONS.map((occ) => (
              <option key={occ} value={occ}>{occ}</option>
            ))}
          </select>
          <ChevronDown />
        </div>
      </div>

      {/* Interests */}
      <div>
        <label htmlFor="interests" className="mb-1.5 block text-sm font-medium" style={labelStyle}>
          Interests &amp; personality <span style={{ color: 'var(--accent)' }}>*</span>
        </label>
        <textarea
          id="interests"
          rows={3}
          placeholder="e.g. obsessed with cooking and Italian food, loves hiking, recently got into cold plunging, hates clutter"
          value={form.interests}
          onChange={(e) => update('interests', e.target.value)}
          required
          className={`${fieldClass} resize-none`}
          style={fieldStyle}
        />
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          The more specific you are, the better the recommendations.
        </p>
      </div>

      {/* ── Refine results ── */}
      <div
        className="space-y-5 rounded-xl p-4"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Refine results
        </h3>

        {/* Count */}
        <div>
          <label className="mb-2 block text-sm font-medium" style={labelStyle}>
            How many ideas?
          </label>
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((c) => (
              <ChipButton
                key={c}
                active={form.count === c}
                onClick={() => update('count', c)}
              >
                {c}
              </ChipButton>
            ))}
          </div>
        </div>

        {/* Price */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label className="block text-sm font-medium" style={labelStyle}>
              Price range
            </label>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatPrice(form.priceMin)} – {formatPrice(form.priceMax)}
            </span>
          </div>
          <div className="dual-range-wrap">
            <div className="dual-range-track" />
            <div
              className="dual-range-fill"
              style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
            />
            <input
              type="range"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              value={form.priceMin}
              onChange={(e) => updatePriceMin(Number(e.target.value))}
              className="dual-range-input dual-range-input-min"
              aria-label="Minimum price"
            />
            <input
              type="range"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              value={form.priceMax}
              onChange={(e) => updatePriceMax(Number(e.target.value))}
              className="dual-range-input dual-range-input-max"
              aria-label="Maximum price"
            />
          </div>
          <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>$0</span>
            <span>$1.5k</span>
          </div>
        </div>

        {/* Level */}
        <div>
          <label className="mb-2 block text-sm font-medium" style={labelStyle}>
            How deep into this interest are they?
          </label>
          <div className="flex gap-2">
            {LEVEL_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                active={form.level === opt.value}
                onClick={() => update('level', opt.value)}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>
        </div>

        {/* Relatedness */}
        <div>
          <label className="mb-2 block text-sm font-medium" style={labelStyle}>
            How adventurous?
          </label>
          <div className="flex gap-2">
            {RELATEDNESS_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                active={form.relatedness === opt.value}
                onClick={() => update('relatedness', opt.value)}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Controls how far results stray from the literal interests.
          </p>
        </div>
      </div>

      {/* Submit — coral accent CTA */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl py-3.5 text-base font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: loading ? 'var(--surface)' : 'var(--accent)',
          color: loading ? 'var(--text-muted)' : '#fff',
          boxShadow: loading ? 'none' : '0 4px 22px rgba(232,114,74,0.35)',
        }}
      >
        {loading ? 'Finding the perfect gifts…' : '🎁  Find Gift Ideas'}
      </button>
    </form>
  );
}
