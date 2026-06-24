# Jacobi Enterprise Price Integrity Phase 2

Date: 2026-06-24
Branch: `phase/enterprise-data-layer`

## Executive Summary

This phase moves Jacobi from a static investor-demo dashboard toward a real pilot workflow for the compliance-led pivot.

Implemented:

- Enterprise Supabase schema for organizations, members, products, sellers, watchlists, scan jobs, findings, evidence, exports, share tokens, and audit logs.
- Authenticated FastAPI endpoints for the pilot MAP workflow.
- MAP policy evaluator with severity and coverage gates.
- CSV import contract through an API and a dashboard import panel.
- Dashboard pages that read live enterprise workspace data when signed in and fall back to labeled demo data when anonymous.
- UI fixes for the dashboard nav overlap shown in the screenshot.
- Local middleware guard so unauthenticated/local demo pages do not crash without Supabase env vars.

## Commit Split

Meaningful commits created in this phase:

- `8b64538 schema: add enterprise price integrity tables`
- `cddbcc4 api: add enterprise watchlist and MAP workflow`
- `f5ca24a ui: wire dashboard to enterprise workspace`
- `d5e3c57 fix(ui): prevent dashboard nav overlap`
- `a32eed6 fix(ui): harden dashboard local rendering`

This intentionally avoids stuffing the phase into one large commit.

## Database Layer

Added migration:

- `supabase/migrations/202606240001_enterprise_price_integrity.sql`

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

The current scan-job endpoint evaluates imported effective prices against MAP floors. It does not yet run the live crawler worker for every watchlist row.

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
  - launches the MAP evaluator scan job
  - refreshes the dashboard data

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

## Remaining Work

Still not complete from the broader pivot plan:

- Real durable worker/queue that runs the existing probe engine across watchlist rows.
- Persisted screenshot/source capture for every evidence item.
- Enterprise evidence PDF builder for findings, not only legacy probe reports.
- Share-token creation/revoke UI and scoped external evidence access.
- Organization invite flow, roles UI, and deeper RBAC enforcement.
- CSV file-picker polish and downloadable row-error report.
- Scan-job progress UI for queued/running/partial failure states.
- Production Supabase migration application and seed/pilot data setup.
- Pilot onboarding docs and design-partner operating playbook.

## Recommended Next Phase

Build the live watchlist scan worker:

1. Add a worker function that claims queued `scan_jobs`.
2. For each `watchlist_item`, run the existing guarded probe path.
3. Convert probe results into `evidence_items`.
4. Run MAP evaluation from actual observed prices.
5. Persist findings and update scan-job progress incrementally.
6. Add UI progress states for queued, running, completed, and partial failure.
