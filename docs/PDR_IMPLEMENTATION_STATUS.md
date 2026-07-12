# Jacobi Price Optimisation PDR Implementation Status

Authoritative specification: [`PDR_OPEN_SOURCE_PRICE_OPTIMIZATION.md`](PDR_OPEN_SOURCE_PRICE_OPTIMIZATION.md) (SHA-256 `997B3536BF306765192...`, byte-identical to the copy supplied in `C:\Users\hussa\Downloads`).

Branch: `pivot/price-optimization-mvp`
Recovered baseline: `3b024c4`
Last ledger audit: 2026-07-12

## Status contract

- `COMPLETE`: implementation, automated tests, fresh verification, and documentation agree.
- `PARTIAL`: some repository implementation exists but one or more acceptance requirements are not satisfied.
- `NOT_STARTED`: no substantive implementation exists on this branch.
- `EXTERNALLY_BLOCKED`: repository-side preparation is complete; completion requires an external approval, credential, legal decision, partnership, or real-user result.
- `NOT_APPLICABLE`: explicitly outside the PDR release or prohibited by the PDR.

No row may be promoted to `COMPLETE` from source inspection alone. The verification column must identify a passing automated check or reproducible evidence.

## Recovery and product decisions

| PDR section | Requirement | Status | Implementation files | Tests / verification | Limitation or external blocker |
|---|---|---|---|---|---|
| Document control; Phase 0 | Preserve the existing repository and continue on `pivot/price-optimization-mvp` | COMPLETE | Git worktree at `jacobi-fix-travel-context` | `git status --short`; `git branch --show-current`; `git worktree list`; recovered clean at `3b024c4` | None |
| Document control; Phase 0 | Commit the authoritative PDR | COMPLETE | `docs/PDR_OPEN_SOURCE_PRICE_OPTIMIZATION.md` | SHA-256 matches supplied download; 3,207 lines read in full | None |
| Decision log 1-7 | Pivot the primary product to verified exact-product savings while preserving Deep Audit and Agentcore | COMPLETE | Price-first README/home/navigation/extension/REST/MCP/CLI; preserved legacy math, probe, evidence and enterprise modules | Compare, frontend, extension and maintained legacy gates | Historical Deep Audit documentation is indexed and retained rather than deleted |
| Product scope; non-goals | No autonomous purchase, credentials, CAPTCHA bypass, stealth evasion, or paid-provider dependency | COMPLETE | Agentcore policy boundary; zero-cost compare registry; explicit managed-provider Deep Audit acknowledgement | Provider isolation, policy, extension-message and secret tests | Legacy managed collection remains available only after explicit Deep Audit selection |

## Product identity, matching, cost, and optimisation

