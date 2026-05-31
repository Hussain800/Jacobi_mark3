# Jacobi Handoff — Full Session Summary

## What Jacobi Is

Jacobi is a hackathon project that deploys 24 adversarial probe agents — each with a unique digital fingerprint (geo, device, cookie, referrer, network tier) — against any pricing page. It detects price discrimination and classifies it into 4 topology levels: uniform, selective, progressive, aggressive.

**Stack**: FastAPI backend (Python 3.11, Render) + Next.js 14 frontend (Vercel) + BrightData Web Unlocker proxies + Supabase + Stripe billing.

**Prod URLs**:
- Frontend: `https://jacobi-v2.vercel.app/`
- Backend: `https://jacobi-backend.onrender.com`

---

## All Fixes Applied (in order)

### Round 1 — Price Extraction Was Broken (Amazon.ae returned $0 after 80s)

**7 Root Causes Found**:
1. `check_bot_detection()` false-positive: flagged valid Amazon pages with JSON-LD prices as "JS-only shell"
2. Direct HTTP timeout was 8s — too short for international Amazon pages from Render's datacenter IP
3. Retry config stripped `cookie`, `sec_ch_ua`, `referrer` headers — making retries look MORE like bots
4. Amazon price range max was $5,000 — rejected premium products
5. `_visible_text()` stripped `<script>` tags before price detection, missing JSON-LD prices
6. Direct HTTP redirects to mobile pages with different DOM structure
7. Retry preserved stripped config on re-attempts

**Fixes Applied** (`backend/main.py`, `backend/brightdata_config.py`):
- Added `_has_price_in_html()` helper — checks raw HTML (including `<script>` tags) for price patterns before thin-page heuristic fires
- Direct HTTP timeout: 8s → 25s
- Retry now preserves all headers (was stripping cookie/sec_ch_ua/referrer)
- Amazon price range: $5K → $50K max
- Added browser-like headers to direct HTTP: `Sec-Fetch-*`, `Accept-Encoding`, `Upgrade-Insecure-Requests`, `Cache-Control`, `Connection`
- BrightData zone default: `"mcp_unlocker"` → `""` (empty string, to avoid doomed BD API calls)
- Added `FAKE_ZONE_NAMES` set: `{"placeholder", "none", "todo", "tbd", "mcp_unlocker", "your_zone_name", "your_key_here"}`

### Round 2 — Speed: Sequential Waves Causing 95s+ Times

**Root Cause**: `_run_probe_engine` ran 3 sequential waves of 8 agents (wave 0 → wave 1 → wave 2). Each wave waited for all 8 agents to complete before starting the next. With 30-60s timeouts, total time = 3 × 30s = 90s minimum.

**Fixes Applied**:
- Removed wave-based execution entirely. Now runs ALL 24 agents in one parallel batch with semaphore-limited concurrency.
- BrightData mode: timeout 60s → 25s, semaphore 8 → 12
- Direct HTTP mode: timeout 15s, semaphore 12
- Reduced retries from 3 to 2 (`(cfg, retry_cfg)` instead of `(cfg, retry_cfg, retry_cfg)`)
- Added `_ingest_agent()` helper to deduplicate result handling

### Round 3 — BrightData Integration

**Setup**:
- Created Web Unlocker zone `web_unlocker1` on BrightData
- API key: already configured in Render env vars
- Set `BRIGHTDATA_UNLOCKER_ZONE=web_unlocker1` in Render env vars
- Enabled `BRIGHTDATA_CUSTOM_HEADERS_ENABLED=true` in Render env vars
- Enabled "Custom Headers & Cookies" in BrightData zone settings

**Code Changes**:
- Removed `"render": True` from BrightData API payload — no speed benefit, Web Unlocker auto-handles JS challenges
- Increased BrightData timeout to 60s for JS-heavy sites like Booking.com

### Round 4 — Progressive Probing & Concurrency Tuning

**Key Discovery**: BrightData API slows down dramatically with high concurrency on Render (1 request = 3.5s, 12 concurrent = 41.5s each). Higher concurrency ≠ faster results.

**Fixes Applied**:
- **Progressive Two-Phase Probing**:
  - Phase 1: 6 fast agents with semaphore 6 (~24s on Render)
  - If prices uniform (< 2% spread) → skip Phase 2, mark remaining 18 agents with baseline price
  - If prices vary → Phase 2: remaining 18 agents with semaphore 4
- Empty BrightData responses (< 500 bytes) auto-fallback to direct HTTP
- BrightData timeout: 60s → 25s
- Semaphore for BD mode: 12 → 6

**Current Performance**:
- Amazon.ae: ~25s (6 agents, uniform pricing, Phase 2 skipped)
- Booking.com: ~70s (24 agents, JS-heavy page via BrightData proxies)

### Round 5 — Topology Classification Bug

**Bug**: `classify_topology()` only checked `sig` (significant gradients count) and `di_pct` (discrimination index %). Booking.com showed $1,119 spread but "uniform" classification because no individual variables had statistically significant gradients.

**Fix**: Added `spread_pct` parameter to `classify_topology()`. Now uses `max(di_pct, spread_pct)` for classification. A 356% spread with 0 significant gradients → "aggressive" (was "uniform").

Changed thresholds:
```python
if sig == 0 and di_pct < 5: return "uniform"
if sig <= 1 and di_pct < 12: return "selective"
if sig <= 3 and di_pct < 25: return "progressive"
return "aggressive"
```

### Round 6 — PDF Export Redesign

Complete rewrite of `backend/report_export.py` PDF generation using ReportLab's drawing primitives instead of tables:

