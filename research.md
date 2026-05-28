# JACOBI — Product Research & Feature Roadmap

> 24-Agent Adversarial Pricing Topology Probe
> BrightData × MIT Hackathon
> Generated: 2026-05-26

---

## How to Read

Each section below ranks items by **impact** and **effort**:

- **P0** — Blocks the demo / breaks the product. Fix immediately.
- **P1** — Unlocks core value prop. Do before presenting.
- **P2** — Makes the product feel complete. Nice-to-have before hackathon deadline.
- **P3** — Future / post-hackathon polish.

---

## 1. Critical Blockers (P0)

| # | Issue | File(s) | Why It Matters |
|---|-------|---------|----------------|
| 1 | **Live probe returns all $36 (uniform) for most sites** — BrightData fetches real pages but many sites don't show IP-based price discrimination to anonymous visitors. Booking.com, Expedia, United all fail to return varied prices. Only Google Flights showed real variation ($596 vs $667). | `backend/main.py` | The core hackathon demo needs to SHOW discrimination. Without it, the product is a "pricing checker" not a "discrimination probe." |
| 2 | **Google Flights returned real variance but gradient/topology still classified as "uniform"** — fixed now, but the statistical significance thresholds need real-world validation. | `backend/main.py:450-483` | If topology classification is wrong, the entire analysis pipeline looks broken. |
| 3 | **BrightData Unlocker API returns CAPTCHA for many sites** (United Airlines = 24/24 blocked, many Booking.com agents timeout). The 60s timeout helps but non-US proxies are unreliable. | `backend/main.py:387-420` | Unreliable agent success rate undermines the "24 agents" value prop. |
| 4 | **No env var for NEXT_PUBLIC_API_URL in deployed Vercel frontend** — the deployed frontend at `frontend-theta-ashy-11.vercel.app` calls `localhost:8000` by default. | `frontend/components/dashboard.tsx:473` | Deployed Vercel frontend cannot reach local backend. |

---

## 2. Features That Exist (But May Be Broken/Incomplete)

| Feature | Status | Notes |
|---------|--------|-------|
| BrightData HTTP API probe | ✅ Working | 10-20/24 agents succeed depending on site |
| Price parsing (multi-site) | ✅ Working | Booking.com, Amazon, airline selectors |
| Currency detection & conversion | ✅ Working | INR, AED, GBP, EUR + 30+ currencies |
| Gradient computation (t-test) | ✅ Fixed | Now uses effect-size + delta% for small samples |
| Topology classification | ✅ Fixed | uniform/selective/progressive/aggressive |
| Gemini AI analysis | ✅ Working | Generates plain-English verdict + action items |
| Savings verdict computation | ✅ Working | Total savings, cheapest price, severity score |
| Demo mode (simulated data) | ✅ Working | 24 agents, $245 baseline, $57 spread |
| Probe history (localStorage) | ✅ Fixed | `probe-conservations` key now consistent |
| Export JSON / CSV | ✅ Working | Per-agent data export |
| Supabase persistence | ⚠️ Partial | `save_probe()` called but may fail silently |
| PDF export | ⚠️ Untested | Added in commit `cd4d037` — not verified |
| Stripe integration | ❌ Dead code | `stripe` + `@stripe/stripe-js` in package.json, only referenced in Tactical3DNetwork.tsx from other branch |
| Prisma | ❌ Dead code | In node_modules, no schema file found |
| Email auth | ❌ Stub | `Credentials` provider in `auth.ts` for dev sign-in, Google OAuth not configured |
| Leaderboard | ⚠️ Partial | Frontend renders it, backend returns empty array on Supabase failure |

---

## 3. Frontend Gaps (P1-P2)

