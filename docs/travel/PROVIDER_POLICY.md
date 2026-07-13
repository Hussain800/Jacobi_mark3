# Travel provider and page-adapter policy

Production approval is a policy and credential decision external to this
repository. A provider being technically configured does not imply inventory
completeness, permission to redistribute results or permission to monetize a
redirect.

| Source | Access method | Environment label | Fields retained | Cache/retention boundary | Production/monetization status |
|---|---|---|---|---|---|
| Amadeus Self-Service | fixed official OAuth/API origins | `sandbox_api` or `live_official_api` | normalized itinerary/property, fare/rate, disclosed taxes, baggage/policy facts, availability and sanitized errors | normalized bounded records only; no OAuth token or raw response persistence | sandbox supported when credentials exist; production approval and commercial terms remain external |
| Current supported page | local extension extraction | `browser_observed` | sanitized intent and visible baseline facts | no raw HTML, complete URL, session token, traveller identity or payment data | baseline evidence only; never counted as independent search |
| Versioned local demo pages | extension fixture adapter | `fixture` | synthetic flight/hotel intent fields | repository fixtures only | development/demo only |
| Bright Data legacy Deep Audit | explicit managed provider | `managed_provider` | preserved legacy audit evidence rules | governed by the legacy evidence retention configuration | optional and never required or automatically invoked by travel search |

## Amadeus Self-Service

- Test origin: `https://test.api.amadeus.com`.
- Production origin: `https://api.amadeus.com`.
- Credentials stay server-side in `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET`.
- `AMADEUS_ENVIRONMENT=production` is rejected unless `AMADEUS_PRODUCTION_APPROVED=1`.
- Missing credentials disable the provider and expose `unconfigured`; they do not silently create fixture or generic `live` evidence.
- Flight Offers Price is required for fresh flight revalidation.
- The initial hotel path cannot claim verified savings without equivalent price revalidation and complete mandatory fees.
- Amadeus inventory is not exhaustive. Sandbox inventory is synthetic or limited.
- Deep-link and affiliate permission are not inferred from API access. Affiliate data never enters ranking.

## Browser and extension adapters

- Support is allowlist- and version-based; public accessibility is not scraping permission.
- The open page supplies baseline evidence only. Independent supply must come from a separately labelled provider.
- No adapter may collect passenger/guest names, passport/document data, credentials, payment data, raw HTML or full browsing history.
- A new production domain needs exact host permissions, sanitized fixtures, extraction tests, policy review date, retention rules and redirect approval.

## Review checklist

Before changing a provider or adapter to production-supported, record:

1. official access method and fixed origins;
2. policy review owner/date and provider approval;
3. collected and deliberately excluded fields;
4. cache and retention limits;
5. rate limits, deadlines and normalized failure behavior;
6. price/revalidation and mandatory-fee coverage;
7. redirect and monetization permission;
8. sanitized happy/failure fixtures and contract results.

