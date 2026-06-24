# Jacobi Session Changelog

Date: 2026-06-24  
Repository: `https://github.com/Hussain800/Jacobi_mark3`  
Current mainline merge: `570f49a Merge pull request #25 from Hussain800/phase/5-security-controls`

## Living Document Rule

This is the running implementation changelog for the enterprise pivot work completed today. Keep this file current after every meaningful future implementation phase, especially after schema changes, API contract changes, dashboard workflow changes, production rollout work, or PR merges.

When updating this file, add:

- Date and branch/PR.
- Commit list.
- Product/business impact.
- Backend/API changes.
- Frontend/UI changes.
- Database/migration changes.
- Verification performed.
- Updated production-readiness verdict.

## Executive Summary

Jacobi has moved from a consumer savings / price-checking concept into a compliance-led enterprise price-integrity product.

Today completed the first two practical build phases of the pivot:

- **Phase 1: Compliance-led reframe and investor-demo surface.**
  - Main product positioning changed toward controlled synthetic-buyer pricing audits, price-integrity findings, compliance-risk monitoring, and evidence-grade reporting.
  - Existing live audit/probe engine stayed intact.
  - Frontend and backend were reconciled with the current `Jacobi_mark3` mainline, including security hardening and Next/React platform upgrades.

- **Phase 2: Enterprise data/workflow foundation plus live watchlist scan path.**
  - Enterprise schema, org/workspace model, watchlists, findings, evidence, audit logs, and dashboard live-data wiring were added.
  - The live watchlist scan worker path was added so imported watchlist rows can now be scanned using the existing probe engine and converted into evidence-backed MAP findings.

Current product verdict:

**Application-level paid-pilot foundation with production-readiness tooling.**

The app now has the enterprise workflow foundation, durable worker contract, evidence locker, report exports, redacted share/revoke flow, role/rate/cost controls, and production readiness tooling. Final production launch still requires external environment execution: apply migrations in production Supabase, verify RLS against the production database, configure Vercel/BrightData/Sentry secrets, and complete one controlled pilot smoke test.

## Phase 3: Durable Scan Worker And Evidence Locker

PR:

- `#23 Phase 3: Durable scan worker and evidence locker`
- URL: `https://github.com/Hussain800/Jacobi_mark3/pull/23`
- Branch: `phase/3-durable-evidence`
- Merge commit: `8493c8514bd6f4c9fed3c2fa278b44a0bd6b7750`

Commit split:

- `646514a api: add durable enterprise scan worker`
- `8ef0f8c ui: add enterprise evidence locker`
- `1201640 test: cover durable worker evidence flow`

Implemented:

- Secret-protected worker endpoint: `POST /api/enterprise/scan-worker/run`.
- Queue-wide claim helper for queued live jobs.
- Partial worker slices with safe release back to queue.
- Idempotent skip of already-processed watchlist items.
- Evidence list/detail APIs: `GET /api/evidence`, `GET /api/evidence/{evidence_id}`.
- Dashboard Evidence locker at `/dashboard/evidence`.
- Vercel cron declaration for the worker route.

Verification:

- `python -m pytest tests/test_enterprise_workflow.py -q`
- `python -m pytest tests -q`
- `npm run build`
- GitHub Actions and Vercel preview passed.

## Phase 4: Enterprise Reporting And External Sharing

PR:

- `#24 Phase 4: Enterprise reporting and external sharing`
- URL: `https://github.com/Hussain800/Jacobi_mark3/pull/24`
- Branch: `phase/4-reporting-sharing`
- Merge commit: `4f9fd69665c091ddf36a44b16e865eaa82fca64c`

Commit split:

- `04e6873 schema: add enterprise reporting and share records`
- `2724ac8 api: add MAP report exports and shares`
- `196abb5 ui: add enterprise report and share flows`
- `8e76271 test: cover enterprise exports and share revoke`

Implemented:

- Migration `202606240003_enterprise_reporting_sharing.sql`.
- MAP PDF and JSON finding exports.
- Export checksums and `evidence_exports` audit records.
- Redacted share-token create/revoke APIs.
- Public redacted share page at `/share/enterprise/[token]`.
- Dashboard export/share controls on finding evidence pages.

Verification:

- `python -m pytest tests/test_enterprise_workflow.py -q`
- `python -m pytest tests -q`
- `npm run build`
- GitHub Actions and Vercel preview passed.

## Phase 5: Security, Roles, Rate Limits, Cost Controls

PR:

