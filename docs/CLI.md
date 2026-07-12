# Jacobi CLI

The CLI exposes product identity, comparison, optimization, provider metadata,
health, and the optional Deep Audit. It uses the same deterministic core and
`ComparisonService` as REST and MCP.

## Run locally

From `backend/`:

```powershell
python -m jacobi --help
```

For a shell-level `jacobi` command, define an alias that keeps the backend on
the Python import path:

```powershell
function jacobi { python -m jacobi @args }
```

Every command supports human output by default and JSON with `--json`.

## Identify

Resolve fields supplied on the command line:

```powershell
python -m jacobi identify `
  --title "Sony WH-1000XM6 Wireless Headphones - Black" `
  --brand Sony `
  --mpn WH-1000XM6/B
```

Or read a JSON object from a file or standard input:

```powershell
python -m jacobi identify --input product.json --json
Get-Content product.json | python -m jacobi identify --input - --json
```

Supported flags include brand, family, model, MPN, GTIN, SKU, storage, memory,
generation, processor, screen size, year, region, colour, connectivity, and
warranty region.

## Compare and optimize

Create `comparison.json` using the REST `ComparisonRequest` shape:

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

Run the full comparison:

```powershell
python -m jacobi compare --input comparison.json
python -m jacobi compare --input comparison.json --json
```

Return the cheapest-route decision and all exclusions:

```powershell
python -m jacobi optimize --input comparison.json
python -m jacobi optimize --input comparison.json --json
```

The fixture flag is only for deterministic local demonstrations. A normal
comparison does not activate fixtures. For real zero-cost browser-assisted
comparison, supply extension/open-tab observations in `submitted_offers`.
Direct public HTTP is explicit: supply `comparison_urls` and set
`allow_direct_http` to true. Unknown costs and provider failures remain visible.

## Providers and health

Provider metadata is descriptive and does not invoke a provider:

```powershell
python -m jacobi providers
python -m jacobi providers --json
python -m jacobi health
```

The output distinguishes fixtures from live browser/direct-HTTP capabilities,
shows which providers require explicit invocation, and reports the mandatory
collection cost as zero.

## Deep Audit

Deep Audit preserves the original price-context workflow and is separate from
normal comparison. The acknowledgement flag is mandatory:

```powershell
python -m jacobi audit --demo fee_drift --confirm-explicit
python -m jacobi audit --url https://example.com/product `
  --displayed-total 1699 --currency AED --tier free `
  --confirm-explicit --allow-managed-provider --json
```

Without `--confirm-explicit`, the command exits with code 2 and does no audit.
Fixture demos are hermetic and cost zero. A live 24-profile (`free`) or
50-profile (`pro`) synthetic audit additionally requires
`--allow-managed-provider`, because the preserved engine may use credentials
configured by the deployer. Omitting either flag makes no live or paid-provider
call. Normal compare and optimize commands never invoke this path.

## Exit status

- `0`: command completed
- `2`: invalid input, validation failure, or Deep Audit not explicitly enabled

Errors go to standard error. With `--json`, errors are JSON objects.

## Verification

```powershell
cd backend
python -m pytest -q tests/test_compare_tooling.py tests/test_jacobi_cli.py
```