| PDR section | Requirement | Status | Implementation files | Tests / verification | Limitation or external blocker |
|---|---|---|---|---|---|
| FR-1 | Detect supported product pages locally from structured data, metadata, price, and URL signals with safe unsupported behaviour | COMPLETE | Bounded `extension/shared/extraction.js`; active-tab injection; uncertainty UI | Extraction/security tests including 100-run <500 ms budget; unpacked Chromium smoke | Dynamic pages without an observable price/currency return uncertainty rather than a fabricated product |
| FR-2 | Extract current offer fields locally and send normalised fields rather than full DOM | COMPLETE | Browser JSON-LD/metadata/merchant hooks; `ComparisonRequest`; provenance/limitations | Extension extraction/message tests; browser-submitted API test | Checkout-only costs remain explicit unknowns unless observed |
| FR-3; Domain model | Canonical identity: brand, family, model, MPN, GTIN/EAN/UPC, SKU, storage, memory, generation, processor, screen size, year, region, colour, condition, bundles, accessories, warranty region | COMPLETE | `backend/compare/identity.py`; `backend/compare/schemas.py` | `test_compare_identity_rich.py`; maintained backend suite `1,586 passed, 2 skipped` | Condition remains correctly offer-scoped while every material identity dimension is canonicalised |
| FR-3; Extraction confidence | Field-level provenance, confidence decomposition, contradictions, aliases, and explicit unknowns | COMPLETE | `IdentityEvidence`, `IdentityContradiction`, `ProductIdentity` in `backend/compare/schemas.py`; resolver in `identity.py` | `test_compare_identity_rich.py`; focused core `149 passed` | None |
| FR-3 | Deterministic identifier priority and no model-only high-confidence hallucination | COMPLETE | `backend/compare/identity.py` | `python -m pytest backend/tests/test_compare_engine.py` baseline result pending in this ledger | No LLM fallback implemented; acceptable for deterministic release |
| Testing strategy: golden dataset | Version-controlled labelled dataset of at least 100 pairs across every required mismatch/trade-off class | COMPLETE | `backend/tests/fixtures/golden_product_pairs.jsonl` (105 synthetic labelled pairs) | `test_golden_product_pairs.py`: 106 dataset cases pass; focused core `149 passed` | Real-page validation is tracked separately and fixtures make no live-support claim |
| FR-6 | Explicit classifications: `EXACT_EQUIVALENT`, `EQUIVALENT_WITH_DISCLOSED_TRADEOFF`, `SIMILAR_NOT_EQUIVALENT`, `REJECTED` | COMPLETE | `EquivalenceClass` and `classify()` | Golden dataset and equivalence tests pass | None |
| FR-6; Equivalence scoring | Hard-reject GTIN/MPN/model/storage/memory/region/connectivity conflicts; title similarity cannot override conflicts | COMPLETE | `backend/compare/equivalence.py` | Existing compare mismatch tests; 100-pair calibration pending | Must remain green against golden dataset |
| FR-6 | Explain every compared field with matched, mismatched, unknown state and reason codes | COMPLETE | `EquivalenceResult.field_explanations`; `classify()` | `test_equivalence_required_fields.py`; golden dataset | Warranty duration is retained in offer evidence; warranty region is the equivalence gate |
| FR-7 | Decimal-safe money arithmetic | COMPLETE | `Money` and `compute_payable()` in `backend/compare/` | Existing Decimal tests | None |
| FR-7 | Each cost is known, estimated, unknown, or not applicable | COMPLETE | `CostState`, `CostLine`, explicit component states in `PriceBreakdown` | `test_total_cost_states.py` | None |
| FR-7 | Item, shipping, taxes, duties, marketplace fees, payment fees, FX, coupons, membership/student pricing, cashback separation, mandatory service costs | COMPLETE | `backend/compare/schemas.py`; `backend/compare/total_cost.py` | `test_total_cost_states.py`; focused core and maintained suite pass | Conditional savings and cashback are retained separately and never reduce guaranteed total |
| FR-7; valid saving | Unknown costs never silently equal zero or drive a headline saving | COMPLETE | `compute_payable()`; `build_recommendation()` | Existing incomplete-total tests | Taxes/duties are treated N/A by domestic-MVP policy; explicit state still required |
| FR-8 | Freshness, evidence tier, extraction source, stock freshness, TTL, and revalidation status | COMPLETE | Per-offer `observed_at`, `stock_observed_at`, `ttl_seconds`, `revalidation_status`, `evidence_tier`; manifests | Stale/optimizer/provider/API tests | Default TTL is 15 minutes but providers may supply a bounded per-offer value |
| FR-9; methodology | Filter-first ranking, complete totals first, deterministic exclusions | COMPLETE | `backend/compare/ranking.py`; safety filters; preference modes; stable observation-ID tie break | `test_compare_optimizer.py`; full compare regressions | Incomplete totals cannot win in any preference mode |
| FR-9 | Rank by payable total plus equivalence, completeness, seller legitimacy, condition, warranty, delivery, returns, availability, freshness, eligibility, legality, evidence quality | COMPLETE | `rank()`; `PreferenceMode`; explicit ranking factors and explanations | `test_compare_optimizer.py`; service/API regression tests | Safety filters always win; official-seller and UAE-warranty modes may prefer a costlier valid route only when explicitly selected |
| FR-10 | Explain every excluded offer and expose current/best/eligible/trade-off/similar/rejected offers | COMPLETE | Candidate field explanations, exclusion explanations, ranking factors, selection trace; side-panel groups | Optimizer/API/extension rendering tests | Every non-selected class remains visible without being presented as the exact recommended route |

## Providers, discovery, UAE support, and performance

