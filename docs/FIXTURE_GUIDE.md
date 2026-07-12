# Fixture Guide

Fixtures make matching, totals, provider isolation, and the extension reproducible without retailer availability or paid services.

## Fixture locations

- `backend/compare/fixtures/*.json`: deterministic merchant offer catalogues.
- `backend/tests/fixtures/golden_product_pairs.jsonl`: labelled identity/equivalence pairs.
- `backend/agentcore/fixtures/*.html`: legacy Agentcore evidence fixtures.
- `extension/tests/fixture-product.html`: browser extraction and side-panel fixture.

Fixture observations must set `fixture=true`, use synthetic or approved captured data, and state that they are not live. Do not use a retailer trademark or URL to imply current availability.

## Adding an offer fixture

1. Use a stable product with deterministic GTIN, MPN, or model.
2. Record every known field and leave every unobserved field unknown.
3. Represent all money as strings with currency.
4. Include condition, stock, seller type, warranty, delivery, and timestamp where the source supports them.
5. Add a failure or mismatch fixture beside the happy path.
6. Add focused tests for extraction, equivalence, total completeness, and ranking.

## Golden pair labels

Use exactly:

- `EXACT_EQUIVALENT`;
- `EQUIVALENT_WITH_DISCLOSED_TRADEOFF`;
- `SIMILAR_NOT_EQUIVALENT`;
- `REJECTED`.

The dataset should retain coverage for wrong models and generations, storage and RAM differences, regional variants, refurbished/new, bundles, accessory-only listings, misleading titles, marketplace sellers, colour trade-offs, and warranty differences.

## Sanitizing captured pages

Before committing an HTML fixture:

- remove account names, addresses, cookies, tokens, session IDs, analytics IDs, and unrelated recommendations;
- remove scripts and remote resources unless a parser test specifically requires safe inert text;
- truncate to the minimum DOM/metadata needed for the test;
- replace tracking URLs and personal identifiers;
- document capture date and intended parser behavior in the test or fixture header;
- confirm redistribution is permitted.

Never commit a CAPTCHA challenge response for bypass development, authenticated page, checkout session, payment data, or secret-bearing request/response.

## Verification

```powershell
cd backend
python -m pytest tests/test_compare_identity.py tests/test_compare_equivalence.py tests/test_compare_golden_dataset.py -q
python -m pytest tests/test_compare_providers.py tests/test_compare_discovery.py -q

cd ..
node --test extension/tests/*.test.js
```

Live retailer tests, when performed manually, are validation evidence only and must not become CI dependencies.