| # | Finding | File:Line | Priority |
|---|---------|-----------|----------|
| 1 | **No loading skeleton for first probe** — agent grid appears empty until first poll returns. Recent fix pre-populates 24 cells but needs live test. | `dashboard.tsx:670-676` | P1 |
| 2 | **No error boundary** around ResultCard or AgentGrid — crash in recharts or agent modal breaks entire chat. | `dashboard.tsx` (entire) | P1 |
| 3 | **Mobile layout not tested** — fixed widths, `min-w-[180px]` sample cards, `hidden sm:inline` for nav text. Needs mobile QA. | Multiple files | P1 |
| 4 | **No feedback when live probe fails** — shows "Scanning... (0/24 agents)" indefinitely if backend doesn't respond. Should timeout and show error CTA. | `dashboard.tsx:528-531` | P1 |
| 5 | **Infinite polling if backend returns 404** — the `setInterval` never clears if `/api/result/{id}` returns 404 (no session found). | `dashboard.tsx:513-515` | P1 |
| 6 | **"Load" in history page doesn't actually reload the probe** — just navigates to `/chat` without passing the session ID. | `history/page.tsx:186-189` | P2 |
| 7 | **Demo toggle uses `useCache` but the switch has no label when active** — user might not know demo is on. | `dashboard.tsx:563-567` | P2 |
| 8 | **No keyboard shortcuts** — Enter sends (works), but no Escape to close modals, no `/` to focus input. | `dashboard.tsx:547` | P2 |
| 9 | **MatricesCursor canvas re-renders on every state change** — currently in `LandingPage` which re-renders on typewriter state. Should be memoized or moved to layout. | `components/MatricesCursor.tsx` | P2 |
| 10 | **Auth button "sign in" shows even when auth is not configured** — should hide or show "coming soon" if Google OAuth env vars are missing. | `components/auth-button.tsx:16` | P2 |
| 11 | **No "what is this?" onboarding** — first-time users see sample cards + input but no explanation of the 24-agent concept. | `app/chat/page.tsx` (empty state) | P2 |
| 12 | **Console errors from recharts on first render** — `ResponsiveContainer` needs a parent with defined height. | `dashboard.tsx:173-180` | P2 |

---

## 4. Backend Gaps (P1-P2)

| # | Finding | File:Line | Priority |
|---|---------|-----------|----------|
| 1 | **In-memory session store grows unbounded** — `SESSION_STORE` dict never cleaned. Leaks memory over time. Needs TTL or cap. | `main.py:430-431` | P2 |
| 2 | **Race condition on SESSION_STORE** — `run_full_probe` writes to shared dict while `/api/result/{id}` reads it. Probes run sequentially (single `ACTIVE_SESSION_ID`), but concurrent requests would corrupt. | `main.py:430-447` | P2 |
| 3 | **Gemini API call has no retry** — if Gemini returns 429 or 503, the analysis silently returns `None`. | `gemini_analyzer.py` | P1 |
| 4 | **No rate limiting on `/api/probe`** — anyone can hammer the endpoint, burning BrightData credits. | `main.py:669-691` | P1 |
| 5 | **AI analysis hardcodes demo data path** — `/api/analyze-demo` only works with `DEMO_RESULT`. Real probe analysis goes through `/api/analyze` which needs the `use_data_dir` field. Frontend calls `analyze-demo` in demo mode but not `/api/analyze` in live mode properly. | `main.py:840-853` | P1 |
| 6 | **No request validation on `target_url`** — users could probe internal network addresses (SSRF). | `main.py:35-38` | P2 |
| 7 | **Price parser is Booking.com/Amazon heavy** — other sites get generic CSS selector fallback that rarely works. | `main.py:193-349` | P2 |
| 8 | **Hardcoded zone name** `mcp_unlocker` — should come from config. | `main.py:397` | P2 |
| 9 | **Supabase `save_probe` called in fire-and-forget** — exception is caught and printed but no retry. | `main.py:677-681` | P2 |
| 10 | **No POST endpoint for analyze-demo** — frontend calls `/api/analyze-demo` via GET with no body. Works but inconsistent with `/api/analyze` which is POST. | `main.py:840` | P3 |

