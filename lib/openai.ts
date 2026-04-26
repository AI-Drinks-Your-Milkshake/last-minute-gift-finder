import OpenAI from 'openai';
import type { GiftIdea } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getGiftIdeas(params: {
  recipient: string;
  age: string;
  occasion: string;
  interests: string;
}): Promise<GiftIdea[]> {
  const systemPrompt = `You are a premium gift concierge who specializes in finding specific, exciting, high-quality gifts. You think like a personal shopper who knows exactly what someone will love. Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

  const userPrompt = `Generate 5–8 gift ideas for:

Recipient: ${params.recipient} (${params.age} years old)
Occasion: ${params.occasion}
About them: ${params.interests}

Return a JSON object with a "gifts" key containing an array. Each object must have exactly these fields:
- "title": a specific, exciting product name — not generic (say "Oura Ring Gen 3" not "fitness tracker", "Vitamix A3500" not "blender", "Loewe Puzzle Bag" not "handbag")
- "description": 1–2 sentences explaining why this is a perfect match for this specific ${params.recipient} given their interests
- "priceRange": format "$X–$Y" matching the tier below
- "searchTerms": 3–6 words optimized for Amazon product search
- "emoji": one emoji for the gift category — choose the most fitting: 🎮 gaming, 📚 books, 🏃 fitness, 🎨 art/creative, 🍳 cooking, 🎵 music, 🌿 wellness, 🧳 travel, 💎 jewelry/luxury, 🔧 tech/tools, 🎭 entertainment, 👗 fashion, 🏠 home, 🍷 food/drink, 🧘 mindfulness, 🐾 pets, 🌱 outdoors, 🎲 games/fun

Price distribution (include all three tiers):
- 1–2 budget picks: $30–$75
- 2–3 mid-range picks: $75–$300
- 2–3 splurge options: $300–$1,500

Think like a thoughtful friend who knows this ${params.recipient} well. Pick gifts that feel curated and genuinely exciting, not safe or obvious. Avoid gift cards, generic flowers, or candles unless interests explicitly demand them.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.85,
    max_tokens: 1800,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(content) as { gifts: GiftIdea[] };

  if (!Array.isArray(parsed.gifts)) {
    throw new Error('Unexpected response shape from OpenAI');
  }

  return parsed.gifts;
}
