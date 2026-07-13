# MCP price optimization

Jacobi's stdio MCP server exposes price optimization and the preserved legacy
Agentcore tools from one process. Price optimization uses the same
`ComparisonService` as REST. It does not execute purchases.

## Start the server

Install backend dependencies, then run from `backend/`:

```powershell
python -m agentcore.mcp_server
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "jacobi": {
      "command": "python",
      "args": ["-m", "agentcore.mcp_server"],
      "cwd": "C:\\path\\to\\Jacobi_mark3\\backend"
    }
  }
}
```

The price tools accept JSON objects as strings where the shape is nested. This
keeps the MCP schema compatible across clients while preserving the Pydantic
validation used by REST.

## Price tool catalog

| Tool | Purpose | Network behavior |
| --- | --- | --- |
| `identify_product` | Resolve identifiers, variants, provenance, contradictions, confidence, and unknowns | None |
| `discover_offers` | Return offers and partial provider failures from a comparison request | Request-controlled providers only |
| `compare_offers` | Return the complete typed optimization result | Request-controlled providers only |
| `find_cheapest_route` | Return the recommendation, best route, and every excluded offer | Request-controlled providers only |
| `verify_offer_equivalence` | Classify one observed candidate field by field | None |
| `calculate_total_cost` | Calculate a Decimal-safe payable total and preserve unknown/estimated components | None |
| `explain_optimization` | Explain a stored comparison | None; access token required |
| `fetch_evidence_manifest` | Fetch immutable comparison evidence | None; access token required |
| `deep_audit_price` | Run a fixture audit or the optional legacy 24/50-profile audit | Only when explicitly enabled |

The legacy `health_check`, `verify_purchase_context`, `compare_total_price`,
`check_platform_policy`, `create_evidence_manifest`, and `explain_decision`
tools remain available for backward compatibility.

## Travel tool catalog

The travel tools reuse `travel.tooling.TravelToolingProtocol`, the same
injectable facade used by the CLI:

| Tool | Purpose | Network behavior |
| --- | --- | --- |
| `parse_travel_intent` | Validate a typed flight/hotel intent and return its fingerprint | None |
| `search_travel` | Search explicitly configured official providers | Configured fixed-origin providers only |
| `get_travel_search_status` | Read a capability-authorized durable search | None |
| `revalidate_travel_offer` | Run official flight price revalidation | The selected offer's configured official provider |
| `explain_travel_search` | Explain offers, provider failures, and limitations | None |
| `fetch_travel_evidence` | Fetch sanitized hashed offer and revalidation evidence | None |

`search_travel` accepts a JSON string containing `vertical`, `intent`, optional
`requested_providers`, and optional provider-specific bounded options. It
returns `search_id` and an unguessable `capability_token`; the other stateful tools
require both. Raw provider payloads and credentials are never returned.

The tooling facade enqueues the same durable job used by REST and workers and
reads results from the Market Graph. In local memory mode, state lasts only for
the current process. Hotel price revalidation is refused because the initial
hotel provider does not expose a guaranteed equivalent price-check contract.
Missing baggage or mandatory hotel fees stay unknown and visible in
evidence/limitations.

## Comparison request

`discover_offers`, `compare_offers`, and `find_cheapest_route` take a
`request_json` string with the REST `ComparisonRequest` shape:

```json
{
  "source_url": "https://www.amazon.ae/dp/B0DEMO123",
  "market": "AE",
  "include_fixture_offers": true,
  "current_offer": {
    "title": "Sony WH-1000XM6 Wireless Headphones - Black",
    "brand": "Sony",
    "mpn": "WH-1000XM6/B",
    "gtin": "4548736158801",
    "price": {"amount": "1699", "currency": "AED"},
    "shipping": {"amount": "0", "currency": "AED"},
    "condition": "new",
    "stock": "in_stock"
  }
}
```

`include_fixture_offers` is a development-only explicit opt-in. Omit it for a
normal request. Real zero-cost observations can be supplied in
`submitted_offers`; explicit public-page URLs require both `comparison_urls`
and `allow_direct_http: true`. The service never upgrades a request to a paid
provider.

Provider failures are isolated and returned in `provider_errors`. An empty or
partial result is not converted into invented offer data.

## Focused tools

`identify_product` accepts observed identity fields:

```json
{"title":"Sony WH-1000XM6 Black","brand":"Sony","mpn":"WH-1000XM6/B"}
```

`verify_offer_equivalence` accepts `current_product_json`,
`candidate_offer_json`, and optional `current_condition`. The candidate must
include an absolute `source_url`, observed price with currency, and any known
identity/variant fields. Its classification is one of:

- `EXACT_EQUIVALENT`
- `EQUIVALENT_WITH_DISCLOSED_TRADEOFF`
- `SIMILAR_NOT_EQUIVALENT`
- `REJECTED`

`calculate_total_cost` accepts a `PriceBreakdown` JSON object. Unknown costs
remain in `unknown_components`; the known subtotal may be present while
`total_complete` remains false.

## Evidence authorization

Comparison creation returns a one-time `comparison_access_token`. Treat it as
a secret capability. Pass it with the `comparison_id` to
`explain_optimization`. Pass it with both `comparison_id` and `manifest_id` to
`fetch_evidence_manifest`. Invalid credentials intentionally return a generic
not-found error to avoid disclosing record existence.

## Deep Audit boundary

`deep_audit_price` is never called by comparison, discovery, or optimization.
The tool returns an error unless `explicit=true`. Deterministic development
tests use `demo="fee_drift"`, which stays in the local Agentcore fixture path.

A live URL selects the preserved synthetic matrix (`tier="free"` for 24
profiles or `tier="pro"` for 50) only when
`allow_managed_provider=true`. This second acknowledgement is required because
the legacy engine may use provider credentials configured by the deployer. No
live audit or managed-provider call occurs when either acknowledgement is
absent. Jacobi never supplies provider credentials.

## Verification

```powershell
cd backend
python -m pytest -q tests/test_compare_tooling.py tests/test_price_optimization_mcp.py
python -m pytest -q tests/travel/test_travel_tooling_surfaces.py
```