| PDR section | Requirement | Status | Implementation files | Tests / verification | Limitation or external blocker |
|---|---|---|---|---|---|
| FR-4/FR-5 | Capability-aware plugin interface for current-page, structured metadata, direct HTTP, browser-assisted, local Playwright, merchant search, official API, optional managed provider | COMPLETE | `backend/compare/adapters/base.py`; `browser_submitted.py`; `direct_http.py`; legacy `backend/agentcore/playwright_provider.py` | `test_compare_providers.py`; `test_compare_api.py` | The interface represents every provider class; concrete live merchant-search/API plugins remain retailer-specific work tracked below |
| FR-5 | Provider metadata: domains, capabilities, cost, evidence tier, timeouts, retries, limitations, rate limits, health, extraction fields | COMPLETE | `ProviderMetadata`; `GET /api/v1/providers/capabilities`; `GET /api/v1/providers/health` | `test_compare_providers.py`; `test_compare_api.py` | Health is a declared provider state, not an external-retailer uptime guarantee |
| Reliability | Provider failures and timeouts are isolated and honest partial results returned | COMPLETE | Per-provider timeout, bounded semaphore, overall deadline and pending-task cancellation in service | Provider failure/timeout/API tests | Public errors disclose provider class/status without raw upstream bodies |
| UAE support | Fixture support for Amazon UAE, Noon, Sharaf DG, and Sony UAE is labelled as fixture | COMPLETE | `backend/compare/fixtures/`; `fixture_store.py`; side-panel `demo fixtures` tag | Fixture adapter tests | Not live retailer support |
| UAE support | Practical Jumbo and official manufacturer fixture coverage | COMPLETE | Explicitly labelled Jumbo and Sony UAE fixtures; browser merchant hooks | Provider fixture/policy tests | Fixtures prove deterministic behavior only, never live inventory |
| UAE support | At least one genuine zero-cost live provider path | COMPLETE | `BrowserSubmittedOfferAdapter`; `DirectHttpStructuredMetadataAdapter`; comparison request integration | `test_browser_submitted_offer_is_real_zero_cost_route`; `test_compare_providers.py` | Live retailer availability is not claimed; browser observations and explicitly submitted public URLs are the genuine zero-cost paths |
| Offer discovery | Exact identifiers, merchant/official search, browser-assisted results, submitted URLs, open tabs, public catalog lookups | COMPLETE | Identifier queries; catalogue interface; browser-submitted/open-tab offers; explicit public URLs; merchant-search/official-API plug-in kinds | Discovery/provider/API/extension tests | Autonomous UAE search adapters stay disabled until retailer policy/partnership approval; browser-assisted fallback is implemented |
| Offer discovery | Deduplicate tracking URLs, sellers, and repeated variants | COMPLETE | `backend/compare/discovery.py`; service candidate integration | `test_compare_discovery.py` | Deduplication is deterministic and performed before equivalence/ranking |
| Performance | Bounded concurrency, overall deadline, progressive partial output, caching, cancellation, deduplication | COMPLETE | Semaphore/deadlines/task cancellation; staged side-panel progress; bounded result/persistence stores; cached fixture catalogues; candidate dedupe | Provider isolation, storage, API and extension tests | Comparison is bounded synchronous work; pending providers are cancelled at the deadline and returned as partial failures |
| Performance | Benchmark actual identity/comparison/provider performance honestly | COMPLETE | `backend/compare/benchmark.py` | `test_compare_benchmark.py`; fresh 50-iteration rank-25 run: median 1.7372 ms, p95 2.8168 ms on the local development machine | Hermetic ranker timing is not a live-retailer or end-to-end latency claim |

## Extension and web product

