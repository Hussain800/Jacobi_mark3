# Jacobi Remaining Phases PRD

Date: 2026-06-24  
Repository: `https://github.com/Hussain800/Jacobi_mark3`  
Roadmap status: Phases 1-6 implemented at application level
Current product level: application-ready for paid pilot after production environment verification

## Executive Summary

Jacobi has completed the first two practical phases of the enterprise pivot:

- **Phase 1:** compliance-led product reframe, investor-demo dashboard, mainline hardening, and frontend platform upgrade.
- **Phase 2:** enterprise workspace/data foundation, MAP workflow, live watchlist scan path, and probe-backed evidence persistence.

The original remaining work was organized into four production-readiness phases:

- **Phase 3:** Durable Scan Execution + Evidence Locker
- **Phase 4:** Enterprise Reporting + External Sharing
- **Phase 5:** Security, Roles, Rate Limits, Cost Controls
- **Phase 6:** Production Supabase, Ops, Pilot GTM

Those phases have now been implemented in the application codebase. The remaining work is external launch execution: production Supabase migration/RLS verification, Vercel/BrightData/Sentry environment configuration, and one controlled pilot smoke test.

## Implementation Status Update

Completed after this PRD was created:

- **Phase 3:** durable scan worker endpoint, queue-wide claim/release, evidence APIs, evidence locker UI, Vercel cron contract.
- **Phase 4:** MAP PDF/JSON exports, evidence checksums, export audit records, redacted external shares, share revoke, public shared-finding page.
- **Phase 5:** centralized enterprise roles, organization invites, role-enforced mutations, stricter import URL validation, scan rate limits, cost controls, live-scan kill switch, workspace settings UI.
- **Phase 6:** production readiness health endpoint, production verification script, pilot onboarding docs, investor demo script, pilot CSV template, production checklist.

Open launch gates:

- Apply migrations to production Supabase.
- Run production RLS/table verification with `SUPABASE_DB_URL`.
- Configure `SCAN_WORKER_SECRET`, Supabase service key, BrightData credentials, and Sentry/log redaction in production.
- Run the production smoke protocol in `docs/PRODUCTION_READINESS_CHECKLIST.md`.

## Current State

Completed capabilities:

- Enterprise tables for organizations, members, products, sellers, watchlists, watchlist items, scan jobs, findings, evidence items, exports, share tokens, and audit logs.
- MAP policy evaluator with severity and confidence gates.
- Authenticated APIs for workspace, watchlist creation, CSV import, scan jobs, and findings.
- Imported CSV MAP preview workflow.
- Live scan jobs that can run the existing probe engine for watchlist items.
- Probe-backed evidence persistence.
- MAP findings from real observed prices.
- Dashboard live workspace loading for signed-in users.
- Portfolio CSV import and live scan controls.
- UI overlap fixes and responsive dashboard hardening.

Key limitations:

- Worker is still a FastAPI background task, not an external durable queue.
- Evidence storage is metadata-rich but lacks a complete evidence locker UI and screenshot/source artifact model.
- Enterprise PDF/redacted reports and evidence hashes are not complete.
- Share-token lifecycle is modeled in schema but not operationally surfaced.
- Roles, invites, rate limits, and cost controls are not production complete.
- Production Supabase/RLS/ops rollout remains unverified.

## Phase 3: Durable Scan Execution + Evidence Locker

### Objective

Turn the current pilot live-scan path into a durable, observable scan execution system with an evidence locker that enterprise users can trust.

### Business Outcome

Design partners can import watchlists, launch scans, monitor progress, inspect evidence, and rely on partial results even when a worker crashes or a target blocks some probes.

### Required Capabilities

Durable scan execution:

- Move scan execution out of request-scoped FastAPI background tasks.
- Add an external durable queue, cron worker, or equivalent worker service.
- Worker must claim queued `scan_jobs` retry-safely.
- Worker must process `watchlist_items` incrementally.
- Worker must persist progress after every target.
- Worker must tolerate partial target failures.
- Worker must resume or safely skip already-processed targets.
- Worker must preserve current store-level idempotency protections.

