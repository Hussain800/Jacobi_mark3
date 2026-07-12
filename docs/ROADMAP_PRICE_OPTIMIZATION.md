# Price Optimization Roadmap

The [PDR implementation ledger](PDR_IMPLEMENTATION_STATUS.md) is the requirement-level source of truth. This roadmap describes product sequence without converting plans into support claims.

## Foundation delivered in the branch

- deterministic electronics identity with provenance, confidence, aliases, contradictions, and unknowns;
- labelled 100+ pair golden dataset;
- four-class equivalence engine with hard mismatch rejection;
- Decimal-safe, uncertainty-preserving totals;
- filter-first ranking and evidence-backed result contracts;
- fixture, browser-submitted, and explicit direct-HTTP provider lanes;
- provider capability/health surfaces and failure isolation;
- comparison persistence interface and Supabase migration;
- Manifest V3 side panel and local fixture tests;
- legacy Deep Audit preserved separately.

## Next engineering priorities

1. Resolve all release security findings, especially tracked credential exposure.
2. Finish stable REST, MCP, and CLI parity around the same core service.
3. Validate the migration and RLS against a real Supabase test project.
4. Build a policy-reviewed, zero-cost merchant-search or official-feed adapter with approved fixtures.
5. Add a local-Playwright comparison provider only for pages where browser rendering is lawful and necessary.
6. Complete history/settings/evidence provider UX without reviving the legacy audit as the primary consumer flow.
7. Add durable jobs, cancellation, cache, shared rate limits, and production metrics where scale justifies them.
8. Benchmark identity, totals, and latency with reproducible scripts.

## Public beta gates

- no unresolved secret or severe security finding;
- >=97% exact-match precision on labelled data and measured real-page validation;
- false headline-saving rate below 2% in external testing;
- at least one genuine zero-cost live source with documented policy basis;
- three repeatable demo products;
- packed extension permission/privacy review;
- complete deployment, rollback, retention, and deletion runbooks;
- Chrome Web Store submission and external approvals.

## Differentiation after beta

- cross-border landed cost and warranty-region rules;
- verified public membership/student routes and payment-fee modelling;
- official manufacturer integration framework;
- watchlists, revalidation, and historical observations;
- remote MCP deployment;
- community adapters and country modules;
- optional multi-output Deep Audit for price, fees, stock, delivery, and ranking sensitivity.

Do not expand categories until exact identity, meaningful savings, source access, and user demand are measured for the next vertical.