---

## 5. Technical Debt & Code Quality (P2-P3)

| # | Finding | File:Line | Priority |
|---|---------|-----------|----------|
| 1 | **TypeScript `any` usage** — `DEMO_AGENTS`, `DEMO`, `updateLast`, `msg.report` all typed as `as any` or `any`. | `dashboard.tsx:63-106, 495, 502-504, 629` | P2 |
| 2 | **Unused imports** — `Zap`, `Download`, `Signal` imported in dashboard.tsx but some may be unused after refactors. | `dashboard.tsx:4-13` | P2 |
| 3 | **Hardcoded API key in `.env`** — `254d841d-f14d-4f4b-a394-3da0b03af036` committed to git (checked into backend/.env which is NOT in .gitignore). | `.gitignore` + `backend/.env` | **SECURITY** |
| 4 | **GitHub PAT in `.env`** — `sk-0EqmrKVAbVNz5WHjf0Tb944QiSAmuW2F2stP7YoqArLSBy2LfDagtyKkzGZRMaIe` in .env. | `backend/.env` | **SECURITY** |
| 5 | **No linting/formatting config** — no `.eslintrc`, `.prettierrc`, or `ruff.toml` found. Code style is inconsistent. | Project root | P3 |
| 6 | **Next.js 14.2 is outdated** — build warns about it. v15+ has perf improvements. | `package.json` | P3 |
| 7 | **Vercel deployment for frontend only** — backend is not deployed. Needs separate hosting (Railway, Fly.io, or Vercel serverless functions). | `vercel.json` | P2 |
| 8 | **No Dockerfile** — backend can't be containerized for easy deployment. | Project root | P3 |
| 9 | **`@auth/core` + `next-auth` dual dependency** — both in package.json. `next-auth@beta` already depends on `@auth/core`. Possible version conflict. | `package.json` | P2 |
| 10 | **Python `except: pass` / bare except** — several places swallow exceptions silently. | `main.py:520, 583, 679` | P2 |

---

## 6. Missing Product Features (P2-P3)

| # | Feature | Rationale | Priority |
|---|---------|-----------|----------|
| 1 | **Real user accounts** (beyond dev sign-in) | Leaderboard, history, and "my probes" require persistence. Supabase Auth is scaffolded but not wired to frontend. | P2 |
| 2 | **Share probe results via URL** | Currently results are ephemeral (in-memory on backend). A shareable link with a unique ID lets users bookmark/fwd results. PDF export exists but is unverified. | P2 |
| 3 | **Pricing page / about page** | Hackathon landing page is minimal. No "pricing" or "how it works" for non-technical visitors. | P2 |
| 4 | **Scheduled / recurring probes** | "Track this price over time" — probe the same URL daily and show price history chart. | P3 |
| 5 | **Comparison view** — side-by-side prices by variable (location, device, cookie, referrer) | Current gradient bars are informative but not scannable. A table view would be better. | P2 |
| 6 | **Webhook notifications** | "Notify me when price discrimination is detected on this product." | P3 |
| 7 | **Browser extension** | One-click probe from any product page. High demo value for hackathon. | P2 (high impact) |
| 8 | **Multi-language support** | Current UI is English-only. Gemini analysis could be localized. | P3 |
| 9 | **Dark/light theme toggle** | Currently dark-only. Some users prefer light. | P3 |
| 10 | **Rate limit / usage dashboard** | Show remaining BrightData API calls, credits used, agents deployed. | P2 |

---

## 7. Competitive & Market Positioning

### What JACOBI Does That Others Don't

- **24-agent multi-variable matrix**: Location × Device × Cookies × Referrer × Network Tier = 5-dimension probe
- **Simultaneous deployment**: All 24 agents deploy in parallel (3 staggered waves)
- **Statistical topology classification**: Not just "prices differ" but HOW they differ (uniform/selective/progressive/aggressive)
- **AI-powered plain-English verdict**: Gemini translates statistical findings into actionable steps
- **BrightData-native**: Built specifically for the BrightData Unlocker API, not a generic scraper

