# Jacobi Pivot Implementation Changelog

Date: 2026-06-24  
Branch: `pivot/price-integrity-mainline`  
Repository: `https://github.com/Hussain800/Jacobi_mark3`

## Executive Summary

This branch moves Jacobi from a consumer-facing price-checking product toward an enterprise price-integrity audit product.

The work combines Claude's investor-demo pivot with additional mainline reconciliation, backend security hardening, demo-honesty cleanup, and a frontend platform upgrade. The result is a working compliance-led enterprise demo on top of the current `Jacobi_mark3` mainline, with pilot-gate protections for owned probe results, share visibility, report exports, URL safety, and probe launch rate limiting.

## Repository And Branch Work

- Treated `Hussain800/Jacobi_mark3` as the source of truth.
- Created a clean worktree at `C:\Hussain new\JACOBI CLEAN\Jacobi_mark3_pivot`.
- Created branch `pivot/price-integrity-mainline` from latest `origin/main`.
- Imported Claude's local pivot work onto current mainline as commit:
  - `823058a feat(pivot): compliance-led reframe + enterprise audit dashboard`
- Preserved newer `Jacobi_mark3` mainline work, including:
  - SSRF URL guard in `backend/url_guard.py`
  - honest backend-down proxy behavior
  - Math Engine v2
  - PDF formatting fixes
  - Smart 24 / Pro 50 beta gate

## Product And Positioning Changes

- Reframed Jacobi around enterprise price-integrity intelligence.
- Changed public positioning from consumer savings/shopping language to:
  - controlled synthetic-buyer audits
  - pricing-variation findings
  - compliance-risk candidates
  - evidence-grade reports
  - MAP and gray-market monitoring as the second commercial wedge
- Kept the strategic framing compliance-led:
  - primary narrative: algorithmic / personalized / surveillance-pricing compliance
  - secondary wedge: MAP, unauthorized seller, and gray-market enforcement
- Removed or softened overclaiming language such as "overpaying," "shopper," and "price discrimination" on main investor-facing surfaces.
- Clarified seeded demo data versus real live audits.

## Frontend Demo And Dashboard Changes

Claude's pivot commit added a new enterprise dashboard under `/dashboard`:

- `/dashboard/overview`
  - KPI posture view
  - open findings
  - critical findings
  - monitored URLs
  - high-confidence findings
  - audits this month
- `/dashboard/portfolio`
  - seeded monitored URL/watchlist view
- `/dashboard/findings`
  - seeded pricing findings queue
  - severity, confidence, status, and finding type labels
- `/dashboard/evidence/[id]`
  - evidence detail screen
  - 24-buyer table
  - variation breakdown
  - coverage/confidence language
  - non-legal disclaimer
- `/dashboard/audits`
  - live audit tab reusing the existing cockpit/probe engine
- Shared dashboard UI:
  - `DemoModeBanner`
  - dashboard tabs
  - KPI strip
  - severity/confidence/type/status pills
  - evidence export controls
- Seeded data file:
  - `frontend/app/dashboard/demo-data.ts`
  - explicitly documents that dashboard sample data is not live audit output

Additional cleanup after port:

- Changed dashboard overview wording from "live view" to "sample view."
- Kept `Run audit` explicitly labeled as the real live audit path.
- Reframed About page variable descriptions to neutral audit language.
- Reframed design preview copy from shopper/fingerprint language to synthetic-buyer pricing variation.
- Updated cockpit copy from "probe cockpit" / "Twenty-four shoppers" to audit/synthetic-buyer language.
- Updated backend report copy from shopper language to synthetic-buyer language.

## Backend Security And Access Control Changes

### Probe Launch Rate Limiting

Added in `backend/main.py`:

- `PROBE_RATE_LIMIT_WINDOW_SECONDS`
  - default: `60`
- `PROBE_RATE_LIMIT_MAX_REQUESTS`
  - default: `5`