- `#25 Phase 5: Enterprise security, roles, and cost controls`
- URL: `https://github.com/Hussain800/Jacobi_mark3/pull/25`
- Branch: `phase/5-security-controls`
- Merge commit: `570f49aeed41c4b4c74e64ebc0cd8a67d5a622a6`

Commit split:

- `16085f2 schema: add enterprise role and invite controls`
- `675f66f api: enforce enterprise roles and scan controls`
- `f83d331 ui: add workspace access settings`
- `8ee20b4 test: cover enterprise security controls`

Implemented:

- Central role/permission helper in `backend/enterprise_access.py`.
- Organization invite migration and invite APIs.
- Role enforcement for watchlists, imports, scans, exports, shares, and member management.
- Stricter CSV URL validation against private/local/internal targets.
- Live scan rate limits, max target caps, estimated cost budget checks, and live-scan kill switch.
- Workspace Settings page at `/dashboard/settings`.

Verification:

- `python -m pytest tests/test_enterprise_workflow.py -q`
- `python -m pytest tests -q`
- `npm run build`
- GitHub Actions and Vercel preview passed.

## Phase 6: Production Ops, Supabase Verification, Pilot GTM

Branch:

- `phase/6-production-ops`

Commit split:

- `fa30f3f ops: add enterprise production readiness checks`
- `c8f9afb ui: align pricing with enterprise pilot packaging`
- docs commit in this PR: production checklist, pilot onboarding, investor demo script, CSV template, changelog/PRD updates

Implemented in this phase:

- Production readiness module: `backend/ops_readiness.py`.
- Authenticated health endpoint: `GET /api/enterprise/health`.
- Read-only verifier script: `scripts/verify_production_readiness.py`.
- Production checklist: `docs/PRODUCTION_READINESS_CHECKLIST.md`.
- Pilot onboarding guide: `docs/PILOT_ONBOARDING.md`.
- Investor demo script: `docs/INVESTOR_DEMO_SCRIPT.md`.
- Pilot CSV template: `docs/PILOT_CSV_TEMPLATE.csv`.

Required external launch gates:

- Apply all Supabase migrations to production.
- Run `python scripts/verify_production_readiness.py --strict` with production env and `SUPABASE_DB_URL`.
- Configure Vercel cron/worker secret and BrightData production credentials.
- Complete one controlled pilot smoke test.

## Work Completed Before Codex Phase 2

PR #19 merged the compliance-led pivot and mainline reconciliation:

- PR: `#19`
- Branch: `pivot/price-integrity-mainline`
- Merge commit: `653a2bb Merge pull request #19 from Hussain800/pivot/price-integrity-mainline`

Important commits:

- `823058a feat(pivot): compliance-led reframe + enterprise audit dashboard`
- `d5b1b8b Harden pivot branch and upgrade frontend stack`

High-level changes:

- Reframed Jacobi from a consumer shopping/savings tool into an enterprise pricing-integrity audit product.
- Added investor-demo dashboard routes under `/dashboard`.
- Added seeded demo data with honesty labeling.
- Preserved `/dashboard/audits` as the live audit path.
- Hardened backend access control around probe results, share links, exports, URL safety, and launch rate limiting.
- Upgraded frontend stack to Next `16.2.9` and React `19.2.7`.
- Cleared frontend moderate audit issues through the platform upgrade and PostCSS override.
- Added regression tests for access control and rate limiting.

Existing root changelog:

- `JACOBI_PIVOT_IMPLEMENTATION_CHANGELOG.md`

## Phase 2A: Enterprise Data Layer And MAP Workflow

PR:

- `#20 [codex] Enterprise price integrity phase 2`
- URL: `https://github.com/Hussain800/Jacobi_mark3/pull/20`
- Branch: `phase/enterprise-data-layer`
- Merged: `2026-06-24T14:11:52Z`
- Merge commit: `ea24b1f0b43326b315e18cc64cce4f015ec24dfd`

Commit split:

- `8b64538 schema: add enterprise price integrity tables`
- `cddbcc4 api: add enterprise watchlist and MAP workflow`
- `f5ca24a ui: wire dashboard to enterprise workspace`
- `d5e3c57 fix(ui): prevent dashboard nav overlap`
- `a32eed6 fix(ui): harden dashboard local rendering`
- `31557a7 docs: document enterprise phase 2 implementation`

### Database Changes

Added migration:

- `supabase/migrations/202606240001_enterprise_price_integrity.sql`

Added enterprise tables:

- `organizations`
- `organization_members`
- `products`
- `sellers`
- `watchlists`
- `watchlist_items`
- `scan_jobs`
- `findings`
- `evidence_items`
- `evidence_exports`
- `share_tokens`
- `audit_log`

