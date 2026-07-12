# Price Optimization Deployment

Deployment of the comparison path does not require Bright Data or another paid collection provider.

## Components

- FastAPI backend from the root `Dockerfile` or a Python 3.11 service.
- Next.js frontend from `frontend/`.
- Supabase when durable production persistence is selected.
- Manifest V3 extension configured for the deployed backend and web origin.

`render.yaml` provides a free-plan Docker Blueprint for the API with the comparison health check and zero-cost defaults. There is no Docker Compose file, Redis queue, or production merchant-search service; configure those explicitly rather than assuming they exist.

## Backend container

```powershell
docker build -t jacobi-price-optimization .
docker run --rm -p 8000:8000 `
  -e JACOBI_COMPARE_STORAGE=memory `
  -e ALLOWED_ORIGINS=http://localhost:3000 `
  jacobi-price-optimization
```

The container installs `backend/requirements.txt`, copies `backend/`, and starts `uvicorn main:app` on port 8000.

## Required production choices

### Persistence

For durable comparisons:

```text
JACOBI_COMPARE_STORAGE=supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<server-only service-role key>
```

Apply migrations in order, including:

- `supabase/migrations/202607050001_agent_provenance_records.sql` for Agentcore evidence;
- `supabase/migrations/202607120001_price_optimization_persistence.sql` for comparisons.

Set `JACOBI_AGENT_STORAGE=supabase` as well when Agentcore manifests must survive process restarts. These stores are selected independently. Explicit Supabase selection fails closed when configuration is absent; do not catch that error and silently use memory.

### Origins and rate limiting

Set `ALLOWED_ORIGINS` to a comma-separated allowlist for the deployed web frontend. The comparison rate limit defaults to 30 requests per process per minute:

```text
JACOBI_COMPARE_RATE_LIMIT_PER_MIN=30
JACOBI_AGENT_RATE_LIMIT_PER_MIN=30
JACOBI_TRUSTED_PROXY=1  # only behind a trusted reverse proxy
```

The comparison limiter is process-local, not a distributed quota. Multi-instance deployments need an upstream gateway or shared limiter. Configure proxy headers at the platform boundary and test the effective client identity.

### Evidence and observability

```text
JACOBI_MANIFEST_SIGNING_KEY=<high-entropy server-only value>
JACOBI_ARTIFACT_DIR=/persistent/private/path
JACOBI_ARTIFACT_MAX_FILES=500
JACOBI_HTTP_MAX_BYTES=2097152
SENTRY_DSN=                 # blank disables telemetry
SENTRY_TRACES_SAMPLE_RATE=0
JACOBI_COMPARE_TELEMETRY_ENABLED=false
```

Sentry is opt-in. The backend removes request headers, cookies, bodies, and query strings and disables default PII before sending events.

## Render Blueprint

The committed Blueprint deploys the root Dockerfile and prompts for `ALLOWED_ORIGINS`. Validate it when the Render CLI is installed:

```powershell
render blueprints validate
```

The local verification environment did not include the Render CLI, so the Blueprint received YAML/static schema checks only. Durable Supabase storage remains an explicit environment change described above.

## Bright Data isolation

The normal comparison service does not import or invoke the legacy `BrightDataMCPClient`. Its default adapter registry is fixture-only, and request-created direct/browser providers are zero-cost. No managed adapter is registered.

Leave these unset for comparison deployments:

```text
BRIGHTDATA_API_KEY=
BRIGHTDATA_UNLOCKER_ZONE=
BRIGHTDATA_CUSTOM_HEADERS_ENABLED=false
```

They are relevant only to the explicitly launched legacy Deep Audit workflow. If a self-hoster enables that path, credentials stay server-side and spending is their responsibility.

## Frontend deployment

From `frontend/`:

```powershell
npm ci
$env:NEXT_PUBLIC_API_URL = "https://api.example.com"
npm run build
```

Deploy the generated Next.js application to Vercel or another Node-compatible platform. Configure Supabase/auth values only for the account/workspace features that use them. Never expose the service-role key through a `NEXT_PUBLIC_*` variable.

## Extension production configuration

The extension requests the configured backend origin as an optional host permission when Settings are saved. For production:

1. serve the API over HTTPS;
2. set the default backend/web URLs or publish setup instructions;
3. verify optional permission prompts and the extension's single-purpose disclosure;
4. package from a clean tree and scan it for secrets/source artifacts;
5. test the packed extension against the deployed API;
6. submit to the Chrome Web Store only after privacy/legal review.

Chrome Web Store approval is external. The repository supports unpacked installation; it does not prove store approval.

## Optional Playwright

Playwright is not installed by `backend/requirements.txt`. Agentcore can use it only after an explicit install:

```powershell
python -m pip install playwright
python -m playwright install chromium
$env:JACOBI_ENABLE_PLAYWRIGHT = "1"
```

The price-optimization provider registry does not yet implement a local-Playwright discovery adapter. Do not describe this optional Agentcore evidence provider as live multi-retailer comparison.

## Startup and health checks

```powershell
python -c "import main; print(main.app.title)"
Invoke-RestMethod https://api.example.com/health
Invoke-RestMethod https://api.example.com/api/v1/compare/health
Invoke-RestMethod https://api.example.com/api/v1/providers/health
```

The compare health response reports storage selection and confirms that mandatory provider cost is zero. It does not prove external retailer availability.

## Rollback

Application rollback is a normal image/deployment rollback. The migration only adds new tables and policies; do not drop them during an application rollback. Preserve comparison/evidence rows, deploy the previous image, and perform destructive schema cleanup only through a separately reviewed migration and backup.
