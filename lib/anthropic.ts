import Anthropic from '@anthropic-ai/sdk';
import type { GiftTheme, GiftIdea, GiftCategory } from '@/types';
import { GIFT_CATEGORIES } from '@/types';
import { aestheticPromptFragment } from './aesthetics';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Sonnet 4.6 — newer training cutoff (Aug 2025) and noticeably better
// recommendation quality than Haiku 4.5. Freshness is still patched at request
// time via `lib/trends.ts`, but the model swap closes part of the gap.
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
  vibes?: string[];
  // Currently-trending product names pulled from Brave web search.
  // Used as in-context inspiration — Claude only recommends them if they
  // actually fit the recipient.
  trendingProducts?: string[];
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
    typeof x.searchTerms === 'string' && x.searchTerms.length > 0 &&
    typeof x.emoji === 'string' && x.emoji.length > 0 &&
    typeof x.category === 'string' &&
    GIFT_CATEGORIES.includes(x.category as GiftCategory)
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

  const userPrompt = `Generate ${params.count} gift ideas for:

Recipient: ${params.recipient} (${params.age} years old)
Occasion: ${params.occasion}
About them: ${params.interests}

${levelInstruction(params.level)}
${priceInstruction(params.priceMin, params.priceMax)}
${aestheticFragment ? '\n' + aestheticFragment + '\n' : ''}${trendingFragment}
Step 1 — Identify 3 thematic dimensions from this person's interests:
- Theme 1: The direct interest itself (e.g. "e-scooters")
- Theme 2: An adjacent activity or value this interest suggests (e.g. "micromobility" or "urban commuting")
- Theme 3: A broader lifestyle dimension (e.g. "exploring" or "being outdoors")

Step 2 — Generate gifts organized by these themes. Distribute the ${params.count} gifts as evenly as possible across all 3 themes. Each theme MUST contain at least 1 gift.

Return a JSON object with a "themes" key containing an array of EXACTLY 3 objects. Each theme object must have:
- "id": a short slug (e.g. "direct", "micromobility", "exploring") — must be unique across themes
- "label": display text — for theme 1 use "For [interest] fans" style, for themes 2-3 use "Since they like [theme dimension]" style
- "relatednessLevel": 1 for theme 1, 2 for theme 2, 3 for theme 3
- "gifts": array of gift objects, each with:
  - "title": specific product name (e.g. "Oura Ring Gen 3" not "fitness tracker", "Vitamix A3500" not "blender")
  - "description": 1–2 sentences explaining why it fits this specific recipient. Start with what they'd actually do with it, in a single concrete sentence. Avoid the words "perfect", "thoughtful", or "loves".
  - "priceRange": formatted as "$X–$Y"
  - "priceMin": lower bound as a NUMBER (no $ sign, no quotes, no commas)
  - "priceMax": upper bound as a NUMBER (no $ sign, no quotes, no commas)
  - "searchTerms": 3–6 words optimized for Amazon product search
  - "emoji": single emoji for the gift category — choose the most fitting: 🎮 gaming, 📚 books, 🏃 fitness, 🎨 art/creative, 🍳 cooking, 🎵 music, 🌿 wellness, 🧳 travel, 💎 jewelry/luxury, 🔧 tech/tools, 🎭 entertainment, 👗 fashion, 🏠 home, 🍷 food/drink, 🧘 mindfulness, 🐾 pets, 🌱 outdoors, 🎲 games/fun
  - "category": MUST be exactly one of these strings: ${GIFT_CATEGORIES.map((c) => `"${c}"`).join(', ')}

Think like a thoughtful friend who knows this ${params.recipient} well. Pick gifts that feel curated and genuinely exciting, not safe or obvious. Avoid gift cards, generic flowers, or candles unless interests explicitly demand them.

Respond with ONLY the JSON object. Start your response with { and end with }. No prose, no markdown fences.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0.85,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
      // Prefill the assistant turn with `{` to force a JSON-object response.
      // The model continues from this prefix, so we prepend `{` before parsing.
      { role: 'assistant', content: '{' },
    ],
  });

  const first = response.content[0];
  if (!first || first.type !== 'text') {
    throw new Error('Empty or non-text response from Anthropic');
  }
  const content = '{' + first.text;

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