Recommended v1 implementation default:

- Keep the existing enterprise store helper contract.
- Add a worker entrypoint that can be called by cron or queue consumer.
- Use `scan_jobs.status`, metadata `processed_item_ids`, and target counts as the first durable checkpoint model.
- Do not rewrite the probe engine.

Evidence locker:

- Create evidence list/detail UI for evidence items independent of findings.
- Allow filtering by:
  - scan job
  - finding
  - product
  - seller
  - status/source
  - date
- Show captured agent context:
  - buyer context
  - observed price
  - currency/native price
  - extraction method
  - source URL
  - probe session ID
  - captured timestamp
  - coverage
  - bot/challenge/failure signals
- Link evidence items to probe sessions and findings.
- Add empty/loading/error states.

Screenshot/source capture:

- Persist screenshot artifact references where available.
- Persist source excerpts/raw extraction snippets.
- Store artifact metadata in a way that supports redacted exports later.
- Avoid storing secrets, auth headers, cookies, or private tokens.

Scan progress UX:

- Show queued/running/completed/failed/cancelled scan states.
- Show target-level progress.
- Show partial failure count and latest error reason.
- Add refresh/polling behavior for active scans.
- Clearly distinguish imported preview scans from live probe scans.

### Acceptance Criteria

- A scan job can be queued, claimed by a worker, processed, and completed without requiring the original API request to remain alive.
- Killing/restarting the worker does not duplicate completed target results.
- A partially failing scan still stores evidence/findings for successful targets.
- Evidence locker shows live-probe evidence rows created by Phase 2.
- Dashboard shows accurate progress for queued/running/completed/failed scans.
- All scan progress state survives process restart when Supabase is configured.

### Test Plan

Backend:

- Unit test worker claim behavior.
- Unit test idempotent reprocessing of already-recorded target results.
- Unit test partial failure accounting.
- Unit test invalid URL target handling.
- Unit test evidence locker API filtering.

Frontend:

- Render evidence locker empty/loading/error states.
- Render evidence rows with missing optional metadata.
- Render scan progress states.
- Verify mobile layout for evidence table/list.

Operational:

- Run one live scan against a controlled public test target.
- Confirm evidence rows, finding rows, scan-job counters, and audit logs match.

## Phase 4: Enterprise Reporting + External Sharing

### Objective

Build enterprise-grade outputs that turn Jacobi evidence into shareable audit artifacts for compliance, reseller enforcement, legal review, and executive reporting.

### Business Outcome

Customers can export credible reports, share redacted evidence externally, revoke access, and prove what was observed without giving outsiders full workspace access.

### Required Capabilities

MAP PDF report:

- Generate finding-level MAP PDF reports.
- Include:
  - organization/workspace name
  - product/SKU
  - seller/domain
  - target URL
  - MAP floor
  - observed low price
  - spread below MAP
  - severity/confidence
  - coverage
  - scan timestamp
  - evidence table
  - raw/source excerpts where safe
  - disclaimer that Jacobi provides evidence, not legal conclusions

Redacted external report:

- Generate a redacted version for external sellers/agencies.
- Hide internal workspace metadata.
- Hide sensitive buyer/session/proxy details where needed.
- Preserve enough evidence to support enforcement discussions.

Evidence checksums/hashes:

- Add checksum/hash metadata for exported evidence packages.
- Store hash on `evidence_exports`.
- Include hash in report footer or metadata.

Export records:

- Use `evidence_exports` as the audit record for generated exports.
- Track:
  - finding ID
  - requested by
  - format
  - status
  - file URL or artifact reference
  - created timestamp
  - checksum/hash

Share-token lifecycle:

- Add UI to create external share links.
- Add expiry date/time.
- Add revoke action.
- Add visible revoked/expired states.
- Scope token to finding/report read only.
- Log create/revoke events to audit log.

External shared view:

- Add scoped read-only evidence/report page.
- Require valid, unexpired, unrecalled token.
- Show redacted evidence/report only.
- Never expose full workspace navigation or authenticated dashboard controls.

