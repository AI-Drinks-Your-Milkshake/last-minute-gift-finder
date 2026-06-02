// Model benchmark: Haiku vs Sonnet on the real streaming gift prompt.
//
// Measures, per run: time-to-first-theme (when the first card would appear),
// total stream time, themes parsed, total gifts, and whether output parsed
// cleanly. Uses the SAME brace-depth streaming parser the app now uses, so
// the reliability column reflects production behavior.
//
// Run from the project root:
//   node scripts/bench-model.mjs                 # 3 runs each, count=30, mixed
//   node scripts/bench-model.mjs --runs 5 --count 30 --relatedness mixed
//
// Requires a real ANTHROPIC_API_KEY in .env.local (or the environment).

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

// ── Args (tolerant: --runs 5, --runs=5, missing, or garbled all degrade
//          to the default instead of producing NaN) ─────────────────────────
const argv = process.argv.slice(2);
function flag(name) {
  // Support "--name value" and "--name=value".
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function intOpt(name, def) {
  const v = parseInt(flag(name), 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}
const RUNS        = intOpt('runs', 3);
const COUNT       = intOpt('count', 30);
const RELATEDNESS = flag('relatedness') || 'mixed';
const MODELS = [
  { label: 'Haiku 4.5',  id: 'claude-haiku-4-5' },
  { label: 'Sonnet 4.6', id: 'claude-sonnet-4-6' },
];

// ── API key (env or .env.local) ──────────────────────────────────────────────
function loadKey() {
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
    return process.env.ANTHROPIC_API_KEY;
  }
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('ANTHROPIC_API_KEY='));
    const val = line ? line.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '') : '';
    return val;
  } catch {
    return '';
  }
}
const KEY = loadKey();
if (!KEY || !KEY.startsWith('sk-ant-') || KEY.includes('...')) {
  console.error('No real ANTHROPIC_API_KEY found in env or .env.local. Set it and retry.');
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey: KEY });

// ── Prompt (mirrors lib/anthropic.ts streaming variant) ──────────────────────
function distribution(count, relatedness) {
  if (relatedness === 'similar') return [count, 1, 1];
  if (relatedness === 'mixed') return [Math.ceil(count / 2), Math.floor(count / 2), 1];
  const base = Math.floor(count / 3), r = count % 3;
  return [base + (r > 0 ? 1 : 0), base + (r > 1 ? 1 : 0), base];
}
const buffered = Math.min(35, Math.ceil(COUNT * 1.15));
const [t1, t2, t3] = distribution(buffered, RELATEDNESS);
const total = t1 + t2 + t3;
const today = new Date().toISOString().slice(0, 10);

const SYSTEM = `You are a premium gift concierge who specializes in finding specific, exciting, high-quality gifts. Output ONLY valid NDJSON — exactly 3 lines, each a single complete JSON object for one theme, with no outer wrapper, no markdown, no code fences.\n\nToday's date is ${today}.`;

const USER = `Generate ${total} gift ideas for:

Recipient: Dad (35-55 years old)
Occasion: Father's Day
About them: grilling, smoking meats, spending time outdoors

Mix approachable and specific gifts.
Aim for a balanced mix across budget, mid-range, and splurge.

Step 2 — Generate gifts organized by 3 themes. Use EXACTLY these gift counts per theme:
- Theme 1: exactly ${t1} gift(s)
- Theme 2: exactly ${t2} gift(s)
- Theme 3: exactly ${t3} gift(s)
Total: ${total} gifts.

Output EXACTLY 3 lines — one complete JSON object per line, no outer array or wrapper key. Each theme JSON object must have:
- "id": short unique slug
- "label": display text
- "relatednessLevel": 1, 2, or 3
- "gifts": array of objects with "title", "description" (1 sentence), "priceRange" ("$X–$Y"), "priceMin" (number), "priceMax" (number), "searchTerms" (3–6 words)

Output only the 3 JSON lines. No other text, no markdown, no outer wrapper.`;

// ── Brace-depth streaming parser (same approach as lib/anthropic.ts) ─────────
function makeParser() {
  const ids = new Set();
  let buf = '', scan = 0, depth = 0, inStr = false, esc = false, start = -1;
  const okTheme = (t) =>
    t && typeof t === 'object' && typeof t.id === 'string' &&
    [1, 2, 3].includes(t.relatednessLevel) && Array.isArray(t.gifts) && t.gifts.length > 0;
  function from(slice) {
    let p; try { p = JSON.parse(slice); } catch { return []; }
    const out = [];
    const add = (c) => { if (okTheme(c) && !ids.has(c.id)) { ids.add(c.id); out.push(c); } };
    if (p && Array.isArray(p.themes)) p.themes.forEach(add); else add(p);
    return out;
  }
  return function drain(text) {
    buf += text;
    const ready = [];
    for (; scan < buf.length; scan++) {
      const ch = buf[scan];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') { if (depth === 0) start = scan; depth++; }
      else if (ch === '}') { if (depth > 0) depth--; if (depth === 0 && start >= 0) { ready.push(...from(buf.slice(start, scan + 1))); start = -1; } }
    }
    return ready;
  };
}

// ── One run ──────────────────────────────────────────────────────────────────
async function runOnce(modelId) {
  const drain = makeParser();
  const themes = [];
  const t0 = Date.now();
  let firstThemeMs = null;
  try {
    const stream = await anthropic.messages.create({
      model: modelId, max_tokens: 8000, temperature: 0.85,
      system: SYSTEM, messages: [{ role: 'user', content: USER }], stream: true,
    });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        for (const th of drain(ev.delta.text)) {
          if (firstThemeMs === null) firstThemeMs = Date.now() - t0;
          themes.push(th);
        }
      }
    }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), totalMs: Date.now() - t0 };
  }
  const gifts = themes.reduce((n, t) => n + t.gifts.length, 0);
  return {
    ok: themes.length === 3,
    firstThemeMs, totalMs: Date.now() - t0,
    themes: themes.length, gifts,
  };
}

// ── Drive ────────────────────────────────────────────────────────────────────
const fmt = (ms) => (ms == null ? '  —  ' : (ms / 1000).toFixed(1) + 's');
console.log(`\nPrompt: count=${COUNT} (buffered ${buffered}, dist ${t1}+${t2}+${t3}=${total}), relatedness=${RELATEDNESS}, runs=${RUNS}\n`);
for (const m of MODELS) {
  const rows = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`  ${m.label} run ${i + 1}/${RUNS}… `);
    const r = await runOnce(m.id);
    rows.push(r);
    console.log(r.ok ? `first ${fmt(r.firstThemeMs)} · total ${fmt(r.totalMs)} · ${r.themes} themes / ${r.gifts} gifts` : `FAIL (${r.error ?? `${r.themes} themes`})`);
  }
  const okRows = rows.filter((r) => r.ok);
  const avg = (sel) => okRows.length ? okRows.reduce((s, r) => s + sel(r), 0) / okRows.length : null;
  console.log(`  → ${m.label}: ${okRows.length}/${RUNS} clean · avg first ${fmt(avg((r) => r.firstThemeMs))} · avg total ${fmt(avg((r) => r.totalMs))}\n`);
}
