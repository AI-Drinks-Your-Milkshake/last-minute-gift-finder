'use client';

import { useState, FormEvent } from 'react';
import type { SearchFormData, GiftIdea } from '@/types';

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

const CORAL = '#e8724a';

interface Props {
  onSearchStart: () => void;
  onResults: (gifts: GiftIdea[], formData: SearchFormData) => void;
  onError: (message: string) => void;
}

const ChevronDown = () => (
  <svg
    className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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

export default function SearchForm({ onSearchStart, onResults, onError }: Props) {
  const [form, setForm] = useState<SearchFormData>({
    recipient: '',
    age: '',
    occasion: '',
    interests: '',
  });
  const [loading, setLoading] = useState(false);

  function update(field: keyof SearchFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        onError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      onResults(data.gifts, form);
    } catch {
      onError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-[#e8724a] focus:outline-none focus:ring-2 focus:ring-[#e8724a]/20';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Row: Who + Age */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="recipient" className="mb-1.5 block text-sm font-medium text-gray-700">
            Who is this for? <span style={{ color: CORAL }}>*</span>
          </label>
          <div className="relative">
            <select
              id="recipient"
              value={form.recipient}
              onChange={(e) => update('recipient', e.target.value)}
              required
              className={`${fieldClass} appearance-none`}
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
          <label htmlFor="age" className="mb-1.5 block text-sm font-medium text-gray-700">
            Age <span style={{ color: CORAL }}>*</span>
          </label>
          <input
            id="age"
            type="text"
            placeholder="e.g. 35, mid-40s, 8"
            value={form.age}
            onChange={(e) => update('age', e.target.value)}
            required
            className={fieldClass}
          />
        </div>
      </div>

      {/* Occasion */}
      <div>
        <label htmlFor="occasion" className="mb-1.5 block text-sm font-medium text-gray-700">
          Occasion <span style={{ color: CORAL }}>*</span>
        </label>
        <div className="relative">
          <select
            id="occasion"
            value={form.occasion}
            onChange={(e) => update('occasion', e.target.value)}
            required
            className={`${fieldClass} appearance-none`}
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
        <label htmlFor="interests" className="mb-1.5 block text-sm font-medium text-gray-700">
          Interests &amp; personality <span style={{ color: CORAL }}>*</span>
        </label>
        <textarea
          id="interests"
          rows={3}
          placeholder="e.g. obsessed with cooking and Italian food, loves hiking, recently got into cold plunging, hates clutter"
          value={form.interests}
          onChange={(e) => update('interests', e.target.value)}
          required
          className={`${fieldClass} resize-none`}
        />
        <p className="mt-1.5 text-xs text-gray-400">
          The more specific you are, the better the recommendations.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl py-3.5 text-base font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: loading
            ? '#d1d5db'
            : 'linear-gradient(135deg, #e8724a 0%, #c85e35 100%)',
          boxShadow: loading ? 'none' : '0 4px 18px rgba(232,114,74,0.38)',
        }}
      >
        {loading ? 'Finding the perfect gifts…' : '🎁  Find Gift Ideas'}
      </button>
    </form>
  );
}