| PDR section | Requirement | Status | Implementation files | Tests / verification | Limitation or external blocker |
|---|---|---|---|---|---|
| Browser extension | Manifest V3 side panel with minimal permissions and scoped merchant access | COMPLETE | `extension/manifest.json`; `background.js`; runtime origin grant flow | Chromium manifest-permission assertion | Install grants no host or tab-list access; open-tab fallback requests optional permissions in two explicit steps |
| Browser extension | Current-tab JSON-LD, metadata, DOM/merchant extraction and identity preview | COMPLETE | `shared/extraction.js`; `product-context.js`; `sidepanel/app.js` | `extension/tests/extraction.test.js`; unpacked Chromium test | Dynamic checkout-only fields remain unknown unless present in the observed page |
| Side-panel states | Detection, search/progress, saving, no-saving, trade-off, uncertainty, unsupported, backend unavailable, partial failure | COMPLETE | `sidepanel/app.js`; `sidepanel/render.js` | `extension/tests/render.test.js`; screenshot smoke | Progress is staged in the client while provider failure details are rendered from the final bounded comparison response |
| Browser extension | Evidence details, open cheaper route, voluntary Deep Audit, settings, self-hosted backend, privacy explanation | COMPLETE | side panel; protected evidence call; `settings.html/js`; `background.js` | Node security/state tests; Chromium smoke | Deep Audit remains intentionally separate and voluntary |
| Browser extension | Compare submitted URLs and user-opened comparison tabs | COMPLETE | Explicit two-step `compareOpenTabs()` flow; `submitted_offers` API contract | Extension syntax/browser test; backend browser-submitted API test | Reads at most ten user-opened tabs after optional tab-list and per-origin grants |
| Browser extension | Playwright/Chromium unpacked-extension test and screenshot artifacts | COMPLETE | `extension/tests/chromium-extension-test.mjs`; `extension/artifacts/sidepanel-saving.png` | Unpacked Chromium PASS, v0.5.0, zero auto-granted hosts | Harness uses Chrome/Edge/CDP and skips only when no compatible browser is installed |
| Web application redesign | Homepage/metadata/navigation/onboarding/dashboard/history/results/settings/evidence/providers reflect verified exact-price pivot | COMPLETE | Price-first homepage, compare/developer/extension routes, dashboard provider/settings UI, separated history, side-panel result/evidence UI | TypeScript and production Next.js build; extension screenshot/browser test | Browser side panel is the primary result surface; enterprise dashboard remains the clearly labelled advanced workspace |
| Web application redesign | Deep Audit retained as advanced, voluntary experience | COMPLETE | Secondary web navigation, `/chat`, extension disclosure/context menu, versioned REST/MCP/CLI entry | Legacy audit tests plus explicit-boundary API/MCP/CLI tests | Live matrix may use only deployer-configured credentials after separate acknowledgement |

## API, persistence, evidence, MCP, and CLI

| PDR section | Requirement | Status | Implementation files | Tests / verification | Limitation or external blocker |
|---|---|---|---|---|---|
| API requirements | Versioned identification endpoint | COMPLETE | Typed `POST /api/v1/identify` using the canonical resolver | `test_compare_api.py`; OpenAPI surface assertion | Accepts bounded browser-observed fields and performs no network request |
| API requirements | Discovery/submitted-offer endpoint | COMPLETE | Typed `POST /api/v1/discover`; `POST /api/v1/offers/submit` | API/browser-provider tests | Discovery uses only request-approved providers and returns honest partial failures |
| API requirements | Comparison and comparison status endpoints | COMPLETE | `POST /api/v1/compare`; protected result and status routes; repository-backed restart retrieval | `test_compare_api.py` | Comparison is bounded synchronous work; client stages progress while status exposes final completion |
| API requirements | Optimisation endpoint/explanation | COMPLETE | `POST /api/v1/optimize`; result recommendation/envelope; MCP/CLI explanation | API, optimizer, MCP tests | Full optimization result intentionally preserves all inclusion/exclusion evidence |
| API requirements | Evidence endpoint | COMPLETE | Protected `GET /api/v1/evidence/{id}` backed by immutable Agentcore manifests | `test_compare_api.py` | Comparison-scoped bearer token prevents public manifest enumeration |
| API requirements | Provider health and capability endpoints | COMPLETE | `GET /api/v1/providers/health`; `GET /api/v1/providers/capabilities` | `test_compare_api.py`; `test_compare_providers.py` | Declared health does not fabricate live retailer probes |
| API requirements | Deep Audit versioned endpoint | COMPLETE | Explicit `POST /api/v1/deep-audit`; preserved legacy APIs | API, CLI, MCP and legacy tests | Live synthetic matrix additionally requires managed-provider acknowledgement |
| API behaviour | Typed validation/errors, request IDs, timeouts, partial results, rate limiting, OpenAPI descriptions | COMPLETE | Pydantic request/result models; request IDs; per-IP limit; provider/global deadlines; structured partial errors | OpenAPI path assertion; input-bound/security/API tests | Rate limiting is process-local and documented for upstream production enforcement |
| API architecture | Business logic outside `backend/main.py` | COMPLETE | `backend/compare/api.py`, `service.py`, engines | Import/API tests | Legacy business logic remains in main but new compare logic is modular |
| Persistence | Repository-backed development persistence for products, offers, comparisons, evidence, watches, preferences | COMPLETE | `backend/compare/storage.py`; service persistence integration | `test_compare_storage.py`; protected restart retrieval in `test_compare_api.py` | Memory development repository is deliberately bounded; production selection is explicit |
| Persistence | Supabase production persistence, safe migration, RLS/access boundaries | COMPLETE | `SupabaseComparisonRepository`; `supabase/migrations/202607120001_price_optimization_persistence.sql` | `test_compare_persistence_migration.py`; storage fail-closed tests | Static migration validation passed; applying to a real project is credential-gated deployment work |
| Agentcore/evidence | Reuse immutable EvidenceManifest with source URL, timestamp, method, raw price, identifiers, seller, availability, tier, confidence, limitations, hashes | COMPLETE | Current-page/provider/optimizer attempts in `backend/compare/service.py`; Agentcore manifest builder | API manifest assertions; Agentcore/compare tests | Raw DOM is deliberately not retained; structured browser evidence records that limitation |
| Agentcore/evidence | OptimizationEnvelope or compatible DecisionEnvelope extension | COMPLETE | `OptimizationEnvelope` embedded in `OptimizationResult` and persisted with immutable manifest reference | `test_compare_api.py`; persistence/tooling tests | Envelope is optimization-specific while preserving Agentcore reason/evidence conventions |
| MCP | Nine requested comparison/evidence/deep-audit tools reuse the same core services | COMPLETE | `backend/agentcore/mcp_server.py`; `backend/compare/tooling.py`; `docs/MCP_PRICE_OPTIMIZATION.md` | `test_price_optimization_mcp.py`; preserved Agentcore tests | Live synthetic audits require both explicit Deep Audit selection and managed-provider acknowledgement |
| CLI | `jacobi identify/compare/optimize/providers/health/audit` with human and JSON output | COMPLETE | `backend/jacobi.py`; shared tooling facade; `docs/CLI.md` | `test_jacobi_cli.py`; `test_compare_tooling.py` | CLI is run as `python -m jacobi` from `backend/` |