### What Similar Tools Do

| Tool | Approach | Gap JACOBI Fills |
|------|----------|------------------|
| PriceGrabber / CamelCamelCamel | Track single product over time | No multi-agent fingerprinting |
| VPN-based price checkers | Manual location switching | No automated 24-agent matrix |
| Incognito mode | One-dimensional (cookies only) | Only 1 of 5 variables |
| BrightData's own SERP API | SERP scraping | Not pricing-discrimination focused |

### Hackathon Differentiation

The BrightData × MIT Hackathon judges will likely evaluate on:

1. **Technical complexity** — 24-agent parallel probe, statistical analysis, AI integration ✅
2. **Real-world problem** — Pricing discrimination is universally relatable ✅
3. **Working demo** — Must show discrimination being detected (not just "uniform pricing found") ⚠️
4. **Business potential** — Could this be a product? ✅ (but needs the features above)
5. **Presentation quality** — UI polish, clear narrative, working deployment ⚠️ (minimal landing page, no backend deployment)

---

## 8. Immediate Action Items (Hackathon Prep)

### Must Fix Before Demo (P0-P1)

1. **Deploy backend** to Railway/Fly.io so Vercel frontend can call a live API (not localhost)
2. **Set `NEXT_PUBLIC_API_URL`** in Vercel environment to point to deployed backend
3. **Remove BrightData API key from committed `.env`** — rotate the key
4. **Test Google Flights probe on deployed backend** — confirm real price variance shows
5. **Add frontend error boundary** so crashes don't white-screen the demo
6. **Add probe timeout with user-facing message** — "This URL doesn't show pricing discrimination" instead of infinite scanning

### Should Fix Before Demo (P1-P2)

7. **Tune the landing page copy** to explain what JACOBI does in one sentence
8. **Remove Stripe/Prisma dead deps** from package.json to reduce bundle
9. **Test the full flow** — paste URL → 24 agents → gradient analysis → AI verdict → share
10. **Add keyboard shortcut** (Cmd+Enter, Escape to close modal)
11. **Make demo toggle more visible** — label it "Simulated Demo" with a tooltip

### Nice-to-Have (P2-P3)

12. **Browser extension** — right-click → "Probe this price" (huge demo wow factor)
13. **Compare mode** — paste 2 URLs, see which has more discrimination
14. **Price history chart** on repeated probe of same URL
15. **Shareable result links** via Supabase persistence

---

## 9. Architecture Diagram

```
User ──> /chat (Next.js) ──> POST /api/probe ──> BrightData Unlocker API
                                                      │
                                              3 waves × 8 agents
                                              (different geo/device/cookie/referrer)
                                                      │
                                              Parse prices from HTML
                                                      │
                                              Compute gradients (t-test + effect size)
                                                      │
                                              Classify topology
                                                      │
                                              Gemini AI analysis
                                                      │
                                              Savings verdict
                                                      │
                         <── Poll /api/result/{id} ──┘
                              (real-time agent grid)
```

---

## 10. Key Metrics

| Metric | Value |
|--------|-------|
| Frontend bundle size (/chat) | 113 kB (First Load: 205 kB) |
| Landing page | 3.43 kB |
| Backend startup time | ~2s |
| Probe duration (Google Flights) | ~90s (20/24 agents) |
| Probe duration (Booking.com) | ~120s (10/24 agents, rest timeout) |
| Gemini analysis time | ~3-5s |
| Total probe-to-verdict pipeline | ~2 min (with 60s agent timeout) |
| Python deps | httpx, BeautifulSoup4, FastAPI, google-genai, supabase |
| Node deps | next, react, recharts, lucide-react, next-auth |
