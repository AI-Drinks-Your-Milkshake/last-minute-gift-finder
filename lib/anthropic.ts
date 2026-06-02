import Anthropic from '@anthropic-ai/sdk';
import type { GiftTheme, GiftIdea } from '@/types';
import { aestheticPromptFragment } from './aesthetics';
import { MODEL } from './models';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type Level = 'casual' | 'interested' | 'enthusiast';

interface GetGiftIdeasParams {
  recipient: string;
  age: string;
  occasion: string;
  interests: string;
  count: number;
  priceMin: number;
  priceMax: number;
  level: Level;
  // How adventurous the user wants results. Used to weight per-theme gift
  // counts so the visible result count always matches what the user requested:
  //   similar    → all count gifts in theme 1 (level 1)
  //   mixed      → count gifts split across themes 1+2 (levels 1+2)
  //   adventurous → count gifts split evenly across all 3 themes
  relatedness?: 'similar' | 'mixed' | 'adventurous';
  vibes?: string[];
  // Currently-trending product names pulled from Brave web search.
  // Used as in-context inspiration — Claude only recommends them if they
  // actually fit the recipient.
  trendingProducts?: string[];
  // Optional per-request model override (full id, e.g. "claude-sonnet-4-6").
  // Defaults to MODEL. The route only forwards this for owner/dev requests.
  model?: string;
  // Optional dev-log callback — fires before the Anthropic call so observers
  // can distinguish "waiting for Claude" from a silent failure.
  onLog?: (msg: string) => void;
}

// Compute per-theme gift counts so the number of VISIBLE gifts (after
// client-side relatedness filtering) exactly matches the user's requested count.
//  similar    → show only theme 1 (level 1) → concentrate gifts there
//  mixed      → show themes 1+2 (levels ≤ 2) → split across t1 and t2
//  adventurous → show all themes → distribute evenly across all 3
// Themes that are hidden by the filter still need ≥1 gift so the JSON
// schema stays valid (3 themes, each non-empty).
function themeDistribution(count: number, relatedness: string = 'adventurous'): [number, number, number] {
  if (relatedness === 'similar') {
    return [count, 1, 1];
  }
  if (relatedness === 'mixed') {
    const t1 = Math.ceil(count / 2);
    const t2 = Math.floor(count / 2);
    return [t1, t2, 1];
  }
  // adventurous: spread evenly, extras front-loaded
  const base = Math.floor(count / 3);
  const r = count % 3;
  return [base + (r > 0 ? 1 : 0), base + (r > 1 ? 1 : 0), base];
}

function levelInstruction(level: Level): string {
  switch (level) {
    case 'casual':
      return 'Choose gifts that are accessible, well-known, and require no prior experience or expertise. Avoid niche or hard-to-find items.';
    case 'interested':
      return 'Mix approachable and specific gifts. Some can be niche but should still be easy to search for and understand.';
    case 'enthusiast':
      return 'Lean into specific, niche, and high-quality products that only someone deep into this interest would truly appreciate. Brand names and model numbers matter.';
  }
}

function priceInstruction(priceMin: number, priceMax: number): string {
  const range = `Every gift's priceMin must be >= ${priceMin} and priceMax must be <= ${priceMax}.`;
  if (priceMax < 75) {
    return `All picks under $${priceMax}. ${range}`;
  }
  if (priceMin >= 300) {
    return `All picks $${priceMin}+ — splurges only. ${range}`;
  }
  if (priceMax < 300) {
    return `Mix of budget ($30–$75) and mid-range ($75–$${priceMax}) picks. ${range}`;
  }
  if (priceMin >= 75) {
    return `Mix of mid-range ($${priceMin}–$300) and splurge ($300+) picks. ${range}`;
  }
  // full range
  return `Aim for a balanced mix across all three tiers: 1–2 budget picks ($30–$75), some mid-range picks ($75–$300), and some splurge picks ($300+). ${range}`;
}

