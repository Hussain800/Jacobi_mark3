# Jacobi Chrome extension

Load this directory with **Chrome → Extensions → Developer mode → Load unpacked**.

The default travel flow supports two versioned local demo pages:

- `http://127.0.0.1:<port>/fixture-flight-v1.html` with adapter `flight-demo-v1`;
- `http://127.0.0.1:<port>/fixture-hotel-v1.html` with adapter `hotel-demo-v1`.

These are fixture-only adapters, not claims of production-site support. Their host access is optional and limited in the manifest to `localhost` and `127.0.0.1`; there is no `<all_urls>`, `http://*/*`, or `https://*/*` declaration. A production self-hosted API outside those predeclared origins requires a separately reviewed manifest build with that exact API origin.

Privacy Mode is the default. The page is parsed locally and the sanitized typed intent is sent only after **Search independently** is clicked. Automatic Savings Mode requires the explicit consent checkbox plus scoped API/demo-origin permission. Automatic detection never opens the side panel. Neither mode sends raw HTML, a complete page URL, passenger/guest identity, booking/session tokens, credentials, or payment data.

Travel searches use material-only SHA-256 fingerprints as idempotency keys. Progressive status first uses capability-header-authenticated SSE with `Last-Event-ID`, then bounded polling if streaming is unavailable. Supplier navigation is never taken from an offer payload: a flight offer is revalidated and the server must issue a short-lived validated redirect. Changed, unavailable, unsupported, or stale offers remain blocked. The initial hotel provider does not prove equivalent price revalidation, so hotel redirects are truthfully unavailable.

Fixture, sandbox API, live official API, browser-observed, direct-public, and managed-provider labels remain separate. A generic `live` label is rendered as unverified.

The legacy active-page retail `/api/v1/compare`, popup, and explicit 60–100 second Deep Audit path remain available when the active page is not a supported travel demo. The older cross-origin **Open tabs** fallback stays visible for compatibility, but this narrow-permission build cannot grant arbitrary retailer origins; only predeclared local origins can be injected. Supporting a reviewed retailer group requires adding those exact origins to a future manifest build.

Run deterministic checks from the repository root:

```powershell
node --test extension/tests/*.test.js
node extension/tests/chromium-extension-test.mjs
```

The Chromium harness loads the unpacked MV3 extension, verifies the retail compatibility panel plus both versioned travel fixtures, and writes retail, flight, and hotel screenshots under `extension/artifacts/`. It skips cleanly when compatible Chrome, Edge, or Playwright Chromium is unavailable.
