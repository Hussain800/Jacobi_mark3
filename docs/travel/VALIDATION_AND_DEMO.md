# Travel validation and reproducible demos

## Deterministic repository demo

From the repository root:

```powershell
node --test extension/tests/*.test.js
node extension/tests/chromium-extension-test.mjs
```

The Chromium command loads the unpacked Manifest V3 extension and exercises a
single open flight fixture page, a single open hotel fixture page, and a
degraded provider result. It opens no competitor tabs and writes the reviewed
flight, hotel and degraded screenshots to `extension/artifacts/`. All rendered
offers in this harness are labelled `Fixture data`; it is not a live-provider
claim.

The backend provider and progressive-search path is reproduced hermetically:

```powershell
Set-Location backend
python -m pytest -q tests/travel/test_amadeus_provider.py tests/travel/test_provider_contract_matrix.py
python -m pytest -q tests/travel/test_search_service_worker.py tests/travel/test_search_access_sse.py tests/travel/test_travel_api_v2.py
python -m jacobi travel eval --dataset flight_equivalence_v1
python -m jacobi travel eval --dataset hotel_equivalence_v1
python -m jacobi travel benchmark
```

The provider fixtures are sanitized Amadeus-shaped contracts. They prove OAuth,
normalization, partial failure, duplicate suppression, SSE progress, deterministic
equivalence/cost/ranking, evidence, flight revalidation and redirect denial; they
do not prove production inventory.

## Configured Amadeus sandbox demo

Set server-only sandbox credentials and start the API and worker:

```powershell
$env:AMADEUS_CLIENT_ID="<sandbox client id>"
$env:AMADEUS_CLIENT_SECRET="<sandbox client secret>"
$env:AMADEUS_ENVIRONMENT="sandbox"
$env:JACOBI_TRAVEL_INLINE_WORKER="1"
$env:JACOBI_TRAVEL_RUNTIME="memory"
$env:JACOBI_TRAVEL_STORAGE="memory"
$env:JACOBI_TRAVEL_CAPABILITY_SECRET="replace-with-at-least-32-random-bytes"
Set-Location backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

In another terminal, serve the versioned one-page fixtures:

```powershell
Set-Location extension/tests/fixtures
python -m http.server 4173 --bind 127.0.0.1
```

Load `extension/` unpacked, configure `http://localhost:8000`, grant the exact
localhost permissions, explicitly consent to Automatic Savings Mode, and open
one of:

- `http://127.0.0.1:4173/fixture-flight-v1.html`
- `http://127.0.0.1:4173/fixture-hotel-v1.html`

The page supplies only the browser-observed baseline intent. The backend then
independently queries the configured Amadeus sandbox. Results must say `Sandbox
API`, not live. Flight offers can use Flight Offers Price revalidation; the
initial Amadeus hotel adapter remains non-redirectable because it does not prove
an equivalent guaranteed price-check contract and may omit property-paid fees.

## Production-only validation

Production is an explicit, opt-in exercise outside default CI:

```powershell
$env:AMADEUS_ENVIRONMENT="production"
$env:AMADEUS_PRODUCTION_APPROVED="1"
$env:AMADEUS_CLIENT_ID="<approved production id>"
$env:AMADEUS_CLIENT_SECRET="<approved production secret>"
```

Do not run this mode until provider approval, credentials, quota, retention,
redirect and commercial terms are confirmed. A successful sandbox or fixture
run must never be relabelled as production.

## Full local release gates

```powershell
Set-Location backend
python -m pytest -q
Set-Location ../frontend
npm ci
npm run build
Set-Location ..
node --test extension/tests/*.test.js
node extension/tests/chromium-extension-test.mjs
python scripts/validate_travel_policy.py
python scripts/validate_travel_deployment.py
python scripts/validate_travel_quality_workflow.py
./scripts/test-package-extension.ps1
git diff --check
```

Docker Compose and real Supabase RLS validation are required release evidence
when those external runtimes and credentials are available; static validation
does not substitute for them.
