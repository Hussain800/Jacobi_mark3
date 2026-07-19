# Jacobi Travel Price Guardian Implementation Plan

- Status: execution plan following the committed Phase 0 audit
- Branch: `pivot/travel-price-guardian-v1`
- Stacked base: `pivot/price-optimization-mvp`

This plan is executable without reopening product scope. The authoritative PRD and [`IMPLEMENTATION_LEDGER.md`](IMPLEMENTATION_LEDGER.md) control completion. Each milestone ends with focused tests, ledger evidence, a granular commit and a stacked-PR update.

## Engineering invariants

1. One supported open page is sufficient for the normal flight and hotel flows.
2. Travel uses typed `FlightIntent` and `HotelIntent`; retail `ProductIdentity` remains isolated.
3. Exact equivalence, cost completeness, saving class and ranking are deterministic.
4. Unknown mandatory costs never become zero or a verified saving.
5. The baseline page is browser-observed evidence, not independent supply.
6. Fixture, sandbox, browser-observed, direct-public, managed and independently queried production data remain distinct.
7. Revalidation is mandatory before a redirect token can be issued.
8. Affiliate data is attached only after ranking and explicit user click.
9. No checkout, payment, credential automation, CAPTCHA bypass or unrestricted server fetch exists.
10. Legacy Deep Audit and `/api/v1/compare` remain functional but secondary.

## Milestone 0: audit and stacked delivery surface

Deliver:

- repository/dependency/API/database/extension/test/security audit;
- requirement ledger and ADRs;
- stacked branch and draft PR;
- baseline quality-gate record.

Gate:

- audit committed before travel product code;
- branch merge-base equals PR #45 head;
- no uncommitted or unrelated user changes.

## Milestone 1: shared travel domain and persistence contracts

Deliver:

- `backend/travel/domain` typed enums, intents, offers, evidence, errors and results;
- Decimal-safe travel money/cost components and explicit completeness;
- flight/hotel fingerprints and state-transition validation;
- provider protocol/descriptors/registry with fail-closed credential and approval gates;
- memory repository, Postgres/Supabase repository and Redis abstraction;
- additive migration for the travel Market Graph and RLS;
- `/api/v2/travel` skeleton with consistent error/request contracts;
- separate worker entry point and liveness/readiness wiring.

Tests:

- unit and property-based domain tests;
- shared memory/Postgres repository contract tests using a hermetic database path where available;
- static migration/RLS/grant tests;
- configuration fail-closed tests;
- `main.py` assembly smoke and OpenAPI assertions.

## Milestone 2: flight correctness and independently queried supply

Deliver:

- deterministic flight identity/equivalence/reason codes;
- travel costing and lexicographic ranker;
- Amadeus OAuth client with fixed sandbox/production endpoints;
- Flight Offers Search normalization and Flight Offers Price revalidation;
- sanitized provider fixtures for success, partial, auth, rate limit, timeout, malformed, changed, unavailable, missing baggage and duplicate responses;
- Redis-backed idempotent provider jobs, deadlines, retries, leases, rate limits, cancellation and persisted attempts;
- replayable SSE with `Last-Event-ID`;
- capability-scoped result/evidence access;
- revalidation-gated redirect service;
- at least 300 labelled flight pairs and evaluation CLI.

Gate:

- no live calls in default tests;
- Amadeus `sandbox_api` and `live_official_api` labels are selected only from configured environment;
- a verified saving requires exactness, complete mandatory costs, fresh availability and revalidation;
- false exact-match precision meets the PRD dataset gate.

## Milestone 3: flight extension flow

Deliver:

- automatic and privacy modes with explicit onboarding consent;
- narrowly scoped flight-domain host permissions;
- three versioned flight adapters selected by feasibility and fixture stability;
- local validation, sanitization, SPA debounce and intent/idempotency fingerprints;
- automatic search from one open page;
- badge, progressive SSE, exact/trade-off/unknown/degraded/stale states;
- recheck and safe open-route flow;
- deterministic local flight demo and Chromium E2E artifact.

Gate:

- no comparison tab or repeated itinerary entry;
- side panel opens only after user action;
- automatic network submission occurs only after consent;
- adapter fixture and Chromium tests pass.

## Milestone 4: hotels end to end

Deliver:

- canonical hotel property identity and crosswalks;
- room/rate equivalence, mandatory-fee basis and hotel reason codes;
- Amadeus hotel search adapter as the accessible initial hotel provider, with truthful limitations;
- hotel revalidation behavior supported by the provider contract; where the upstream cannot guarantee a price-check endpoint, the route remains conditional or unavailable rather than fabricated;
- at least 300 labelled hotel pairs and evaluation CLI;
- three versioned hotel page adapters;
- one-page hotel extension flow, demo and Chromium E2E.

Gate:

- fuzzy name alone cannot prove property identity;
- refundable/non-refundable, meal, occupancy, room-family, bed, payment-timing and mandatory-fee differences cannot be exact;
- unknown mandatory fees remain visible and block verified savings.

## Milestone 5: trust, shared clients and product pivot

Deliver:

- preferences, supplier trust tiers, deterministic explanations and mismatch feedback;
- travel REST, MCP and CLI surfaces using the same services;
- `jacobi travel eval`, `benchmark`, `providers` and `health` commands;
- default travel homepage, navigation, onboarding, provider/status/settings/history/evidence UI;
- Deep Audit retained as an explicit specialist path;
- provider policy ledger, privacy/retention documentation and real-user validation plan;
- OpenTelemetry-compatible hooks and privacy-conscious metrics, disabled by default.

Gate:

- affiliate metadata has no input to the rank key;
- evidence and limitation labels agree across API, extension, MCP, CLI and frontend;
- telemetry contains no full URLs, provider payloads or personal data.

## Milestone 6: deployment, resilience and release gates

Deliver:

- Docker Compose services for Postgres, Redis, API, worker and frontend;
- separate API/worker commands, migrations, rollback and health/readiness;
- Redis restart/lease-expiry/SSE reconnect/duplicate suppression tests;
- extension packaging and permission/privacy documentation;
- security review, target validation runbooks and final supported-domain/provider matrices;
- updated draft PR body with exact validation, blockers and reproducible demos.

Gate:

- backend, property, provider, migration, MCP, CLI and security tests pass;
- frontend typecheck/build pass;
- extension Node and Chromium tests pass;
- Docker images and Compose validation pass where tooling is available;
- real Supabase RLS, production provider credentials, legal approvals, Web Store review and real-user results remain external until actually performed;
- ledger contains no dishonest `COMPLETE` rows.

## Commit sequence

Expected coherent commits:

```text
docs(travel): audit repository and record architecture decisions
chore(travel): open stacked delivery surface
feat(travel): add typed domain and deterministic state contracts
feat(travel): add market graph persistence and redis job spine
feat(travel-api): add progressive search and capability-scoped SSE
feat(travel-flights): add Amadeus search normalization and revalidation
test(travel-flights): add equivalence corpus and provider contracts
feat(extension): add automatic flight savings mode
feat(travel-hotels): add property/rate comparison and provider flow
test(travel-hotels): add equivalence corpus and extension adapters
feat(travel-tooling): add MCP CLI evaluation and telemetry
feat(frontend): make travel guardian the default product
chore(deploy): add API worker redis postgres compose topology
docs(travel): close verified ledger and release runbooks
```

The exact split may change to keep commits reviewable, but audit, domain, persistence, providers, extension, frontend, deployment and final evidence will not be collapsed into one commit.
