# Chrome Web Store submission preparation

Repository packaging is deterministic and reviewable. Chrome Web Store publisher verification, policy/legal approval, listing completion, and store review remain external.

## Single purpose

Jacobi locally extracts a bounded travel intent from an explicitly supported flight or hotel page, submits only that structured intent according to the selected privacy mode, and shows independently queried results in a side panel. It does not book, pay, store traveller credentials, bypass access controls, or launch Deep Audit automatically. Legacy active-page retail comparison and explicitly selected Deep Audit remain secondary compatibility paths.

## Permission explanation

- `activeTab`: read the page on which the user invokes Jacobi.
- `scripting`: inject the bounded local extractor after user invocation or scoped automatic-mode consent.
- `sidePanel`: show progressive travel results beside the source page.
- `storage`: keep settings and short-lived search references.
- `contextMenus`: expose the separately labelled Deep Audit action.
- optional `tabs`: requested only for the legacy Open tabs action.
- optional host origins: generated from one operator-supplied API origin and an explicit reviewed supported-site list.

The release packager rejects `<all_urls>`, wildcard hosts, credentials, paths, queries, fragments, and non-loopback HTTP origins. Chrome host permissions are host-scoped rather than port-scoped: a loopback API such as `http://127.0.0.1:8000` remains the configured API base, while its manifest permission is `http://127.0.0.1/*`.

## Deterministic package

Supply the exact reviewed origins; there are no production defaults:

```powershell
./scripts/test-package-extension.ps1

./scripts/package-extension.ps1 `
  -ApiOrigin "https://api.example.com" `
  -SupportedSiteOrigin @(
    "https://flights.example.com",
    "https://hotels.example.com"
  ) `
  -Output "dist/jacobi-extension.zip"
```

The packager:

1. copies only the explicit reviewed MV3 file allowlist;
2. normalizes packaged text to UTF-8 without BOM and LF line endings;
3. injects the API default into packaged `shared/config.js`;
4. injects supported-site patterns into packaged config and combines them with the API host in `optional_host_permissions`;
5. parses and validates the generated MV3 manifest and its referenced files;
6. sorts ZIP entries and fixes their timestamp to `1980-01-01T00:00:00`;
7. prints the final SHA-256 digest and reviewed origins.

Identical inputs must produce byte-identical archives. The package test proves determinism, origin injection, exact file count, fixed timestamps, and negative rejection of path-bearing, wildcard, and insecure public origins.

Inspect the output before submission:

```powershell
Expand-Archive dist/jacobi-extension.zip dist/jacobi-extension-inspect
Get-Content dist/jacobi-extension-inspect/manifest.json
Get-Content dist/jacobi-extension-inspect/shared/config.js
Get-ChildItem dist/jacobi-extension-inspect -Recurse
Get-FileHash dist/jacobi-extension.zip -Algorithm SHA256
```

The archive excludes tests, screenshots, artifacts, repository documentation, environment files, and any file not in the reviewed allowlist. Run the extension Node and Chromium gates, scan the archive, inspect every permission, and test the packed extension against the intended API and supported sites before submission.

## CI gate

`.github/workflows/travel-quality.yml` runs on the stacked travel branch, its expected PR bases, and manual dispatch. It independently gates backend travel plus CLI/MCP, the frontend production build, extension Node tests, deployment/migration validation, deterministic Windows packaging, and an installed-Chrome MV3 test under Xvfb. CI packages use reserved `.invalid` origins and are review artifacts only, never production releases.

## External steps

Store listing copy, final screenshots, privacy questionnaire, developer identity verification, supported-site policy approval, production API/origin selection, and Web Store review must be completed in the publisher account. Repository validation never implies approval or production readiness.