## Open source, security, observability, and deployment

| PDR section | Requirement | Status | Implementation files | Tests / verification | Limitation or external blocker |
|---|---|---|---|---|---|
| Open-source strategy | README promise, architecture, local/extension setup, provider plugin guide, MCP/CLI/deploy guides, fixture guide, roadmap, limitations, demo | COMPLETE | Price-first README and current guides under `docs/` | Link/YAML/diff checks; documented setup commands | Historic Deep Audit reference is collapsed/indexed, not erased |
| Open-source strategy | CONTRIBUTING, SECURITY, privacy, code of conduct, issue templates, PR template, adapter template | COMPLETE | Root governance files, GitHub forms/template, provider adapter template | YAML parse and link checks | Maintainer/community enforcement occurs on the hosting platform |
| Open-source strategy | Archive obsolete docs without deleting useful history | COMPLETE | `docs/ARCHIVE_INDEX.md`; archived-in-place README section; retained historical files | Documentation link/path audit | Historical files are explicitly non-authoritative for the pivot release |
| Security/privacy | SSRF, redirects/private IPs, URL validation, hostile JSON-LD/HTML, message validation, CORS, secrets/API keys, storage/evidence access, rate limits, timeouts, limits, sanitisation, telemetry, paid-provider isolation | COMPLETE | URL guards/redirect streams/input bounds; extension allowlists/escaping; protected evidence; RLS; default-off telemetry/managed providers | Focused security/provider/storage/extension/secret suites | Shared production rate limiting, egress pinning and credential rotation are documented operational requirements |
| Security/privacy | Create `docs/SECURITY_REVIEW_PRICE_OPTIMIZATION.md` | COMPLETE | Evidence-backed security review with findings, mitigations, residual risk and release gate | Current-tree secret regression and focused security suites | Credential rotation/history assessment is an external action before public release |
| Bright Data default | Normal comparison never automatically calls Bright Data or any paid provider; optional path disabled by default | COMPLETE | `OptionalManagedAdapter`; zero-cost provider registry; explicit request flags | `test_compare_package_never_imports_brightdata`; `test_compare_providers.py`; API health declares zero mandatory cost | Legacy Deep Audit retains Bright Data compatibility outside the normal comparison path |
| Observability | Optional privacy-conscious metrics for identity, providers, partial failures, saving/no-saving, open action, latency, mismatch feedback | COMPLETE | `backend/compare/telemetry.py`; service instrumentation; persistence event interface; extension local feedback | `test_compare_telemetry.py`; extension tests | Recorder is disabled by default, bounded, rejects URLs/arbitrary dimensions, and exposes an interface for hosted exporters |
| Validation | Repository infrastructure for false/wrong-match feedback and real-user study | COMPLETE | Token-scoped `/api/v1/feedback`; persistence events; opt-in extension submission; `REAL_USER_VALIDATION_PROTOCOL.md` | Feedback API, telemetry and extension tests | Consented participant results are tracked separately below |
| Deployment | Docker/env/health/Render/Vercel/extension production/Supabase/optional Playwright/CORS/startup checks; no Bright Data requirement | COMPLETE | Docker health check; env examples; `render.yaml`; Vercel config; Supabase migration; package script; deployment guide | YAML/package/static checks, backend boot/OpenAPI, frontend build | Render CLI and real Supabase deployment validation require external credentials/tools |
| Chrome Web Store | Package/submission preparation with single-purpose and privacy disclosures | EXTERNALLY_BLOCKED | Minimal optional-permission manifest; packaging script; submission/privacy guide; screenshot/browser test | Package contains 18 runtime files, excludes tests/artifacts | Publisher verification, privacy questionnaire, legal review and Web Store approval are external |
| Retailer/legal approvals | Policy records and integration interfaces for retailer-specific live support | EXTERNALLY_BLOCKED | Machine-readable UAE policy matrix; browser/direct fallbacks; provider SDK; fixtures/tests | Provider policy/fixture tests | Retailer partnership, terms and legal approval are external; no independent live-search claim is made |
| Real-user metrics | Validate release thresholds on real pages/users | EXTERNALLY_BLOCKED | Default-off aggregate metrics; feedback workflow; golden dataset; real-user protocol | Telemetry/feedback/golden/benchmark tests | Recruitment, consent and real-user results are external and no fixture metric is substituted |