### Acceptance Criteria

- User can export a MAP finding PDF from dashboard.
- Export creates an `evidence_exports` record.
- Exported PDF includes evidence and non-legal disclaimer.
- User can create a share link for a finding/report.
- External viewer can open valid share link without signing in.
- Revoked or expired share link no longer works.
- Share and export actions are audit-logged.

### Test Plan

Backend:

- Test PDF generation for MAP finding.
- Test export record creation.
- Test redacted report excludes sensitive metadata.
- Test share-token valid/expired/revoked states.
- Test non-owner cannot create/revoke share token.

Frontend:

- Test export action states.
- Test share modal create/copy/revoke flow.
- Test external shared page for valid/expired/revoked tokens.

Manual QA:

- Open PDF and visually inspect layout.
- Verify redacted report is safe to send externally.
- Verify share link cannot access dashboard routes.

## Phase 5: Security, Roles, Rate Limits, Cost Controls

### Objective

Harden Jacobi for paid pilots by enforcing organization roles, controlling expensive scan behavior, and reducing abuse/security risk.

### Business Outcome

Enterprise customers can invite teams safely, operators can control BrightData/probe spend, and Jacobi can support paid pilots without uncontrolled cost or data-exposure risk.

### Required Capabilities

Central access-control service:

- Centralize org membership and role checks.
- Enforce roles consistently across:
  - watchlists
  - imports
  - scan jobs
  - findings
  - evidence
  - exports
  - share tokens
  - audit logs
- Define role permissions:
  - owner: all actions
  - admin: workspace management except ownership transfer
  - analyst: imports, scans, findings, evidence, exports
  - viewer: read-only

Team invites:

- Add invite creation flow.
- Add invite acceptance flow.
- Add role assignment.
- Add member removal/deactivation.
- Audit-log invite/member changes.

URL and CSV validation:

- Strengthen CSV row validation.
- Add row-level import error report/download.
- Enforce strict URL validation for imports and scans.
- Reject private/internal/non-http URLs.
- Normalize domains and seller URLs.
- Avoid duplicate watchlist rows.

Rate limits:

- Add scan launch rate limits by org and user.
- Add import rate limits.
- Add share/export rate limits.
- Keep existing probe rate limiting.
- Return clear 429 responses with retry guidance.

Cost controls:

- Add org-level monthly scan budget.
- Add BrightData spend guardrails.
- Add max targets per scan by plan.
- Add max concurrent live scans by org.
- Add kill-switch for live scans.
- Add alert/log when scan cost thresholds are approached.

Audit logging:

- Add audit-log writes for:
  - export created/completed/failed
  - share created/revoked/expired access attempt
  - finding status changes
  - role/member changes
  - scan cancelled/retried
  - import completed/failed

### Acceptance Criteria

- Viewers cannot mutate workspace state.
- Analysts can run scans but cannot manage org members.
- Admins can manage watchlists and members.
- Owners can perform all workspace actions.
- Import errors are row-specific and downloadable.
- Scan/import/export/share rate limits are enforced.
- Cost limits prevent excessive target scans.
- Audit log reflects sensitive operations.

### Test Plan

Backend:

- Role matrix tests for every enterprise endpoint.
- URL validation tests for malicious/private/internal inputs.
- CSV validation tests for missing/invalid/duplicate rows.
- Rate-limit tests for scan/import/export/share flows.
- Cost-limit tests for max targets/concurrency/budget.

Frontend:

- Hide/disable actions based on role.
- Render permission errors cleanly.
- Render import error report.
- Render plan/cost limit messages.

Security QA:

- Attempt cross-org access.
- Attempt IDOR on findings/evidence/exports/shares.
- Attempt private URL imports.
- Attempt burst scan launches.

## Phase 6: Production Supabase, Ops, Pilot GTM

### Objective

Prepare Jacobi for real paid-pilot operation, investor demos, and design-partner onboarding with production infrastructure, observability, and commercial packaging.

