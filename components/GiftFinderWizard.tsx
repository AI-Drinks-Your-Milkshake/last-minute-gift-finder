'use client';

import { useState, useMemo } from 'react';
import type { GiftTheme, SearchFormData } from '@/types';
import GiftThemeSection from './GiftThemeSection';

// ── Constants ──────────────────────────────────────────────────────────────

const RECIPIENTS = [
  'Son', 'Daughter', 'Mom', 'Dad', 'Husband', 'Wife',
  'Boyfriend', 'Girlfriend', 'Brother', 'Sister', 'Friend',
  'Coworker', 'Boss', 'Grandma', 'Grandpa', 'Teacher',
  'Baby', 'Toddler', 'Teen Boy', 'Teen Girl',
];

const OCCASIONS = [
  'Birthday', 'Holiday / Christmas', 'Anniversary',
  "Valentine's Day", "Mother's Day", "Father's Day",
  'Graduation', 'Wedding', 'Baby Shower',
  'Housewarming', 'Thank You', 'Just Because', 'Other',
];

const LEVELS: Array<{ value: SearchFormData['level']; label: string; desc: string }> = [
  { value: 'casual',     label: 'Casual',     desc: 'Dabbles occasionally, not obsessive' },
  { value: 'interested', label: 'Into it',    desc: 'Has some gear, regularly engaged' },
  { value: 'enthusiast', label: 'Enthusiast', desc: 'Deep hobby, loves niche stuff' },
];

const VIBES: Array<{ value: SearchFormData['relatedness']; label: string; desc: string }> = [
  { value: 'similar',    label: 'Just like this', desc: 'Ideas that directly match their interests' },
  { value: 'mixed',      label: 'Mix it up',      desc: 'Some obvious picks, some adjacent surprises' },
  { value: 'adventurous',label: 'Surprise me',    desc: 'Unexpected ideas that open new doors' },
];

const COUNT_OPTIONS = [6, 9, 12] as const;
const PRICE_MIN = 0;
const PRICE_MAX = 1500;
const PRICE_STEP = 25;
const STEP_NAMES = ['Who', 'Age', 'Occasion', 'About them', 'Adventurousness'];

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 'loading' | 'results';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
}

const DEFAULT_FORM: SearchFormData = {
  recipient: '',
  age: '',
  occasion: '',
  interests: '',
  count: 9,
  priceMin: 0,
  priceMax: 1500,
  level: 'interested',
  relatedness: 'mixed',
};

// Dark-surface style constants
const C = {
  bg:        '#0d0d11',
  surface:   '#16161e',
  border:    '#22222e',
  accent:    '#e8724a',
  textPri:   '#f2f2f8',
  textSec:   '#8888a2',
  textMuted: '#44445a',
};

// ── Main component ─────────────────────────────────────────────────────────

