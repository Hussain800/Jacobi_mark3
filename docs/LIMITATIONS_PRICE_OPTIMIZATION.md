# Price Optimization Limitations

Jacobi is an in-progress open-source price-optimization implementation. A result is evidence at an observation time, not a guarantee of checkout price, availability, delivery, warranty acceptance, or seller performance.

## Provider coverage

- Fixture catalogues for Amazon UAE, Noon, Sharaf DG, and Sony are deterministic test/demo data, not live support.
- Browser extraction includes hints for Amazon UAE, Noon, Sharaf DG, and Jumbo, but selectors may change and fields are not independently verified by the backend.
- Direct HTTP works only for explicit public URLs with usable JSON-LD or Open Graph fields. It does not execute JavaScript, log in, solve CAPTCHAs, evade controls, or discover the web automatically.
- No production-certified merchant search, official API/feed, local-Playwright comparison, or paid managed comparison adapter is registered.
- No retailer partnership or policy approval is implied.

## Comparison completeness

- Shipping, tax, duty, payment fees, membership eligibility, warranty, returns, delivery, and stock can remain unknown.
- An incomplete total cannot produce the headline saving.
- Currency conversion is not a ranking path without an explicit reliable FX assumption.
- Cross-border landed cost is not production-ready.
- Coupons, student/membership prices, and cashback remain conditional unless eligibility and immediacy are known.

## Matching and ranking

- Deterministic rules reduce false matches but cannot guarantee identity when source identifiers are missing or wrong.
- Exactness thresholds are validated against synthetic/labelled fixtures, not yet against the PDR's required real-user study.
- Colour, warranty, bundles, marketplace seller, and condition can move an offer into trade-off/similar groups.
- Seller legitimacy, returns, delivery, and route legality are not a substitute for user due diligence.
- Historical prices and future price prediction are not implemented.

## Runtime and persistence

- The default memory repository is process-local, bounded, and non-durable.
- Supabase migration validation is static until applied and exercised against a real project.
- Comparison rate limits are per process. Multi-instance deployments need an upstream/shared limit.
- Progressive provider errors are represented, but the current comparison request returns a completed result rather than a durable asynchronous job stream.
- Cache infrastructure and distributed cancellation are not production implemented.

## Product surfaces

- The unpacked extension is implemented and tested against local fixtures; Chrome Web Store approval is not complete.
- Browser automation tests depend on an installed compatible Chromium/Chrome/Edge and may skip otherwise.
- Several legacy web dashboard pages still describe the original audit product. The comparison landing and demo are newer than all retained enterprise/history surfaces.
- Deep Audit remains the legacy route and may require optional provider credentials. It is deliberately slower and is never part of normal comparison.
- MCP and CLI capability should be judged from the current commands/tools, not the PDR wishlist; consult their dedicated guides and schemas when present.

## Validation blockers

The repository cannot complete:

- Chrome Web Store review;
- retailer partnership or terms approval;
- legal/privacy approval for a specific hosted deployment;
- production credentials and live Supabase validation;
- real-user metrics, false-match rate, savings frequency, click-through, or retention;
- sustained live-retailer latency/availability benchmarks.

Interfaces, fixtures, tests, feedback hooks, and runbooks can prepare for those activities, but results must be measured externally and reported without extrapolation.