// Recipient-keyed voice overlay. Shapes the *description* prose that the
// shopper reads on each gift card. The recipient never sees this — the voice
// shift exists because identical product picks read very differently in
// "premium concierge" voice vs. "peer-to-peer" voice, and that affects how
// the shopper feels about each suggestion.
function voiceOverlayFor(recipient: string): string {
  const r = recipient.trim();
  if (['Teen Boy', 'Teen Girl', 'Tween Boy', 'Tween Girl'].includes(r)) {
    return 'Write descriptions in a peer-to-peer voice — casual, direct, no "they\'ll love this" filler. Use the language a friend their age would use about why something is cool.';
  }
  if (['Mom', 'Dad', 'Grandma', 'Grandpa', 'Mother-in-law', 'Father-in-law', 'Stepmom', 'Stepdad'].includes(r)) {
    return 'Write descriptions in a warm, practical voice. Focus on items that show care and attention to who they actually are. Avoid overly trendy or youth-coded language.';
  }
  if (['Husband', 'Wife', 'Boyfriend', 'Girlfriend', 'Partner', 'Fiancé(e)'].includes(r)) {
    return 'Write descriptions in an intimate, knowing voice. Specificity beats sentimentality — "I pay attention to you" lands harder than "perfect for the one you love."';
  }
  if (['Coworker', 'Boss', 'Client'].includes(r)) {
    return 'Write descriptions in a tasteful, professional voice. Items should be thoughtful without being too personal. Safe but not boring.';
  }
  if (['Baby', 'Toddler', 'Kid (5–8)'].includes(r)) {
    return 'Write descriptions in a warm parent-to-parent voice — practical, with a clear note on what skill, milestone, or play-pattern the gift supports.';
  }
  if (r === 'Dog' || r === 'Cat') {
    return 'Write descriptions from the perspective of a thoughtful pet owner. Practical first — durability, safety, suitability for the animal\'s temperament.';
  }
  return ''; // default: keep the base concierge voice
}

