# Jacobi Enterprise Price Integrity Phase 2

Date: 2026-06-24
Original branch: `phase/enterprise-data-layer`
Follow-up branch merged: `phase/live-watchlist-worker`

Update: PR #21 (`Live watchlist scan worker and evidence persistence`) has now been merged into `main`. The original Phase 2 data/workflow foundation has been extended with a live watchlist scan worker path, real probe-backed evidence persistence, and live scan controls in the portfolio dashboard.

## Executive Summary

This phase moves Jacobi from a static investor-demo dashboard toward a real pilot workflow for the compliance-led pivot.

Implemented:

- Enterprise Supabase schema for organizations, members, products, sellers, watchlists, scan jobs, findings, evidence, exports, share tokens, and audit logs.
- Authenticated FastAPI endpoints for the pilot MAP workflow.
- MAP policy evaluator with severity and coverage gates.
- CSV import contract through an API and a dashboard import panel.
- Explicit scan modes for imported MAP preview versus live probe-backed watchlist scans.
- Live scan worker path that claims queued scan jobs, runs the existing probe engine per watchlist item, persists probe-backed evidence, and creates MAP findings from real observed prices.
- Dashboard pages that read live enterprise workspace data when signed in and fall back to labeled demo data when anonymous.
- Portfolio live scan controls with scan target/completed/failed counts.
- UI fixes for the dashboard nav overlap shown in the screenshot.
- Local middleware guard so unauthenticated/local demo pages do not crash without Supabase env vars.

## Commit Split

Meaningful commits created in this phase:

- `8b64538 schema: add enterprise price integrity tables`
- `cddbcc4 api: add enterprise watchlist and MAP workflow`
- `f5ca24a ui: wire dashboard to enterprise workspace`
- `d5e3c57 fix(ui): prevent dashboard nav overlap`
- `a32eed6 fix(ui): harden dashboard local rendering`
- `31557a7 docs: document enterprise phase 2 implementation`
- `89ed17f schema: add live scan worker bookkeeping`
- `8c5519d api: persist live scan evidence`
- `afb2014 api: run live watchlist scan jobs`
- `4424d0b test: cover live scan evidence workflow`
- `4faece4 ui: add live scan controls`

This intentionally avoids stuffing the phase into one large commit.

## Database Layer

Added migration:

- `supabase/migrations/202606240001_enterprise_price_integrity.sql`
- `supabase/migrations/202606240002_live_scan_worker.sql`

Tables added:

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

Security:

- RLS enabled on all new enterprise tables.
- Org-scoped access through `public.is_org_member(org_id)`.
- Indexes added for org, status, scan, finding, evidence, share-token, and audit-log lookups.
- Additional indexes added for queued scan jobs, watchlist scan-job status, watchlist item scan linkage, and evidence lookup by scan job.

Live scan bookkeeping added to `watchlist_items`:

- `last_probe_session_id`
- `last_scan_job_id`
- `last_scan_status`
- `last_error`

## Backend API

Added modules:

- `backend/map_policy.py`
- `backend/enterprise_store.py`

Added endpoints:

- `GET /api/enterprise/workspace`
- `POST /api/watchlists`
- `POST /api/watchlists/{watchlist_id}/items/import`
- `POST /api/scan-jobs`
- `GET /api/findings`
- `GET /api/findings/{finding_id}`

CSV import columns:

```csv
product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct
```

The scan-job endpoint now supports two modes:

- `run_mode: "imported"` evaluates imported effective prices against MAP floors for quick CSV policy preview.
- `run_mode: "live"` queues a probe-backed scan job that runs the existing synthetic-buyer probe engine per watchlist row, persists evidence rows, and creates MAP findings from real observed prices.

## Frontend

Added:

- `frontend/app/dashboard/use-enterprise-workspace.ts`
- `frontend/app/dashboard/evidence/[id]/evidence-client.tsx`

Updated:

- `/dashboard/overview`
- `/dashboard/portfolio`
- `/dashboard/findings`
- `/dashboard/evidence/[id]`
- shared dashboard UI components
- design nav and route chrome
- Supabase middleware guard

Behavior:

- Anonymous users continue seeing explicitly labeled demo data.
- Signed-in users load `/api/enterprise/workspace`.
- Portfolio page now includes a compact CSV import panel that:
  - creates a pilot MAP watchlist
  - imports CSV rows
  - launches the imported MAP evaluator scan job
  - refreshes the dashboard data
- Portfolio page now includes live scan controls for signed-in live workspaces:
  - `Run live`
  - `Refresh`
  - targets/completed/failed counts

## UI Bug Fix

The screenshot overlap was caused mainly by two fixed navs rendering on `/dashboard`:

- root `RouteChrome` rendered `GlobalNav`
- dashboard layout rendered `DesignNav`

Fixes:

- `/dashboard` is now excluded from `GlobalNav` in `RouteChrome`.
- `DesignNav` now has explicit grid columns.
- auth/status text is overflow-safe.
- status text hides at medium widths.
- dashboard KPI strip uses flex-wrap so mobile does not leave a blank-looking tile.

## Verification

Backend:

```bash
python -m pytest tests -q
```

Result:

```text
1326 passed, 1 warning
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

- URL: `http://127.0.0.1:3001/dashboard/overview`
- Viewports checked:
  - `1280x720`
  - `1846x240`
  - `390x780`
- Findings interaction checked:
  - `/dashboard/findings`
  - clicked `high` severity filter
  - critical row disappeared
  - high rows remained

Rendered QA results:

- no duplicate global nav on dashboard
- no nav bounding-box overlaps
- no visible framework overlay
- no console warnings/errors
- dashboard content rendered in all checked viewports

Follow-up rendered QA after PR #21:

- URL: `http://localhost:3001/dashboard/portfolio`
- Viewports checked:
  - `1440x900`
  - `390x844`
- Import panel opened on both viewports.
- Result:
  - no detected overlaps
  - portfolio/import layout rendered correctly

## Remaining Work

Still not complete from the broader pivot plan:

- External durable queue/cron worker. The live worker path exists, but currently runs through the FastAPI background-task pattern.
- Persisted screenshot/source capture for every evidence item.
- Evidence locker UI across all evidence items.
- Enterprise evidence PDF builder for findings, not only legacy probe reports.
- Share-token creation/revoke UI and scoped external evidence access.
- Organization invite flow, roles UI, and deeper RBAC enforcement.
- CSV file-picker polish and downloadable row-error report.
- More complete scan-job progress UI for queued/running/partial failure states.
- Rate limits and cost controls for enterprise imports/scans/exports/shares.
- Production Supabase migration application and seed/pilot data setup.
- Pilot onboarding docs and design-partner operating playbook.

## Recommended Next Phase

Continue with production hardening:

1. Move the live scan worker from FastAPI background tasks to an external durable queue/cron worker.
2. Build the evidence locker UI and screenshot/source artifact model.
3. Build MAP-specific PDF/redacted reports and share-token create/revoke flows.
4. Harden roles, rate limits, cost controls, audit logging, and production Supabase/RLS verification.

Detailed remaining phases are tracked in:

- `docs/JACOBI_REMAINING_PHASES_PRD.md`
