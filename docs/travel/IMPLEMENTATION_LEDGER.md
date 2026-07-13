# Jacobi Travel Price Guardian Implementation Ledger

- Authoritative specification: `C:\Users\hussa\Downloads\Jacobi_Travel_Price_Guardian_PRD.md`
- PRD SHA-256: `FF915B5813C26554CFA87E998D09958E96E337E2A66817741131A357BE09D1CD`
- Branch: `pivot/travel-price-guardian-v1`
- Stacked base: `pivot/price-optimization-mvp` at `c4cb4e2`
- Last audit: 2026-07-13

## Status contract

- `NOT_STARTED`: repository work has not begun beyond audit/planning.
- `IN_PROGRESS`: implementation exists but code, tests, documentation or fresh validation is incomplete.
- `BLOCKED_EXTERNAL`: every repository-side prerequisite is complete and only credentials, provider/legal approval, Chrome Web Store review, target deployment access or real-user evidence remains.
- `COMPLETE`: implementation, relevant automated tests, documentation and fresh validation all agree.

A reusable retail component is not automatically a completed travel requirement. Every `COMPLETE` row must include a fresh result. External blockers cannot hide unfinished repository work.

## Document control and Phase 0 audit

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-000 | Read the complete authoritative PRD before editing product code and record its digest. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | Document control check | `Get-FileHash ...; (Get-Content ...).Count` | 2,272 lines; SHA-256 recorded | Source file remains in the supplied Downloads path. |
| TR-001 | Read the supplied research report and resolve conflicts in favor of the later PRD. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md`; ADR-008 | Document control check | `Get-FileHash ...; (Get-Content ...).Count` | 131 lines; SHA-256 recorded | Research citation tokens were not treated as repository verification. |
| TR-002 | Fetch remotes, verify PR #45 and recover the exact foundation commit. | COMPLETE | Git branch/worktree metadata; audit | Recovery commands | `git fetch --all --prune; gh pr view 45 ...; git rev-parse HEAD` | PR #45 open draft and clean; head/base verified; commit `c4cb4e2` | None. |
| TR-003 | Create `pivot/travel-price-guardian-v1` directly from the verified foundation. | COMPLETE | Git branch | Merge-base check | `git branch --show-current; git merge-base HEAD origin/pivot/price-optimization-mvp` | Branch correct; merge-base `c4cb4e2` | Stacked draft PR is tracked separately. |
| TR-004 | Open a stacked draft PR against `pivot/price-optimization-mvp`. | COMPLETE | GitHub draft PR #46 | `gh pr view` | `gh pr view 46 --json isDraft,baseRefName,headRefName,url` | Draft PR #46 open with the required base/head | Must remain draft; do not merge PR #45 to start. |
| TR-005 | Produce current architecture and repository-tree inventory. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | Source/tree inspection | `rg --files`; directory and symbol inventories | Architecture and focused tree recorded | Generated/build/vendor directories excluded from the focused tree. |
| TR-006 | Produce dependency/runtime/deployment map. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | Manifest inspection | inspect `requirements.txt`, `package.json`, Docker/Render/CI | Present and missing travel dependencies recorded | No dependency was added during audit. |
| TR-007 | Inventory reusable PR #45 components and retail-specific replacement boundaries. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | Diff/symbol inspection | `git diff --stat origin/main...HEAD`; `rg` symbols | Reuse/isolation decisions recorded | Reuse is not credited as completed travel behavior. |
| TR-008 | Inventory database migrations, repositories, RLS and access boundaries. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | Migration/storage tests inventoried | list migrations; inspect storage and static RLS tests | 13 migrations; no travel tables | Real Supabase validation remains future credential-gated work. |
| TR-009 | Inventory REST/OpenAPI, Agentcore, MCP, CLI and Deep Audit. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | OpenAPI generation/collection | import app and enumerate OpenAPI | 60 paths; no `/api/v2/travel` | `main.py` remains legacy-heavy. |
| TR-010 | Inventory extension permissions, messages, storage, UI and frontend surfaces. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | Manifest/message/source inspection | inspect manifest and extension contracts | Current retail flow and travel gaps recorded | Broad optional host declaration must be narrowed. |
| TR-011 | Inventory tests, CI and browser artifacts. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md` | pytest collection and workflow inspection | `python -m pytest --collect-only -q` | 1,690 backend tests collected; existing extension/CI inventoried | Collection proves discoverability, not pass status for this branch. |
| TR-012 | Review security controls and relevant secret-history findings without exposing secrets. | COMPLETE | `docs/travel/REPOSITORY_AUDIT.md`; inherited security review | Secret regression/history inspection | current-tree regression plus history review inventory | Known key-shaped value remains redacted; residual findings recorded | Rotation/revocation and full history assessment are external. |
| TR-013 | Record required architecture decisions. | COMPLETE | `docs/adr/ADR-001` through `ADR-009` | Documentation link check | verify ADR files and links | Nine accepted travel ADRs recorded | Later changes require superseding ADRs. |
| TR-014 | Commit the Phase 0 audit before major product implementation. | IN_PROGRESS | Audit, plan, ledger, ADRs | `git diff --check`; docs validation | commit audit docs | Pending | This row becomes complete in the audit commit follow-up. |