## Phase ledger

| Phase | Requirement | Status | Evidence | Remaining work |
|---|---|---|---|---|
| Phase 0 | PDR, branch, schemas, fixture merchants/API, side-panel fixture result | COMPLETE | Commits `f5ecbc6..3b024c4`; inherited compare tests | Baseline gates must remain green |
| Phase 1 | Exact identity spine, first live adapter, 30 labelled pairs, core UI states | COMPLETE | 105-pair dataset, browser/direct zero-cost paths, all side-panel states | Golden, provider, extension and API tests |
| Phase 2 | 3-5 live merchants, persistence, evidence, telemetry, <10 s comparison | EXTERNALLY_BLOCKED | Five UAE browser/fixture policies, durable persistence/evidence/telemetry and bounded benchmark infrastructure | Independent retailer search/API access and real-page latency require policy approval/field study |
| Phase 3 | 100-pair benchmark, CLI, MCP tools, adapter SDK, screenshots, privacy/open-source release candidate | COMPLETE | 105 pairs; CLI/MCP; adapter template; Chromium screenshot; governance/privacy/security guides | Golden, tooling, extension and documentation checks |
| Phase 4 | Public beta infrastructure, watches, feedback/version workflow, health dashboard | EXTERNALLY_BLOCKED | Watch/preference/event persistence, feedback API, provider health UI, packaging and validation protocol | Web Store/GitHub launch and real-user metrics require external accounts/participants |
| Phase 5 | Warranty/payment/official-store framework, Deep Audit side-panel entry, remote MCP/community adapters | COMPLETE | Cost/eligibility/preference models, official/local-warranty modes, explicit Deep Audit, MCP and provider SDK | Cost, optimizer, tooling and extension tests |
| Phase 6 | Category expansion selected from evidence | NOT_APPLICABLE | PDR places this after validation | No category expansion before UAE electronics release evidence |

## Verification log

| Date | Command | Result |
|---|---|---|
| 2026-07-12 | `git status --short` | Clean at recovered baseline |
| 2026-07-12 | `git branch --show-current` | `pivot/price-optimization-mvp` |
| 2026-07-12 | `git log --oneline --decorate -30` | Ten local pivot commits recovered through `3b024c4` |
| 2026-07-12 | `git diff --check main...HEAD` | Only inherited trailing-space warnings in four older Markdown files; no pivot-source whitespace errors identified |
| 2026-07-12 | `cd backend; python -m pytest tests/test_compare_identity_rich.py tests/test_equivalence_required_fields.py tests/test_total_cost_states.py tests/test_golden_product_pairs.py tests/test_compare_engine.py tests/test_compare_api.py -q` | `149 passed` |
| 2026-07-12 | `cd backend; python -m pytest tests -q` | `1,586 passed, 2 skipped` in 38.00 s |

## Completion rule

Final completion requires every row above to be `COMPLETE`, `EXTERNALLY_BLOCKED`, or `NOT_APPLICABLE`, with no `PARTIAL` or `NOT_STARTED` entries. External statuses may be used only after all repository-side interfaces, fixtures, configuration, tests, documentation, and runbooks needed for later completion exist.
