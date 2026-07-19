# Travel application validation review

This review covers the ordinary application controls required for the Travel
Price Guardian. It is not a penetration test, vulnerability-research exercise,
or repository-history investigation.

## Validated boundaries

| Boundary | Repository control | Verification |
|---|---|---|
| Provider credentials | Amadeus OAuth credentials are read only by the backend; absent credentials produce an honest `unconfigured` provider. Production requires the explicit approval gate. | `tests/travel/test_amadeus_provider.py`; `tests/travel/test_provider_contract_matrix.py` |
| Provider egress | Amadeus test and production clients use fixed official origins selected by server configuration. Redirect targets are checked against the provider descriptor allowlist and private/local destinations are rejected. | provider and search-worker redirect tests |
| Browser payload | Versioned adapters emit bounded typed intent only. Raw HTML, complete URLs, identity, session, credential, passport and payment fields are rejected. | `extension/tests/travel.test.js`; `extension/tests/messages.test.js` |
| Anonymous result access | Search capabilities are random, hash-only at rest, search-scoped and expiring. Missing, wrong or expired capabilities do not enumerate a search. | `tests/travel/test_persistence_repository.py`; `tests/travel/test_search_access_sse.py` |
| User records | Owner-scoped persistence and additive RLS policies separate user A, user B, anonymous capabilities and service writes. Authenticated deletion removes user-linked history/preferences and namespaced Agentcore evidence. | persistence, migration, access and retention/deletion tests |
| Evidence integrity | Agentcore manifests use a canonical SHA-256 and optional server HMAC. Travel evidence retrieval verifies the hash and any attached HMAC; altered evidence fails closed. Exact travel totals remain Decimal strings in the authoritative extraction. | `tests/test_agentcore.py`; `tests/travel/test_search_service_worker.py` |
| Revalidation and redirect | No offer payload directly authorizes navigation. Flight price and availability are revalidated, changed prices require reconfirmation, targets are allowlisted, and redirect grants expire. Unsupported hotel revalidation remains closed. | worker/API and extension background tests |
| API errors and logs | Travel errors use bounded redacted codes with request/search IDs and retryability. Opt-in structured logs reject URLs, capabilities, payloads and arbitrary labels. Telemetry and tracing default off. | `tests/travel/test_travel_api_v2.py`; `tests/travel/test_travel_telemetry.py` |
| Extension privileges | Manifest V3 uses no `<all_urls>`, cookies, debugger, checkout, credential or browsing-history permission. Exact host access is optional; notifications exist only for evidenced meaningful savings. | manifest/config/background tests and unpacked Chromium gate |
| Paid providers | Automatic travel search does not invoke Bright Data or Deep Audit. Managed provider use is explicit and separately labelled. | travel scope tests and legacy compare/provider-usage tests |

## Validation still dependent on an external target

- Real Supabase anon/user-A/user-B/service-role RLS execution requires a target
  project and credentials.
- Production Amadeus response, quota, terms and redirect validation require an
  approved production account.
- Production DNS/egress enforcement is configured by the deployment operator;
  repository URL/redirect validation is application-layer defense in depth.
- Chrome Web Store review and exact production page-adapter permission review
  are external approvals.

These gaps are recorded as `BLOCKED_EXTERNAL` rather than being represented as
completed production validation.