### Business Outcome

The team can confidently onboard pilot customers, monitor scan health and cost, produce investor/demo materials, and operate the system without relying on local assumptions.

### Required Capabilities

Production Supabase rollout:

- Apply all enterprise migrations in production:
  - `202606240001_enterprise_price_integrity.sql`
  - `202606240002_live_scan_worker.sql`
- Verify migration success.
- Verify indexes exist.
- Verify triggers and RLS policies exist.
- Verify service-role backend access works.
- Verify authenticated user RLS behavior works.

RLS verification:

- Test user can access own org data.
- Test user cannot access another org.
- Test role restrictions if Phase 5 is complete.
- Test share-token external access does not expose workspace data.
- Document verification results.

Seed pilot workspace:

- Create pilot organization.
- Create sample products/sellers/watchlists.
- Seed demo/pilot MAP scenario.
- Keep seeded data clearly labeled if used for demo.

Observability:

- Add Sentry or equivalent error monitoring.
- Review log redaction.
- Ensure no secrets, cookies, headers, or PII leak into logs.
- Add scan health metrics:
  - scan duration
  - extraction success rate
  - blocked/challenged rate
  - findings per scan
  - evidence rows per scan
  - domain-level success/failure
- Add BrightData cost benchmarks.

Infrastructure:

- Decide backend hosting tier for Smart 24 and Pro 50 workloads.
- Re-run Pro 50 benchmark before opening beta.
- Keep `PRO50_BETA` disabled until production timing target is met.
- Confirm environment variables across preview/production.
- Confirm Vercel and backend deployment checks.

Pilot GTM materials:

- Pilot CSV template.
- Design-partner onboarding doc.
- Pilot operating playbook.
- Pilot report template.
- Investor demo script.
- Investor screenshots.
- Pricing/packaging cleanup:
  - Pilot
  - Professional
  - Enterprise
- Define paid pilot success metrics:
  - number of monitored URLs
  - evidence quality
  - findings generated
  - time saved
  - enforcement workflows supported
  - customer willingness to pay

### Acceptance Criteria

- Production Supabase has all required migrations applied.
- RLS behavior is verified and documented.
- Pilot workspace can import, scan, find, inspect evidence, export/share if previous phases complete.
- Monitoring captures backend errors and scan failures.
- Logs are redacted.
- Domain health and scan health are visible to operators.
- Pilot onboarding package is ready for first design partners.
- Pricing/packaging is consistent across product, pitch, and sales docs.

### Test Plan

Production verification:

- Run production smoke import.
- Run production live scan against approved target.
- Confirm scan job, evidence, finding, audit log rows.
- Confirm dashboard renders live data.
- Confirm RLS cross-org denial.

Operational verification:

- Trigger controlled scan failure and confirm monitoring/logs.
- Confirm cost guardrails.
- Confirm no secrets in logs.

GTM verification:

- Walk through design-partner onboarding doc.
- Generate sample pilot report.
- Run investor demo script end to end.

## Cross-Phase Non-Negotiables

- Do not claim legal conclusions; present evidence and risk candidates.
- Keep seeded/demo data visibly labeled.
- Preserve SSRF/public URL guardrails.
- Keep Pro 50 behind beta gate until benchmark and infra are ready.
- Keep changes in meaningful commits by subsystem.
- Update `docs/JACOBI_SESSION_CHANGELOG.md` after every meaningful phase.

## Production-Grade Definition

Jacobi reaches production-grade enterprise pilot readiness when:

- Durable scan worker survives restarts and avoids duplicate results.
- Evidence locker is usable by analysts.
- MAP/redacted reports can be exported.
- Share links can be created, expired, and revoked.
- Roles and org boundaries are enforced.
- Rate and cost controls prevent abusive or accidental spend.
- Production Supabase migrations and RLS are verified.
- Monitoring and log redaction are in place.
- Pilot onboarding and reporting materials are ready.

Until then, Jacobi should be described as:

**Early paid-pilot foundation with live evidence-backed scan capability.**