## Product, experience and scope

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-100 | Make the travel price guardian the default product and preserve Deep Audit as an explicit specialist path. | NOT_STARTED | target frontend/extension/navigation; existing legacy modules | frontend/extension/legacy regression | full product gates | Pending | Retail default still active. |
| TR-101 | One supported open flight page automatically creates an independent provider search without tabs or repeated entry. | NOT_STARTED | target extension flight adapters; travel API/worker/provider | Chromium flight E2E | travel demo command | Pending | Requires configured sandbox fixture for CI; production credentials external. |
| TR-102 | One supported open hotel page provides the same lazy-user flow. | NOT_STARTED | target hotel adapters/provider | Chromium hotel E2E | travel demo command | Pending | Hotel provider field/revalidation limits must be labelled. |
| TR-103 | Automatic Savings Mode requires explicit onboarding consent and narrowly scoped supported-domain groups. | NOT_STARTED | target extension onboarding/settings/manifest | permission/mode E2E | Node + Chromium | Pending | Current manifest has broad optional host patterns. |
| TR-104 | Privacy Mode parses locally and sends only after explicit click. | NOT_STARTED | target extension privacy flow | mode/message E2E | Node + Chromium | Pending | None. |
| TR-105 | Meaningful interruption uses configurable max(USD 20 equivalent, 3% baseline) while smaller savings remain passive. | NOT_STARTED | target preferences/badge logic | unit/render/E2E | pytest + Node | Pending | Needs evidenced FX conversion. |
| TR-106 | Side panel shows saving, exactness/trade-offs, completeness, freshness, supplier, evidence, rejected candidates, recheck and open route. | NOT_STARTED | target travel side panel | render/Chromium tests | Node + Chromium | Pending | Current UI is retail-specific. |
| TR-107 | No autonomous checkout/payment, credential automation, CAPTCHA bypass, stealth evasion or unrestricted scraping. | NOT_STARTED | travel policy/security tests/docs | negative/security tests | security gate | Pending | Existing code has no travel checkout; future implementation must preserve the boundary. |
| TR-108 | No generic itinerary planner, OTA, price prediction, guaranteed-lowest claim or broad metasearch destination as primary flow. | NOT_STARTED | product copy/policy/docs | claims/content checks | repository text audit | Pending | Deep Audit and retail history remain secondary. |
| TR-109 | Affiliate revenue never affects ranking and only attaches after explicit click. | NOT_STARTED | target ranker/redirect service | rank invariance/redirect tests | pytest | Pending | Affiliate approval remains external. |
| TR-110 | First use works anonymously with optional account history/preferences. | NOT_STARTED | target capability/auth/persistence | access/RLS tests | pytest + real RLS when available | Pending | No anonymous global history. |

## Architecture and shared domain

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-200 | Implement modular monolith plus separate worker using shared Python travel packages. | IN_PROGRESS | `backend/travel/{domain,costing,equivalence,ranking,search,persistence,providers}`; target worker | travel unit/import tests; pending worker contract | `python -m pytest -q tests/travel` | Shared modular packages implemented; separate worker pending | No microservices/Kafka/Kubernetes. |
| TR-201 | Keep all new travel business logic outside `backend/main.py`; main is travel assembly only. | NOT_STARTED | target `backend/api/v2_travel.py`; main router mount | architecture/import test | pytest | Pending | Legacy main logic remains preserved debt. |
| TR-202 | Create typed travel enums/errors/results/evidence contracts. | COMPLETE | `backend/travel/domain` | `test_domain_models.py` | `python -m pytest -q tests/travel/test_domain_models.py` | Typed travel-only contracts pass | Retail ProductIdentity is not imported. |
| TR-203 | Create validated `FlightIntent`, legs, passengers, selected itinerary, baseline and bounded page context. | COMPLETE | `backend/travel/domain/flight.py`; `intent.py` | validation/unit tests | `python -m pytest -q tests/travel/test_domain_models.py` | Flight intent validation and bounded context pass | Passenger names/documents are rejected from page context. |
| TR-204 | Create validated `HotelIntent`, property hint, occupancies, selected rate and bounded page context. | COMPLETE | `backend/travel/domain/hotel.py`; `intent.py` | validation/unit tests | `python -m pytest -q tests/travel/test_domain_models.py` | Hotel intent validation and bounded context pass | Guest identities are not modeled. |
| TR-205 | Use Decimal-safe Money and preserve original/conversion evidence, source, timestamp, age and rounding. | COMPLETE | `backend/travel/domain/money.py`; `backend/travel/costing/currency.py` | money/conversion tests | `python -m pytest -q tests/travel/test_domain_models.py tests/travel/test_costing_engine.py` | Decimal construction, FX evidence and rounding pass | Existing retail Money is a pattern only. |
| TR-206 | Model every cost as known, estimated, unknown or not applicable. | COMPLETE | `backend/travel/costing/engine.py` | `test_costing_engine.py` | `python -m pytest -q tests/travel/test_costing_engine.py` | Four-state validation and unknown preservation pass | Unknown never equals zero. |
| TR-207 | Support flight/hotel cost kinds including fare/rate, taxes, fees, baggage, resort/destination, cleaning, local tax and FX spread. | COMPLETE | `backend/travel/domain/enums.py`; `backend/travel/costing` | costing scenarios | `python -m pytest -q tests/travel/test_costing_engine.py` | Required cost kinds aggregate with Decimal semantics | Provider omissions remain unknown. |
| TR-208 | Preserve fixture/sandbox/live official/browser/direct-public/managed observation labels end to end. | IN_PROGRESS | `backend/travel/domain/enums.py`; `backend/travel/providers`; target API/UI | domain/provider label tests; pending Node/API | travel/provider focused suites | Domain/provider labels are explicit; end-to-end rendering pending | Generic `live` is prohibited. |
| TR-209 | Implement canonical material intent fingerprints and idempotency keys. | IN_PROGRESS | `backend/travel/search/fingerprint.py`; `runtime.py`; target API | `test_search_fingerprint.py`; `test_search_runtime.py`; pending SPA/API dedupe | `python -m pytest -q tests/travel/test_search_fingerprint.py tests/travel/test_search_runtime.py` | Material-only flight/hotel hashes and runtime idempotency pass; API/extension binding pending | Fingerprints exclude tracking, baseline price and personal data. |
| TR-210 | Validate persisted search state transitions including cancel/expire states. | NOT_STARTED | target state machine/repository | transition/property tests | pytest | Pending | One provider failure must not fail useful results. |
| TR-211 | Keep authoritative travel money Decimal-safe through Agentcore evidence compatibility without float round-trip. | NOT_STARTED | target travel evidence adapter; inherited Agentcore schemas | precision/manifest tests | pytest | Pending | Existing Agentcore Money is float-backed and cannot be the travel price authority. |

