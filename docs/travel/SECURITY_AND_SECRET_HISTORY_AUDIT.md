# Travel Pivot Security and Secret-History Baseline

- Audit date: 2026-07-13
- Revision: `c4cb4e2b4ed3a0f98bce2b2ccd005d770c79be4a`
- Scope: inherited repository controls that the travel implementation may reuse or expose
- Status: Phase 0 baseline; remediation evidence is tracked in [`IMPLEMENTATION_LEDGER.md`](IMPLEMENTATION_LEDGER.md)

This document records the security state before travel product code is added. It does not reproduce credentials, make live provider calls, or claim that repository-only checks prove hosted infrastructure configuration.

## Method

The audit combined:

- full review of ranked public API, Agentcore, extension, persistence, webhook, billing, export, deployment and CI controls;
- source-to-control-to-sink tracing for promoted candidates;
- focused runtime reproduction for evidence-signature, numeric-precision and redirect behavior;
- static RLS/grant review across all migrations;
- current-tree high-confidence secret regression testing and bounded Git-history assessment;
- `92` focused backend security/persistence tests and `14` extension contract tests.

Detailed scan artifacts are generated outside the repository because they can include security-sensitive proof material. This repository document contains the actionable, non-secret baseline needed for implementation and review.

## Confirmed findings

| ID | Severity | Boundary | Evidence | Impact | Required repository action |
|---|---|---|---|---|---|
| SEC-TR-000 | High; potentially Critical on Linux | Static-file route | `backend/main.py:3451-3456` joins decoded `{rest:path}` below `frontend/out/_next/static` without resolving and enforcing containment. A local ASGI request with four percent-encoded parent segments returned `backend/.env.example` with HTTP 200. | Any anonymous caller can read service-readable files. In a Linux container, reachable process or mounted secret files could expose provider and service-role credentials. | Replace the route with a containment-checked resolver or trusted static-files component and add encoded traversal regression tests. |
| SEC-TR-001 | High | Enterprise membership RLS | `202606240007_optimize_rls_initplan.sql:19-22` accepts any inserted row where `user_id = auth.uid()` without requiring membership or constraining `role`. | A user who knows an organization UUID can insert themselves as owner under normal authenticated table grants. | Add a role-aware, owner-controlled insert policy and adversarial migration tests. |
| SEC-TR-002 | High | Enterprise table RLS | `202606240001_enterprise_price_integrity.sql:296-357` gives every organization member `FOR ALL` access to products, sellers, watchlists/items, scan jobs, findings, evidence and share tokens. | Viewers or ordinary members can alter evidence, jobs, findings and public-sharing state through direct Supabase access. | Replace broad policies with operation- and role-specific policies; test viewer/member/admin/owner transitions. |
| SEC-TR-003 | High | Legacy private probes | `backend/main.py:3273-3303` uses the service-role lookup in `backend/supabase_client.py:156-188` without the ownership/publicity check used by other probe routes. | A known private session ID can disclose summary data and send the private report to the configured analyzer. | Apply the common probe read guard before analysis and add IDOR tests. |
| SEC-TR-004 | High when managed credentials exist | Deep Audit provider spend | `backend/compare/api.py:203-222` and `backend/compare/tooling.py:202-240` treat caller-supplied `explicit` and `allow_managed_provider` booleans as authorization. | An anonymous caller can trigger 24/50-profile managed-provider work with deployer credentials. | Require an authenticated operator/capability grant and a shared rate/cost limit; keep fixture demos anonymous and hermetic. |
| SEC-TR-005 | Medium | Evidence authenticity | `backend/agentcore/evidence.py:126-139` creates an HMAC but `verify_manifest()` checks only an attacker-recomputable public hash. | Altered signed evidence can pass verification after its public hash is recomputed while the invalid signature is retained. | Verify the HMAC when present and fail closed when verification material is required. |
| SEC-TR-006 | Medium | Evidence precision | `backend/compare/service.py:395-405` narrows Decimal money into `agentcore.schemas.Money.amount: float`. | A manifest can cryptographically preserve a different amount than the Decimal-authoritative comparison; `9007199254740993.01` reproduces as `9007199254740994.0`. | Make travel evidence Decimal-authoritative and remove the legacy float narrowing where compatibility permits. |
| SEC-TR-007 | Medium | OAuth callback | `frontend/app/auth/callback/route.ts:7-13` concatenates the caller-controlled `next` value with the origin. | A value such as `@attacker.example` redirects a successfully authenticated user off-site. | Accept only normalized same-origin absolute paths. |
| SEC-TR-008 | Medium | Caller-asserted provenance/policy | `backend/agentcore/policy.py:108-118` trusts caller-controlled `official_route`; REST/MCP callers pass it directly. | Arbitrary destinations can receive an allow decision and `official_api` provenance despite no verified supplier-domain binding. | Derive route class from an allowlisted provider/merchant record, never a caller assertion. |
| SEC-TR-009 | Medium | Outbound HTTP/webhooks | URL validation resolves DNS before HTTPX or Chromium performs a second independent resolution in direct HTTP, Agentcore HTTP, Playwright and webhook paths. | DNS rebinding can change a validated public address into a private destination; Playwright also follows subresource/navigation requests without address pinning. | Use fixed official endpoints for travel providers, add connected-address/egress controls for fallbacks, and intercept Playwright navigation/subresources. |
| SEC-TR-010 | Medium | Stripe/webhook boundary | Checkout return URLs are caller-selected; webhook bodies are fully buffered before signature verification; event IDs/order are not persisted. | Legitimate checkout can return to phishing destinations; oversized or stale signed events can exhaust memory or restore stale entitlement. | Allowlist frontend return origins, bound bodies, and persist idempotency/order controls. |
| SEC-TR-011 | Medium | Extension privacy | `extension/background.js:24-42` forwards and stores full page URLs for Deep Audit, and `shared/extraction.js:101-112` does not reject credential-bearing source URLs. | Session, signed, reset or HTTP-basic parameters can enter local history, backend requests and logs. | Strip sensitive/tracking parameters, reject userinfo and send only typed travel intent in the primary flow. |
| SEC-TR-012 | Medium | Public probe projection | `202605270001_board_visibility_and_tiers.sql:19-27` permits selection of the complete probe row when marked public/demo. | Direct Supabase clients can retrieve fields beyond the curated public-board projection, including raw report material. | Publish through a restricted view/RPC or separate public projection table. |

