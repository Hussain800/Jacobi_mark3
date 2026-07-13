# Travel provider and page-adapter policy

The normative machine-readable ledger is
`backend/travel/providers/policy_ledger.json`. The API derives future-provider
disabled states from that file, and `scripts/validate_travel_policy.py` rejects
missing fields, ambiguous approval states, persisted raw payloads, or any source
that permits monetization data to influence ranking.

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

## Planned providers remain disabled

Booking.com Demand API, Expedia Rapid API and Skyscanner Travel APIs are
`not_implemented`, `disabled` and `blocked_external` in the ledger. Their public
provider-health rows carry those states rather than presenting a fake descriptor
or a generic `live` label. No network origin, credential field or redirect is
enabled for them. Enabling one requires executed partner approval, reviewed
fixed origins, credentials, retention terms, contract fixtures, revalidation
coverage, and explicit redirect/monetization permission.

Their Booking.com, Expedia and Skyscanner production page adapters are separate
ledger rows and are also `not_implemented`, `disabled` and `blocked_external`.
Provider approval does not automatically approve page extraction or host access.

Commission, revenue share, bids and sponsored placement are forbidden ranking
inputs for every source, including future commercial providers. Compensation
may be disclosed after ranking only when an executed agreement permits it.

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