## Flight and hotel identity/equivalence/cost/ranking

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-300 | Flight exactness enforces passenger mix, trip type, segment count, airports, dates, operating flight, cabin, baggage and known fare rules. | IN_PROGRESS | `backend/travel/equivalence/flights.py` | flight unit tests; golden corpus pending | focused pytest; later travel eval | Deterministic rule tests pass | 300+ corpus still required. |
| TR-301 | Flight trade-offs/rejections expose marketing/operating, self-transfer, separate ticket, baggage, refund and change differences. | IN_PROGRESS | `backend/travel/equivalence/flights.py`; `reasons.py` | adversarial unit tests; golden corpus pending | focused pytest; later travel eval | Trade-off/rejection unit cases pass | False savings remain release blockers. |
| TR-302 | Hotel identity uses crosswalk/official ID/address/geospatial/phone/domain/alias hierarchy; fuzzy name alone is insufficient. | IN_PROGRESS | `backend/travel/equivalence/hotels.py` | identity unit tests; golden corpus pending | focused pytest; later travel eval | ID/address/geo/phone/domain/alias hierarchy passes unit cases | Crosswalk repository integration pending. |
| TR-303 | Hotel exactness enforces property, dates, occupancy, room family, guaranteed bed, meal, refundability/cancellation, payment and fee basis. | IN_PROGRESS | `backend/travel/equivalence/hotels.py` | hotel unit tests; golden corpus pending | focused pytest; later travel eval | Deterministic hotel rate rules pass unit cases | 300+ corpus still required. |
| TR-304 | Return exact, disclosed trade-off, similar, rejected or insufficient-evidence with reason codes and explanations. | IN_PROGRESS | `backend/travel/equivalence` | unit tests; golden corpora pending | `python -m pytest -q tests/travel/test_equivalence_rules.py` | Five explicit classes, reasons and field explanations pass unit tests | Evaluation datasets pending. |
| TR-305 | Return verified, conditional, potential, none or cannot-compare saving classes. | COMPLETE | `backend/travel/costing/savings.py`; domain results | saving-class tests | `python -m pytest -q tests/travel/test_costing_engine.py` | All five saving classes pass | Verified has strict gates. |
| TR-306 | Verified saving requires exactness, complete mandatory costs, current availability, fresh revalidation, consistent currency and no hard preference violation. | COMPLETE | `backend/travel/costing/savings.py` | release-gate unit tests | `python -m pytest -q tests/travel/test_costing_engine.py` | Strict verified gates pass | No exceptions for lower subtotals. |
| TR-307 | Rank with inspectable lexicographic key in the PRD order and deterministic tie-break. | COMPLETE | `backend/travel/ranking` | `test_ranking_policy.py` | `python -m pytest -q tests/travel/test_ranking_policy.py` | Named lexicographic key and deterministic tie-break pass | No vague deal score. |
| TR-308 | Explain every inclusion/exclusion from deterministic facts and reason codes. | IN_PROGRESS | `backend/travel/equivalence`; target service/API/UI | equivalence tests; pending API/Node | focused pytest | Core field explanations pass; orchestration/UI exclusions pending | LLM rewriting optional and off. |
| TR-309 | Apply user hard preferences, supplier trust, freshness and redirect friction without commission inputs. | IN_PROGRESS | `backend/travel/ranking/ranker.py`; target preferences | rank tests; pending preference/invariance tests | `python -m pytest -q tests/travel/test_ranking_policy.py` | Rank dimensions implemented; preference service pending | Trust tiers need documented policy. |

