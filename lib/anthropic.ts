import Anthropic from '@anthropic-ai/sdk';
import type { GiftTheme, GiftIdea } from '@/types';
import { aestheticPromptFragment } from './aesthetics';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';

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

function isValidGift(g: unknown): g is GiftIdea {
  if (!g || typeof g !== 'object') return false;
  const x = g as Record<string, unknown>;
  return (
    typeof x.title === 'string' && x.title.length > 0 &&
    typeof x.description === 'string' && x.description.length > 0 &&
    typeof x.priceRange === 'string' && x.priceRange.length > 0 &&
    typeof x.priceMin === 'number' && Number.isFinite(x.priceMin) &&
    typeof x.priceMax === 'number' && Number.isFinite(x.priceMax) &&
    (x.priceMax as number) >= (x.priceMin as number) &&
    typeof x.searchTerms === 'string' && x.searchTerms.length > 0
  );
}

function isValidTheme(t: unknown): t is GiftTheme {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  if (typeof x.id !== 'string' || x.id.length === 0) return false;
  if (typeof x.label !== 'string' || x.label.length === 0) return false;
  if (x.relatednessLevel !== 1 && x.relatednessLevel !== 2 && x.relatednessLevel !== 3) return false;
  if (!Array.isArray(x.gifts) || x.gifts.length === 0) return false;
  return x.gifts.every(isValidGift);
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
    model: MODEL,
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
  if (!Array.isArray(themesRaw) || themesRaw.length !== 3) {
    throw new Error('Anthropic response must contain exactly 3 themes');
  }

  if (!themesRaw.every(isValidTheme)) {
    throw new Error('One or more themes failed validation');
  }

  return themesRaw as GiftTheme[];
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

  const stream = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    temperature: 0.85,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    stream: true,
  });

  // Buffer text from the stream. Yield a theme whenever a complete JSON line
  // lands (i.e. we see a '\n' after content that parses as a valid GiftTheme).
  let lineBuffer = '';
  let fullText   = '';
  const yieldedIds = new Set<string>();

  function tryExtractTheme(text: string): GiftTheme | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const start = trimmed.indexOf('{');
    const end   = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (!isValidTheme(parsed)) return null;
      if (yieldedIds.has((parsed as GiftTheme).id)) return null;
      yieldedIds.add((parsed as GiftTheme).id);
      return parsed as GiftTheme;
    } catch {
      return null;
    }
  }

  for await (const chunk of stream) {
    if (chunk.type !== 'content_block_delta') continue;
    if (chunk.delta.type !== 'text_delta') continue;

    const text = chunk.delta.text;
    fullText   += text;
    lineBuffer += text;

    // Yield any complete lines (everything up to the last '\n').
    const lastNl = lineBuffer.lastIndexOf('\n');
    if (lastNl < 0) continue;

    const completeLines = lineBuffer.slice(0, lastNl).split('\n');
    lineBuffer = lineBuffer.slice(lastNl + 1);

    for (const line of completeLines) {
      const theme = tryExtractTheme(line);
      if (theme) yield theme;
    }
  }

  // Process the final partial line (no trailing '\n').
  if (lineBuffer.trim()) {
    const theme = tryExtractTheme(lineBuffer);
    if (theme) yield theme;
  }

  // ── Fallback: Claude output the old {themes:[...]} format instead of NDJSON ──
  // If we got fewer than 3 themes from line-by-line parsing, attempt to parse
  // the full accumulated text as the standard JSON object format.
  if (yieldedIds.size < 3) {
    let raw = fullText.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    const firstBrace = raw.indexOf('{');
    const lastBrace  = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        const themesRaw = (parsed as { themes?: unknown }).themes;
        if (Array.isArray(themesRaw)) {
          for (const t of themesRaw) {
            if (isValidTheme(t) && !yieldedIds.has((t as GiftTheme).id)) {
              yieldedIds.add((t as GiftTheme).id);
              yield t as GiftTheme;
            }
          }
        }
      } catch {
        // Nothing we can do — the route will emit an error event.
      }
    }
  }
}
