# Chrome Web Store submission preparation

Repository preparation is complete; Chrome Web Store review and approval remain external.

## Single purpose

Jacobi reads structured product and price fields from pages the user explicitly invokes, sends those fields to the configured comparison backend, and shows evidence-backed purchase routes in a side panel. It does not execute purchases, read browsing history automatically, bypass access controls, or launch Deep Audit automatically.

## Permission explanation

- `activeTab`: read only the page on which the user invokes Jacobi.
- `scripting`: inject the bounded extractor after that explicit invocation.
- `sidePanel`: show comparison results beside the product page.
- `storage`: keep self-hosted settings, recent local actions, and optional local feedback.
- `contextMenus`: expose the separately labelled Deep Audit action.
- optional `tabs`: requested only when the user selects **Open tabs**.
- optional HTTP(S) origins: requested at runtime only for the configured API or open-tab origins.

Telemetry is disabled by default. See [privacy](PRIVACY_PRICE_OPTIMIZATION.md) and the [security review](SECURITY_REVIEW_PRICE_OPTIMIZATION.md).

## Build and inspect

```powershell
.\scripts\package-extension.ps1
Expand-Archive dist\jacobi-extension.zip dist\jacobi-extension-inspect
Get-ChildItem dist\jacobi-extension-inspect -Recurse
```

The package excludes tests, screenshots, and development documentation. Before submission, run the Node and unpacked Chromium tests, scan the archive for secrets, inspect every permission in `manifest.json`, and test against the production HTTPS API.

## External steps

Store listing copy, final screenshots, privacy questionnaire, developer identity verification, legal approval, and Web Store review must be completed in the publisher account. Approval is never implied by the repository package.