## Search, providers, worker and progressive results

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-400 | Implement vertical-aware provider protocol, descriptors, registry, health and fail-closed credential/approval gates. | NOT_STARTED | target `backend/travel/providers` | provider contract tests | pytest | Pending | Providers may implement one vertical. |
| TR-401 | Implement real search lifecycle accepted→parsed→cache_checked→running→partial→verifying→terminal. | IN_PROGRESS | `backend/travel/search/models.py`; target orchestrator/events | `test_search_runtime.py`; pending integration tests | `python -m pytest -q tests/travel/test_search_runtime.py` | State transitions implemented; 3 focused tests pass; orchestration pending | Progress must correspond to real work. |
| TR-402 | Implement Redis queue, leases, retries, deadlines, cancellation, rate limits, cache, event replay, OAuth cache and heartbeat. | IN_PROGRESS | `backend/travel/search/runtime.py`; target worker/orchestrator | `test_search_runtime.py`; pending Redis/worker resilience | `python -m pytest -q tests/travel/test_search_runtime.py` | Memory/Redis runtime contracts implemented; 3 focused tests pass | Redis integration/restart tests and worker are pending. |
| TR-403 | Persist sanitized provider attempts, counts, timings, redacted errors and rate-limit state. | IN_PROGRESS | `backend/travel/persistence`; `202607130001_travel_market_graph.sql`; target worker | persistence/migration tests; pending worker integration | `python -m pytest -q tests/travel/test_persistence_repository.py tests/travel/test_travel_migration.py` | Repository boundary passes; worker attempt lifecycle pending | Raw upstream payload/error fields are rejected. |
| TR-404 | Enforce default 8s soft, 15s hard and 8s revalidation deadlines with per-provider isolation. | NOT_STARTED | target search/provider context | timeout/degraded tests | pytest | Pending | Configurable within safe bounds. |
| TR-405 | Stream named SSE events with IDs, heartbeats, replay and `Last-Event-ID`. | IN_PROGRESS | `backend/travel/search/models.py`; `runtime.py`; `sse.py`; target API | runtime replay/framing tests; pending API reconnect tests | `python -m pytest -q tests/travel/test_search_runtime.py tests/travel/test_search_access_sse.py` | Replayable event and safe SSE framing contracts pass; 6 focused tests pass; HTTP endpoint pending | Disconnect does not silently lose results. |
| TR-406 | Implement Amadeus OAuth with fixed test/production endpoints, token cache and server-only secrets. | NOT_STARTED | target Amadeus auth/client | auth/allowlist fixtures | pytest | Pending | Credentials must not be required in default CI. |
| TR-407 | Normalize Amadeus Flight Offers Search, taxes and baggage with truthful sandbox/production labels. | NOT_STARTED | target Amadeus flights/normalizer | provider fixtures/contracts | pytest | Pending | Production inventory validation requires credentials. |
| TR-408 | Revalidate flight offers through Flight Offers Price before redirect. | NOT_STARTED | target Amadeus revalidation | changed/unavailable/timeout tests | pytest | Pending | Changed price requires reconfirmation. |
| TR-409 | Implement first accessible hotel provider, initially Amadeus Hotel Search, without overstating inventory or price-check capability. | NOT_STARTED | target Amadeus hotels | provider fixtures/contracts | pytest | Pending | Upstream revalidation limitations may block verified hotel savings. |
| TR-410 | Supply sanitized provider fixtures for happy, partial, auth, rate limit, timeout, malformed, changed, unavailable, missing data and duplicate cases. | NOT_STARTED | target provider fixtures | contract matrix | pytest | Pending | Fixtures are redistribution-safe and labelled. |
| TR-411 | Current page remains baseline observation, never counted as independent search. | NOT_STARTED | target browser observation provider | label/ranking tests | pytest + Node | Pending | Browser evidence may be incomplete. |
| TR-412 | Cache fresh equivalent results and safely return them before slow providers. | NOT_STARTED | target freshness/cache/orchestrator | cache hit/staleness tests | pytest | Pending | Provider-specific retention/TTL policy required. |
| TR-413 | Deduplicate normalized offers and provider duplicates deterministically. | NOT_STARTED | target travel dedupe | property/provider tests | pytest | Pending | Preserve distinct material fare/rate variants. |

