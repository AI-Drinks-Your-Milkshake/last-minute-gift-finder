'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

declare global {
  interface Window { __devLog?: (msg: string) => void; }
}
import type { GiftTheme, GiftIdea, SearchFormData } from '@/types';
import GiftThemeSection from './GiftThemeSection';
import PinPreview from './PinPreview';
import DevPanel, { clearDevLog } from './DevPanel';
import { RECIPIENT_GROUPS, COMMON_RECIPIENTS } from '@/lib/recipients';
import { OCCASIONS } from '@/lib/occasions';
import { AESTHETICS, FEATURED_VIBE_VALUES } from '@/lib/aesthetics';
import { selectThemesForDisplay, countGifts, flattenGifts } from '@/lib/select-gifts';

const LEVELS: Array<{ value: SearchFormData['level']; label: string; desc: string }> = [
  { value: 'casual',     label: 'Casual',     desc: 'Dabbles occasionally, not obsessive' },
  { value: 'interested', label: 'Into it',    desc: 'Has some gear, regularly engaged' },
  { value: 'enthusiast', label: 'Enthusiast', desc: 'Deep hobby, loves niche stuff' },
];

const VIBES: Array<{ value: SearchFormData['relatedness']; label: string; desc: string }> = [
  { value: 'similar',     label: 'Just like this', desc: 'Ideas that directly match their interests' },
  { value: 'mixed',       label: 'Mix it up',      desc: 'Some obvious picks, some adjacent surprises' },
  { value: 'adventurous', label: 'Surprise me',    desc: 'Unexpected ideas that open new doors' },
];

const PRICE_MIN  = 0;
const PRICE_MAX  = 1500;
const PRICE_STEP = 25;
const COUNT_MIN  = 3;
const COUNT_MAX  = 30;
const COUNT_STEP = 1;
// Vibe is step 5 (optional). Adventurousness shifted to step 6.
const STEP_NAMES = ['Who', 'Age', 'Occasion', 'About them', 'Vibe', 'Adventurousness'];
const TOTAL_STEPS = STEP_NAMES.length;
const MAX_VIBES = 2;

// Which vibe chips to render: the full list when expanded, otherwise the
// featured subset plus any vibe the user has already selected (so a selected
// chip never hides behind "Show all").
function visibleAesthetics(selected: string[], showAll: boolean) {
  if (showAll) return AESTHETICS;
  return AESTHETICS.filter(
    a => FEATURED_VIBE_VALUES.includes(a.value) || selected.includes(a.value),
  );
}

const TAGLINE = 'As an Amazon Associate we earn from qualifying purchases.';

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 'loading' | 'results';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
}

const DEFAULT_FORM: SearchFormData = {
  recipient:  '',
  age:        '',
  occasion:   '',
  interests:  '',
  count:      9,
  priceMin:   0,
  priceMax:   1500,
  level:      'interested',
  relatedness:'mixed',
  vibes:      [],
};

const C = {
  bg:        '#0d0d11',
  surface:   '#16161e',
  border:    '#22222e',
  accent:    '#e8724a',
  textPri:   '#f2f2f8',
  textSec:   '#8888a2',
  textMuted: '#44445a',
};

// ── Wizard step wrapper — module-level so React never remounts it ──────────

function StepWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-8 sm:px-10 lg:px-12 lg:py-10" style={{ maxWidth: 600 }}>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function GiftFinderWizard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [step,           setStep]           = useState<WizardStep>(1);
  // Vibe lists default to a featured subset; these reveal the full list.
  const [showAllVibesStep,    setShowAllVibesStep]    = useState(false);
  const [showAllVibesSidebar, setShowAllVibesSidebar] = useState(false);
  // Who step defaults to a "Common" cluster; this reveals the full grouped list.
  const [showAllRecipients,   setShowAllRecipients]   = useState(false);
  const [form,           setForm]           = useState<SearchFormData>(DEFAULT_FORM);
  const [themes,         setThemes]         = useState<GiftTheme[]>([]);
  const [error,          setError]          = useState<string | null>(null);
  const [resultForm,     setResultForm]     = useState<SearchFormData>(DEFAULT_FORM);
  const [refreshing,     setRefreshing]     = useState(false);
  const [committedLevel,      setCommittedLevel]      = useState<SearchFormData['level']>('interested');
  const [committedCount,      setCommittedCount]      = useState<number>(9);
  const [committedPriceMin,   setCommittedPriceMin]   = useState<number>(0);
  const [committedPriceMax,   setCommittedPriceMax]   = useState<number>(1500);
  const [committedVibes,      setCommittedVibes]      = useState<string[]>([]);
  const [committedRelatedness, setCommittedRelatedness] = useState<SearchFormData['relatedness']>('mixed');
  const [pageSlug,            setPageSlug]            = useState<string | null>(null);
  const [pinImageUrl,         setPinImageUrl]         = useState<string | null>(null);
  // True once the /api/cards stream has fully closed. Drives the loading band
  // (narration + progress) and gates the published-count surface logs.
  const [imagesSettled,       setImagesSettled]       = useState(false);
  // Transient hint shown after the (MVP no-op) "Save this person" button.
  const [saveHinted,          setSaveHinted]          = useState(false);
  // Streaming progress (complete cards emitted / requested) for the loading bar.
  const [progress,            setProgress]            = useState<{ emitted: number; target: number }>({ emitted: 0, target: 9 });
  // Input-aware narration shown while the first cards are being generated.
  const [narrationIdx,        setNarrationIdx]        = useState(0);
  const narrationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reveal queue — the stream fills `received`; a steady timer pops one card at
  // a time onto screen, so strict-order server bursts drip in smoothly rather
  // than flooding. Purely visual (no extra requests).
  const revealTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const receivedRef  = useRef<Array<{ themeId: string; themeLabel: string; level: 1 | 2 | 3; gift: GiftIdea }>>([]);
  const revealedRef  = useRef(0);
  const streamDoneRef = useRef(false);
  const abortRef     = useRef<AbortController | null>(null);
  const REVEAL_MS = 120;

  const narrationLines = useMemo(() => {
    const who = form.recipient || 'them';
    const interest = form.interests ? form.interests.split(/[,;]/)[0].trim() : '';
    return [
      `Getting to know ${who}…`,
      interest ? `Zeroing in on ${interest}…` : `Reading what makes ${who} tick…`,
      'Scanning thousands of products…',
      'Picking the dead-on matches…',
      `Hunting for a few they'd never expect…`,
      'Lining up the photos…',
    ];
  }, [form.recipient, form.interests]);

  function startNarration() {
    setNarrationIdx(0);
    if (narrationTimer.current) clearInterval(narrationTimer.current);
    narrationTimer.current = setInterval(() => {
      setNarrationIdx((i) => Math.min(i + 1, narrationLines.length - 1));
    }, 2200);
  }
  function stopNarration() {
    if (narrationTimer.current) { clearInterval(narrationTimer.current); narrationTimer.current = null; }
  }

  // Regroup the revealed slice of received cards back into themes for display.
  function regroupRevealed(): GiftTheme[] {
    const items = receivedRef.current.slice(0, revealedRef.current);
    const out: GiftTheme[] = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (!last || last.id !== it.themeId) {
        out.push({ id: it.themeId, label: it.themeLabel, relatednessLevel: it.level, gifts: [it.gift] });
      } else {
        last.gifts.push(it.gift);
      }
    }
    return out;
  }

  function stopReveal() {
    if (revealTimer.current) { clearInterval(revealTimer.current); revealTimer.current = null; }
  }

  // Reset buffers and start the steady one-at-a-time reveal cadence.
  function startReveal() {
    receivedRef.current = [];
    revealedRef.current = 0;
    streamDoneRef.current = false;
    stopReveal();
    revealTimer.current = setInterval(() => {
      if (revealedRef.current < receivedRef.current.length) {
        revealedRef.current += 1;
        setThemes(regroupRevealed());
        setProgress((p) => ({ emitted: revealedRef.current, target: p.target }));
      } else if (streamDoneRef.current) {
        // Buffer drained and the stream has closed → finish.
        stopReveal();
        setImagesSettled(true);
        stopNarration();
      }
    }, REVEAL_MS);
  }

  // We run a single model (Haiku). If a stale ?model= param is in the URL
  // (e.g. a saved tab from when the model toggle existed), strip it so the
  // address bar stays clean — it has no effect anymore.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('model')) {
      url.searchParams.delete('model');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  // ── Dev log ──
  const devStart = useRef<number>(Date.now());
  function devLog(msg: string) {
    const elapsed = ((Date.now() - devStart.current) / 1000).toFixed(1);
    if (typeof window !== 'undefined') window.__devLog?.(`+${elapsed}s ${msg}`);
  }

  // ── Display preferences (no re-fetch needed) ──
  const [gridCols, setGridCols] = useState(4);
  const [pinWidth, setPinWidth] = useState(340);

  // Drag-to-resize for the pin column. Captures start state on mousedown,
  // then tracks delta on mousemove until mouseup cleans up.
  const pinDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function handlePinDragStart(e: React.MouseEvent) {
    e.preventDefault();
    pinDragRef.current = { startX: e.clientX, startWidth: pinWidth };
    const onMove = (ev: MouseEvent) => {
      if (!pinDragRef.current) return;
      // Dragging the left edge leftward widens the panel.
      const delta = pinDragRef.current.startX - ev.clientX;
      setPinWidth(Math.max(240, Math.min(700, pinDragRef.current.startWidth + delta)));
    };
    const onUp = () => {
      pinDragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

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
    clearDevLog();
    abortRef.current?.abort();     // cancel any in-flight card stream
    stopReveal();
    stopNarration();
    setForm(DEFAULT_FORM);
    setThemes([]);
    setError(null);
    setPageSlug(null);
    setPinImageUrl(null);
    setImagesSettled(false);
    setStep(1);
  }

  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    // Full reload so the server recomputes isAdmin (cookie is now cleared).
    window.location.href = '/app';
  }

  // ── Complete-card stream consumer ──
  // Reads /api/cards (SSE). Each `card` event is a fully-formed gift (text +
  // image) in strict display order — we append it to its theme so the card
  // locks in complete, no text-only state. `progress` drives the loading bar.
  // Returns when the stream closes.
  async function runCardStream(body: object, signal?: AbortSignal): Promise<{
    slug: string | null; pinUrl: string | null; emitted: number; errored: boolean;
  }> {
    const start = Date.now();
    let slug: string | null = null;
    let pinUrl: string | null = null;
    let emitted = 0;
    let errored = false;

    const res = await fetch('/api/cards', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal,
    });
    devLog(`[stream] /api/cards responded ${res.status}`);
    if (!res.body) return { slug, pinUrl, emitted, errored: true };

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        devLog(`[stream] closed after ${((Date.now() - start) / 1000).toFixed(1)}s — ${emitted} cards`);
        break;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';

      for (const part of parts) {
        const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try {
          const ev = JSON.parse(dataLine.slice(6)) as {
            type: string; msg?: string; message?: string;
            card?: { themeId: string; themeLabel: string; relatednessLevel: 1 | 2 | 3 } & GiftIdea;
            emitted?: number; target?: number; pageSlug?: string; pinImageUrl?: string;
          };
          if (ev.type === 'log') { const m = ev.msg ?? ev.message; if (m) devLog(m); }
          else if (ev.type === 'card' && ev.card) {
            const c = ev.card;
            // Buffer it — the reveal queue renders one card at a time.
            receivedRef.current.push({
              themeId: c.themeId, themeLabel: c.themeLabel, level: c.relatednessLevel,
              gift: {
                title: c.title, description: c.description, priceRange: c.priceRange,
                priceMin: c.priceMin, priceMax: c.priceMax, searchTerms: c.searchTerms, imageUrl: c.imageUrl,
              },
            });
            emitted++;
          }
          // (server `progress` events are ignored — the reveal queue drives the bar)
          else if (ev.type === 'done') { slug = ev.pageSlug ?? null; pinUrl = ev.pinImageUrl ?? null; }
          else if (ev.type === 'error') { errored = true; if (ev.message) setError(ev.message); }
        } catch { /* malformed event — skip */ }
      }
    }
    return { slug, pinUrl, emitted, errored };
  }

  // ── Initial search ──
  // Optimistic: jump straight to the results layout (header + their chips), then
  // stream complete cards in. Narration + a progress bar fill the brief wait
  // before the first card lands (~5-7s).

  async function handleSubmit() {
    clearDevLog();
    devStart.current = Date.now();
    devLog(`[search] ${form.recipient} · ${form.age} · ${form.occasion}${form.interests ? ` · "${form.interests.slice(0, 40)}"` : ''}`);

    setThemes([]);
    setError(null);
    setPageSlug(null);
    setPinImageUrl(null);
    setImagesSettled(false);
    setProgress({ emitted: 0, target: form.count });

    // Commit the search params immediately so the header, sidebar summary and
    // pin preview reflect THIS search from the first frame.
    setResultForm({ ...form });
    setCommittedLevel(form.level);
    setCommittedCount(form.count);
    setCommittedPriceMin(form.priceMin);
    setCommittedPriceMax(form.priceMax);
    setCommittedVibes(form.vibes ?? []);
    setCommittedRelatedness(form.relatedness);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    startReveal();      // resets buffers + starts the one-at-a-time cadence
    startNarration();
    setStep('results'); // optimistic transition — no separate skeleton screen

    try {
      const { emitted, slug, pinUrl, errored } = await runCardStream({
        recipient: form.recipient, age: form.age, occasion: form.occasion, interests: form.interests,
        count: form.count, priceMin: form.priceMin, priceMax: form.priceMax,
        level: form.level, relatedness: form.relatedness, vibes: form.vibes ?? [],
      }, abortRef.current.signal);
      if (slug) setPageSlug(slug);
      if (pinUrl) setPinImageUrl(pinUrl);
      // Tell the reveal queue the stream is done; it settles once it drains.
      streamDoneRef.current = true;
      if (emitted === 0 && !errored) {
        stopReveal(); stopNarration(); setImagesSettled(true);
        devLog('[stream] 0 cards received — see the [error]/[anthropic] lines above');
        setError('Something went wrong. Please try again.');
        setStep(6);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // superseded by a newer search
      stopReveal(); stopNarration(); setImagesSettled(true);
      devLog(`[stream] aborted: ${err instanceof Error ? err.message : String(err)}`);
      setError('Network error. Please check your connection and try again.');
      setStep(6);
    }
  }

  // ── Refresh (re-stream with new depth/count/etc from the sidebar) ──

  async function handleRefresh() {
    devStart.current = Date.now();
    devLog(`[refresh] count=${resultForm.count} level=${resultForm.level} relatedness=${resultForm.relatedness}`);
    setRefreshing(true);
    setThemes([]);
    setImagesSettled(false);
    setProgress({ emitted: 0, target: resultForm.count });
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    startReveal();
    startNarration();

    try {
      const { emitted, slug, pinUrl } = await runCardStream({
        recipient: form.recipient, age: form.age, occasion: form.occasion, interests: form.interests,
        count: resultForm.count, priceMin: resultForm.priceMin, priceMax: resultForm.priceMax,
        level: resultForm.level, relatedness: resultForm.relatedness, vibes: resultForm.vibes ?? [],
      }, abortRef.current.signal);
      streamDoneRef.current = true; // reveal queue settles once it drains
      if (emitted > 0) {
        setCommittedLevel(resultForm.level);
        setCommittedCount(resultForm.count);
        setCommittedPriceMin(resultForm.priceMin);
        setCommittedPriceMax(resultForm.priceMax);
        setCommittedVibes(resultForm.vibes ?? []);
        setCommittedRelatedness(resultForm.relatedness);
        if (slug) setPageSlug(slug);
        if (pinUrl) setPinImageUrl(pinUrl);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') { setRefreshing(false); return; }
      stopReveal(); stopNarration(); setImagesSettled(true);
    } finally {
      setRefreshing(false);
    }
  }

  // Compare unordered string arrays (vibes are a small set, max 2 entries)
  function arraysDiffer(a: string[] | undefined, b: string[] | undefined): boolean {
    const aa = (a ?? []).slice().sort().join('|');
    const bb = (b ?? []).slice().sort().join('|');
    return aa !== bb;
  }

  // The refresh button appears whenever a filter change WIDENS the search beyond
  // what the model was originally asked for — those changes can't be satisfied by
  // the existing result set and require a re-fetch. Narrowing changes (lower
  // count, tighter price range, less adventurous) are applied live by the
  // visibleThemes filter below without hitting the API. Relatedness is purely
  // client-side (all themes are always fetched), so it never triggers refresh.
  //
  // Vibe changes ALWAYS require a refresh — vibes shape the underlying
  // recommendations, and there's no metadata on already-returned gifts to
  // filter them client-side by vibe.
  const needsRefresh =
    resultForm.level       !== committedLevel       ||
    resultForm.count       !== committedCount       ||
    resultForm.priceMin     <  committedPriceMin    ||
    resultForm.priceMax     >  committedPriceMax    ||
    arraysDiffer(resultForm.vibes, committedVibes)  ||
    resultForm.relatedness !== committedRelatedness;

  // ── Filtered results ──

  const visibleThemes = useMemo<GiftTheme[]>(() => {
    const { relatedness, priceMin, priceMax } = resultForm;

    // Apply the live price refinement first (gift-level), then hand off to the
    // shared selection used by EVERY surface. `strict: false` lets gifts whose
    // image is still loading render as shimmer cards immediately; as images
    // resolve, imageless gifts drop out and the count converges to exactly N.
    const priceFiltered = themes
      .map(t => ({
        ...t,
        gifts: t.gifts.filter(g => g.priceMin <= priceMax && g.priceMax >= priceMin),
      }))
      .filter(t => t.gifts.length > 0);

    return selectThemesForDisplay(priceFiltered, relatedness, committedCount, { strict: false });
  }, [themes, resultForm, committedCount]);

  // ── Published-count dev logs (all four surfaces) ──────────────────────────
  // Once enrichment has settled, record exactly what each surface publishes.
  // The public page and pin image are computed with the identical shared
  // selection on the full theme set, so the client can report their counts
  // accurately without a server round-trip. (With lazy enrichment, many gifts
  // intentionally stay un-looked-up, so we gate on imagesSettled, not on every
  // image having resolved.)
  const publishedThemes = useMemo(
    () => selectThemesForDisplay(themes, committedRelatedness, committedCount, { strict: true }),
    [themes, committedRelatedness, committedCount],
  );
  const lastLoggedRef = useRef<string>('');
  useEffect(() => {
    if (step !== 'results' || refreshing) return;
    if (themes.length === 0 || !imagesSettled) return;

    const searchCount   = countGifts(visibleThemes);
    const pinPreview     = flattenGifts(visibleThemes).filter(g => typeof g.imageUrl === 'string').slice(0, 30);
    const pinPreviewCount = pinPreview.length;
    const pageCount      = countGifts(publishedThemes);
    const pinImageCount  = Math.min(30, pageCount);

    const sig = `${searchCount}|${pinPreviewCount}|${pageCount}|${pinImageCount}`;
    if (lastLoggedRef.current === sig) return;
    lastLoggedRef.current = sig;

    devLog(`[surface] search results: ${searchCount} gifts`);
    devLog(`[surface] pin preview: ${pinPreviewCount} products`);
    devLog(`[surface] public page: ${pageCount} gifts`);
    devLog(`[surface] pin image: ${pinImageCount} products`);

    // Shortfall is an error — oversampling is supposed to prevent it. Surface
    // it loudly so we can measure how often it actually happens.
    if (searchCount < committedCount) {
      devLog(`[surface] ⚠ ERROR shortfall: ${searchCount}/${committedCount} gifts have images — increase oversampling`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, refreshing, imagesSettled, visibleThemes, publishedThemes, committedCount]);

  // ── Step metadata ──


  const isWizardStep = typeof step === 'number' && step >= 1 && step <= TOTAL_STEPS;
  const wizardStep   = isWizardStep ? (step as number) : 0;
  const displayStep  = step === 'loading' ? TOTAL_STEPS + 1 : wizardStep;

  const stepValues = [
    form.recipient,
    form.age,
    form.occasion,
    form.interests.length > 35 ? form.interests.slice(0, 35) + '…' : form.interests,
    (form.vibes && form.vibes.length > 0)
      ? AESTHETICS.filter(a => form.vibes!.includes(a.value)).map(a => a.label).join(', ')
      : 'Skipped',
    VIBES.find(v => v.value === form.relatedness)?.label ?? '',
  ];

  // ── Slider index helpers ──

  const vibeIdx  = VIBES.findIndex(v => v.value === resultForm.relatedness);
  const levelIdx = LEVELS.findIndex(l => l.value === resultForm.level);

  // ── Style helpers ──

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 22, fontSize: 14,
    border:     `1px solid ${active ? C.textPri : C.border}`,
    background:  active ? C.textPri : C.surface,
    color:       active ? C.bg      : C.textSec,
    cursor: 'pointer', fontWeight: active ? 500 : 400, fontFamily: 'inherit',
  });

  const levelCardStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    background:  active ? 'rgba(232,114,74,0.08)' : C.surface,
    border:     `1px solid ${active ? C.accent : C.border}`,
    borderRadius: 12, padding: '14px 12px', cursor: 'pointer', textAlign: 'left',
  });

  const vibeCardStyle = (active: boolean): React.CSSProperties => ({
    background:  active ? 'rgba(232,114,74,0.08)' : C.surface,
    border:     `1px solid ${active ? C.accent : C.border}`,
    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
  });

  const backBtn: React.CSSProperties = {
    background: 'none', border: 'none', color: C.textMuted,
    fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
    fontFamily: 'inherit',
  };

  const continueBtn = (enabled: boolean): React.CSSProperties => ({
    background: enabled ? C.accent : '#22222e',
    color:      enabled ? '#fff'   : C.textMuted,
    border: 'none', borderRadius: 12, padding: '13px 28px',
    fontSize: 15, fontWeight: 500, cursor: enabled ? 'pointer' : 'not-allowed',
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
        <span style={{ color: C.accent }}>✦</span> LastMinuteGiftFinder
      </button>

      {isWizardStep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 120, height: 2, background: '#22222e', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: C.accent, borderRadius: 2,
              width: `${(wizardStep / TOTAL_STEPS) * 100}%`, transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: C.textMuted }}>{wizardStep} of {TOTAL_STEPS}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {(step === 'results' || step === 'loading') && (
          <button onClick={resetSearch} style={{
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '4px 12px',
            fontSize: 12, color: C.textMuted, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            New search
          </button>
        )}
        {isAdmin ? (
          <button onClick={handleLogout} style={{
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '4px 12px',
            fontSize: 12, color: C.textMuted, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Log out
          </button>
        ) : (
          <a href="/app/login" style={{
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '4px 12px',
            fontSize: 12, color: C.textMuted, cursor: 'pointer', fontFamily: 'inherit',
            textDecoration: 'none', display: 'inline-block',
          }}>
            Log in
          </a>
        )}
      </div>
    </nav>
  );

  // ── Sidebar brand footer (shared) ─────────────────────────────────────

  const sidebarBrandFooter = (
    <div style={{ padding: '12px 20px', borderTop: `1px solid #16161e`, flexShrink: 0 }}>
      <p style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.6, fontStyle: 'italic' }}>
        {TAGLINE}
      </p>
    </div>
  );

  // ── Display controls footer (results sidebar) ─────────────────────────
  // Layout-only: changes how many columns the cards render in. Lives in its
  // own "Display" section (not "Refine results") so it's clear it doesn't
  // re-run the search.
  const displayFooter = (
    <div style={{ padding: '12px 20px', borderTop: `1px solid #16161e`, flexShrink: 0 }}>
      <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
        Display
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: C.textSec }}>Columns</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[2, 3, 4, 5, 6].map((n) => {
            const active = gridCols === n;
            return (
              <button
                key={n}
                onClick={() => setGridCols(n)}
                aria-label={`${n} columns`}
                title={`${n} columns`}
                style={{
                  width: 30, height: 28, borderRadius: 8,
                  border: `1px solid ${active ? C.accent : C.border}`,
                  background: active ? 'rgba(232,114,74,0.12)' : C.surface,
                  color: active ? C.textPri : C.textSec,
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Wizard / loading sidebar ───────────────────────────────────────────

  const wizardSidebar = (
    <aside className="hidden lg:flex flex-col border-r flex-shrink-0"
      style={{
        borderColor: '#16161e', width: 260,
        height: 'calc(100vh - 52px)', position: 'sticky', top: 52,
        overflow: 'hidden',
      }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px' }}>
        <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 20 }}>
          Your search
        </p>
        <div>
          {STEP_NAMES.map((name, i) => {
            const n = i + 1;
            const s = n < displayStep ? 'done' : n === displayStep ? 'active' : 'pending';
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
                  color:      s === 'active' ? '#fff'   : s === 'done' ? C.textSec  : C.textMuted,
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
        <div style={{ paddingTop: 20, marginTop: 8 }}>
          <p style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
            Your answers stay on this page and are never stored.
          </p>
        </div>
      </div>
      {sidebarBrandFooter}
    </aside>
  );

  // ── Results sidebar ────────────────────────────────────────────────────

  const resultsSidebar = (
    <aside className="hidden lg:flex flex-col border-r flex-shrink-0"
      style={{
        borderColor: '#16161e', width: 260,
        height: 'calc(100vh - 52px)', position: 'sticky', top: 52,
        overflow: 'hidden',
      }}>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px' }}>

        {/* Search summary header with Edit button */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Your search
            </p>
            <button
              onClick={resetSearch}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: C.accent, fontFamily: 'inherit',
                padding: 0, lineHeight: 1,
              }}
            >
              ✎ Edit
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {[form.recipient, form.age, form.occasion].filter(Boolean).map(v => (
              <span key={v} style={{ padding: '5px 10px', borderRadius: 20, fontSize: 12, background: C.textPri, color: C.bg, fontWeight: 500 }}>
                {v}
              </span>
            ))}
          </div>
          {form.interests && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Interests</p>
              <p style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{form.interests}</p>
            </div>
          )}
        </div>

        {/* Save this person — MVP placeholder (intentionally no-op). Reserves
            the spot + intent for the upcoming saved-profile feature. */}
        <button
          onClick={() => setSaveHinted(true)}
          style={{
            width: '100%', background: C.surface, color: C.textSec,
            border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '10px 14px', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginBottom: saveHinted ? 8 : 20,
          }}
        >
          ♡ Save this person
        </button>
        {saveHinted && (
          <p style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 20 }}>
            Saving the people you shop for is coming soon.
          </p>
        )}

        <div style={{ height: 1, background: '#16161e', marginBottom: 20 }} />

        {/* Refine controls */}
        <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 16 }}>
          Refine results
        </p>

        {/* Price dual-range */}
        <div style={{ marginBottom: 22 }}>
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

        {/* Vibe — multi-select chips (max MAX_VIBES). Optional, but any change
            triggers a refresh because vibes shape the underlying recs. */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: C.textSec }}>Vibe</p>
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {(resultForm.vibes ?? []).length}/{MAX_VIBES}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {visibleAesthetics(resultForm.vibes ?? [], showAllVibesSidebar).map(a => {
              const selected = (resultForm.vibes ?? []).includes(a.value);
              const atCap = (resultForm.vibes ?? []).length >= MAX_VIBES && !selected;
              return (
                <button
                  key={a.value}
                  onClick={() => {
                    setResultForm(prev => {
                      const current = prev.vibes ?? [];
                      if (current.includes(a.value)) {
                        return { ...prev, vibes: current.filter(v => v !== a.value) };
                      }
                      if (current.length >= MAX_VIBES) return prev;
                      return { ...prev, vibes: [...current, a.value] };
                    });
                  }}
                  disabled={atCap}
                  style={{
                    padding: '5px 11px', borderRadius: 16, fontSize: 12,
                    border:     `1px solid ${selected ? C.textPri : C.border}`,
                    background:  selected ? C.textPri : C.surface,
                    color:       selected ? C.bg      : C.textSec,
                    cursor:      atCap ? 'not-allowed' : 'pointer',
                    opacity:     atCap ? 0.4 : 1,
                    fontWeight:  selected ? 500 : 400,
                    fontFamily: 'inherit',
                  }}
                >
                  {a.label}
                </button>
              );
            })}
            <button
              onClick={() => setShowAllVibesSidebar(v => !v)}
              style={{
                padding: '5px 11px', borderRadius: 16, fontSize: 12,
                border: `1px dashed ${C.border}`,
                background: 'transparent',
                color: C.textMuted,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {showAllVibesSidebar
                ? 'Show fewer'
                : `+ ${AESTHETICS.length - visibleAesthetics(resultForm.vibes ?? [], false).length} more`}
            </button>
          </div>
        </div>

        {/* How adventurous — slider */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: C.textSec }}>How adventurous?</p>
            <span style={{ fontSize: 12, color: C.textPri, fontWeight: 500 }}>{VIBES[vibeIdx]?.label}</span>
          </div>
          <input
            type="range" min={0} max={2} step={1}
            value={vibeIdx}
            onChange={e => setResultForm(prev => ({ ...prev, relatedness: VIBES[Number(e.target.value)].value }))}
            style={{ width: '100%', accentColor: C.accent }}
            aria-label="How adventurous"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {VIBES.map(v => (
              <span key={v.value} style={{ fontSize: 10, color: C.textMuted, textAlign: 'center', maxWidth: 60, lineHeight: 1.3 }}>
                {v.label}
              </span>
            ))}
          </div>
        </div>

        {/* Depth of interest — slider */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: C.textSec }}>Depth of interest</p>
            <span style={{ fontSize: 12, color: C.textPri, fontWeight: 500 }}>{LEVELS[levelIdx]?.label}</span>
          </div>
          <input
            type="range" min={0} max={2} step={1}
            value={levelIdx}
            onChange={e => setResultForm(prev => ({ ...prev, level: LEVELS[Number(e.target.value)].value }))}
            style={{ width: '100%', accentColor: C.accent }}
            aria-label="Depth of interest"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {LEVELS.map(l => (
              <span key={l.value} style={{ fontSize: 10, color: C.textMuted, textAlign: 'center', maxWidth: 60, lineHeight: 1.3 }}>
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* Number of results — slider */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: C.textSec }}>Number of results</p>
            <span style={{ fontSize: 12, color: C.textPri, fontWeight: 500 }}>{resultForm.count}</span>
          </div>
          <input
            type="range"
            min={COUNT_MIN} max={COUNT_MAX} step={COUNT_STEP}
            value={resultForm.count}
            onChange={e => setResultForm(prev => ({ ...prev, count: Number(e.target.value) }))}
            style={{ width: '100%', accentColor: C.accent }}
            aria-label="Number of results"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{COUNT_MIN}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{COUNT_MAX}</span>
          </div>
        </div>

      </div>

      {/* Sticky refresh button footer */}
      {needsRefresh && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid #16161e`, background: C.bg, flexShrink: 0 }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              width: '100%', background: C.accent, color: '#fff',
              border: 'none', borderRadius: 10, padding: '11px 16px',
              fontSize: 13, fontWeight: 500, cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.7 : 1, fontFamily: 'inherit',
            }}
          >
            {refreshing ? 'Refreshing…' : '↻  Refresh results'}
          </button>
        </div>
      )}

      {displayFooter}
    </aside>
  );

  // ── Pin column (right panel, desktop only) ────────────────────────────
  // Hidden on mobile to keep the results view clean. Shows the Pinterest
  // pin preview scaled to fit the column width, updating live as the
  // user refines results. Uses `committedVibes` so theming stays in sync
  // with the actual fetched results — vibe changes only apply post-refresh.

  const pinColumn = (
    <aside className="hidden lg:flex flex-col border-l flex-shrink-0"
      style={{
        borderColor: '#16161e', width: pinWidth,
        height: 'calc(100vh - 52px)', position: 'sticky', top: 52,
        overflow: 'hidden',
      }}>

      {/* Relative wrapper so the absolute drag handle is positioned
          against the panel edge rather than the viewport. */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Drag handle ── Grab this left edge to resize the panel. */}
        <div
          onMouseDown={handlePinDragStart}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
            cursor: 'ew-resize', zIndex: 10,
            background: 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(232,114,74,0.25)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        />

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px' }}>

        {/* ── PIN PREVIEW ────────────────────────────────────────────── */}
        <p style={{
          fontSize: 10, color: C.textMuted, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 8, fontWeight: 600,
        }}>
          Pin preview
        </p>

        {/* Title formula breakdown — shows which wizard inputs compose the title */}
        {visibleThemes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {[
              committedVibes[0]
                ? { label: 'Vibe', value: committedVibes[0].charAt(0).toUpperCase() + committedVibes[0].slice(1).replace(/-/g, ' ') }
                : null,
              { label: 'Occasion', value: form.occasion },
              { label: 'Recipient', value: form.recipient },
              form.interests?.trim()
                ? { label: 'Interest', value: form.interests.split(/[,;]/)[0].trim() }
                : null,
            ].filter(Boolean).map((item) => (
              <div key={item!.label} style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'baseline' }}>
                <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', width: 52, flexShrink: 0 }}>
                  {item!.label}
                </span>
                <span style={{ fontSize: 11, color: C.textSec }}>{item!.value}</span>
              </div>
            ))}
          </div>
        )}

        {!refreshing && visibleThemes.length > 0 ? (
          <PinPreview
            recipient={form.recipient}
            occasion={form.occasion}
            vibes={committedVibes}
            themes={visibleThemes}
            interests={form.interests}
            targetWidth={pinWidth - 40}
            minimal
          />
        ) : (
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
            {refreshing
              ? 'Refreshing…'
              : 'Run a search to see the Pinterest pin preview.'}
          </p>
        )}

        {/* ── PAGE PREVIEW ───────────────────────────────────────────── */}
        {visibleThemes.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid #16161e` }}>
            <p style={{
              fontSize: 10, color: C.textMuted, letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 8, fontWeight: 600,
            }}>
              Page preview
            </p>
            <p style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
              The public page a Pinterest pin would link to.
            </p>
            {pageSlug ? (
              <a
                href={`/g/${pageSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', background: C.surface, color: C.textSec,
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: '10px 14px', fontSize: 12, fontWeight: 500,
                  textDecoration: 'none', fontFamily: 'inherit',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = C.accent;
                  (e.currentTarget as HTMLAnchorElement).style.color = C.textPri;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = C.border;
                  (e.currentTarget as HTMLAnchorElement).style.color = C.textSec;
                }}
              >
                Open page preview
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10L10 2M10 2H4.5M10 2V7.5" />
                </svg>
              </a>
            ) : (
              <p style={{ fontSize: 11, color: C.textMuted }}>
                {refreshing ? 'Refreshing…' : 'Saving page…'}
              </p>
            )}
          </div>
        )}

        {/* ── PIN IMAGE URL ───────────────────────────────────────────── */}
        {visibleThemes.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid #16161e` }}>
            <p style={{
              fontSize: 10, color: C.textMuted, letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 8, fontWeight: 600,
            }}>
              Pin image URL
            </p>
            <p style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
              1000×1500px — ready to post to Pinterest.
            </p>
            {pinImageUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href={pinImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    width: '100%', background: C.surface, color: C.textSec,
                    border: `1px solid ${C.border}`, borderRadius: 10,
                    padding: '10px 14px', fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', fontFamily: 'inherit',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = C.accent;
                    (e.currentTarget as HTMLAnchorElement).style.color = C.textPri;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = C.border;
                    (e.currentTarget as HTMLAnchorElement).style.color = C.textSec;
                  }}
                >
                  Open pin image
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 10L10 2M10 2H4.5M10 2V7.5" />
                  </svg>
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}${pinImageUrl}`)}
                  style={{
                    width: '100%', background: 'none', color: C.textMuted,
                    border: `1px solid ${C.border}`, borderRadius: 10,
                    padding: '8px 14px', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Copy URL
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 11, color: C.textMuted }}>
                {refreshing ? 'Refreshing…' : 'Generating…'}
              </p>
            )}
          </div>
        )}

      </div>
      </div>{/* end relative wrapper */}
    </aside>
  );

  // ── Landing screen ─────────────────────────────────────────────────────

  const landingScreen = (
    <div style={{ minHeight: 'calc(100vh - 52px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 500, width: '100%' }}>
        <p style={{ fontSize: 12, color: C.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
          AI gift finder
        </p>
        <h1 style={{ fontSize: 42, fontWeight: 500, color: C.textPri, lineHeight: 1.15, marginBottom: 14, letterSpacing: '-0.02em' }}
          className="text-3xl lg:text-5xl">
          The perfect gift,<br />
          <span style={{ color: C.accent }}>in under a minute.</span>
        </h1>
        <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.7, marginBottom: 32, maxWidth: 400 }}>
          Describe who you&apos;re shopping for and we&apos;ll generate tailored ideas — from dead-on to unexpectedly brilliant.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 40 }}>
          {['Birthdays', 'Holidays', 'Anniversaries', 'Weddings', 'Just because'].map(tag => (
            <span key={tag} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, border: `1px solid ${C.border}`, color: C.textSec, background: C.surface }}>
              {tag}
            </span>
          ))}
        </div>
        <button onClick={() => setStep(1)} style={{
          background: C.accent, color: '#fff', border: 'none', borderRadius: 12,
          padding: '16px 36px', fontSize: 16, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Get started →
        </button>
        <p style={{ fontSize: 11, color: C.textMuted, marginTop: 16 }}>
          Free · No account needed · Usually takes less than a minute
        </p>
        <p style={{ fontSize: 10, color: C.textMuted, marginTop: 32, lineHeight: 1.6, fontStyle: 'italic' }}>
          {TAGLINE}
        </p>
      </div>
    </div>
  );

  // ── Wizard steps ──────────────────────────────────────────────────────

  const step1 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 1 OF {TOTAL_STEPS}</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        Who&apos;s this gift for?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 28, lineHeight: 1.5 }}>Pick the closest relationship.</p>
      <div style={{ marginBottom: 36 }}>
        {showAllRecipients ? (
          // Full grouped list.
          RECIPIENT_GROUPS.map((group) => (
            <div key={group.id} style={{ marginBottom: 18 }}>
              <p style={{
                fontSize: 10, color: C.textMuted, letterSpacing: '0.08em',
                textTransform: 'uppercase', marginBottom: 8,
              }}>
                {group.label}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {group.recipients.map((r) => (
                  <button
                    key={r}
                    onClick={() => update('recipient', r)}
                    onDoubleClick={() => { update('recipient', r); setStep(2); }}
                    style={chipStyle(form.recipient === r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          // Collapsed: a single "Common" cluster. Include the currently-selected
          // recipient even if it isn't in the common set, so the choice stays
          // visible without expanding.
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                ...COMMON_RECIPIENTS,
                ...(form.recipient && !COMMON_RECIPIENTS.includes(form.recipient) ? [form.recipient] : []),
              ].map((r) => (
                <button
                  key={r}
                  onClick={() => update('recipient', r)}
                  onDoubleClick={() => { update('recipient', r); setStep(2); }}
                  style={chipStyle(form.recipient === r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => setShowAllRecipients(v => !v)}
          style={{
            ...chipStyle(false),
            marginTop: 14,
            background: 'transparent',
            borderStyle: 'dashed',
            color: C.textMuted,
          }}
        >
          {showAllRecipients ? 'Show fewer' : 'More people…'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => { window.location.href = '/'; }} style={backBtn}>← Back</button>
        <button onClick={() => { if (form.recipient) setStep(2); }} disabled={!form.recipient} style={continueBtn(!!form.recipient)}>
          Continue
        </button>
      </div>
    </StepWrap>
  );

  const step2 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 2 OF {TOTAL_STEPS}</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        How old are they?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 28, lineHeight: 1.5 }}>A specific number or a rough range works fine.</p>
      <input
        type="text" placeholder="42" value={form.age}
        onChange={e => update('age', e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (form.age.trim()) setStep(3); } }}
        autoFocus className="dark-input"
        style={{
          background: C.surface, border: `1px solid ${C.border}`, color: C.textPri,
          borderRadius: 14, padding: '18px 22px', fontSize: 32, fontWeight: 500,
          width: 200, display: 'block', marginBottom: 8, fontFamily: 'inherit', letterSpacing: '-0.01em',
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

  const step3 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 3 OF {TOTAL_STEPS}</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        What&apos;s the occasion?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 28, lineHeight: 1.5 }}>Pick the one that fits best.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
        {OCCASIONS.map(o => (
          <button key={o} onClick={() => update('occasion', o)} onDoubleClick={() => { update('occasion', o); setStep(4); }} style={chipStyle(form.occasion === o)}>{o}</button>
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

  const step4 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 4 OF {TOTAL_STEPS}</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        Tell us about them.
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 24, lineHeight: 1.5 }}>
        Interests, hobbies, quirks — anything that helps paint a picture. Optional — skip if you want general ideas.
      </p>
      <textarea
        placeholder="e.g. obsessed with cooking and craft beer, loves camping, recently got into woodworking…"
        value={form.interests} onChange={e => update('interests', e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setStep(5); } }}
        rows={4} className="dark-textarea"
        style={{
          background: C.surface, border: `1px solid ${C.border}`, color: C.textPri,
          borderRadius: 14, padding: '14px 16px', fontSize: 14,
          width: '100%', fontFamily: 'inherit', resize: 'none', lineHeight: 1.6,
          marginBottom: 6, display: 'block',
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
        <button onClick={() => setStep(5)} style={continueBtn(true)}>
          {form.interests.trim() ? 'Continue' : 'Skip'}
        </button>
      </div>
    </StepWrap>
  );

  // ── Step 5 — Vibe (optional) ──────────────────────────────────────────
  // Multi-select up to MAX_VIBES. Skippable — user can hit Continue with
  // nothing selected. Selected vibes propagate to the API and shape the
  // aesthetic of the recommendations.
  const toggleVibe = (v: string) => {
    const current = form.vibes ?? [];
    if (current.includes(v)) {
      update('vibes', current.filter(x => x !== v));
    } else if (current.length < MAX_VIBES) {
      update('vibes', [...current, v]);
    }
  };

  // Double-click: ensure this vibe is selected (a double-click fires two
  // clicks first, which net-cancel the toggle), then advance to step 6.
  const selectVibeAndContinue = (v: string) => {
    const current = form.vibes ?? [];
    if (!current.includes(v) && current.length < MAX_VIBES) {
      update('vibes', [...current, v]);
    }
    setStep(6);
  };

  const step5 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 5 OF {TOTAL_STEPS}</p>
      <h2 style={{ fontSize: 28, fontWeight: 500, color: C.textPri, lineHeight: 1.2, marginBottom: 8 }}>
        Any vibe?
      </h2>
      <p style={{ fontSize: 15, color: C.textSec, marginBottom: 8, lineHeight: 1.5 }}>
        Optional — pick up to {MAX_VIBES} aesthetics that fit them.
      </p>
      <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
        Helps anchor the recommendations toward a specific look or feel. Skip if you&apos;re not sure.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28, maxWidth: 520 }}>
        {visibleAesthetics(form.vibes ?? [], showAllVibesStep).map(a => {
          const selected = (form.vibes ?? []).includes(a.value);
          const atCap = (form.vibes ?? []).length >= MAX_VIBES && !selected;
          return (
            <button
              key={a.value}
              onClick={() => toggleVibe(a.value)}
              onDoubleClick={() => selectVibeAndContinue(a.value)}
              disabled={atCap}
              style={{
                ...chipStyle(selected),
                opacity: atCap ? 0.4 : 1,
                cursor: atCap ? 'not-allowed' : 'pointer',
              }}
            >
              {a.label}
            </button>
          );
        })}
        <button
          onClick={() => setShowAllVibesStep(v => !v)}
          style={{
            ...chipStyle(false),
            background: 'transparent',
            borderStyle: 'dashed',
            color: C.textMuted,
          }}
        >
          {showAllVibesStep
            ? 'Show fewer'
            : `+ ${AESTHETICS.length - visibleAesthetics(form.vibes ?? [], false).length} more`}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setStep(4)} style={backBtn}>← Back</button>
        <button onClick={() => setStep(6)} style={continueBtn(true)}>
          {(form.vibes ?? []).length === 0 ? 'Skip' : 'Continue'}
        </button>
      </div>
    </StepWrap>
  );

  const step6 = (
    <StepWrap>
      <p style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.05em', marginBottom: 12 }}>STEP 6 OF {TOTAL_STEPS}</p>
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
      <div style={{ marginBottom: 36, maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: C.textSec }}>How many ideas?</p>
          <span style={{ fontSize: 13, color: C.textPri, fontWeight: 500 }}>{form.count}</span>
        </div>
        <input
          type="range"
          min={COUNT_MIN} max={COUNT_MAX} step={COUNT_STEP}
          value={form.count}
          onChange={e => update('count', Number(e.target.value))}
          style={{ width: '100%', accentColor: C.accent }}
          aria-label="How many ideas"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>{COUNT_MIN}</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>{COUNT_MAX}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setStep(5)} style={backBtn}>← Back</button>
        <button onClick={handleSubmit} style={{
          background: C.accent, color: '#fff', border: 'none', borderRadius: 12,
          padding: '14px 36px', fontSize: 16, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Find gift ideas
        </button>
      </div>

      {/* On failure we land back here — keep the diagnostics visible so the
          logs that explain WHY (timeout vs [error] vs 0 themes) don't vanish
          with the loading screen. */}
      {error && isAdmin && (
        <div style={{ marginTop: 32 }}>
          <p style={{
            fontSize: 10, color: C.textMuted, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
          }}>
            Diagnostics — what happened
          </p>
          <DevPanel />
        </div>
      )}
    </StepWrap>
  );

  // ── Loading skeleton (right pane only) ────────────────────────────────

  const loadingSkeleton = (
    <div className="px-5 py-8 sm:px-10 lg:px-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ maxWidth: 680, marginBottom: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
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
      {isAdmin && <DevPanel />}
    </div>
  );

  // ── Results content ────────────────────────────────────────────────────

  const resultsContent = (
    <div className="px-5 py-6 sm:px-8 lg:px-10">
      {/* Mobile filter strip */}
      <div className="lg:hidden" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: C.textPri, fontWeight: 500, marginBottom: 10 }}>
          Gift ideas for {form.recipient}, {form.age} · {form.occasion}
        </p>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
          {VIBES.map(v => (
            <button key={v.value}
              onClick={() => setResultForm(prev => ({ ...prev, relatedness: v.value }))}
              style={{
                padding: '4px 10px', borderRadius: 16, fontSize: 12, flexShrink: 0,
                border:     `1px solid ${resultForm.relatedness === v.value ? '#44445a' : C.border}`,
                background:  resultForm.relatedness === v.value ? '#22222e' : C.surface,
                color:       resultForm.relatedness === v.value ? C.textPri : C.textSec,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden lg:flex" style={{ alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: C.textPri }}>
          Gift ideas for {form.recipient}
        </h2>
        <span style={{ fontSize: 13, color: C.textMuted }}>{form.occasion} · {form.age}</span>
        <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>
          {committedCount} ideas
        </span>
      </div>

      {/* Loading band — input-aware narration + progress while complete cards stream in */}
      {!imagesSettled && (
        <div style={{ marginBottom: 28, maxWidth: 520 }}>
          <p style={{ fontSize: 15, color: C.textSec, marginBottom: 10, lineHeight: 1.4 }}>
            {narrationLines[narrationIdx]}
          </p>
          <div style={{ height: 4, background: '#1a1a24', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: C.accent, borderRadius: 4,
              width: `${progress.target > 0 ? Math.max(6, Math.round((progress.emitted / progress.target) * 100)) : 6}%`,
              transition: 'width 0.4s ease',
              animation: progress.emitted === 0 ? 'pulseBar 1.2s ease-in-out infinite' : 'none',
            }} />
          </div>
          {progress.emitted > 0 && (
            <p style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
              {progress.emitted} of {progress.target} ideas
            </p>
          )}
        </div>
      )}

      {/* Complete cards — each locks in (text + image) and fades in, in order */}
      {visibleThemes.map(theme => <GiftThemeSection key={theme.id} theme={theme} cols={gridCols} />)}

      {/* Trailing skeletons — signal more complete cards are still arriving */}
      {!imagesSettled && progress.emitted < progress.target && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap: 16, marginTop: visibleThemes.length > 0 ? 16 : 0 }}>
          {Array.from({ length: Math.min(gridCols, Math.max(1, progress.target - progress.emitted)) }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, minHeight: 320 }} />
          ))}
        </div>
      )}

      {/* No-match message only once streaming has fully settled */}
      {imagesSettled && visibleThemes.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.textSec }}>
            No gifts match the current filters. Try widening the price range or adjusting the adventurousness setting.
          </p>
        </div>
      )}

      <footer style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid #16161e`, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: C.textMuted }}>
          Powered by Claude AI · Amazon links may include affiliate tags
        </p>
      </footer>

      {isAdmin && (
        <div style={{ padding: '0 8px 40px' }}>
          <DevPanel />
        </div>
      )}
    </div>
  );

  // ── Root render ────────────────────────────────────────────────────────

  const showSidebar    = isWizardStep || step === 'loading' || step === 'results';
  const useWizardPanel = isWizardStep || step === 'loading';

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.textPri }}>
      {navBar}

      {step === 0 && landingScreen}

      {step !== 0 && (
        <div className={showSidebar ? 'lg:flex' : ''}>
          {useWizardPanel  && wizardSidebar}
          {step === 'results' && resultsSidebar}
          <div style={{ flex: 1, minWidth: 0, minHeight: 'calc(100vh - 52px)' }}>
            {step === 1         && step1}
            {step === 2         && step2}
            {step === 3         && step3}
            {step === 4         && step4}
            {step === 5         && step5}
            {step === 6         && step6}
            {step === 'loading' && loadingSkeleton}
            {step === 'results' && resultsContent}
          </div>
          {/* Pinterest / Pin Preview is admin-only (logged in via shared password). */}
          {step === 'results' && isAdmin && pinColumn}
        </div>
      )}
    </div>
  );
}
