# Provider Plugin Guide

Jacobi providers collect candidate offers; they do not decide identity, equivalence, totals, or ranking. Those rules remain in the shared comparison core.

## Current capability truth

| Provider | Kind | Cost | Invocation | Status |
|---|---|---:|---|---|
| Fixture stores | `fixture` | zero | `include_fixture_offers=true` | deterministic CI/demo |
| Browser-submitted observations | `browser-assisted` | zero | explicit `submitted_offers` | working for user-observed fields |
| Direct structured metadata | `direct-http` | zero | explicit URLs plus `allow_direct_http=true` | working for public JSON-LD/Open Graph |
| Local Playwright comparison provider | `local-playwright` | zero | none | interface kind only; not implemented in comparison registry |
| Merchant search adapters | `merchant-search` | varies | none | not production implemented |
| Official APIs/feeds | `official-api` | varies | none | not production implemented |
| Optional managed provider | `optional-managed` | paid | deployer construction and opt-in | base class only; disabled and unregistered |

Amazon UAE, Noon, Sharaf DG, and Jumbo have browser DOM selector hints. They do not yet have production-certified live search adapters. Never describe fixture files as live retailer support.

## Contract

Subclass `compare.adapters.base.MerchantAdapter`. Implement `search_offers(product, market)` and declare:

- stable `merchant_id` and human-readable name;
- supported domains and electronics categories;
- provider kind and capabilities;
- zero/paid cost and honest cost estimate;
- evidence tier;
- timeout and retry count;
- known limitations;
- rate-limit policy;
- current health;
- fields actually extracted;
- whether invocation must be explicit;
- whether observations are fixtures.

Start from [the adapter template](templates/provider_adapter.py.example).

## Rules

1. Preserve unknowns. Do not default shipping, tax, duty, currency, condition, warranty, seller, or stock when it was not observed.
2. Return one observation per seller/condition/fulfilment route.
3. Retain the source URL, observation timestamp, extraction confidence, and evidence provenance.
4. Use `Decimal`-compatible strings for money.
5. Let the equivalence and total-cost engines decide eligibility.
6. Bound response size, parsing work, concurrency, redirects, retries, and timeout.
7. Validate every server-fetched URL and redirect through `validate_public_url`.
8. Do not add CAPTCHA bypass, stealth, fingerprint spoofing, credential automation, or checkout automation.
9. Paid providers must derive from `OptionalManagedAdapter`, remain disabled by default, require explicit credentials, and never enter `_register_defaults()`.
10. Tests must be hermetic. Capture approved fixtures; never make CI depend on a retailer.

## Registration

Default registration in `compare/adapters/base.py` is intentionally fixture-only. Production adapters should be registered by explicit deployment configuration or request policy. Do not register a paid adapter as a side effect of import.

## Minimum test matrix

- capability metadata and limitations;
- normal structured listing;
- missing price/currency;
- missing shipping/warranty/condition;
- out of stock and preorder;
- multiple marketplace sellers;
- wrong model/storage/region/condition;
- changed or malformed DOM/JSON-LD;
- interstitial/access-denied response;
- redirect to private IP blocked;
- oversized response blocked;
- timeout and partial failure;
- tracking URL and duplicate seller/variant collapse;
- proof that no paid provider is called by default.

## Production-readiness label

An adapter is production-ready only after its policy basis is reviewed, fixtures cover known failures, field extraction thresholds are measured on real pages, rate limits are documented, and health checks run without fabricating success. Retailer approval and stable live access can remain external blockers; the repository interface and fixtures cannot.