## Persistence and Market Graph

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-500 | Add `travel_searches` with fingerprint, bounded intent, status, market, capability hash, ownership and expiry. | COMPLETE | `202607130001_travel_market_graph.sql`; `backend/travel/persistence` | migration/repository tests | `python -m pytest -q tests/travel/test_persistence_repository.py tests/travel/test_travel_migration.py` | Search schema/repository/access contract passes | Intent payload is bounded and rejects sensitive/raw keys. |
| TR-501 | Add persisted provider attempts. | COMPLETE | migration; travel persistence | migration/repository tests | same focused persistence command | Attempt schema/repository contract passes | Errors are sanitized at repository boundary. |
| TR-502 | Add flight itineraries and canonical hashes. | COMPLETE | migration; travel persistence | migration/repository tests | same focused persistence command | Service-only itinerary catalogue contract passes | Structured segments remain normalized. |
| TR-503 | Add hotel properties and provider crosswalks with evidence/confidence. | COMPLETE | migration; travel persistence | migration/repository tests | same focused persistence command | Property and crosswalk link contracts pass | Ambiguous aliases still require reviewed evidence. |
| TR-504 | Add travel offers and explicit cost components. | COMPLETE | migration; travel persistence | migration/repository tests | same focused persistence command | Offer/cost ownership and link contracts pass | Redirect targets are not stored in offer payloads. |
| TR-505 | Add travel evidence and immutable Agentcore manifest linkage. | IN_PROGRESS | migration; travel persistence; target Agentcore adapter | evidence/access tests; pending manifest integration | focused persistence command | Evidence storage/access contract passes; Agentcore linkage pending | Raw provider payloads are rejected. |
| TR-506 | Add revalidations and redirect events. | COMPLETE | migration; travel persistence | transition/access tests | same focused persistence command | Revalidation/redirect ownership and relationship checks pass | Redirect service must still enforce fresh success. |
| TR-507 | Add feedback and travel preferences; defer watches until core comparison works. | COMPLETE | migration; travel persistence | access/repository tests | same focused persistence command | Feedback/preferences contracts pass; no travel-watch table added | Watches deliberately postponed. |
| TR-508 | Apply RLS/user ownership and service-only boundaries to travel records. | IN_PROGRESS | migration; travel persistence access contexts | static RLS/repository tests; real RLS pending | focused persistence command; later Supabase validation | Static RLS/grant shape and owner/capability/service tests pass | Real target validation requires credentials. |
| TR-509 | Keep Postgres as Market Graph; use relational indexes before any secondary search service. | IN_PROGRESS | migration; ADR-002/008 | migration tests; query benchmark pending | focused migration command | Relational schema/indexes exist; measured query plans pending | Secondary engine needs measured failure and ADR. |
| TR-510 | Memory and production repository implementations share contract tests; production misconfiguration fails closed. | COMPLETE | `backend/travel/persistence/{base,memory,supabase,factory}.py` | repository contracts | `python -m pytest -q tests/travel/test_persistence_repository.py` | Memory/Supabase mapping and fail-closed selection tests pass | Memory is bounded, non-durable and development-only. |

## API, access, revalidation and redirects

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-600 | Add `POST /api/v2/travel/searches` with typed vertical intent, idempotency and extension-version headers. | NOT_STARTED | target v2 router/schemas/service | API/OpenAPI tests | pytest | Pending | No arbitrary server-fetch URL. |
| TR-601 | Add capability-scoped `GET /searches/{id}`. | NOT_STARTED | target API/security/repository | access/cross-user tests | pytest | Pending | Anonymous failures use non-enumerating semantics. |
| TR-602 | Add replayable `GET /searches/{id}/events` SSE. | NOT_STARTED | target API/events | reconnect/access tests | pytest | Pending | Capability/token handling for EventSource must avoid URL leakage. |
| TR-603 | Add offer revalidation endpoint with 8s deadline. | NOT_STARTED | target API/service/jobs | revalidation tests | pytest | Pending | Changed/unavailable states visible. |
| TR-604 | Add redirect endpoint that requires a fresh revalidation authorization and validates the supplier route. | NOT_STARTED | target API/redirect/security | redirect safety/invariance tests | pytest | Pending | No automatic checkout. |
| TR-605 | Add feedback endpoint with bounded sanitized content. | NOT_STARTED | target API/repository | validation/access tests | pytest | Pending | No raw URL or personal data. |
| TR-606 | Add providers and provider health endpoints with truthful configuration/environment labels. | NOT_STARTED | target API/registry | API/OpenAPI tests | pytest | Pending | Optional provider failure does not make API unready. |
| TR-607 | Add GET/PUT travel preferences. | NOT_STARTED | target API/repository | access/validation tests | pytest | Pending | Anonymous preferences are minimal/local or search-scoped. |
| TR-608 | Return consistent redacted error envelopes, request/correlation IDs, retryability and search IDs. | NOT_STARTED | target errors/middleware/API | error/security tests | pytest | Pending | Never expose raw provider errors. |
| TR-609 | Keep `/api/v1/compare` and legacy APIs compatible but remove them from default consumer flow. | NOT_STARTED | existing v1 plus new frontend/extension routing | full legacy/API regressions | pytest + build | Pending | Compatibility must survive pivot. |
| TR-610 | Correct Deep Audit truth labelling so explicit managed-provider execution is not reported as no paid-provider use. | NOT_STARTED | target inherited compare API/tooling compatibility fix | Deep Audit API/MCP/CLI regressions | pytest | Pending | The explicit opt-in contract remains unchanged. |