// Coerce a price-ish value to a finite number. Models under a loose JSON schema
// (Haiku especially) often emit prices as strings ("$1,200", "50") instead of
// raw numbers. The previous STRICT validator silently rejected those gifts —
// which is exactly why production parsed 0 themes from Haiku while a lenient
// benchmark "passed." We coerce instead of reject.
function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[$,\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Normalize one gift into a valid GiftIdea, or null if it's truly unusable.
function normalizeGift(g: unknown): GiftIdea | null {
  if (!g || typeof g !== 'object') return null;
  const x = g as Record<string, unknown>;
  const title       = typeof x.title === 'string' ? x.title.trim() : '';
  const description = typeof x.description === 'string' ? x.description.trim() : '';
  const searchTerms =
    typeof x.searchTerms === 'string' && x.searchTerms.trim() ? x.searchTerms.trim() : title;
  if (!title || !description || !searchTerms) return null;

  let min = toNum(x.priceMin);
  let max = toNum(x.priceMax);
  // Fall back to parsing the human "priceRange" ("$75–$300") when the numeric
  // fields are missing or non-numeric.
  if ((min === null || max === null) && typeof x.priceRange === 'string') {
    const nums = x.priceRange.match(/\d[\d,]*\.?\d*/g);
    if (nums?.[0] && min === null) min = parseFloat(nums[0].replace(/,/g, ''));
    if (nums?.[1] && max === null) max = parseFloat(nums[1].replace(/,/g, ''));
  }
  if (min === null && max !== null) min = max;
  if (max === null && min !== null) max = min;
  if (min === null || max === null) return null;
  if (max < min) [min, max] = [max, min];

  const priceRange =
    typeof x.priceRange === 'string' && x.priceRange.trim() ? x.priceRange.trim() : `$${min}–$${max}`;

  return { title, description, priceRange, priceMin: min, priceMax: max, searchTerms };
}

// Normalize one theme into a valid GiftTheme, or null. Accepts a numeric-string
// relatednessLevel and derives id/label leniently.
function normalizeTheme(t: unknown): GiftTheme | null {
  if (!t || typeof t !== 'object') return null;
  const x = t as Record<string, unknown>;
  const id    = typeof x.id === 'string' && x.id.trim() ? x.id.trim() : '';
  const label = typeof x.label === 'string' && x.label.trim() ? x.label.trim() : id;
  let lvl: unknown = x.relatednessLevel;
  if (typeof lvl === 'string') lvl = Number(lvl);
  if (lvl !== 1 && lvl !== 2 && lvl !== 3) return null;
  if (!Array.isArray(x.gifts)) return null;
  const gifts = x.gifts.map(normalizeGift).filter((g): g is GiftIdea => g !== null);
  if (gifts.length === 0) return null;
  const finalId = id || label;
  if (!finalId || !label) return null;
  return { id: finalId, label, relatednessLevel: lvl as 1 | 2 | 3, gifts };
}

export async function getGiftIdeas(params: GetGiftIdeasParams): Promise<GiftTheme[]> {
  // Inject today's date so Claude (a) knows what year/season it is and (b)
  // avoids recommending products that may have been discontinued. This
  // doesn't add freshness on its own — that's what `lib/trends.ts` is for —
  // but it reduces confidently-wrong-because-stale recommendations.
  const today = new Date().toISOString().slice(0, 10);

  const voiceOverlay = voiceOverlayFor(params.recipient);
  const aestheticFragment = aestheticPromptFragment(params.vibes ?? []);

  const trendingFragment =
    params.trendingProducts && params.trendingProducts.length > 0
      ? `\nCurrently-trending product names that surfaced in recent gift round-ups (use only as inspiration; recommend a specific one only if it actually fits this recipient):\n${params.trendingProducts.map((p) => `- ${p}`).join('\n')}\n`
      : '';

  const systemPrompt = `You are a premium gift concierge who specializes in finding specific, exciting, high-quality gifts. You think like a personal shopper who knows exactly what someone will love. Return ONLY valid JSON — no markdown, no code fences, no extra text.

Today's date is ${today}. If you recommend a specific product, prefer items that are likely still in production and on retail shelves as of this date. If you're unsure whether a product is still current, prefer a category-level recommendation over a specific SKU.${voiceOverlay ? '\n\n' + voiceOverlay : ''}`;

  const [t1Count, t2Count, t3Count] = themeDistribution(params.count, params.relatedness);
  const totalCount = t1Count + t2Count + t3Count;

  const aboutLine = params.interests?.trim()
    ? `About them: ${params.interests}`
    : `About them: No specific interests provided — infer broadly popular gift ideas for a ${params.recipient} aged ${params.age}.`;

  const userPrompt = `Generate ${totalCount} gift ideas for:

Recipient: ${params.recipient} (${params.age} years old)
Occasion: ${params.occasion}
${aboutLine}

${levelInstruction(params.level)}
${priceInstruction(params.priceMin, params.priceMax)}
${aestheticFragment ? '\n' + aestheticFragment + '\n' : ''}${trendingFragment}
Step 1 — Identify 3 thematic dimensions from this person's interests:
- Theme 1: The direct interest itself (e.g. "e-scooters")
- Theme 2: An adjacent activity or value this interest suggests (e.g. "micromobility" or "urban commuting")
- Theme 3: A broader lifestyle dimension (e.g. "exploring" or "being outdoors")

Step 2 — Generate gifts organized by these themes. Use EXACTLY these gift counts per theme:
- Theme 1: exactly ${t1Count} gift(s)
- Theme 2: exactly ${t2Count} gift(s)
- Theme 3: exactly ${t3Count} gift(s)
Total: ${totalCount} gifts. Do not add or remove gifts from these counts.

Return a JSON object with a "themes" key containing an array of EXACTLY 3 objects. Each theme object must have:
- "id": a short slug (e.g. "direct", "micromobility", "exploring") — must be unique across themes
- "label": display text — for theme 1 use "For [interest] fans" style, for themes 2-3 use "Since they like [theme dimension]" style
- "relatednessLevel": 1 for theme 1, 2 for theme 2, 3 for theme 3
- "gifts": array of gift objects, each with:
  - "title": specific product name (e.g. "Oura Ring Gen 3" not "fitness tracker", "Vitamix A3500" not "blender")
  - "description": exactly 1 sentence explaining what makes this specific gift right for this person. Start with what they'd do with it. Avoid "perfect", "thoughtful", "loves".
  - "priceRange": formatted as "$X–$Y"
  - "priceMin": lower bound as a NUMBER (no $ sign, no quotes, no commas)
  - "priceMax": upper bound as a NUMBER (no $ sign, no quotes, no commas)
  - "searchTerms": 3–6 words optimized for Amazon product search

Think like a thoughtful friend who knows this ${params.recipient} well. Pick gifts that feel curated and genuinely exciting, not safe or obvious. Avoid gift cards, generic flowers, or candles unless interests explicitly demand them.

Respond with ONLY the JSON object. Start your response with { and end with }. No prose, no markdown fences.`;

  const response = await anthropic.messages.create({
    model: params.model ?? MODEL,
    // ~250 tokens/gift. With count=25 + mixed distribution the API generates
    // up to 27 gifts total (13+12+1). 8000 tokens gives comfortable headroom;
    // truncation would silently break JSON parsing downstream.
    max_tokens: 8000,
    temperature: 0.85,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
      // Note: Sonnet 4.6 (and other newer "reasoning-capable" models) reject
      // assistant-message prefill with "This model does not support assistant
      // message prefill." The prompt itself forces JSON-only output, and the
      // parser below strips any stray fences or preamble defensively.
    ],
  });

  const first = response.content[0];
  if (!first || first.type !== 'text') {
    throw new Error('Empty or non-text response from Anthropic');
  }

  // Defensive parse: trim whitespace, strip ```json fences if Sonnet adds
  // them despite the prompt, and extract from first `{` to last `}` so any
  // stray preamble or trailing prose doesn't break JSON.parse.
  let raw = first.text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Anthropic response contained no JSON object');
  }
  const content = raw.slice(firstBrace, lastBrace + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Anthropic returned invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Anthropic response is not an object');
  }

  const themesRaw = (parsed as { themes?: unknown }).themes;
  if (!Array.isArray(themesRaw) || themesRaw.length === 0) {
    throw new Error('Anthropic response contained no themes');
  }

  const themes = themesRaw
    .map(normalizeTheme)
    .filter((t): t is GiftTheme => t !== null);
  if (themes.length === 0) {
    throw new Error('No valid themes in Anthropic response');
  }

  return themes;
}