export default function GiftFinderWizard() {
  const [step,       setStep]       = useState<WizardStep>(0);
  const [form,       setForm]       = useState<SearchFormData>(DEFAULT_FORM);
  const [themes,     setThemes]     = useState<GiftTheme[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [resultForm, setResultForm] = useState<SearchFormData>(DEFAULT_FORM);

  // ── Form helpers ──

  function update<K extends keyof SearchFormData>(field: K, value: SearchFormData[K]) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateResultMin(raw: number) {
    const v = Math.min(raw, resultForm.priceMax - PRICE_STEP);
    setResultForm(prev => ({ ...prev, priceMin: Math.max(PRICE_MIN, v) }));
  }

  function updateResultMax(raw: number) {
    const v = Math.max(raw, resultForm.priceMin + PRICE_STEP);
    setResultForm(prev => ({ ...prev, priceMax: Math.min(PRICE_MAX, v) }));
  }

  function resetSearch() {
    setForm(DEFAULT_FORM);
    setThemes([]);
    setError(null);
    setStep(0);
  }

  // ── API call ──

  async function handleSubmit() {
    setStep('loading');
    setError(null);
    try {
      const { relatedness: _r, ...apiBody } = form;
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setStep(5);
        return;
      }
      setThemes(data.themes);
      setResultForm({ ...form });
      setStep('results');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStep(5);
    }
  }

  // ── Filtered results ──

  const visibleThemes = useMemo<GiftTheme[]>(() => {
    const { relatedness, priceMin, priceMax, count } = resultForm;
    const byFilter = themes
      .filter(t => {
        if (relatedness === 'similar')    return t.relatednessLevel === 1;
        if (relatedness === 'mixed')      return t.relatednessLevel <= 2;
        return true;
      })
      .map(t => ({
        ...t,
        gifts: t.gifts.filter(g => g.priceMin <= priceMax && g.priceMax >= priceMin),
      }))
      .filter(t => t.gifts.length > 0);

    let remaining = count;
    return byFilter
      .map(t => {
        const toShow = Math.min(t.gifts.length, remaining);
        remaining -= toShow;
        return { ...t, gifts: t.gifts.slice(0, toShow) };
      })
      .filter(t => t.gifts.length > 0);
  }, [themes, resultForm]);

  const totalVisible = visibleThemes.reduce((acc, t) => acc + t.gifts.length, 0);

  // ── Step metadata ──

  const isWizardStep = typeof step === 'number' && step >= 1 && step <= 5;
  const wizardStep   = isWizardStep ? (step as number) : 0;

  const stepValues = [
    form.recipient,
    form.age,
    form.occasion,
    form.interests.length > 35 ? form.interests.slice(0, 35) + '…' : form.interests,
    VIBES.find(v => v.value === form.relatedness)?.label ?? '',
  ];

  // ── Style helpers (defined outside JSX to avoid recreation noise) ──

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 16px',
    borderRadius: 22,
    fontSize: 14,
    border: `1px solid ${active ? C.textPri : C.border}`,
    background:  active ? C.textPri  : C.surface,
    color:        active ? C.bg       : C.textSec,
    cursor: 'pointer',
    fontWeight:   active ? 500 : 400,
    fontFamily: 'inherit',
  });

  const filterChipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 16,
    fontSize: 12,
    border: `1px solid ${active ? '#44445a' : C.border}`,
    background: active ? '#22222e' : C.surface,
    color:       active ? C.textPri  : C.textSec,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
  });

  const levelCardStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    background: active ? 'rgba(232,114,74,0.08)' : C.surface,
    border:     `1px solid ${active ? C.accent : C.border}`,
    borderRadius: 12,
    padding: '14px 12px',
    cursor: 'pointer',
    textAlign: 'left',
  });

  const vibeCardStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(232,114,74,0.08)' : C.surface,
    border:     `1px solid ${active ? C.accent : C.border}`,
    borderRadius: 12,
    padding: '14px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    textAlign: 'left',
  });

  const backBtn: React.CSSProperties = {
    background: 'none', border: 'none',
    color: C.textMuted, fontSize: 13, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4,
    fontFamily: 'inherit',
  };

  const continueBtn = (enabled: boolean): React.CSSProperties => ({
    background:   enabled ? C.accent : '#22222e',
    color:        enabled ? '#fff'   : C.textMuted,
    border: 'none', borderRadius: 12,
    padding: '13px 28px', fontSize: 15, fontWeight: 500,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
  });

  // ── Nav bar ────────────────────────────────────────────────────────────

  const navBar = (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 24px', borderBottom: `1px solid #16161e`,
      position: 'sticky', top: 0, zIndex: 10, backgroundColor: C.bg,
    }}>
      <button
        onClick={() => { if (step !== 0) resetSearch(); }}
        style={{
          fontSize: 14, fontWeight: 500, color: C.textPri,
          background: 'none', border: 'none',
          cursor: step !== 0 ? 'pointer' : 'default',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ color: C.accent }}>✦</span> Gift Finder
      </button>

      {isWizardStep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 120, height: 2, background: '#22222e', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: C.accent, borderRadius: 2,
              width: `${(wizardStep / 5) * 100}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: C.textMuted }}>{wizardStep} of 5</span>
        </div>
      )}

      {step === 'results' && (
        <button onClick={resetSearch} style={{
          background: 'none', border: `1px solid ${C.border}`,
          borderRadius: 20, padding: '4px 12px',
          fontSize: 12, color: C.textMuted, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          New search
        </button>
      )}
    </nav>
  );

  // ── Wizard progress sidebar ────────────────────────────────────────────

  const wizardSidebar = (
    <aside className="hidden lg:flex flex-col border-r flex-shrink-0"
      style={{ borderColor: '#16161e', width: 260, minHeight: 'calc(100vh - 52px)', padding: '28px 20px' }}>
      <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 20 }}>
        Your search
      </p>
      <div style={{ flex: 1 }}>
        {STEP_NAMES.map((name, i) => {
          const n = i + 1;
          const s = n < wizardStep ? 'done' : n === wizardStep ? 'active' : 'pending';
          return (
            <div key={name} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 12px', borderRadius: 10, marginBottom: 4,
              background: s === 'active' ? 'rgba(232,114,74,0.08)' : s === 'done' ? C.surface : 'transparent',
              border: `1px solid ${s === 'active' ? 'rgba(232,114,74,0.2)' : 'transparent'}`,
              opacity: s === 'pending' ? 0.4 : 1,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 500,
                background: s === 'active' ? C.accent : s === 'done' ? '#22222e' : C.surface,
                color:      s === 'active' ? '#fff'    : s === 'done' ? C.textSec  : C.textMuted,
                border: s === 'pending' ? `1px solid ${C.border}` : 'none',
              }}>
                {s === 'done' ? '✓' : n}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: s === 'pending' ? C.textMuted : C.textPri, marginBottom: 2 }}>
                  {name}
                </p>
                {s === 'done' && stepValues[i] && (
                  <p style={{ fontSize: 11, color: C.textSec }}>{stepValues[i]}</p>
                )}
                {s === 'active' && (
                  <p style={{ fontSize: 11, color: C.accent }}>In progress</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ paddingTop: 20, borderTop: `1px solid #16161e` }}>
        <p style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
          Your answers stay on this page and are never stored.
        </p>
      </div>
    </aside>
  );

  // ── Results sidebar ────────────────────────────────────────────────────

  const resultsSidebar = (
    <aside className="hidden lg:flex flex-col border-r flex-shrink-0"
      style={{ borderColor: '#16161e', width: 260, minHeight: 'calc(100vh - 52px)', padding: '28px 20px', gap: 20 }}>

      {/* Search summary */}
      <div>
        <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
          Your search
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {[form.recipient, form.age, form.occasion].filter(Boolean).map(v => (
            <span key={v} style={{ padding: '5px 10px', borderRadius: 20, fontSize: 12, background: C.textPri, color: C.bg, fontWeight: 500 }}>
              {v}
            </span>
          ))}
        </div>
        {form.interests && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Interests</p>
            <p style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{form.interests}</p>
          </div>
        )}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px' }}>
          <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>Depth</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {LEVELS.map(l => (
              <span key={l.value} style={filterChipStyle(form.level === l.value)}>{l.label}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: '#16161e' }} />

      {/* Refine controls */}
      <div>
        <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14 }}>
          Refine results
        </p>

        {/* Price */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: C.textSec }}>Price range</p>
            <span style={{ fontSize: 12, color: C.textPri, fontWeight: 500 }}>
              {fmt(resultForm.priceMin)} – {fmt(resultForm.priceMax)}
            </span>
          </div>
          <div className="dual-range-wrap">
            <div className="dual-range-track" />
            <div className="dual-range-fill" style={{
              left:  `${((resultForm.priceMin - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%`,
              right: `${100 - ((resultForm.priceMax - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%`,
            }} />
            <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
              value={resultForm.priceMin}
              onChange={e => updateResultMin(Number(e.target.value))}
              className="dual-range-input dual-range-input-min"
              aria-label="Minimum price" />
            <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
              value={resultForm.priceMax}
              onChange={e => updateResultMax(Number(e.target.value))}
              className="dual-range-input dual-range-input-max"
              aria-label="Maximum price" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>$0</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>$1.5k</span>
          </div>
        </div>

        {/* Adventurousness */}
        <div>
          <p style={{ fontSize: 12, color: C.textSec, marginBottom: 8 }}>How adventurous?</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {VIBES.map(v => (
              <button key={v.value}
                onClick={() => setResultForm(prev => ({ ...prev, relatedness: v.value }))}
                style={filterChipStyle(resultForm.relatedness === v.value)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );

  // ── Landing screen ─────────────────────────────────────────────────────

  const landingScreen = (
    <div className="flex lg:grid" style={{ minHeight: 'calc(100vh - 52px)' }}
      // On desktop: two-column via inline grid override
    >
      <div className="hidden lg:flex flex-col justify-center border-r flex-shrink-0"
        style={{ borderColor: '#16161e', width: 280, padding: '40px 28px', gap: 24 }}>
        <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          How it works
        </p>
        {[
          { icon: '👤', title: 'Tell us about them',    desc: 'Recipient, age, occasion, and interests in plain language' },
          { icon: '✨', title: 'AI generates ideas',    desc: 'Grouped from dead-on to unexpectedly brilliant' },
          { icon: '⚙️', title: 'Filter and refine',     desc: 'Narrow by price, count, or adventurousness' },
        ].map(item => (
          <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: C.surface, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
              {item.icon}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: C.textPri, marginBottom: 3 }}>{item.title}</p>
              <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <main style={{ flex: 1, padding: '60px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
        className="lg:px-12">
        <div style={{ maxWidth: 460 }}>
          <p style={{ fontSize: 12, color: C.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
            AI gift finder
          </p>
          <h1 style={{ fontSize: 38, fontWeight: 500, color: C.textPri, lineHeight: 1.15, marginBottom: 14, letterSpacing: '-0.02em' }}
            className="text-3xl lg:text-4xl">
            The perfect gift,<br />
            <span style={{ color: C.accent }}>in under a minute.</span>
          </h1>
          <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.7, marginBottom: 32, maxWidth: 380 }}>
            Describe who you&apos;re shopping for and we&apos;ll generate tailored ideas — from dead-on to unexpectedly brilliant.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
            {['Birthdays', 'Holidays', 'Anniversaries', 'Weddings', 'Just because'].map(tag => (
              <span key={tag} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, border: `1px solid ${C.border}`, color: C.textSec, background: C.surface }}>
                {tag}
              </span>
            ))}
          </div>
          <button onClick={() => setStep(1)} style={{
            background: C.accent, color: '#fff', border: 'none', borderRadius: 12,
            padding: '15px 32px', fontSize: 16, fontWeight: 500, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Get started →
          </button>
          <p style={{ fontSize: 11, color: C.textMuted, marginTop: 14 }}>
            Free · No account needed · Usually takes less than a minute
          </p>
        </div>
      </main>
    </div>
  );

  // ── Wizard step wrapper (shared padding + responsive) ──────────────────

  function StepWrap({ children }: { children: React.ReactNode }) {
    return (
      <div className="px-5 py-8 sm:px-10 lg:px-12 lg:py-10" style={{ maxWidth: 600 }}>
        {children}
      </div>
    );
  }

  // ── Step 1: Who ────────────────────────────────────────────────────────

  const step1 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 1 OF 5</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        Who&apos;s this gift for?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 28, lineHeight: 1.5 }}>
        Pick the closest relationship.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
        {RECIPIENTS.map(r => (
          <button key={r} onClick={() => update('recipient', r)} style={chipStyle(form.recipient === r)}>
            {r}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setStep(0)} style={backBtn}>← Back</button>
        <button onClick={() => { if (form.recipient) setStep(2); }} disabled={!form.recipient} style={continueBtn(!!form.recipient)}>
          Continue
        </button>
      </div>
    </StepWrap>
  );

  // ── Step 2: Age ────────────────────────────────────────────────────────

  const step2 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 2 OF 5</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        How old are they?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 28, lineHeight: 1.5 }}>
        A specific number or a rough range works fine.
      </p>
      <input
        type="text"
        placeholder="42"
        value={form.age}
        onChange={e => update('age', e.target.value)}
        autoFocus
        className="dark-input"
        style={{
          background: C.surface, border: `1px solid ${C.border}`,
          color: C.textPri, borderRadius: 14,
          padding: '18px 22px', fontSize: 32, fontWeight: 500,
          width: 200, display: 'block', marginBottom: 8,
          fontFamily: 'inherit', letterSpacing: '-0.01em',
        }}
      />
      <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 36 }}>e.g. 35, mid-40s, 8</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setStep(1)} style={backBtn}>← Back</button>
        <button onClick={() => { if (form.age.trim()) setStep(3); }} disabled={!form.age.trim()} style={continueBtn(!!form.age.trim())}>
          Continue
        </button>
      </div>
    </StepWrap>
  );

  // ── Step 3: Occasion ───────────────────────────────────────────────────

  const step3 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 3 OF 5</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        What&apos;s the occasion?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 28, lineHeight: 1.5 }}>
        Pick the one that fits best.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
        {OCCASIONS.map(o => (
          <button key={o} onClick={() => update('occasion', o)} style={chipStyle(form.occasion === o)}>
            {o}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setStep(2)} style={backBtn}>← Back</button>
        <button onClick={() => { if (form.occasion) setStep(4); }} disabled={!form.occasion} style={continueBtn(!!form.occasion)}>
          Continue
        </button>
      </div>
    </StepWrap>
  );

  // ── Step 4: About + Level ──────────────────────────────────────────────

  const step4 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 4 OF 5</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        Tell us about them.
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 24, lineHeight: 1.5 }}>
        Interests, hobbies, quirks — anything that helps paint a picture.
      </p>
      <textarea
        placeholder="e.g. obsessed with cooking and craft beer, loves camping, recently got into woodworking…"
        value={form.interests}
        onChange={e => update('interests', e.target.value)}
        rows={4}
        className="dark-textarea"
        style={{
          background: C.surface, border: `1px solid ${C.border}`,
          color: C.textPri, borderRadius: 14,
          padding: '14px 16px', fontSize: 14,
          width: '100%', fontFamily: 'inherit', resize: 'none',
          lineHeight: 1.6, marginBottom: 6, display: 'block',
        }}
      />
      <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 24 }}>More specific = better results</p>
      <p style={{ fontSize: 13, color: C.textSec, marginBottom: 12 }}>How deep into these interests are they?</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 36 }}>
        {LEVELS.map(l => (
          <button key={l.value} onClick={() => update('level', l.value)} style={levelCardStyle(form.level === l.value)}>
            <p style={{ fontSize: 13, fontWeight: 500, color: C.textPri, marginBottom: 2 }}>{l.label}</p>
            <p style={{ fontSize: 11, color: C.textSec }}>{l.desc}</p>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setStep(3)} style={backBtn}>← Back</button>
        <button onClick={() => { if (form.interests.trim()) setStep(5); }} disabled={!form.interests.trim()} style={continueBtn(!!form.interests.trim())}>
          Continue
        </button>
      </div>
    </StepWrap>
  );

  // ── Step 5: Adventurousness + Count ───────────────────────────────────

  const step5 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 5 OF 5</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        How adventurous?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 28, lineHeight: 1.5 }}>
        Should results stay close to their interests, or explore a bit?
      </p>
      {error && (
        <div style={{ background: 'rgba(232,75,75,0.10)', border: '1px solid rgba(232,75,75,0.30)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#f6a8a8' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, maxWidth: 480 }}>
        {VIBES.map(v => (
          <button key={v.value} onClick={() => update('relatedness', v.value)} style={vibeCardStyle(form.relatedness === v.value)}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${form.relatedness === v.value ? C.accent : C.textMuted}`,
              background: form.relatedness === v.value ? C.accent : 'transparent',
            }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: C.textPri, marginBottom: 2 }}>{v.label}</p>
              <p style={{ fontSize: 12, color: C.textSec }}>{v.desc}</p>
            </div>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 13, color: C.textSec, marginBottom: 10 }}>How many ideas?</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
        {COUNT_OPTIONS.map(c => (
          <button key={c} onClick={() => update('count', c)} style={{
            ...chipStyle(form.count === c),
            padding: '8px 20px', fontSize: 14,
          }}>
            {c}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setStep(4)} style={backBtn}>← Back</button>
        <button onClick={handleSubmit} style={{
          background: C.accent, color: '#fff', border: 'none', borderRadius: 12,
          padding: '14px 36px', fontSize: 16, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Find gift ideas
        </button>
      </div>
    </StepWrap>
  );

  // ── Loading screen ─────────────────────────────────────────────────────

  const loadingScreen = (
    <div className="px-5 py-8 sm:px-10 lg:px-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ maxWidth: 680, marginBottom: 16 }}>
        {Array.from({ length: form.count > 6 ? 6 : 4 }).map((_, i) => (
          <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, background: '#22222e', borderRadius: '50%' }} className="animate-pulse" />
            <div style={{ width: '70%', height: 14, background: '#22222e', borderRadius: 6 }} className="animate-pulse" />
            <div style={{ width: '45%', height: 12, background: '#1a1a24', borderRadius: 6 }} className="animate-pulse" />
            <div style={{ width: '100%', height: 10, background: '#1a1a24', borderRadius: 6 }} className="animate-pulse" />
            <div style={{ width: '80%',  height: 10, background: '#1a1a24', borderRadius: 6 }} className="animate-pulse" />
            <div style={{ width: '100%', height: 36, background: '#22222e', borderRadius: 8, marginTop: 4 }} className="animate-pulse" />
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: C.textMuted }}>Finding the perfect gifts…</p>
    </div>
  );

  // ── Results content ────────────────────────────────────────────────────

  const resultsContent = (
    <div className="px-5 py-6 sm:px-8 lg:px-10">
      {/* Mobile: summary + filter strip */}
      <div className="lg:hidden" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: C.textPri, fontWeight: 500, marginBottom: 10 }}>
          {totalVisible} ideas for {form.recipient}, {form.age} · {form.occasion}
        </p>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
          {VIBES.map(v => (
            <button key={v.value}
              onClick={() => setResultForm(prev => ({ ...prev, relatedness: v.value }))}
              style={{ ...filterChipStyle(resultForm.relatedness === v.value), flexShrink: 0 }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: results header */}
      <div className="hidden lg:flex" style={{ alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: C.textPri }}>
          Gift ideas for {form.recipient}
        </h2>
        <span style={{ fontSize: 13, color: C.textMuted }}>{form.occasion} · {form.age}</span>
        <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>
          {totalVisible} {totalVisible === 1 ? 'idea' : 'ideas'}
        </span>
      </div>

      {visibleThemes.length > 0 ? (
        visibleThemes.map(theme => (
          <GiftThemeSection key={theme.id} theme={theme} />
        ))
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.textSec }}>
            No gifts match the current filters. Try widening the price range or changing the adventurousness setting.
          </p>
        </div>
      )}

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid #16161e`, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: C.textMuted }}>
          Powered by Claude AI · Amazon links may include affiliate tags
        </p>
      </footer>
    </div>
  );

  // ── Root render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.textPri }}>
      {navBar}

      {/* Landing */}
      {step === 0 && landingScreen}

      {/* Wizard steps + loading + results — two-pane on desktop */}
      {step !== 0 && (
        <div className={isWizardStep || step === 'results' ? 'lg:flex' : ''}>
          {isWizardStep   && wizardSidebar}
          {step === 'results' && resultsSidebar}
          <div style={{ flex: 1, minHeight: 'calc(100vh - 52px)' }}>
            {step === 1         && step1}
            {step === 2         && step2}
            {step === 3         && step3}
            {step === 4         && step4}
            {step === 5         && step5}
            {step === 'loading' && loadingScreen}
            {step === 'results' && resultsContent}
          </div>
        </div>
      )}
    </div>
  );
}
