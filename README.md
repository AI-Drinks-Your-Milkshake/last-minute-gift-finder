# Last Minute Gift Finder

An AI-powered gift recommendation tool. Enter a recipient's age, the occasion, and a few words about their interests — get 5–8 specific, thoughtful gift ideas in seconds, each with an Amazon search link.

**Live features:**
- Tailored gift ideas from GPT-4o mini
- Site-wide "recent searches" panel (last 20, stored in Vercel KV)
- IP-based rate limiting: 5 searches per day per visitor
- Optional Amazon Associates affiliate links

---

## Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 14 (App Router) |
| AI | OpenAI `gpt-4o-mini` |
| Storage / Rate limiting | Vercel KV (Upstash Redis) |
| Styling | Tailwind CSS |
| Deployment | Vercel |

---

## Prerequisites

- **Node.js 18+**
- An **OpenAI account** with API access — [platform.openai.com](https://platform.openai.com)
- A **Vercel account** for deployment (free tier works) — [vercel.com](https://vercel.com)

---

## Local development

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/last-minute-gift-finder.git
cd last-minute-gift-finder
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in the values (see [Environment variables](#environment-variables) below).

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** If `KV_REST_API_URL` is not set, the app still works — it just skips recent searches and rate limiting. You can add KV credentials later.

---

## Environment variables

All variables are documented in `.env.local.example`. Here's the full breakdown:

### `OPENAI_API_KEY` — required

Your OpenAI secret key. Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

**Cost estimate:** `gpt-4o-mini` is very inexpensive. Each gift search costs roughly **$0.001–$0.003** depending on how detailed the interests field is.

---

### `KV_REST_API_URL` and `KV_REST_API_TOKEN` — required for production

Credentials for Vercel KV (a managed Upstash Redis database). Used for:

1. **Recent searches** — stores the last 20 site-wide searches in a Redis list
2. **Rate limiting** — atomic `INCR` counters keyed by `ratelimit:{ip}:{YYYY-MM-DD}`, with TTL set to midnight UTC

**For Vercel deployment:** these are injected automatically when you connect a KV database in the dashboard (see [Deploy to Vercel](#deploy-to-vercel)).

**For local development with KV:**
1. Create a free Redis database at [upstash.com](https://upstash.com) (free tier: 10,000 requests/day)
2. In the database dashboard, find the **REST API** section
3. Copy the `UPSTASH_REDIS_REST_URL` → paste as `KV_REST_API_URL`
4. Copy the `UPSTASH_REDIS_REST_TOKEN` → paste as `KV_REST_API_TOKEN`

---

### `NEXT_PUBLIC_AMAZON_AFFILIATE_TAG` — optional

Your Amazon Associates tag (e.g. `yourbrand-20`). When set, all Amazon search links include `?tag=yourtag-20` so you earn commission on qualifying purchases.

Sign up at [affiliate-program.amazon.com](https://affiliate-program.amazon.com/). Approval is usually fast for sites with content.

---

## Deploy to Vercel

### One-click GitHub flow

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/last-minute-gift-finder.git
   git push -u origin main
   ```

2. **Import to Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click **Import** next to your GitHub repository
   - Vercel auto-detects Next.js — no framework config needed
   - Click **Deploy** (it will fail without env vars — that's fine, we'll add them next)

3. **Attach a KV database:**
   - In your Vercel project, go to **Storage** → **Create Database** → **KV**
   - Create a new KV store and click **Connect to Project**
   - Vercel automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your environment variables

4. **Add the remaining env vars:**
   - In Vercel: **Settings** → **Environment Variables**
   - Add `OPENAI_API_KEY`
   - Optionally add `NEXT_PUBLIC_AMAZON_AFFILIATE_TAG`

5. **Redeploy:**
   - Go to **Deployments** → click the three-dot menu on the latest → **Redeploy**
   - Or push any new commit to `main` — Vercel deploys automatically

### Subsequent deploys

Push to `main` — that's it. Vercel builds and deploys on every push.

---

## Architecture

```
app/
├── layout.tsx                     Root HTML shell, Inter font, metadata
├── page.tsx                       Client component: form + results + sidebar
├── globals.css                    Tailwind imports
└── api/
    ├── search/route.ts            POST: rate-limit → OpenAI → store search
    └── recent-searches/route.ts   GET: last 20 searches from KV

components/
├── SearchForm.tsx                 Controlled form, fetch logic, button state
├── GiftCard.tsx                   Single gift with Amazon link
└── RecentSearches.tsx             Sidebar panel, polls /api/recent-searches

lib/
├── openai.ts                      OpenAI client, system + user prompt
├── kv.ts                          addRecentSearch / getRecentSearches (lpush + ltrim)
└── rate-limit.ts                  checkRateLimit (incr + expire), getClientIp

types/
└── index.ts                       GiftIdea, SearchFormData, RecentSearch
```

### Rate limiting detail

```
POST /api/search
  → getClientIp()          reads x-forwarded-for (Vercel) or x-real-ip
  → kv.incr(key)           key = ratelimit:{ip}:{YYYY-MM-DD}
  → if count == 1: kv.expire(key, secondsUntilMidnightUTC)
  → if count > 5: return 429
```

Atomic `INCR` means no race conditions. The TTL ensures the counter resets cleanly at midnight UTC regardless of when the first request arrived.

### Recent searches detail

```
addRecentSearch(entry)
  → kv.lpush("recent_searches", entry)    prepend
  → kv.ltrim("recent_searches", 0, 19)    keep newest 20
```

`getRecentSearches` reads `lrange 0 19` — always in insertion order (newest first).

---

## Development notes

- The app fails open on KV errors: if rate limiting or KV storage throws, the search still completes
- `NEXT_PUBLIC_AMAZON_AFFILIATE_TAG` is safe to expose client-side — it's just a referral tag, not a secret
- The `response_format: { type: "json_object" }` param on the OpenAI call guarantees valid JSON output
- Recent searches refresh automatically after each successful search (via `refreshKey` prop on the sidebar)

---

## License

MIT
