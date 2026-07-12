# Jacobi Chrome extension

Load this directory with **Chrome → Extensions → Developer mode → Load unpacked**. Open a normal product page and click the Jacobi toolbar action to open the side panel.

The extension starts with no retailer or backend host access. `activeTab` permits extraction only from the page on which the user invoked Jacobi. The side panel previews extracted identity and price fields before requesting access to the configured self-hosted API origin. Configure the comparison API and web app from **Settings**.

The normal comparison sends structured fields, the source URL, and field provenance—not raw page HTML. Telemetry is disabled by default. Deep Audit is optional, disclosed as a 60–100 second workflow, and is never started automatically.

**Open tabs** is an explicit two-step fallback for retailers that cannot be collected server-side. The first click requests optional access to the current window's tab list; the second requests only the HTTP(S) origins currently open. Jacobi extracts structured fields from at most ten tabs, discards tabs without a verified price and currency, and submits the remaining observations through the zero-cost browser-assisted provider. Neither permission is granted at installation.

Run deterministic checks from the repository root:

```powershell
node --test extension/tests/*.test.js
node extension/tests/chromium-extension-test.mjs
```

The Chromium test loads the unpacked MV3 extension beside the local fixture page, renders the deterministic saving state, and writes `extension/artifacts/sidepanel-saving.png`. Pure extraction tests validate the same fixture fields without requiring an interactive host-permission prompt. The browser test skips cleanly when a compatible Playwright Chromium, Chrome, or Edge executable is unavailable.