- `_PROBE_RATE_BUCKETS`
  - in-memory rolling-window bucket store
- `_enforce_probe_rate_limit(request, user)`
  - keys by signed-in user id when available
  - falls back to request client host
  - returns HTTP `429`
  - includes `Retry-After`

The limiter runs after authentication and before URL validation / probe launch.

### Probe Ownership Stamping

New live probe sessions now receive:

- `session["user_id"] = user["id"]`
- `session["is_public"] = bool(input.publish_to_board)`

This lets in-memory sessions and persisted sessions share the same access-control model.

### Result Access Control

Added helper functions in `backend/main.py`:

- `_probe_owner_id(session)`
- `_probe_is_public(session)`
- `_assert_can_read_probe(session, user, allow_public=False)`

Applied to:

- `/api/result/{session_id}`
  - owned real sessions require the matching authenticated user
  - non-owner access returns `404`
  - legacy unowned in-memory test/demo sessions remain readable
- `/api/share/{session_id}`
  - only public/demo sessions are exposed anonymously
  - private owned sessions return `404`

### Export Access Control

Added helper functions in `backend/report_export.py`:

- `_report_owner_id(report)`
- `_report_is_public(report)`
- `_assert_can_read_report(report, user, allow_public=False)`

Applied to:

- `/api/export/{report_id}/json`
  - still Pro-gated
  - now also owner-gated
- `/api/export/{report_id}/csv`
  - still Pro-gated
  - now also owner-gated
- `/api/export/{report_id}/pdf`
  - demo exports remain open
  - owned real report exports require the matching user

Unknown real report IDs now remain clean `404`s. Demo and fallback IDs still resolve to demo output where explicitly intended.

### Supabase Metadata Preservation

Updated `backend/supabase_client.py` so `get_probe_by_session_id()` preserves row-level metadata on reconstructed raw results:

- `user_id`
- `is_public`
- `is_demo`
- `_probe_row_id`
- `_probe_owner_user_id`
- `_probe_is_public`
- `_probe_is_demo`

This ensures persisted Supabase rows can be access-checked after reconstruction from `raw_result`.

### Backend Header Truth Cleanup

Updated the stale `backend/main.py` module header.

It no longer claims:

- BrightData MCP-only mode
- zero SQL
- no persistent storage

It now describes the actual system:

- FastAPI backend
- controlled synthetic-buyer audits
- BrightData Unlocker when configured
- guarded direct HTTP fallback
- Supabase persistence
- in-memory active sessions for frontend polling

## Frontend Platform Upgrade

Upgraded the frontend stack:

- `next`: `14.2` -> `16.2.9`
- `react`: `18.x` -> `19.2.7`
- `react-dom`: `18.x` -> `19.2.7`
- `@types/react`: `18.x` -> `19.2.17`
- `@types/react-dom`: `18.x` -> `19.2.3`
- `postcss`: pinned to `8.5.15`

Added package override:

```json
{
  "overrides": {
    "postcss": "8.5.15"
  }
}
```

Reason:

- `npm audit` reported Next/PostCSS vulnerabilities on the prior stack.
- After the upgrade and override, `npm audit --audit-level=moderate` reports zero vulnerabilities.

## Next 16 Compatibility Changes

Updated code for Next 16:

- `frontend/lib/supabase/server.ts`
  - `createClient()` is now async
  - awaits `cookies()` from `next/headers`
- `frontend/app/auth/callback/route.ts`
  - awaits the server Supabase client
- `frontend/app/api/[...path]/route.ts`
  - awaits `context.params` in the catch-all route handler
- `frontend/middleware.ts`
  - renamed to `frontend/proxy.ts`
  - exported function renamed from `middleware` to `proxy`
- `frontend/next.config.js`
  - added explicit `turbopack.root = __dirname`
- `frontend/app/globals.css`
  - moved Google Fonts `@import` before Tailwind directives for Turbopack compatibility