// ── Streaming variant ────────────────────────────────────────────────────────
//
// Instructs Claude to output one theme per line (NDJSON) so we can yield each
// theme to the client the moment Claude finishes generating it, rather than
// waiting for all three. First cards typically appear within 5–10 s.
//
// Falls back to the standard `{themes:[...]}` JSON format if Claude ignores
// the NDJSON instruction — this ensures we always return something.

export async function* streamGiftThemes(
  params: GetGiftIdeasParams,
): AsyncGenerator<GiftTheme> {
  const today = new Date().toISOString().slice(0, 10);
  const voiceOverlay = voiceOverlayFor(params.recipient);
  const aestheticFragment = aestheticPromptFragment(params.vibes ?? []);
  const trendingFragment =
    params.trendingProducts && params.trendingProducts.length > 0
      ? `\nCurrently-trending product names that surfaced in recent gift round-ups (use only as inspiration; recommend a specific one only if it actually fits this recipient):\n${params.trendingProducts.map((p) => `- ${p}`).join('\n')}\n`
      : '';

  // System prompt — same concierge persona, but NDJSON output format.
  const systemPrompt = `You are a premium gift concierge who specializes in finding specific, exciting, high-quality gifts. You think like a personal shopper who knows exactly what someone will love. Output ONLY valid NDJSON — exactly 3 lines, each a single complete JSON object for one theme, with no outer wrapper, no markdown, no code fences.

Today's date is ${today}. If you recommend a specific product, prefer items that are likely still in production and on retail shelves as of this date.${voiceOverlay ? '\n\n' + voiceOverlay : ''}`;

  const [t1Count, t2Count, t3Count] = themeDistribution(params.count, params.relatedness);
  const totalCount = t1Count + t2Count + t3Count;

  const aboutLine = params.interests?.trim()
    ? `About them: ${params.interests}`
    : `About them: No specific interests provided — infer broadly popular gift ideas for a ${params.recipient} aged ${params.age}.`;

  const userPrompt = `Generate ${totalCount} gift ideas for:

Recipient: ${params.recipient} (${params.age} years old)
Occasion: ${params.occasion}
${aboutLine}

${levelInstruction(params.level)}
${priceInstruction(params.priceMin, params.priceMax)}
${aestheticFragment ? '\n' + aestheticFragment + '\n' : ''}${trendingFragment}
Step 1 — Identify 3 thematic dimensions from this person's interests:
- Theme 1: The direct interest itself (e.g. "e-scooters")
- Theme 2: An adjacent activity or value this interest suggests (e.g. "micromobility" or "urban commuting")
- Theme 3: A broader lifestyle dimension (e.g. "exploring" or "being outdoors")

Step 2 — Generate gifts organized by these themes. Use EXACTLY these gift counts per theme:
- Theme 1: exactly ${t1Count} gift(s)
- Theme 2: exactly ${t2Count} gift(s)
- Theme 3: exactly ${t3Count} gift(s)
Total: ${totalCount} gifts. Do not add or remove gifts from these counts.

Output EXACTLY 3 lines — one complete JSON object per line, no outer array or wrapper key. Each theme JSON object must have:
- "id": a short slug (e.g. "direct", "micromobility", "exploring") — must be unique across themes
- "label": display text — for theme 1 use "For [interest] fans" style, for themes 2-3 use "Since they like [theme dimension]" style
- "relatednessLevel": 1 for theme 1, 2 for theme 2, 3 for theme 3
- "gifts": array of gift objects, each with:
  - "title": specific product name (e.g. "Oura Ring Gen 3" not "fitness tracker", "Vitamix A3500" not "blender")
  - "description": exactly 1 sentence explaining what makes this specific gift right for this person. Start with what they'd do with it. Avoid "perfect", "thoughtful", "loves".
  - "priceRange": formatted as "$X–$Y"
  - "priceMin": lower bound as a NUMBER (no $ sign, no quotes, no commas)
  - "priceMax": upper bound as a NUMBER (no $ sign, no quotes, no commas)
  - "searchTerms": 3–6 words optimized for Amazon product search

Think like a thoughtful friend who knows this ${params.recipient} well. Pick gifts that feel curated and genuinely exciting, not safe or obvious. Avoid gift cards, generic flowers, or candles unless interests explicitly demand them.

Output only the 3 JSON lines. No other text, no markdown, no outer wrapper.`;

  params.onLog?.(
    `[anthropic] key configured: ${Boolean(process.env.ANTHROPIC_API_KEY)} · model ${params.model ?? MODEL} · calling Claude — ${totalCount} gifts across 3 themes (${t1Count}+${t2Count}+${t3Count})`,
  );

  // maxRetries: 1 so a retryable failure (429/529/network) surfaces in ~1-2s
  // instead of backing off until the platform kills the function silently.
  let stream;
  try {
    stream = await anthropic.messages.create(
      {
        model: params.model ?? MODEL,
        max_tokens: 8000,
        temperature: 0.85,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        stream: true,
      },
      { maxRetries: 1 },
    );
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    params.onLog?.(`[anthropic] create() failed: ${detail}`);
    console.error('[anthropic] create() failed:', err);
    throw err;
  }
  params.onLog?.('[anthropic] stream opened — awaiting first token');

  // ── Formatting-agnostic incremental JSON streaming ───────────────────────
  // Yield each theme object the moment its braces balance, regardless of
  // whitespace or newlines. The previous parser assumed exactly one compact
  // JSON object per line — Sonnet happened to honor that, but Haiku (and any
  // model under load) does not, which is what made Haiku "unreliable on NDJSON"
  // and forced the Sonnet revert. Brace-depth scanning works for compact
  // NDJSON, pretty-printed objects, AND a {themes:[...]} wrapper, so streaming
  // no longer depends on the model's formatting.
  const yieldedIds = new Set<string>();
  let buf      = '';     // all text received so far
  let scan     = 0;      // resume index into buf
  let depth    = 0;      // brace nesting depth
  let inStr    = false;  // currently inside a JSON string literal
  let esc      = false;  // previous char was a backslash (string escape)
  let objStart = -1;     // index where the current top-level object began

  // Parse one complete top-level object slice. Accepts either a bare theme or
  // a {themes:[...]} wrapper, returning any newly-seen valid themes.
  function themesFrom(slice: string): GiftTheme[] {
    let parsed: unknown;
    try { parsed = JSON.parse(slice); } catch { return []; }
    const out: GiftTheme[] = [];
    const consider = (cand: unknown) => {
      const theme = normalizeTheme(cand);
      if (theme && !yieldedIds.has(theme.id)) {
        yieldedIds.add(theme.id);
        out.push(theme);
      }
    };
    const wrapper = parsed as { themes?: unknown };
    if (parsed && typeof parsed === 'object' && Array.isArray(wrapper.themes)) {
      for (const t of wrapper.themes) consider(t);
    } else {
      consider(parsed);
    }
    return out;
  }

  // Scan newly-arrived text, emitting every top-level object that has closed.
  function drainComplete(): GiftTheme[] {
    const ready: GiftTheme[] = [];
    for (; scan < buf.length; scan++) {
      const ch = buf[scan];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') { if (depth === 0) objStart = scan; depth++; }
      else if (ch === '}') {
        if (depth > 0) depth--;
        if (depth === 0 && objStart >= 0) {
          ready.push(...themesFrom(buf.slice(objStart, scan + 1)));
          objStart = -1;
        }
      }
    }
    return ready;
  }

  let chunkCount = 0;
  let sawText = false;
  for await (const chunk of stream) {
    chunkCount++;
    // Log the first few raw chunk types so we can see exactly what the model
    // emits on Vercel (text vs thinking vs ping vs nothing) when diagnosing.
    if (chunkCount <= 6) {
      const sub = chunk.type === 'content_block_delta' ? `/${chunk.delta.type}` : '';
      params.onLog?.(`[anthropic] chunk ${chunkCount}: ${chunk.type}${sub}`);
    }
    if (chunk.type !== 'content_block_delta') continue;
    if (chunk.delta.type !== 'text_delta') continue;
    if (!sawText) {
      sawText = true;
      params.onLog?.('[anthropic] first text token received');
    }
    buf += chunk.delta.text;
    for (const theme of drainComplete()) yield theme;
  }

  // Final drain for an object that closed in the very last chunk.
  for (const theme of drainComplete()) yield theme;

  // Safety net: if nothing parsed, surface a sample of the raw model output so
  // we can see exactly what shape defeated the parser (rather than guessing).
  if (yieldedIds.size === 0) {
    params.onLog?.(`[anthropic] 0 themes parsed — raw sample: ${buf.slice(0, 400).replace(/\s+/g, ' ').trim()}`);
  }
}
