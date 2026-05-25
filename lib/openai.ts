import OpenAI from 'openai';
import type { GiftTheme, GiftIdea } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
    typeof x.emoji === 'string' && x.emoji.length > 0
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
  const systemPrompt = `You are a premium gift concierge who specializes in finding specific, exciting, high-quality gifts. You think like a personal shopper who knows exactly what someone will love. Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

  const userPrompt = `Generate ${params.count} gift ideas for:

Recipient: ${params.recipient} (${params.age} years old)
Occasion: ${params.occasion}
About them: ${params.interests}

${levelInstruction(params.level)}
${priceInstruction(params.priceMin, params.priceMax)}

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
  - "description": 1–2 sentences explaining why it fits this specific recipient
  - "priceRange": formatted as "$X–$Y"
  - "priceMin": lower bound as a NUMBER (no $ sign, no quotes, no commas)
  - "priceMax": upper bound as a NUMBER (no $ sign, no quotes, no commas)
  - "searchTerms": 3–6 words optimized for Amazon product search
  - "emoji": single emoji for the gift category — choose the most fitting: 🎮 gaming, 📚 books, 🏃 fitness, 🎨 art/creative, 🍳 cooking, 🎵 music, 🌿 wellness, 🧳 travel, 💎 jewelry/luxury, 🔧 tech/tools, 🎭 entertainment, 👗 fashion, 🏠 home, 🍷 food/drink, 🧘 mindfulness, 🐾 pets, 🌱 outdoors, 🎲 games/fun

Think like a thoughtful friend who knows this ${params.recipient} well. Pick gifts that feel curated and genuinely exciting, not safe or obvious. Avoid gift cards, generic flowers, or candles unless interests explicitly demand them.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.85,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OpenAI response is not an object');
  }

  const themesRaw = (parsed as { themes?: unknown }).themes;
  if (!Array.isArray(themesRaw) || themesRaw.length !== 3) {
    throw new Error('OpenAI response must contain exactly 3 themes');
  }

  if (!themesRaw.every(isValidTheme)) {
    throw new Error('One or more themes failed validation');
  }

  return themesRaw as GiftTheme[];
}
