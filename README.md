# Competitor Ad Intelligence

Search competitor **Meta / Facebook ads** and analyze creative trends — built for performance marketers.

A lightweight Node.js + Express backend serves a local JSON ad dataset, an OpenAI-compatible AI breakdown endpoint, and a single-file Tailwind dashboard for browsing, filtering, and scoring competitor creatives.

> **Search-driven & live.** The app starts empty — search any competitor (e.g. `nike`, `redbull`) and a real **Playwright** browser scrapes the public [Meta Ad Library](https://www.facebook.com/ads/library/) for that brand's ads (real copy, real image/video URLs from Meta's CDN), then scores, persists, and lets you analyze them. A mock mode (`USE_MOCK_SCRAPER=true`) is available for demos / when rate-limited.
>
> ⚠️ **Read before using live scraping** — see [Scraping notes](#-scraping-notes-important).

---

## ✨ Features

- 🔍 **Competitor search** — filter ads by one or many brands
- 📊 **Dashboard metrics** — totals, top competitors, formats, CTAs, longest-running ads
- 🏆 **Performance score** — `running_days × format_weight × country_weight`
- 🤖 **AI creative analysis** — hook, offer, CTA type, angle, audience, intent, funnel stage, emotional trigger, summary
- 🎛️ **Filters & sorting** — country, format, CTA, competitor · sort by score / running days / newest
- 🪟 **Card & table views** + modern dark SaaS UI (Tailwind via CDN)

---

## 🧱 Tech Stack

| Layer    | Tech                                              |
| -------- | ------------------------------------------------- |
| Frontend | Single `index.html`, Tailwind CDN, vanilla JS     |
| Backend  | Node.js, Express.js                               |
| AI       | OpenAI-compatible Chat Completions API            |
| Scraper  | Playwright (mock scaffold for MVP)                |
| Data     | Local `ads.json` (no database, no auth)           |

---

## 📁 Folder Structure

```
/project
├── backend
│   ├── server.js              # Express app + static frontend
│   ├── routes/                # ads, competitors, analyze, dashboard
│   ├── services/              # data, score, analysis, dashboard logic
│   └── data/
│       └── ads.json           # starts empty []; results come from search
├── playwright
│   └── scraper.js             # mock collector (real-shaped scaffold)
├── frontend
│   └── index.html             # the entire UI
├── .env                       # config (PORT, OpenAI-compatible keys)
├── package.json
└── README.md
```

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Install the Chromium browser used for scraping (one-time)
npx playwright install chromium

# 3. (optional) add an OpenAI-compatible key in .env for live AI analysis
#    Without a key, the app falls back to a deterministic heuristic analysis.

# 4. Run the dev server (auto-reload)
npm run dev   # or: npm start
```

Then open **http://localhost:5000** and search a competitor.

Quick scraper test from the CLI:

```bash
node playwright/scraper.js nike          # real scrape
node playwright/scraper.js --mock nike   # synthetic data
SCRAPER_HEADLESS=false node playwright/scraper.js nike   # watch the browser
SCRAPER_DEBUG=true node playwright/scraper.js nike       # verbose logs
```

---

## 🕸️ Scraping notes (IMPORTANT)

This tool drives a real browser against the **public** Meta Ad Library (no login
required). To stay robust, it does **not** parse Meta's obfuscated HTML — it
intercepts the page's **GraphQL JSON** responses and extracts ad snapshots,
giving real `image_url` / `video_url` straight from Meta's CDN.

Please be aware:

- ⚖️ **Terms of Service** — automated access technically violates Meta's ToS.
  Use responsibly; for production prefer the official **Meta Ad Library API**.
- 🐢 **It's slow** — a live search takes ~30–60s per brand (page load + lazy-load
  scrolls). The UI shows a "Scraping…" state while it runs.
- 🚦 **Rate limiting** — hitting Meta repeatedly from one IP can get you
  temporarily throttled (searches then return 0 ads). Wait, change
  `SCRAPER_COUNTRY`, or flip `USE_MOCK_SCRAPER=true`.
- 🔧 **Maintenance** — Meta changes its page/GraphQL periodically; the field
  mapping in [`playwright/scraper.js`](playwright/scraper.js) may need updates.
  Run with `SCRAPER_DEBUG=true` to diagnose.
- 🧩 **Dynamic / catalog ads** — Advantage+ & catalog ads return Mustache
  tokens like `{{product.name}}` (the real value is filled per-viewer and isn't
  in the data). The scraper prefers real text fields and falls back to the
  brand name, so the UI never shows `{{…}}`. Such ads are flagged `_templated`.

### Inspecting raw data

With `SCRAPER_DEBUG=true`, every scrape writes the **full raw result** —
including each ad's raw `title`/`body` and the complete Meta `snapshot` — to
`playwright/last-scrape.<brand>.json`, and prints a `raw → chosen headline`
table to the console. Hit a single brand and open that file to see exactly which
keys hold real values:

```bash
SCRAPER_DEBUG=true node playwright/scraper.js nike
# -> writes playwright/last-scrape.nike.json
```

---

## ⚙️ Configuration (`.env`)

| Variable          | Default                     | Description                                   |
| ----------------- | --------------------------- | --------------------------------------------- |
| `PORT`            | `5000`                      | Server port                                   |
| `OPENAI_API_KEY`  | _(empty)_                   | Key for AI analysis; empty → heuristic mode   |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint                |
| `OPENAI_MODEL`    | `gpt-4o-mini`               | Model name                                    |
| `USE_MOCK_SCRAPER`| `false`                     | `true` → synthetic data instead of scraping   |
| `SCRAPER_HEADLESS`| `true`                      | `false` → show the browser window             |
| `SCRAPER_COUNTRY` | `US`                        | Ad Library country filter                     |
| `SCRAPER_ACTIVE_STATUS` | `all`                 | `all` · `active` · `inactive`                 |
| `SCRAPER_MAX_ADS` | `24`                        | Max ads collected per brand                   |
| `SCRAPER_SCROLLS` | `6`                         | Lazy-load scroll passes                       |
| `SCRAPER_DEBUG`   | `false`                     | Verbose scraper logging                       |
| `RAPIDAPI_KEY`    | _(empty)_                   | Key for the RapidAPI data source              |
| `RAPIDAPI_HOST`   | `ad-libraries.p.rapidapi.com` | RapidAPI host                               |

AI works with OpenAI, OpenRouter, Together, Groq, and local LLMs (Ollama / LM Studio).

---

## 🔀 Data sources (two options + fallback)

Every search picks a **source** (selector next to the search box, or `source` in
the API body). All sources return the **same Meta ad data** — they just fetch it
differently — and feed through one shared normalizer
([`adMapper.js`](backend/services/adMapper.js)).

| Source       | How it works                                  | Speed   | Needs            |
| ------------ | --------------------------------------------- | ------- | ---------------- |
| **RapidAPI** | REST call to `ad-libraries.p.rapidapi.com`    | ~1–3s   | `RAPIDAPI_KEY`   |
| **Live scrape** | Playwright browses the public Ad Library   | ~30–60s | Chromium         |
| **Mock**     | Synthetic demo data                           | instant | nothing          |
| **Auto** _(default)_ | RapidAPI first, then live scrape      | varies  | —                |

**Fallback** — if the chosen source errors or returns **0 ads**, the next source
in the chain is tried automatically:

- `auto`   → API → scrape  (→ mock, only if `USE_MOCK_SCRAPER=true`)
- `api`    → API → scrape
- `scrape` → scrape → API
- `mock`   → mock only

The response reports `sourcesUsed` (which source actually returned each brand's
ads) and an `attempts` trace, and the UI shows `· via api` / `· via scrape`.

### RapidAPI vs. direct Meta scrape — what's the difference?

Both ultimately read the **same public Meta Ad Library** data (identical
`snapshot` fields → identical results in the app). The trade-off is *how* you get
it:

| | **RapidAPI (`api`)** | **Direct scrape (`scrape`)** |
|---|---|---|
| Mechanism | 3rd-party proxy calls Meta for you | Your own browser hits Meta directly |
| Speed | Fast (~1–3s), JSON | Slow (~30–60s), launches Chromium |
| Reliability | Stable, paginated | Fragile; breaks on Meta UI changes |
| Rate limits | RapidAPI quota / billing | Meta throttles your IP |
| Cost | Paid API key | Free (just compute) |
| Meta ToS | The proxy bears the automation | You automate Meta directly (ToS risk) |
| Dependency | Relies on RapidAPI staying up | Self-contained |

**Rule of thumb:** use **RapidAPI** for speed and reliability (great for a demo
or steady use within quota); use the **direct scrape** when you have no API
budget/quota or want zero third-party dependency. `auto` gives you the best of
both — fast when the API works, self-reliant when it doesn't.

---

## 🔌 API Endpoints

| Method | Endpoint                   | Description                              |
| ------ | -------------------------- | ---------------------------------------- |
| GET    | `/api/ads`                 | All ads (scored + sorted by score desc)  |
| GET    | `/api/ads/:id`             | A single ad by id                        |
| POST   | `/api/competitors/search`  | Filter ads by competitor names           |
| POST   | `/api/analyze/:id`         | AI creative breakdown for one ad         |
| GET    | `/api/dashboard`           | Aggregated dashboard metrics             |
| GET    | `/api/health`              | Health check                             |

**Search body**

```json
{ "competitors": ["nike", "adidas"], "source": "auto" }
```

`source` is one of `auto` (default) · `api` · `scrape` · `mock`.

**Analyze response**

```json
{
  "id": 1,
  "competitor": "Nike",
  "analysis": {
    "hook": "Run Faster, Go Further",
    "offer": "Free shipping this week",
    "cta_type": "Direct Response",
    "angle": "Performance",
    "audience": "Runners & Athletes",
    "audience_intent": "High",
    "funnel_stage": "Consideration",
    "emotional_trigger": "Aspiration",
    "summary": "Performance-focused video creative…"
  }
}
```

---

## 🏆 Performance Score

```
score = running_days × format_weight × country_weight
```

**Format weights:** `video 1.5` · `carousel 1.3` · `image 1.0`
**Country weights:** US 1.3 · UK 1.2 · DE/FR 1.15 · CA/AU 1.1 · others 1.0

Ads are returned sorted by score, descending.

---

## 🗺️ Future Roadmap

- 🐘 **PostgreSQL** — persistent storage replacing `ads.json`
- 📚 **Meta Ad Library API** — official, compliant data source (replaces scraping)
- ✅ ~~Real Playwright collection~~ — **done** (GraphQL interception)
- 🧠 **AI Creative Insights** — trend detection, clustering, recommendations
- 👥 **Multi-user support** — accounts, saved searches, workspaces
- 🛡️ **Anti-throttle** — proxy rotation / request pacing for reliable scraping

---

## ⚠️ Disclaimer

This tool collects data from the **public** Meta Ad Library via browser
automation, which technically violates Meta's Terms of Service. It is intended
for legitimate competitor research / educational use. You are responsible for
how you use it — respect Meta's ToS and local laws, and prefer the official
**Meta Ad Library API** for production. A mock mode is provided for demos.