## Extension and supported pages

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-700 | Implement versioned travel page adapter contract with match/observe/extract/sanitize/confidence/missing fields. | NOT_STARTED | target extension adapters | adapter fixture tests | Node | Pending | No raw HTML by default. |
| TR-701 | Implement three robust supported flight adapters after feasibility review. | NOT_STARTED | target flight adapters/fixtures | extraction + Chromium E2E | Node + Chromium | Pending | Domain support is fixture/E2E-gated and policy-reviewed. |
| TR-702 | Implement three robust supported hotel adapters after feasibility review. | NOT_STARTED | target hotel adapters/fixtures | extraction + Chromium E2E | Node + Chromium | Pending | Same support gate. |
| TR-703 | Support SPA navigation, mutation debounce, stability and idempotent search suppression. | NOT_STARTED | target content/background logic | storm/debounce/E2E tests | Node + Chromium | Pending | Background suspension/restart considered. |
| TR-704 | Send only minimal sanitized intents; strip tracking/session/auth/booking/email/passenger fields. | NOT_STARTED | target privacy/sanitizer | hostile fixture/privacy tests | Node | Pending | Complete URLs/HTML not collected. |
| TR-705 | Implement travel extension states unsupported through stale with truthful data-origin labels. | NOT_STARTED | target side panel/render/background | render/Chromium tests | Node + Chromium | Pending | No generic live label. |
| TR-706 | Implement badge checking/saving/checked/degraded states and meaningful-saving interruption only. | NOT_STARTED | target background/badge policy | badge E2E | Chromium | Pending | Side panel remains user-opened. |
| TR-707 | Implement recheck, changed-price reconfirmation and safe cheaper-route opening. | NOT_STARTED | target side panel/background/messages | redirect/revalidation E2E | Chromium | Pending | Redirect blocked without revalidation. |
| TR-708 | Store only allowed mode/domains/currency/threshold/install ID/preferences/references/telemetry consent. | NOT_STARTED | target extension storage | storage/privacy tests | Node | Pending | No names, passports, payment, credentials, raw HTML/history. |
| TR-709 | Preserve self-hosted backend configuration with explicit backend-origin permission. | NOT_STARTED | target settings/config | permission/E2E tests | Node + Chromium | Pending | Backend origin is separate from supported travel hosts. |
| TR-710 | Package unpacked MV3 extension and generate flight/hotel/degraded browser artifacts. | NOT_STARTED | target packaging/tests/artifacts | package + Chromium | scripts | Pending | Web Store approval remains external. |

## Security, privacy, observability and policy

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-800 | Keep provider credentials server-side, separated by environment, and safely disable absent configuration. | NOT_STARTED | target provider config/security | config/secret tests | pytest | Pending | Production credentials external. |
| TR-801 | Use fixed official-provider allowlists and strict validated outbound fallback controls. | NOT_STARTED | target allowlists/provider clients | SSRF/redirect tests | pytest | Pending | Production egress/DNS control external to app. |
| TR-802 | Implement short-lived opaque capability tokens stored only as hashes with search-scoped access/expiry/rate limits. | IN_PROGRESS | `backend/travel/search/access.py`; target repository/API | `test_search_access_sse.py`; pending endpoint scope tests | `python -m pytest -q tests/travel/test_search_access_sse.py` | Opaque issuance, hash-only verification and expiry pass | Repository/API binding and shared endpoint rate limits pending. |
| TR-803 | Strip tracking/session/auth parameters and never collect passenger names, passports, payments or credentials. | NOT_STARTED | target redaction/extension/provider logging | redaction/property tests | pytest + Node | Pending | Baseline identifiers limited to trip/stay facts. |
| TR-804 | Never log raw provider payloads or complete URLs; use structured redacted request/provider logs. | NOT_STARTED | target telemetry/logging/redaction | log-capture tests | pytest | Pending | Retention policy still operational. |
| TR-805 | Keep telemetry disabled by default and consent-aware. | NOT_STARTED | target metrics/tracing/extension settings | env/consent tests | pytest + Node | Pending | No advertising use. |
| TR-806 | Implement required travel metrics and OpenTelemetry-compatible spans behind configuration. | NOT_STARTED | target telemetry | metric/span tests | pytest | Pending | No sensitive dimensions. |
| TR-807 | Add liveness/readiness for Postgres, Redis, worker heartbeat and provider configuration/sandbox. | NOT_STARTED | target health/API/worker | health/degraded tests | pytest + Compose | Pending | Optional provider failure does not fail API readiness. |
| TR-808 | Maintain provider/page-adapter policy ledger with access, fields, retention, approval and monetization constraints. | NOT_STARTED | target provider policy docs/data | schema/link checks | scripts | Pending | Legal approval external. |
| TR-809 | Update security review for travel threat surface and inherited secret-history finding. | IN_PROGRESS | `docs/travel/SECURITY_AND_SECRET_HISTORY_AUDIT.md`; target final review | security suite/history scan | pytest + scanner | Phase 0 baseline recorded; final travel implementation review pending | Rotation/revocation external. |
| TR-810 | Provide deletion/retention policy for user history and de-identified market observations. | NOT_STARTED | target privacy/runbooks/persistence | deletion/access tests | pytest | Pending | Hosted retention settings environment-specific. |
| TR-811 | Close the inherited unauthenticated `/_next/static` path traversal before deploying the travel branch. | NOT_STARTED | target `backend/main.py` static route | encoded traversal regression | pytest | Phase 0 reproduced HTTP 200 for an out-of-root tracked file | No production secret file was accessed. |
| TR-812 | Replace inherited role-insensitive enterprise membership/table policies and service-isolate the outbox. | NOT_STARTED | target additive migration | static + real RLS adversarial tests | pytest + Supabase validation | Phase 0 source controls identified | Effective hosted grants require external Supabase credentials. |
| TR-813 | Apply ownership/publicity authorization to every private-probe consumer, including analysis. | NOT_STARTED | target legacy routes/shared guard | BOLA/IDOR tests | pytest | Pending | Preserve public demo behavior. |
| TR-814 | Require authenticated authorization for managed Deep Audit/provider spend and shared rate limits. | NOT_STARTED | target compare API/tooling/MCP/auth | auth/cost-limit tests | pytest | Pending | Local fixture demos remain hermetic. |
| TR-815 | Verify evidence HMACs, preserve Decimal money, and derive official-route provenance server-side. | NOT_STARTED | target Agentcore evidence/policy/schemas and compare service | tamper/precision/policy tests | pytest | Phase 0 tamper and precision reproductions confirmed | Compatibility migration may be needed for legacy manifests. |
| TR-816 | Fix same-origin OAuth/Stripe redirects, webhook body bounds and event replay/order controls. | NOT_STARTED | target frontend callback, billing, Stripe persistence | redirect/body/replay tests | pytest + frontend tests | Pending | Stripe signing remains required. |
| TR-817 | Prevent DNS-rebinding/connected-address bypass in reusable HTTP, webhook and Playwright paths. | NOT_STARTED | target URL transport/egress/browser controls | rebinding/redirect/subresource tests | pytest | Pending | Production network egress is an operational defense-in-depth layer. |
| TR-818 | Redact sensitive extension/source URLs and fail closed for hosted auth/persistence configuration. | NOT_STARTED | target extension config/extraction/history; deployment startup | privacy/config tests | pytest + Node | Pending | Self-hosted localhost remains explicit development configuration. |

