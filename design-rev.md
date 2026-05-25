# Gift Finder — Design Specification

## Product name

**Gift Finder** (formerly "Last Minute Gift Finder"). Update all metadata, copy, and UI labels to match.

---

## URL / routing architecture

Use Next.js App Router **route groups** to separate marketing from the app while staying in one repo and one Vercel deployment.

```
app/
  (marketing)/
    layout.tsx        ← marketing shell (full-width, no app chrome)
    page.tsx          ← / (landing — redirect to /app for now)
  (app)/
    app/
      layout.tsx      ← app shell with Gift Finder metadata
      page.tsx        ← /app  (renders <GiftFinderWizard />)
  api/
    search/route.ts   ← stays put, no change
    recent-searches/route.ts
  layout.tsx          ← root layout (Inter font, globals.css only)
  globals.css
```

**Why this structure:**
- `/` is reserved for the future marketing landing page (long-form, SEO-optimised, can eventually be on Webflow/Framer)
- `/app` is the gift finder tool — clean URL, no nesting friction
- Route groups (the parentheses folders) don't affect the URL
- Migrating to `app.domain.com` later is a Vercel domain alias + one middleware rewrite, no code restructuring

---

## Color tokens (unchanged, defined in globals.css)

```css
--bg:             #0d0d11   /* page background */
--surface:        #16161e   /* card/input surfaces */
--surface-raise:  #1a1a24   /* slightly elevated surfaces */
--surface-card:   #14141c   /* gift cards */
--border:         #22222e   /* default border */
--border-raise:   #1e1e2a   /* slightly elevated borders */
--text-primary:   #f2f2f8   /* headings, labels */
--text-secondary: #8888a2   /* body copy, descriptions */
--text-muted:     #44445a   /* hints, placeholders */
--text-soft:      #b0b0c8   /* secondary emphasis */
--accent:         #e8724a   /* coral CTA / active states */
--chip-selected-bg:   #f2f2f8
--chip-selected-text: #0d0d11
```

---

## Application architecture: GiftFinderWizard

The entire `/app` experience lives in `components/GiftFinderWizard.tsx` (client component). The page file just renders `<GiftFinderWizard />`.

### Wizard state

| State | Type | Notes |
|---|---|---|
| `step` | `0 \| 1 \| 2 \| 3 \| 4 \| 5 \| 'loading' \| 'results'` | 0 = landing, 1–5 = wizard steps |
| `form` | `SearchFormData` | Updated as user progresses through steps |
| `resultForm` | `SearchFormData` | Snapshot of form at submit time + refine controls updated post-search |
| `themes` | `GiftTheme[]` | API response |
| `error` | `string \| null` | Shown on step 5 if API call fails |

---

## Layout

### Nav bar (all screens)
- Logo: `✦ Gift Finder` (✦ in coral `#e8724a`)
- During wizard steps: progress bar (120px wide) + "N of 5" counter
- During results: "New search" ghost button (resets state, returns to step 0)
- Logo is clickable during wizard/results — triggers reset to step 0

### Two-pane layout (desktop ≥ lg breakpoint)

```
┌─── Nav bar (full width) ─────────────────────────────────────┐
├─ Sidebar (260px) ──┬─ Main pane (flex-1) ────────────────────┤
│                    │                                          │
│  Step 0: "How it   │  Landing CTA                            │
│   works" explainer │  (h1, subtext, occasion pills, Get started →)
│                    │                                          │
│  Steps 1–5:        │  Current step question                  │
│  Progress tracker  │  (heading, chips or inputs, Back/Continue)│
│  (completed steps  │                                          │
│  show their values)│                                          │
│                    │                                          │
│  Results:          │  Gift section grid (GiftThemeSection)   │
│  Search summary    │  (grouped by relatednessLevel)          │
│  + Refine controls │                                          │
└────────────────────┴──────────────────────────────────────────┘
```

### Mobile (below lg)
- Sidebar is hidden (`hidden lg:flex`)
- Nav bar shows logo + progress indicator
- Step content is full-screen with responsive padding (`px-5 py-8 sm:px-10`)
- Results: compact summary bar + horizontal scroll filter strip above results

---

## Wizard steps

### Step 0 — Landing
**Desktop:** Two-pane. Left = "How it works" (3 items: tell us / AI generates / filter). Right = headline, tags, CTA.
**Mobile:** Full-width headline + CTA.
- Headline: "The perfect gift, in under a minute."
- Accent on second line: "in under a minute." in coral
- Sub-copy: "Describe who you're shopping for and we'll generate tailored ideas — from dead-on to unexpectedly brilliant."
- Occasion pills: Birthdays · Holidays · Anniversaries · Weddings · Just because
- CTA button: "Get started →"
- Footer note: "Free · No account needed · Usually takes less than a minute"

### Step 1 — Who
- Heading: "Who's this gift for?"
- Sub: "Pick the closest relationship."
- Chip grid: all RECIPIENTS options (wraps, `flex-wrap`)
- Required: must select before Continue is enabled

### Step 2 — Age
- Heading: "How old are they?"
- Sub: "A specific number or a rough range works fine."
- Single text input, large (32px font, prominent)
- Hint: "e.g. 35, mid-40s, 8"
- Required: non-empty before Continue is enabled