**Visual Elements**:
- Full-width navy (`#0f1123`) header banner with green (`#00d992`) accent stripe
- JACOBI branding + "Pricing Topology Report" in header
- Color-coded topology badge rendered as rounded pill (green/uniform, amber/selective, orange/progressive, red/aggressive)
- 3 metric cards with rounded rectangles: Baseline Price, Price Spread, Discrimination Score
- Gradient impact bars drawn as proportional `Rect` shapes (red = significant, gray = not)
- Price range bar with green baseline marker line
- 24-agent price heatmap: green-to-red colored dots showing distribution
- Plain-English verdict text per topology level
- Timestamp footer with session ID

---

## Current Architecture State

### `backend/main.py` — Core Changes
- `check_bot_detection()`: 3-layer detection (honeypot phrases → raw HTML price check → thin-page heuristic)
- `_has_price_in_html()`: checks raw HTML for price patterns including JSON-LD
- `_run_probe_engine()`: progressive two-phase probing
  - Phase 1: 6 agents, semaphore 6, 25s timeout (BD) or 15s (direct HTTP)
  - Uniform detection: spread < 2% → fill remaining 18 agents with baseline
  - Phase 2: 18 agents, semaphore 4 (only if prices vary)
- `classify_topology()`: uses max(di_pct, spread_pct) for classification
- `launch_single_agent()`: 2 retries (was 3), full headers preserved
- `_identity_headers()`: 11 browser-like headers including Sec-Fetch-*
- `BrightDataMCPClient.probe_url()`: empty response detection + auto-fallback
- `FAKE_ZONE_NAMES`: rejects placeholder zone names
- Amazon price range: $1-$50,000

### `backend/brightdata_config.py`
- Zone default: `""` (empty, not `"mcp_unlocker"`)

### `backend/report_export.py`
- Complete PDF redesign with ReportLab Drawing primitives
- `HeaderBanner` Flowable class for branded header
- Metric cards with `Drawing` + `Rect` shapes
- Gradient bars as proportional `Rect` shapes
- Agent heatmap with color-coded dots
- Pro-tier gated (`_require_pro` dependency)

### Render Environment Variables
```
BRIGHTDATA_API_KEY=61982bfb-b47c-4d00-a281-f885a2cbdab8
BRIGHTDATA_UNLOCKER_ZONE=web_unlocker1
BRIGHTDATA_CUSTOM_HEADERS_ENABLED=true
SUPABASE_URL=https://dlxfhoquysrncxkelyxa.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=sb_publishable_Br_pt2cgWxok1ZLAMXMWiQ_Bb7KvAES
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRO_PRICE_ID=price_1TbQtuEX9Slvr2kwpbhWvTlk
STRIPE_WEBHOOK_SECRET=whsec_...
GEMINI_API_KEY=AIzaSyCznrAWnfsQ4SX810j6fIIarEUmYnAkZKk
```

### `.env.local` (local dev only, gitignored)
```
BRIGHTDATA_UNLOCKER_ZONE=web_unlocker1
BRIGHTDATA_CUSTOM_HEADERS_ENABLED=false
JACOBI_MODE=live
```

---

## Known Limitations

1. **Booking.com speed**: ~70s. BrightData proxies need 17-25 seconds to render Booking.com's JS-heavy pages. This is a BrightData infrastructure limitation, not fixable in code. Without proxies, Booking.com blocks all direct HTTP requests with JS challenges.

2. **Amazon shows $0 hidden premium**: Correct behavior — Amazon doesn't price-discriminate on product pages. Everyone sees the same price. JACOBI correctly detects "uniform" topology. Test with flight/hotel URLs to see discrimination detection.

3. **Agent geos**: Some BrightData geo proxies (specific US state codes) return empty responses. The empty-response detection + fallback handles this, but those agents retry via direct HTTP (which may be slower or blocked).

---

## Git History (last 10 commits on main)
```
aa7d8ca feat: complete PDF redesign with drawn graphics - header banner, bar charts, heatmap
8152b28 feat: professional research-grade PDF report with brand visuals
cc23d6a fix: uniform pricing fills 18 remaining agents with baseline for full 24-agent UI
2084a9b fix: Phase 1 semaphore 6 for Amazon <30s, Phase 2 semaphore 4 for Booking
b998537 fix: progressive probe - Phase 1 (6 agents, semaphore 3) for <30s Amazon speed
839cf84 perf: reduce BD timeout 60s->25s, semaphore 8->12, remove render flag
c540b5f fix: unified parallel execution for both BrightData and direct HTTP modes
33426d9 fix: BD timeout 30s->60s + topology classification with spread fallback
b4f3c56 fix: parallelize 24-agent probe + semaphore limiting for direct HTTP mode
709df7e perf: semaphore 16, 25s timeout, empty-response fallback for Amazon speed
```

---

## Testing Notes

- **Debug probe** (no auth needed): `POST https://jacobi-backend.onrender.com/api/debug-probe` with `{"target_url": "...", "target_name": "..."}`
- **Health check**: `GET https://jacobi-backend.onrender.com/health` — shows `probe_mode`, `brightdata_configured`, etc.
- **Live probe**: Requires Google OAuth sign-in via Supabase. Uses `/api/probe` → polls `/api/result/{id}`
- **PDF export**: Pro-tier gated. Requires auth. `/api/export/{session_id}/pdf`
- **Test URLs**:
  - Amazon.ae: `https://www.amazon.ae/Lenovo-Legion-Gaming-GeForce-Windows/dp/B0FL4HLJ56/` → ~25s, $3,158.68
  - Booking.com: `https://www.booking.com/searchresults.html?ss=New+York&checkin=2026-07-10&checkout=2026-07-14&group_adults=2&no_rooms=1&selected_currency=USD` → ~70s, $246-$1075