## Tests, evaluation and performance

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-900 | Add unit tests for money, currency, completeness, intents, fingerprints, transitions, reasons, ranking, capabilities and redaction. | NOT_STARTED | target travel tests | unit suite | pytest | Pending | None. |
| TR-901 | Add Hypothesis properties for money/rounding, currency, dates/time zones, passenger/occupancy, rank stability and unknown preservation. | NOT_STARTED | target property tests; dependency manifest | property suite | pytest | Pending | Add dependency only for tests/runtime as required. |
| TR-902 | Create 300+ labelled flight pairs with adversarial negatives and saving expectations. | NOT_STARTED | target `flight_equivalence_v1.jsonl` | dataset/eval tests | `python -m jacobi travel eval --dataset flight_equivalence_v1` | Pending | Synthetic/sanitized labels are not real-user validation. |
| TR-903 | Create 300+ labelled hotel pairs with collisions, policy differences, ambiguity and hidden fees. | NOT_STARTED | target `hotel_equivalence_v1.jsonl` | dataset/eval tests | `python -m jacobi travel eval --dataset hotel_equivalence_v1` | Pending | Same limitation. |
| TR-904 | Report precision, recall, confusion matrix, cost accuracy, ranking agreement, latency and failures. | NOT_STARTED | target evaluation tooling | CLI snapshot/tests | travel eval/benchmark | Pending | No fabricated production metrics. |
| TR-905 | Add provider contract matrix for every required response/failure scenario. | NOT_STARTED | target provider contract tests | provider suite | pytest | Pending | No live calls in default CI. |
| TR-906 | Add extension adapter fixture, SPA, mode, message, badge, rendering, unsafe-link and origin-label tests. | NOT_STARTED | target extension tests/fixtures | Node suite | node --test | Pending | None. |
| TR-907 | Add Chromium flight, hotel and degraded one-page E2E with screenshots/artifacts. | NOT_STARTED | target Chromium harness/demo pages | browser E2E | Node Chromium command | Pending | Compatible local Chromium required. |
| TR-908 | Add SSE reconnect, worker restart, Redis lease expiry, duplicate suppression, degraded path, changed price and redirect safety tests. | NOT_STARTED | target resilience tests | integration suite | pytest + Compose | Pending | Docker/Redis availability may gate some local runs. |
| TR-909 | Add `jacobi travel eval/benchmark/providers/health` commands with human and JSON output. | NOT_STARTED | target CLI/tooling | CLI tests | pytest + commands | Pending | Reuse core services. |
| TR-910 | Meet measured beta precision/extraction/latency gates or keep them explicitly open. | NOT_STARTED | target eval/benchmark/reports | full evaluation | travel eval + benchmark + E2E | Pending | Real-provider/user latency requires external environment. |
| TR-911 | Preserve the full legacy backend, Agentcore, MCP, CLI and `/api/v1` suites. | COMPLETE | existing repository | backend suite baseline | `python -m pytest --collect-only -q` plus prior green foundation evidence | 1,690 collected; foundation previously 1,688 passed, 2 skipped | Must be rerun after each major implementation; collection alone is not final validation. |

