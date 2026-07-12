# Price Optimization Demo

This demo proves the local product-page-to-side-panel workflow without live retailers or paid services.

## What it demonstrates

- bounded browser extraction of structured product fields;
- identity preview and evidence provenance;
- deterministic fixture discovery;
- exact-equivalence rejection and trade-off separation;
- all-in total completeness;
- saving/already-best/uncertainty/partial-failure UI states;
- token-scoped comparison and evidence retrieval;
- one-click safe route opening.

It does not demonstrate current retailer availability, production merchant search, or Chrome Web Store approval.

## Run

1. Start the backend and configure the extension using [local setup](LOCAL_SETUP_PRICE_OPTIMIZATION.md).
2. Load `extension/tests/fixture-product.html` from a local HTTP server or use the deterministic comparison page in the web app.
3. Click the Jacobi toolbar action to open the side panel.
4. Confirm the model, MPN/GTIN, price, currency, and source labels.
5. Run the fixture comparison and inspect the saving, exact-match explanation, rejected/trade-off offers, freshness, and evidence ID.
6. Use **Open cheaper offer** only on the fixture/demo route.
7. Select **Deep Audit** only to demonstrate the separate legacy workflow and its 60–100 second disclosure.

One simple local fixture host option:

```powershell
cd extension/tests
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/fixture-product.html`.

The extractor recognizes only this named localhost fixture (and the repository's named Sony demo page) as a deterministic demo and explicitly sends `include_fixture_offers=true`. Normal retailer pages never enable fixtures automatically, and the result remains labelled `fixture_mode=true`.

## Automated artifact

```powershell
node --test extension/tests/*.test.js
node extension/tests/chromium-extension-test.mjs
```

The Chromium test writes `extension/artifacts/sidepanel-saving.png` when a compatible browser is available. A skip means browser infrastructure was unavailable, not that extension behavior passed.

## Live zero-cost validation

For a user-approved public product URL:

- prefer the already-open browser page;
- submit a second user-opened tab through `submitted_offers`; or
- explicitly submit a URL with `allow_direct_http=true`.

Expect partial results. Never switch to a paid provider automatically, bypass an interstitial, or call a fixture result “live.” Record the URL, observation time, extraction method, fields, failures, and final checkout discrepancy as validation evidence.
