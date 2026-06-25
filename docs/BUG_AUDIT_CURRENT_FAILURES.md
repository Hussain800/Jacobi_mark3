# Jacobi — Current Failures Bug Audit

Date: 2026-06-25
Author: diagnostic pass (reproduce-before-fix). **No code was changed to produce this document.**
Scope: the live production failures reported against `https://jacobi-mark3.vercel.app`.

> **Verdict up front: Jacobi is NOT production-ready and NOT pilot-ready.** The
> infrastructure (DB, env, deploy, auth gating) is wired, but the actual product
> surface has multiple user-facing failures. This document records root causes
> with evidence. Fixes are tracked separately and must be verified by smoke tests
> before any readiness claim is made.

## How this was reproduced (no BrightData credits spent)

- Live HTTP probes against the Render backend `https://jacobi-mark3.onrender.com`
  and the Vercel frontend `https://jacobi-mark3.vercel.app`.
- Static source tracing of the probe lifecycle, nav, and demo paths.
- Direct Supabase reads of the seeded pilot rows.
- The reporter's own reproduction (Booking → "needs context"; Amazon UAE → ~30s → "Probe session expired").
- I did **not** launch new live probes of hard sites (would burn credits and not add signal beyond the reporter's repro).

---

## BUG-1 — "Probe session expired" on live scans (CRITICAL)

**Symptom:** A live audit (e.g. Amazon UAE `…/dp/B0FL4HLJ56/`) runs ~30s, then the
UI shows `Probe session expired` and halts. No completion, no honest failure state.

**Where the string comes from:** purely frontend, on a polling 404:
- `frontend/components/design/cockpit/CockpitProbe.tsx:452-455` — `if (r2.status === 404) { … setErrorMsg("Probe session expired") }`
- `frontend/components/dashboard.tsx:315-316` — same string on the dashboard path.

**Lifecycle (traced):**
1. `POST /api/probe` (`backend/main.py:2293`) creates an **in-process** session in
   `SESSION_STORE` (a plain dict, `backend/main.py:1342`) and fires the engine as a
   fire-and-forget `asyncio.create_task(_complete_probe_in_background(...))` (`main.py:2394`).
   It returns `{session_id, status:"running"}` immediately.
2. Frontend polls `GET /api/result/{session_id}` every 1s (`CockpitProbe.tsx:448-451`).
3. `GET /api/result` (`main.py:2686`) reads `SESSION_STORE.get(session_id)`; on miss it
   falls back to Supabase `get_probe_by_session_id` (`main.py:2696`), else returns **404**.

**Root cause:** the probe is only persisted to Supabase **on completion**
(`_complete_probe_in_background` → `save_probe`; `supabase_client.py:30`). While a probe
is still running it lives **only in process memory**. On Render's **free tier** the
instance sleeps after ~15 min idle and is reclaimed/restarted; any of:
- cold-start mid-flight, instance recycle, or a second instance, **or**
- `MAX_SESSION_STORE` eviction (`main.py:1369-1374`)

drops the in-memory session. The next poll misses both memory **and** Supabase (because
the running probe was never persisted) → **404 → "Probe session expired."**

**Independent evidence of the cold-start race:** `GET /api/result/<fake-id>` timed out
with no response (HTTP 000) while the instance was asleep; an immediate retry of
`demo_session_static` returned 200 once warm. A real user's first probe after idle races
exactly this window. Also note `probe_url` uses a 30s timeout (`main.py:1266`), matching
the reported ~30s.

**Why it's unacceptable (reporter is correct):** a running job must never be silently
declared "expired." If the process is gone, there is no durable record to recover from,
and the UI invents a terminal state.

**Fix direction (Phase 2):**
- Persist a probe row **early** (status `running`) at launch, update through the lifecycle.
- `GET /api/result` must read the persistent row on memory-miss and return its real status
  (`queued/running/...`) — only a row that exists in *neither* memory nor DB is a true 404.
- Add a server-side **watchdog/timeout**: a probe `running` past a hard cap (e.g. 120s) is
  marked `timeout` with a stored reason instead of spinning forever (covers instance-killed-mid-probe).
- Frontend: tolerate transient 404 (retry a few polls before erroring), show elapsed time +
  current phase, and render honest states (`queued/running/provider_blocked/needs_browser_provider/
  insufficient_evidence/timeout/failed_with_reason/completed`) — never a bare "expired".

---

## BUG-2 — Demo / case-study links run live probes of hard sites (HIGH)

**Symptom:** The Booking "Leela Palace" case study (and others) trigger a **live** probe
that either needs context (Booking needs dates/occupancy) or gets blocked, instead of
showing guaranteed demo evidence.

**Root cause:** a working **cached** fixture already exists — `GET /api/result/demo_session_static`
returns a full completed report (verified 200 live), and `POST /api/probe` with `use_data_dir`
short-circuits to it (`main.py:2316-2317`). But the case-study/demo buttons call `runLive(url,name)`
(`CockpitProbe.tsx:382,386`) against the real URL instead of loading the cached demo. So the
"demo" depends on live scraping of hostile sites.

**Fix direction (Phase 3):** a deterministic "Try Demo" / case-study path that loads cached
fixture data (no BrightData), clearly labeled "Demo data / cached evidence," showing multiple
synthetic observations, capability labels, evidence table, and the export path. Live hard sites
must not be the only demo path.

---

## BUG-3 — Dead footer navigation (MEDIUM, but it's fake UI)

**Symptom:** Footer "Company" column links Method / Extension / Privacy / Terms go nowhere.

**Root cause (confirmed):** `frontend/components/design/DesignFooter.tsx:33-36` — all four are
`<a href="#">`. The file comment even admits: *"Company links remain placeholder (`#`) since
those pages don't exist yet."* No routes exist for `/method`, `/extension`, `/privacy`, `/terms`
(verified against `frontend/app/**`). (The top `DesignNav.tsx` links — Run audit/History/Pricing/
Leaderboard — do resolve to real routes; the dead set is the footer Company column.)

**Fix direction (Phase 4):** implement real pages (`/privacy`, `/terms` — simple but real;
`/method` — explains provider modes, capability labels, local vs managed provider, evidence
limits; `/extension` — honest "coming soon" or removed) and point the footer at them. No `href="#"`.

---

## BUG-4 — Misleading seeded dashboard product (HIGH — honesty issue)

**Symptom:** "Jacobi Internal Pilot Headphones" shows essentially one price — useless as a
showcase for a pricing-evidence product.

**Root cause (from direct DB read of `gyujyxeeteganwgcjbyv`):**
- `products`: "Jacobi Internal Pilot Headphones" (SKU `JCB-PILOT-001`, MAP floor $199) — but the
  watchlist item's `target_url` is **`https://www.apple.com/airpods-pro/`** (mislabeled synthetic product).
- `findings`: a single `MAP_UNDERCUT` ($176 vs $199) whose `evidence_summary` says "Apple Store showed
  USD 176.00 for Jacobi Internal Pilot Headphones" — sourced from the **imported preview** job
  (`scan_job 4f0d31cf`), i.e. one fabricated/imported price, not a multi-observation scan.
- The **live** scan (`scan_job a647eda9`) produced 8 evidence rows, but they have `finding_id = NULL`
  (not linked to any finding) and the item shows `last_coverage_pct = 33.33%` with `last_observed_price = 250`
  — a thin, single-effective-price result.

So the headline product is a mislabeled, single-observation, partially-orphaned record.

**Fix direction (Phase 5):** remove/replace with a clean **labeled demo** product carrying meaningful
multi-observation evidence (several sellers/markets, a clear MAP-undercut or explicit "uniform pricing"
verdict, linked evidence rows), or remove it from the main path. Never present a one-price record as proof of value.

---

## Cross-cutting constraint — Render free tier

The consumer probe engine runs as an **in-process asyncio task** on a **sleeping/recycling free
instance**. This is the structural reason behind BUG-1 and the demo fragility. The enterprise scan
worker already has durable, DB-backed job state (`scan_jobs` + lease reclaim); the **consumer probe
path does not**. Phase 2 brings the probe path up to the same durability bar (persist early, poll the
row, watchdog timeout) — which is achievable on free tier and makes failures honest, even though it
cannot make hostile sites (Amazon/Booking) reliably scrape-able (that's provider capability, surfaced
honestly, with the cached demo as the guaranteed showcase).

## Fix → phase mapping

| Bug | Phase | Primary files |
|-----|-------|---------------|
| BUG-1 lifecycle | 2 | `backend/main.py`, `backend/supabase_client.py`, `frontend/.../CockpitProbe.tsx`, `frontend/components/dashboard.tsx` |
| BUG-2 demo | 3 | `frontend/.../CockpitProbe.tsx`, demo fixture |
| BUG-3 dead nav | 4 | `frontend/app/{privacy,terms,method,extension}/page.tsx`, `DesignFooter.tsx` |
| BUG-4 seeded data | 5 | Supabase seed (+ UI "Demo data" label) |
| acceptance | 6 | `scripts/smoke_test.*` |

Safety throughout (Phase 7): no repeated BrightData scans while debugging; test mode Stripe; no paid
upgrades; no secret exposure; no production-data deletion without asking; no "production-ready" claim
until smoke tests pass.