- `frontend/tsconfig.json`
  - accepted Next 16 TypeScript config updates:
    - `jsx: "react-jsx"`
    - include `.next/dev/types/**/*.ts`
- `frontend/next-env.d.ts`
  - accepted Next 16 route type reference update

## Tests Added

Added `backend/tests/test_access_control.py` with regressions for:

- owned result requires matching user
- non-owner result access returns `404`
- private owned share link is hidden
- public owned share link is readable
- owned PDF export requires matching user
- probe rate limiter returns `429`
- rate limiter includes `Retry-After`

## Verification Results

Backend:

- `python -m pytest tests -q`
  - `1321 passed`
  - `1 warning`
- `python -m compileall backend`
  - passed

Frontend:

- `npx tsc --noEmit`
  - passed
- `npm run build`
  - passed on Next `16.2.9` with Turbopack
  - generated all app routes, including dashboard routes
- `npm audit --audit-level=moderate`
  - `found 0 vulnerabilities`

Routes verified by build output:

- `/`
- `/about`
- `/chat`
- `/dashboard`
- `/dashboard/audits`
- `/dashboard/evidence/[id]`
- `/dashboard/findings`
- `/dashboard/overview`
- `/dashboard/portfolio`
- `/design-preview`
- `/history`
- `/leaderboard`
- `/pricing`
- `/share/[id]`
- `/api/[...path]`
- `/auth/callback`

## Important Files Changed

Backend:

- `backend/main.py`
- `backend/report_export.py`
- `backend/supabase_client.py`
- `backend/tests/test_access_control.py`

Frontend:

- `frontend/app/about/page.tsx`
- `frontend/app/api/[...path]/route.ts`
- `frontend/app/auth/callback/route.ts`
- `frontend/app/dashboard/*`
- `frontend/app/design-preview/preview-body.tsx`
- `frontend/app/globals.css`
- `frontend/components/design/cockpit/CockpitProbe.tsx`
- `frontend/lib/supabase/server.ts`
- `frontend/proxy.ts`
- `frontend/next.config.js`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/tsconfig.json`
- `frontend/next-env.d.ts`

Docs:

- `JACOBI_PIVOT_IMPLEMENTATION_CHANGELOG.md`

## What Is Complete Now

- Correct repo alignment with `Jacobi_mark3`
- Compliance-led enterprise pivot surface
- Investor-demo dashboard
- Seeded demo data clearly labeled
- Live audit tab preserved
- SSRF guard preserved from mainline
- backend-down fake-live fallback avoided
- result/share/export ownership checks added
- probe launch rate limiter added
- stale backend header fixed
- frontend upgraded to Next 16 / React 19
- npm audit cleared
- backend and frontend verification passing

## Still Deferred Product Work

These are not quick cleanup tasks; they are the next product build phase:

- Enterprise database model:
  - organizations
  - organization members
  - products
  - sellers / retailer targets
  - watchlists
  - watchlist items
  - scan jobs
  - scan targets
  - findings / violations
  - evidence items
  - exports
  - audit log
- Persistent scheduled monitoring jobs instead of in-memory schedules
- Real CSV import for product/watchlist setup
- Policy engine:
  - surveillance-pricing risk mode from PEI/topology/math engine
  - MAP-floor comparison mode
- Enterprise PDF/export audit records
- Team roles and organization-scoped RBAC
- Share-token expiry, revoke, and scoped access
- Observability dashboard for scan health, domain success rate, and blocked-agent rate

## Operational Notes

- Rate limiting is currently in-memory. It is suitable for a single-process pilot/demo backend, but should move to Redis or another shared store before horizontally scaling.
- Active probe sessions are still in-memory for frontend polling; completed probes persist to Supabase.
- The dashboard portfolio/findings/evidence data is still seeded demo data; this is intentional and visibly labeled.
- `/dashboard/audits` remains the real live-audit path.
- Pro 50 remains beta-gated.
