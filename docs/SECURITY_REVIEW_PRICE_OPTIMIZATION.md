# Security Review: Price Optimization

Review date: 12 July 2026

Scope: `backend/compare/`, relevant Agentcore collection/evidence code, `extension/`, the price-optimization migration, and deployment defaults.

This is an engineering review, not a penetration test or legal opinion.

## Summary

The comparison path has appropriate foundational controls for local/open-source use: explicit provider activation, SSRF checks, redirect validation, bounded responses and parsers, Decimal-safe totals, honest unknowns, token-scoped result/evidence reads, RLS migration coverage, extension message validation, optional network permissions, and default-off telemetry/paid providers.

The credential was redacted from the current tree during this review. Rotation and history exposure still require confirmation, and several production-hardening gaps remain.

## Findings

| ID | Severity | Status | Finding and required action |
|---|---|---|---|
| SEC-PO-001 | High | MITIGATED_IN_TREE / EXTERNAL_ACTION_OPEN | A tracked Google API-key-shaped value was found in `JACOBI_HANDOFF.md` without an obvious placeholder marker. Commit `caafa55` redacts it and adds a repository secret regression test. Revoke/rotate the credential and assess Git history exposure before publication. The value is intentionally not reproduced here. |
| SEC-PO-002 | Medium | OPEN | Comparison rate limiting is in-process and keyed by the directly observed client address. A multi-worker or multi-instance production service needs an upstream/shared limiter and a verified proxy trust configuration. |
| SEC-PO-003 | Medium | MITIGATED_WITH_RESIDUAL_RISK | Anonymous comparisons use bearer-like access tokens, not authenticated ownership. Tokens are high entropy, stored only as hashes, and expire with the result TTL. There is no early revocation API; add authenticated ownership/revocation before retaining sensitive long-lived hosted history. |
| SEC-PO-004 | Medium | MITIGATED WITH RESIDUAL RISK | URL validation rejects non-HTTP schemes, credentials, localhost, metadata names, and non-public resolved addresses; redirects are revalidated. DNS rebinding between validation and connection remains possible because the client does not pin the validated address. Use a network egress policy or address-pinned resolver for high-risk deployments. |
| SEC-PO-005 | Low | OPEN | Direct HTTP provider errors can include upstream text in internal error strings. The comparison service sanitizes public provider errors, but central structured logging/redaction and log-retention policy should be added before hosted operation. |
| SEC-PO-006 | Low | OPEN | Evidence artifacts are file-count bounded, but production retention/deletion and per-tenant storage quotas are deployment policy rather than enforced centrally. Configure private storage, lifecycle rules, and deletion workflows. |
| SEC-PO-007 | Informational | EXTERNALLY_BLOCKED | Chrome Web Store privacy/permission review, retailer policy review, and production legal approval are external. No repository test can substitute for them. |

## Control review

### SSRF, redirects, and private networks

- `backend/url_guard.py` accepts only HTTP(S), enforces a 2,048-character limit, rejects local/metadata names, resolves hostnames, and rejects every non-global IPv4/IPv6 result.
- `backend/compare/adapters/direct_http.py` validates the initial URL, response URL, and every redirect; disables automatic redirects; caps five redirects; accepts no more than 20 submitted URLs; and caps each body at 1 MB.
- `backend/agentcore/providers.py` applies the same public URL policy per redirect, caps three redirects, streams a configurable 2 MB default maximum, and limits stored HTML artifact count.
- No CAPTCHA bypass, proxy evasion, credential automation, or checkout execution exists in the comparison provider.

### Hostile JSON-LD and HTML

- Server JSON-LD traversal is iterative and capped at 10,000 visited nodes; HTML is bounded before parsing.
- Browser JSON-LD is capped at 256 KB, 500 nodes, depth 10, and 50 script elements; visible text and fields are bounded.
- Invalid JSON-LD is ignored and absence of required currency/price produces uncertainty rather than fabricated AED/zero.
- Side-panel rendering escapes hostile result text; action URLs accept only credential-free HTTP(S).

### Extension messaging and permissions

- The manifest has no install-time host permissions. HTTP(S) origins are optional and requested for the configured backend.
- `activeTab` limits page access to a user-invoked tab.
- Message types and fields are allowlisted. URLs and domains are validated, senders must match the extension ID, and tab-sensitive messages require a tab sender.
- Telemetry is false in the versioned default settings.
- Residual: optional host permissions are broad patterns in the manifest, although the runtime requests only the configured origin. Review the final Web Store permission text.

### API access and CORS

- POST comparisons are rate limited and include request IDs.
- Stored comparison reads and evidence reads require an unguessable, hash-stored, TTL-expiring `X-Jacobi-Access-Token`; failures use not-found responses to reduce enumeration.
- Agentcore custom URL verification can require `X-Api-Key` and scopes stored evidence by organization.
- CORS defaults to the production web origin and localhost/Vercel previews; credentials are not enabled. Set an explicit production allowlist.

### Persistence and RLS

- Production Supabase selection fails closed.
- The price-optimization migration enables RLS on all nine new tables, revokes anonymous grants, uses owner policies for comparisons/watches/preferences, and reserves catalog/observation writes for service role.
- Service-role keys must remain backend-only. RLS does not constrain a compromised service role, so minimize its use and rotate it.

### Secrets and paid-provider isolation

- `.env`, `.env.local`, backend/frontend env files, evidence artifacts, and common build output are ignored.
- The current tree no longer matches the targeted credential patterns. Rotation and history cleanup/assessment for SEC-PO-001 remain required before release.
- No paid provider is in the comparison registry. `OptionalManagedAdapter` is disabled unless explicitly constructed and enabled. Bright Data variables are read by the legacy audit code only, not the normal compare service.
- Never run live paid-provider tests in CI.

### Observability and privacy

- Sentry is disabled without `SENTRY_DSN`; default PII is off and request headers, cookies, bodies, and query strings are stripped.
- Extension telemetry defaults off and no advertising use is implemented.
- Comparison events have a persistence interface, but hosted retention/deletion and analytics consent flows require operational implementation.

## Verification evidence

Run on 12 July 2026:

```text
python -m pytest tests/test_url_guard.py tests/test_agentcore_http_security.py \
  tests/test_compare_providers.py tests/test_compare_discovery.py \
  tests/test_compare_storage.py tests/test_compare_persistence_migration.py -q
84 passed, 1 warning

node --test extension/tests/*.test.js
14 passed

python -m pytest tests/test_repository_secrets.py -q
1 passed, 1 warning
```

The backend tests cover private URL rejection, redirect-hop revalidation, bounded bodies, safe redirects, provider opt-in/cost metadata, partial failure, URL deduplication, owner-scoped storage, fail-closed Supabase selection, and migration RLS/grants. Extension tests cover settings, unsafe/credential-bearing URLs, bounded extraction, missing currency, message/sender validation, explicit result states, safe action URLs, and output escaping.

A targeted tracked-file pattern scan initially found SEC-PO-001. After `caafa55`, the same current-tree scan reported `NO_TRACKED_SECRET_PATTERN_MATCHES`. A full history-aware secret scanner is still required before release.

## Release security gate

Before push or public release:

1. confirm SEC-PO-001 credential rotation/history handling and run a history-aware scanner such as Gitleaks;
2. run the complete backend, frontend, extension, MCP, CLI, and migration gates;
3. configure production origins, shared/upstream rate limiting, private evidence storage, retention, deletion, and key rotation;
4. validate RLS against a real Supabase project using anon, authenticated user A/B, and service-role clients;
5. review the packed extension permissions and contents;
6. complete retailer policy, privacy, legal, and Chrome Web Store reviews.