## Deployment-conditioned findings

These are real broken or missing controls, but repository evidence alone cannot prove the final hosted precondition.

| ID | Condition | Finding | Closure evidence required |
|---|---|---|---|
| SEC-TR-013 | Normal Supabase public-schema grants apply to `outbox_log`. | `003_outbox_webhooks.sql` creates the outbox without RLS or explicit anon/authenticated revocation. Webhook payloads and delivery state may be readable or mutable. | Add service-only RLS/grants regardless, then validate effective grants against a real Supabase project. |
| SEC-TR-014 | The API is publicly deployed without `JACOBI_AGENT_API_KEYS`. | Agentcore custom-URL verification and total-price comparison deliberately become unauthenticated in development-open mode. `render.yaml` does not declare a key requirement. | Production startup must reject missing Agentcore auth configuration; preserve an explicit local-only development mode. |
| SEC-TR-015 | Render lacks a platform production marker or Supabase credentials. | Enterprise persistence can silently use memory; retail comparison is explicitly configured to global bounded memory storage. | Add explicit hosted fail-closed configuration and target-environment readiness validation. |
| SEC-TR-016 | Anonymous observations contain user-derived URLs or payloads. | `offer_observations.user_id IS NULL` is globally readable to authenticated users. | Separate intentionally shared catalogue observations from private/anonymous request observations. Do not reuse this policy for travel. |

## Secret-history finding

`caafa55` removed a Google API-key-shaped value from `JACOBI_HANDOFF.md` and added a current-tree regression test. The value still exists in reachable Git history before that commit. The audit records only its type and location; the credential itself is intentionally not reproduced.

Repository-side controls:

- the current tracked tree passes `backend/tests/test_repository_secrets.py`;
- environment examples contain placeholders rather than live credentials;
- no live secret was used during the audit.

External actions that cannot be proven from this repository:

- revoke/rotate the affected credential in its provider account;
- assess provider audit logs and billing for misuse;
- decide whether coordinated history rewriting is required for the public repository and every clone/fork.

History rewriting is destructive and is not performed as part of this implementation branch.

## Travel security invariants

The travel implementation must close or avoid these inherited failure modes:

1. provider clients use fixed official endpoints and server-only environment-separated credentials;
2. anonymous search/result access is bound to short-lived hashed capabilities;
3. travel money remains Decimal-authoritative through evidence and persistence;
4. route legitimacy and provider environment are derived server-side;
5. revalidation creates a single-use redirect capability and the redirect target is bound to the revalidated offer;
6. no complete page URL, raw provider payload, passenger identity, payment detail or credential is logged or persisted by default;
7. production storage/auth configuration fails closed;
8. RLS and direct-database access enforce the same role/object boundaries as the API;
9. telemetry remains disabled by default and contains no sensitive dimensions;
10. managed-provider and Deep Audit work requires explicit authenticated authorization and never runs in the normal travel path.

## Validation commands

```powershell
cd backend
python -m pytest -q tests/test_repository_secrets.py tests/test_url_guard.py tests/test_agentcore_auth.py tests/test_compare_storage.py tests/test_compare_persistence_migration.py tests/test_rls_policies_static.py tests/test_persistence_guard.py

cd ..\extension
node --test tests/*.test.js
```

Phase 0 result: the travel build may reuse the repository's schemas and patterns only after applying the listed boundary repairs or explicitly implementing stricter travel-specific controls. No finding is considered fixed by documentation alone.