Security and indexing:

- Enabled RLS on all new enterprise tables.
- Added org-scoped access through `public.is_org_member(org_id)`.
- Added indexes for org membership, products, sellers, watchlists, watchlist items, scan jobs, findings, evidence, share tokens, and audit logs.

### Backend Changes

Added modules:

- `backend/map_policy.py`
- `backend/enterprise_store.py`

Added authenticated enterprise endpoints:

- `GET /api/enterprise/workspace`
- `POST /api/watchlists`
- `POST /api/watchlists/{watchlist_id}/items/import`
- `POST /api/scan-jobs`
- `GET /api/findings`
- `GET /api/findings/{finding_id}`

Added MAP evaluator behavior:

- Compares observed effective price against product MAP floor.
- Computes below-MAP spread percentage.
- Buckets severity into `low`, `medium`, `high`, `critical`.
- Applies evidence confidence from coverage.
- Blocks findings when coverage is below the minimum gate.

CSV import contract:

```csv
product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct
```

### Frontend Changes

Added live workspace hook:

- `frontend/app/dashboard/use-enterprise-workspace.ts`

Updated dashboard behavior:

- Signed-in users load live workspace data from `/api/enterprise/workspace`.
- Anonymous users continue to see visibly labeled demo data.
- Portfolio page gained a CSV import panel that:
  - creates a pilot MAP watchlist
  - imports rows
  - launches an imported-price MAP preview scan
  - refreshes dashboard data

Updated pages:

- `/dashboard/overview`
- `/dashboard/portfolio`
- `/dashboard/findings`
- `/dashboard/evidence/[id]`

### UI Fixes

Fixed the dashboard header/nav overlap seen in the user-provided screenshot:

- Removed duplicate global dashboard nav rendering by excluding `/dashboard` from root `GlobalNav`.
- Hardened `DesignNav` grid columns.
- Made auth/status text overflow-safe.
- Hid status text at medium widths.
- Made dashboard KPI strip wrap safely on small screens.

### Verification

Backend:

```bash
python -m pytest tests -q
```

Result at that phase:

```text
1325 passed, 1 warning
```

Frontend:

```bash
npx tsc --noEmit
npm run build
```

Result:

```text
TypeScript passed
Next.js production build passed
```

Rendered QA:

- Checked `/dashboard/overview`.
- Checked `/dashboard/findings` filter interaction.
- Checked desktop, wide/short, and mobile viewports.
- Confirmed no duplicate global nav, no bounding-box nav overlaps, and no visible framework overlay.

## Phase 2B: Live Watchlist Scan Worker And Evidence Persistence

PR:

- `#21 Live watchlist scan worker and evidence persistence`
- URL: `https://github.com/Hussain800/Jacobi_mark3/pull/21`
- Branch: `phase/live-watchlist-worker`
- Merged: `2026-06-24T14:44:00Z`
- Merge commit: `f03bd7d4edefb8c5240ae117664dfd58db1282ca`

Commit split:

- `89ed17f schema: add live scan worker bookkeeping`
- `8c5519d api: persist live scan evidence`
- `afb2014 api: run live watchlist scan jobs`
- `4424d0b test: cover live scan evidence workflow`
- `4faece4 ui: add live scan controls`

### Database Changes

Added migration:

- `supabase/migrations/202606240002_live_scan_worker.sql`

Added worker bookkeeping fields on `watchlist_items`:

- `last_probe_session_id`
- `last_scan_job_id`
- `last_scan_status`
- `last_error`

Added indexes:

- queued scan-job lookup by status and queue time
- watchlist/status scan-job lookup
- watchlist item last scan-job lookup
- evidence lookup by scan job

### Backend Store Changes

Expanded `backend/enterprise_store.py` with live scan support:

- Split scan jobs into explicit modes:
  - `run_mode: "imported"` for CSV/imported observed-price MAP preview
  - `run_mode: "live"` for real probe-backed watchlist scans
- Added queued live scan creation with target item IDs in metadata.
- Added scan-job claiming helpers.
- Added exact work-item loading for the worker.
- Added probe-session observation extraction.
- Added coverage calculation from probe sessions.
- Added buyer-context serialization from agent variables.
- Added live evidence persistence into `evidence_items`.
- Added MAP finding creation from real observed probe prices.
- Added duplicate target-result protection through processed item IDs.
- Added scan-job completion/failure accounting.
- Added memory fallback behavior for local/demo/test environments without Supabase.

Important behavior:

- Imported CSV preview no longer leaves stale queued jobs when no observed prices exist.
- Live jobs create findings only after real probe sessions return observed prices.
- Evidence rows preserve agent metadata, native price details, extraction method, browser language, network tier, proxy type, and probe row ID where available.

### Backend API Changes

Updated `backend/main.py`:

- `LaunchScanJobInput` now accepts `run_mode`.
- `/api/scan-jobs` still creates scan jobs through the enterprise store.
- Live queued jobs now trigger a FastAPI background task.
- The background worker:
  - claims the queued job
  - loads watchlist items
  - validates each target URL through the SSRF/public URL guard
  - creates an in-memory probe session
  - runs the existing probe engine
  - saves the probe row through `save_probe`
  - records evidence and findings through the enterprise store
  - finalizes scan-job status and counts

Operational note:

- This is a credible pilot path, but it is still a FastAPI background-task worker. Production-grade operation should move the same store contract to an external durable queue/cron worker.

### Frontend Changes

Updated workspace hook:

- Exposes `watchlists`.
- Exposes `scanJobs`.
- Exposes `evidenceCount`.

Updated portfolio dashboard:

- CSV import flow explicitly uses `run_mode: "imported"`.
- Added live scan status band for signed-in live workspaces.
- Added live scan controls:
  - `Run live`
  - `Refresh`
- Added scan counts:
  - targets
  - completed
  - failed
- Used `lucide-react` icons for controls.
- Kept layout wrapped and overflow-safe for mobile.

### Tests Added

Updated:

- `backend/tests/test_enterprise_workflow.py`

Coverage added:

- CSV/imported preview flow explicitly uses `run_mode: "imported"`.
- Live scan job queues without creating immediate findings.
- Live scan job can be claimed.
- Fake deterministic probe session records evidence rows.
- MAP finding is created from the lowest live observed price.
- Duplicate result recording does not double-count completed targets.
- Scan job finalizes as completed.
- Workspace serialization exposes the new finding/evidence state.

### Verification

Backend full suite:

```bash
python -m pytest tests -q
```

Result:

```text
1326 passed, 1 warning
```

Frontend production build:

```bash
npm run build
```

Result:

```text
Next.js production build passed
```

PR checks:

- `test-backend`: passed
- `build-frontend`: passed
- `docker`: passed
- `smoke-and-tests`: passed
- `Vercel`: passed

Visual smoke test:

- URL: `http://localhost:3001/dashboard/portfolio`
- Viewports:
  - `1440x900`
  - `390x844`
- Import panel opened on both.
- Result:
  - no detected overlaps
  - visible portfolio/import layout rendered correctly

Known harmless local visual-test note:

- A local frontend-only server returned `404` for `/health`.
- This was not a dashboard asset failure and does not affect the implemented UI.

## Current Architecture After Today

### What Works Now

- Enterprise org/workspace data model exists.
- Watchlists and watchlist items can be created/imported.
- Imported MAP preview can evaluate CSV observed prices.
- Live watchlist scan jobs can run the existing probe engine for watchlist rows.
- Probe-backed evidence items can be persisted.
- MAP findings can be created from live observed prices.
- Dashboard can render live workspace data for signed-in users.
- Dashboard falls back to labeled demo data for anonymous users.
- Portfolio UI can import CSV, run imported preview, launch live scans, and show scan counts.
- UI overlap issue from the screenshot has been fixed.
- CI and Vercel were green after both Codex PRs.

### What Is Not Production-Grade Yet

- The scan worker is not yet an external durable queue or cron worker.
- Evidence rows do not yet include a full screenshot/source locker UI.
- Enterprise MAP PDF/redacted reports are not yet built.
- Share-token create/revoke/expiry flows are not yet exposed in UI.
- Org/team invite UI and full role enforcement are not done.
- Rate limits and cost controls are not centralized for enterprise scans/imports.
- Production Supabase migrations and RLS policies still need live verification.
- Operational dashboards for scan health, domain health, BrightData spend, and extraction success are not complete.
- Pilot onboarding docs, report templates, and GTM packaging are still pending.

## Production Readiness Verdict

Current level:

**Early paid-pilot foundation / design-partner pilot candidate.**

Not yet:

**Final production-grade enterprise SaaS.**

Reason:

The product now has the core enterprise data model and a real probe-backed watchlist scan path. That is enough for controlled design-partner demos and early pilot validation, assuming operators understand the current background-worker and production-rollout limitations.

The next required work is captured in:

- `docs/JACOBI_REMAINING_PHASES_PRD.md`
