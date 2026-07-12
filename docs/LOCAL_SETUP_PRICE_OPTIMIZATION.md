# Local Price Optimization Setup

These steps run the deterministic, zero-paid-provider development path. Bright Data, retailer credentials, Stripe, Supabase, and AI-provider keys are not required.

## Prerequisites

- Python 3.11
- Node.js 20
- Chrome 116+ or Chromium/Edge for extension testing
- Git

## Backend

From the repository root in PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
$env:JACOBI_COMPARE_STORAGE = "memory"
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Verify in another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/api/v1/compare/health
Invoke-RestMethod http://127.0.0.1:8000/api/v1/providers/capabilities
```

The API schema is at `http://127.0.0.1:8000/docs` and OpenAPI JSON at `http://127.0.0.1:8000/openapi.json`.

## Frontend

```powershell
cd frontend
npm ci
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000"
npm run dev
```

Open `http://localhost:3000`. Production auth, billing, and Supabase-backed workspace features need their own environment values; the price-optimization landing/demo does not.

## Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the repository's `extension` directory.
4. Open the extension's **Details → Extension options**.
5. Set the API backend to `http://127.0.0.1:8000` and web app to `http://localhost:3000`.
6. Approve access to the configured API origin when prompted.
7. Open a product page and click the Jacobi toolbar action.

The extension uses the active tab only after user invocation. It does not need all-sites access at install time.

## Deterministic fixture comparison

Use the local API; this request makes no retailer or paid-provider call:

```powershell
$body = @{
  source_url = "https://demo.jacobi.local/sony-wh-1000xm6"
  market = "AE"
  include_fixture_offers = $true
  current_offer = @{
    title = "Sony WH-1000XM6 Wireless Headphones Black"
    brand = "Sony"
    model = "WH-1000XM6"
    mpn = "WH-1000XM6/B"
    price = @{ amount = "1699.00"; currency = "AED" }
    shipping = @{ amount = "0"; currency = "AED" }
    seller = "Demo retailer"
    condition = "new"
    stock = "in_stock"
    warranty_region = "UAE"
  }
} | ConvertTo-Json -Depth 8

$result = Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8000/api/v1/compare `
  -ContentType application/json -Body $body
$result
```

Keep `comparison_id`, `comparison_access_token`, and `evidence_manifest_id`. Reads require the access token:

```powershell
$headers = @{ "X-Jacobi-Access-Token" = $result.comparison_access_token }
Invoke-RestMethod -Headers $headers `
  "http://127.0.0.1:8000/api/v1/comparisons/$($result.comparison_id)"
Invoke-RestMethod -Headers $headers `
  "http://127.0.0.1:8000/api/v1/evidence/$($result.evidence_manifest_id)?comparison_id=$($result.comparison_id)"
```

## Browser-submitted and direct-public comparisons

`submitted_offers` accepts normalized observations from user-opened tabs. This is a real zero-cost input path but is not independent server verification.

`comparison_urls` performs structured-metadata-only HTTP fetches. It is disabled unless `allow_direct_http=true`. The server validates public URLs and every redirect, caps submitted URLs at 20, caps bodies at 1 MB, and does not execute JavaScript or bypass access controls.

## Tests

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

The Chromium extension test may skip when no compatible browser binary is available. It does not use live retailers.

For the shared command-line and agent tools, continue with the [CLI guide](CLI.md) and [MCP guide](MCP_PRICE_OPTIMIZATION.md).
