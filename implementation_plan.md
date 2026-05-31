# Fix Jacobi Probing System — Complete Implementation Plan

## Problem Statement

Jacobi's 24-agent pricing probe returns $0.00 for Amazon.ae URLs (and likely most other sites) in production on Render. The probe takes ~80 seconds and fails to extract any price. This has persisted through multiple attempted fixes by Claude Code and Codex.

## Root Cause Analysis

I traced the complete probe execution path from `/api/probe` → `_complete_probe_in_background` → `_run_probe_engine` → `launch_single_agent` → `BrightDataMCPClient.probe_url` → price extraction. Here are **all 7 root causes**:

> [!CAUTION]
> ### ROOT CAUSE #1: BrightData Zone Defaults to "mcp_unlocker" — A Non-Existent Zone
> 
> In [brightdata_config.py](file:///C:/Users/hussa/.gemini/antigravity/scratch/Jacobi_v2/backend/brightdata_config.py#L23-L27), the zone defaults to `"mcp_unlocker"` when no env var is set. But this zone name doesn't pass the `brightdata_zone_ready()` check in main.py because it IS a real-looking string — so the code **tries** to use BrightData, gets a 400/403 error back, then falls back to direct HTTP. This wastes time on a doomed BrightData call for every agent.
> 
> The `/health` endpoint confirms: `brightdata_zone_configured: false`, `probe_mode: direct_http_fallback`. The zone IS set ("mcp_unlocker") but BrightData rejects it → every agent falls back → direct HTTP from Render's datacenter IPs.

> [!CAUTION]
> ### ROOT CAUSE #2: Bot Detection False-Positives Kill Valid Responses
> 
> The `check_bot_detection()` function at [main.py:513-548](file:///C:/Users/hussa/.gemini/antigravity/scratch/Jacobi_v2/backend/main.py#L513-L548) has a **catastrophic thin-page heuristic** (lines 542-546):
> 
> ```python
> if not has_visible_price and len(text) < 12000 and len(visible) < 200:
>     return True, "JS-only shell (likely blocked)"
> ```
> 
> When Amazon returns a page via direct HTTP (no JS rendering), the HTML is often a **minimal redirect page** or a **mobile-optimized stub** under 12KB with prices embedded in JavaScript/JSON-LD rather than visible text. The `PRICE_TEXT_RE` regex runs on `_visible_text()` output which strips scripts — so JSON-LD prices inside `<script>` tags are invisible to `has_visible_price`. Result: **every valid Amazon response is incorrectly flagged as "JS-only shell"**.

> [!CAUTION]
> ### ROOT CAUSE #3: 8-Second Timeout is Catastrophically Short
>
> When BrightData is not live-ready, `probe_timeout_s` is set to only **8 seconds** at [main.py:917](file:///C:/Users/hussa/.gemini/antigravity/scratch/Jacobi_v2/backend/main.py#L917):
> ```python
> probe_timeout_s = 30.0 if brightdata_live_ready() else 8.0
> ```
> Amazon.ae pages from a datacenter IP can easily take 5-15 seconds. With 3 retries × 24 agents, the total wall time balloons to 80+ seconds because most agents timeout, retry, timeout again.

> [!WARNING]
> ### ROOT CAUSE #4: Amazon Price Range Max is $5,000 — Rejects Valid Products
>
> At [main.py:188](file:///C:/Users/hussa/.gemini/antigravity/scratch/Jacobi_v2/backend/main.py#L188):
> ```python
> "amazon": {"min": 1, "max": 5000},
> ```
> The Lenovo Legion laptop on Amazon.ae is AED 11,600 ≈ **USD $3,158**. This passes the $5K filter. BUT many laptops, electronics, and luxury items on Amazon exceed $5,000 USD. The range is too restrictive for a general-purpose probe.

> [!WARNING]
> ### ROOT CAUSE #5: `_visible_text()` Strips Script Tags Before Price Detection
>
> The `has_visible_price` check in `check_bot_detection()` uses `_visible_text()` which **decomposes `<script>` tags**. But Amazon and many sites embed their prices in `<script type="application/ld+json">` blocks. After stripping scripts, the visible text has NO price patterns → `has_visible_price = False` → triggers the thin-page false positive.

> [!WARNING]
> ### ROOT CAUSE #6: Direct HTTP Doesn't Handle Amazon Redirects Properly
>
> Amazon serves different content based on User-Agent. Mobile UAs get redirected to `m.amazon.ae` which returns different HTML structure. The `httpx` client follows redirects (`follow_redirects=True`), but the resulting mobile page may have a different DOM structure that the desktop-oriented Amazon selectors don't match.

> [!NOTE]
> ### ROOT CAUSE #7: Retry Config Strips Essential Headers
>
> In `launch_single_agent()` at [main.py:857-860](file:///C:/Users/hussa/.gemini/antigravity/scratch/Jacobi_v2/backend/main.py#L857-L860), the retry config strips `cookie`, `sec_ch_ua`, and `referrer` — making the retry request look like a bare bot request. This virtually guarantees Amazon blocks the retry.

---

## Proposed Changes

### [Backend Core Fixes]

#### [MODIFY] [main.py](file:///C:/Users/hussa/.gemini/antigravity/scratch/Jacobi_v2/backend/main.py)

**Fix 1: Fix bot detection to not false-positive on valid pages with JSON-LD prices**
- Modify `check_bot_detection()` to check for prices in the RAW HTML (including `<script>` tags) before applying the thin-page heuristic
- Add a `_has_price_in_html()` helper that checks for price patterns in the full HTML (not just visible text)
- Only apply the thin-page heuristic when the raw HTML also has no price signals

**Fix 2: Increase direct-HTTP timeout from 8s to 20s**  
- Change the fallback timeout from 8.0 to 20.0 seconds
- 8 seconds is too short for international Amazon pages from datacenter IPs

**Fix 3: Expand Amazon price range from $5K to $50K**
- Amazon sells items from $1 to well over $10K USD
- Set max to $50,000 to cover all product categories

**Fix 4: Fix the thin-page heuristic thresholds**
- Increase the "JS-only shell" threshold from 12KB/200chars to be more nuanced
- A real Amazon page even without JS rendering is 50-200KB; a real block page is <5KB
- Add a check: if the page has `<script type="application/ld+json">` with price data, it's NOT blocked

**Fix 5: Don't strip headers on retry**
- Keep cookie, sec_ch_ua, and referrer on retry attempts
- Only vary the User-Agent slightly between retries

**Fix 6: Add proper Accept-Encoding and connection headers**
- Add headers that make the direct HTTP request look more like a real browser
- Add `Accept-Encoding: gzip, deflate, br` and other standard headers

**Fix 7: Remove wave stagger delay when in direct HTTP mode**
- Wave stagger is already 0.0 for non-BrightData mode — confirmed correct

#### [MODIFY] [brightdata_config.py](file:///C:/Users/hussa/.gemini/antigravity/scratch/Jacobi_v2/backend/brightdata_config.py)

**Fix 8: Default zone to empty string, not "mcp_unlocker"**
- Change the fallback from `"mcp_unlocker"` to `""` 
- This way, when no zone is configured, the system immediately uses direct HTTP without wasting time on a doomed BrightData API call
- This alone could save 5-10 seconds per agent (the BrightData timeout)

---

## Verification Plan

### Automated Tests
1. Hit the live production `/api/debug-probe` endpoint with the Amazon.ae URL after deployment
2. Verify the response contains `prices_found: [3158.68]` (or similar AED→USD conversion)
3. Verify `bot_detected: false`
4. Run a full probe via `/api/probe` and poll `/api/result/{id}` until complete
5. Verify `baseline_price > 0`, `successful_agents >= 18`, `status: "completed"`

### Manual Verification
- Open https://jacobi-v2.vercel.app/ and paste the Amazon.ae URL
- Verify it completes in under 30 seconds with a real price around $3,158

