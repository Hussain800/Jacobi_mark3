# Jacobi — Fix Verification Report

Date: 2026-06-25
Companion to: `docs/BUG_AUDIT_CURRENT_FAILURES.md`
Deployed at: frontend `https://jacobi-mark3.vercel.app`, backend `https://jacobi-mark3.onrender.com`, commit `83f9f4b` (both confirmed live via `/health` `git_commit`).

> **Scope note / honesty:** this report states the verification *level* for each
> item (proven-live / verified-at-API-or-data / typecheck-only). It does **not**
> claim Jacobi is "production-ready" as a whole. It claims the four reported
> defects are fixed and verified to the levels below, and that the cost-free
> acceptance smoke test passes 16/16.

## Deploy

- Frontend (Vercel) and backend (Render) both auto-deploy from `main`. Confirmed:
  backend `/health` now returns `git_commit: 83f9f4b`; new frontend routes (`/method`
  etc.) return 200. Render auto-deploy is therefore working (previously unknown).

## BUG-1 — "Probe session expired" → durable lifecycle  ✅ PROVEN LIVE

**Fix:** persist a `running` probe row at launch (`save_probe` in `/api/probe`),
finalize it in place on completion via new `update_probe()`, a hard engine watchdog
(`asyncio.wait_for(..., PROBE_HARD_TIMEOUT_S=150)`), and a read-time backstop in
`/api/result` that turns a row stuck `running` past `cap+30s` into an honest `timeout`.
Frontend tolerates transient 404s (no bare "expired") and renders a `timeout` state.

**Live evidence (cost-free, injected ownerless probe rows, then deleted):**
- Fresh `running` row → `GET /api/result/smoke-run-fresh` = **HTTP 200, status:"running"**
  (a persisted running job is recoverable across process loss — no false 404/"expired").
- 200s-old `running` row → `GET /api/result/smoke-run-stale` = **HTTP 200, status:"timeout"**,
  message *"The audit didn't finish — the worker may have restarted mid-run…"* (read-time watchdog).
- Unknown id → **HTTP 404** clean JSON (no crash, no fabricated result).

Files: `backend/main.py`, `backend/supabase_client.py`, `frontend/.../CockpitProbe.tsx`.

## BUG-2 — Demo reliability → guaranteed cached demo  ✅ API+CODE VERIFIED

**Fix:** added a **"View demo result"** button that loads the cached
`demo_session_static` fixture (no BrightData, can't be blocked), tagged so the existing
"curated sample" notice labels it honestly. Live case studies remain but now fail with
honest states (BUG-1) instead of "expired".

**Evidence:**
- `GET /api/result/demo_session_static` = **HTTP 200, status:completed, agents=24, priced=23**
  (multi-observation, no BrightData) — smoke test PASS.
- Frontend button added; whole frontend `tsc --noEmit` = **exit 0**.
- *Not yet visually clicked in a browser* — recommend a quick click-through (see "Remaining").

Files: `frontend/.../CockpitProbe.tsx`.

## BUG-3 — Dead footer nav → real pages  ✅ PROVEN LIVE

**Fix:** created real `/method`, `/extension`, `/privacy`, `/terms` pages (factual, no
marketing claims) and rewired `DesignFooter.tsx` (no `href="#"` remains).

**Evidence:** all 10 nav routes return **HTTP 200** (smoke test PASS), incl. the 4 new
pages; `tsc --noEmit` exit 0; footer grep shows zero `href="#"`.

Files: `frontend/app/{method,extension,privacy,terms}/page.tsx`, `frontend/components/design/DesignFooter.tsx`.

## BUG-4 — Misleading one-price seed → labeled multi-observation  ✅ DATA VERIFIED

**Fix (prod DB, org `06002d79…`):** renamed the mislabeled product to
`[DEMO] AirPods Pro (2nd gen)`; removed 9 incoherent/orphaned evidence rows; inserted
**5 coherent observations** (US authorized $199, residential $176, mobile $171.50, EU $182,
datacenter $168) linked to the finding; rewrote the finding summary honestly and labeled it
*"Demo data - cached sample, not a live scan."*

**Evidence (DB read-back):** product name updated; `evidence_for_finding = 5`;
`orphaned_evidence = 0`; observation spread 168→199 (four below the $199 MAP floor).
`evidence_items` is a leaf table (no FK references it) so the cleanup was safe.

*Dashboard rendering of this finding is auth-gated; verified at the data layer, not visually.*

## Acceptance smoke test  ✅ 16/16

`scripts/smoke_test.py` (cost-free; launches no live probe). Result: **16/16 passed** —
homepage + every nav route 200; demo loads multi-observation evidence; unknown session
clean 404; enterprise APIs 401 (direct + via proxy); backend up at build 83f9f4b.

## Safety (Phase 7) — honored

- No live BrightData probe was launched during this work (the one demo check uses the cached
  fixture; lifecycle proof used injected DB rows). Zero credits spent.
- Stripe untouched (still test/sandbox). No paid upgrades. No secrets printed/committed.
- Only seeded *demo* rows were modified/deleted (not real customer data); injected smoke rows
  were deleted after use.

## Remaining / honest gaps

1. **Visual click-through not done:** the demo button render and the *signed-in* dashboard
   render are verified at the data/API/typecheck level, not by a browser screenshot (the
   dashboard needs a signed-in session I don't have). Recommended final step: sign in, click
   "View demo result" on `/chat`, and open `/dashboard` to eyeball the `[DEMO] AirPods Pro`
   finding with its 5 observations.
2. **Hard live sites (Amazon/Booking) still may not scrape** — that's provider capability, not
   a bug. They now fail with honest states (blocked / needs-context / timeout), and the cached
   demo is the guaranteed showcase.
3. **Legacy dead code:** `frontend/components/dashboard.tsx` still contains an old
   "Probe session expired" polling path, but it is unreachable (only its `ResultCard`/types are
   imported). Left untouched to avoid changing dead code; flagged for a future cleanup.
4. Manual lifecycle checks under load (many concurrent probes, real cold-start mid-probe) were
   not load-tested.
