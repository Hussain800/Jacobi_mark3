# Contributing to Jacobi

Jacobi welcomes fixes, product-identity rules, cost-model improvements, evidence work, extension improvements, documentation, and policy-compliant provider adapters.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md) and to contribute only material you are allowed to redistribute.

## Before opening a change

- Search existing issues and pull requests.
- Keep one change focused and reviewable.
- Preserve the legacy Deep Audit system and public contracts unless the change explicitly includes a compatible migration.
- Prefer deterministic identifiers and rules over title similarity or model guesses.
- Preserve unknown price components; never turn missing shipping/tax/duty into zero.
- Do not add dependencies without a concrete need and maintainer review.
- Never add CAPTCHA bypass, stealth evasion, credential automation, paid-provider calls in default paths, or live-retailer CI dependencies.

Use the issue forms for bugs, false matches, provider proposals, and category RFCs. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Development setup

Follow [local price-optimization setup](docs/LOCAL_SETUP_PRICE_OPTIMIZATION.md). Fixture mode requires no paid provider or production credentials.

## Provider contributions

Read the [provider plugin guide](docs/PROVIDER_PLUGIN_GUIDE.md) and [fixture guide](docs/FIXTURE_GUIDE.md). Begin with the [adapter template](docs/templates/provider_adapter.py.example).

A provider pull request must include:

- capability/cost/evidence metadata and honest limitations;
- policy basis and reviewed date;
- approved, sanitized fixtures;
- happy-path, missing-field, mismatch, access-denied, timeout, and partial-failure tests;
- SSRF/redirect/body-size protections for server fetches;
- proof the adapter is not invoked by default if it is paid or policy-sensitive;
- no claim of production readiness without measured live validation.

## Tests

Run the smallest focused test first, then the full relevant gates:

```powershell
cd backend
python -m pytest tests -q
python -c "import main; print(main.app.title)"

cd ..\frontend
npm ci
npm run build

cd ..
node --test extension/tests/*.test.js
node extension/tests/chromium-extension-test.mjs
git diff --check
```

If a gate cannot run, state exactly why in the pull request. Do not replace a skipped live/browser check with an unsupported success claim.

## Pull requests

- Use a descriptive title and granular commits.
- Explain behavior, architecture impact, and rollback.
- Link tests to each changed requirement.
- Distinguish fixture, browser-assisted, direct-public, and independently live support.
- Include screenshots for visible extension/frontend changes.
- Update relevant architecture, security, privacy, deployment, provider, limitation, and PDR ledger documentation.
- Disclose migrations, environment changes, external blockers, and known risks.
- Never include secrets, authenticated captures, user data, or paid-provider output.

Maintainers may request a security, policy, legal, or privacy review before merging a provider or data-collection change.