## Deployment, frontend, docs and release

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-1000 | Pivot homepage, metadata, navigation, onboarding, dashboard/history/providers/settings/evidence to travel-first message. | NOT_STARTED | target frontend routes/components | typecheck/build/content tests | tsc + next build | Pending | Deep Audit preserved secondary. |
| TR-1001 | Add Docker Compose for Postgres, Redis, API, worker and frontend. | NOT_STARTED | target compose/Docker configs | config/build/health checks | docker compose config/up | Pending | Local Docker availability required. |
| TR-1002 | Provide separate API and worker commands, migration/bootstrap/fixture/demo sequence and readiness. | NOT_STARTED | target scripts/docs/entrypoints | smoke tests | documented commands | Pending | None. |
| TR-1003 | Provide additive migration and non-destructive rollback runbook. | NOT_STARTED | target migration/docs | migration/rollback tests | SQL validation | Pending | Destructive rollback prohibited without review/backup. |
| TR-1004 | Update Render/Vercel/worker/Redis/Supabase/extension production configuration without managed-provider requirement. | NOT_STARTED | target deployment configs/docs | static config + target validation | build/config commands | Pending | Target credentials external. |
| TR-1005 | Publish provider/support matrices, privacy/permissions, limitations, security, validation and demo runbooks. | NOT_STARTED | target travel docs | link/YAML/content checks | documentation validation | Pending | Claims derive from passing adapters/providers only. |
| TR-1006 | Package extension for Chrome Web Store submission and complete repository-side privacy checklist. | NOT_STARTED | target package/docs | package inspection/browser tests | package script | Pending | Store review/approval remains external. |
| TR-1007 | Implement real-user instrumentation and study plan for 30–50 consented sessions. | NOT_STARTED | target telemetry/feedback/study docs | telemetry/privacy tests | pytest + docs checks | Pending | Participants and outcomes external; never fabricate. |
| TR-1008 | Do not implement watches until flight and hotel comparison core is verified. | COMPLETE | ADR/plan/ledger decision | scope audit | repository symbol review | Watches explicitly deferred | Existing retail watches remain preserved but are not travel watches. |
| TR-1009 | Keep approved future Booking Demand, Expedia Rapid and Skyscanner adapters behind unimplemented/disabled capability boundaries. | NOT_STARTED | target provider registry/docs | disabled-provider tests | pytest | Pending | Access, policy and credentials external. |
| TR-1010 | Final acceptance demo proves flight, hotel and degraded flows with search, SSE, exactness, costs, revalidation, redirect, evidence and labels. | NOT_STARTED | target demo pages/fixtures/scripts/artifacts | final E2E | documented demo command | Pending | Fixture/sandbox demos remain labelled; production validation separate. |
| TR-1011 | Final ledger contains only honest COMPLETE or BLOCKED_EXTERNAL rows and the stacked PR body contains exact evidence/blockers. | NOT_STARTED | this ledger; PR body | ledger consistency/PR inspection | script + `gh pr view` | Pending | No completion based on time/token count. |
| TR-1012 | Update CI so stacked travel PRs run backend, frontend, extension, migration and travel resilience gates. | NOT_STARTED | target `.github/workflows` | workflow syntax/local commands | YAML parse + CI | Pending | Current full CI only targets PRs against `main`. |

## External decisions and validations

These rows remain `NOT_STARTED` until all repository-side interfaces, fixtures, configuration, tests and runbooks are complete. Only then may they become `BLOCKED_EXTERNAL`.

| requirement_id | description | status | implementation_files | tests | validation_command | validation_result | limitations |
|---|---|---|---|---|---|---|---|
| TR-EXT-001 | Validate Amadeus production credentials, quota, rate limits and production responses. | NOT_STARTED | target provider/client/runbook | explicit live smoke only | opt-in live command | Pending | Credentials and account approval external. |
| TR-EXT-002 | Approve first hotel provider and document persistence/caching terms. | NOT_STARTED | target provider policy ledger/runbook | disabled/contract tests | policy checklist | Pending | Provider/legal decision external. |
| TR-EXT-003 | Approve supported page adapters and affiliate/deeplink terms. | NOT_STARTED | target policy ledger/adapters/redirect boundary | adapter/redirect tests | policy checklist | Pending | Legal/partnership review external. |
| TR-EXT-004 | Validate migrations and RLS against a real Supabase project with anon, user A/B and service role. | NOT_STARTED | target migration/RLS harness/runbook | integration test | opt-in Supabase command | Pending | Project credentials external. |
| TR-EXT-005 | Validate Docker/worker/egress/DNS controls in the target production environment. | NOT_STARTED | target deployment configs/runbook | target smoke/resilience | deployment commands | Pending | Deployment authority external. |
| TR-EXT-006 | Complete Chrome Web Store privacy, permission and review process. | NOT_STARTED | target package/privacy/checklist | package/E2E checks | store checklist | Pending | Publisher account/review external. |
| TR-EXT-007 | Rotate/revoke the previously redacted key-shaped credential and complete relevant-history assessment. | NOT_STARTED | security runbook/regression scan | current/history scan | scanner + provider-console confirmation | Pending | Credential owner action external; secret is not reproduced. |
| TR-EXT-008 | Run 30–50 consented booking-session tests and report real activation, accuracy, latency, savings, redirects and retention. | NOT_STARTED | instrumentation/study plan | instrumentation tests | study protocol | Pending | Participants, consent and outcomes external. |

## Verification log

| Date | Command | Result |
|---|---|---|
| 2026-07-13 | `git fetch --all --prune`; PR/branch/worktree inspection | Foundation recovered exactly at `c4cb4e2`; PR #45 open draft and clean |
| 2026-07-13 | PRD/research line counts and SHA-256 | 2,272 and 131 lines; digests recorded above |
| 2026-07-13 | app import and OpenAPI enumeration | 60 paths; no travel v2 paths |
| 2026-07-13 | `python -m pytest --collect-only -q` | 1,690 tests collected in 3.48s |
| 2026-07-13 | dependency, migration, manifest, message and workflow inventories | Audit recorded in `REPOSITORY_AUDIT.md` |

## Completion query

Before final reporting, no row may remain `NOT_STARTED` or `IN_PROGRESS`. A `BLOCKED_EXTERNAL` row is valid only after its repository-side preparation is complete and verified.