### Step 3 — Occasion
- Heading: "What's the occasion?"
- Chip grid: all OCCASIONS options
- Required: must select before Continue is enabled

### Step 4 — About them
- Heading: "Tell us about them."
- Sub: "Interests, hobbies, quirks — anything that helps paint a picture."
- Textarea (4 rows), placeholder with examples
- Hint: "More specific = better results"
- Immediately below textarea, follow-up: "How deep into these interests are they?"
- Three level cards (stacked horizontally, `flex` row): Casual / Into it / Enthusiast
  - Each card: title + one-line description
  - Selected: coral border + coral-tinted background
  - Level has a default (Into it) so no validation needed here
- Required: textarea non-empty before Continue enabled

### Step 5 — Adventurousness + Count
- Heading: "How adventurous?"
- Sub: "Should results stay close to their interests, or explore a bit?"
- Three vibe cards (stacked vertically, full width up to 480px):
  - Radio dot (coral when selected) + title + one-line description
  - Just like this / Mix it up / Surprise me
  - Default: Mix it up
- Secondary section: "How many ideas?" with count chips: 6 / 9 / 12 (default: 9)
- Error message renders here if API call fails
- CTA: "Find gift ideas" (coral, full accent button)
- `count` and `relatedness` are sent to API

---

## Loading state
- Transition: form → `loading` (no intermediate state shown)
- Skeleton: 2-column gift card grid (matches results layout)
  - Per skeleton card: circle + title bar + price bar + 2 description bars + button bar
  - Animated pulse
- Text: "Finding the perfect gifts…"
- Same two-pane layout (sidebar shows last wizard step state)

---

## Results view

### Client-side filtering (useMemo)
Filters `themes` by `resultForm.relatedness` and price range. Count limits total gifts shown across all themes.

```ts
const byRelatedness = themes
  .filter(t => relatedness === 'similar' ? t.relatednessLevel === 1
             : relatedness === 'mixed'   ? t.relatednessLevel <= 2 : true)
  .map(t => ({ ...t, gifts: t.gifts.filter(g => g.priceMin <= priceMax && g.priceMax >= priceMin) }))
  .filter(t => t.gifts.length > 0);

// Apply count limit
let remaining = count;
return byRelatedness.map(t => {
  const toShow = Math.min(t.gifts.length, remaining);
  remaining -= toShow;
  return { ...t, gifts: t.gifts.slice(0, toShow) };
}).filter(t => t.gifts.length > 0);
```

### Desktop results sidebar
1. **Your search** — recipient/age/occasion as white pills; interests in a dark surface card; depth as read-only filter chips
2. **Refine results** — price dual-range slider + adventurousness filter chips
   - Count is NOT shown in the refine panel (can't increase post-search; would be misleading)

### Mobile results
- Summary line: "N ideas for [recipient], [age] · [occasion]"
- Horizontal scroll filter strip: adventurousness chips only (price is too complex for mobile strip; omit for now)
- Results sections below

### Results sections (GiftThemeSection — unchanged)
- Grouped by `relatednessLevel`: 1 = "Directly on point", 2 = "Adjacent" (badge), 3 = "Wildcard" (badge)
- Each section: 2-column gift card grid on sm+, 1-column on mobile
- GiftCard: unchanged (emoji, title, price, tier badge, Amazon search link)

---

## Chip / selection pattern
- Default: `background: #16161e`, `border: 1px solid #22222e`, `color: #8888a2`
- Selected: `background: #f2f2f8`, `border: 1px solid #f2f2f8`, `color: #0d0d11`, `font-weight: 500`
- Level / vibe cards selected: coral border + `rgba(232,114,74,0.08)` background

---

## CTA button pattern
- Primary (coral): `background: #e8724a`, white text, `border-radius: 12px`, `padding: 13px 28px`
- Disabled: `background: #22222e`, muted text, `cursor: not-allowed`
- Back link: no border/background, muted text color, small arrow prefix

---

## Files to create / modify

| File | Action |
|---|---|
| `app/layout.tsx` | Update title to "Gift Finder" |
| `app/(marketing)/layout.tsx` | Create — pass-through layout |
| `app/(marketing)/page.tsx` | Create — redirect to `/app` |
| `app/(app)/app/layout.tsx` | Create — Gift Finder metadata |
| `app/(app)/app/page.tsx` | Create — renders `<GiftFinderWizard />` |
| `app/page.tsx` | Delete — replaced by (marketing) route group |
| `components/GiftFinderWizard.tsx` | Create — full wizard + results (replaces SearchForm) |
| `app/globals.css` | Add `.dark-input::placeholder` rule |
| `components/SearchForm.tsx` | No longer used (keep file, just unused) |

---

## What does NOT change
- `types/index.ts` — unchanged
- `components/GiftCard.tsx` — unchanged
- `components/GiftThemeSection.tsx` — unchanged  
- `app/api/search/route.ts` — unchanged
- `app/api/recent-searches/route.ts` — unchanged
- `lib/anthropic.ts`, `lib/kv.ts`, `lib/rate-limit.ts` — unchanged
- `app/globals.css` color tokens and dual-range slider CSS — unchanged
