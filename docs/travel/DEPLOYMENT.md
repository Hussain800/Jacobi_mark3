# Travel deployment and runtime

This runbook covers the travel API, worker, frontend, Redis coordination and
Postgres/Supabase Market Graph. It does not replace the preserved retail and
Deep Audit deployment paths.

## Runtime modes

| Mode | Storage | Coordination | Worker | Intended use |
|---|---|---|---|---|
| Local Compose default | bounded API-process memory | Redis | inline in API | deterministic development and fixture demos |
| Distributed | Supabase shared by API and worker | Redis | separate `travel_worker` process | durable staging/production |
| Render Blueprint | external Supabase | external Redis | separate background worker | durable production topology |

The Compose PostgreSQL service initializes and validates the additive travel
schema. The application repository currently talks to Supabase, not directly to
that plain PostgreSQL container. Do not run the separate worker with memory
storage: API and worker processes would not share search records.

## Environment

Copy the tracked template and replace every placeholder before a real deployment:

```powershell
Copy-Item .env.travel.example .env
```

Important settings:

- `JACOBI_TRAVEL_STORAGE=memory|supabase`; production and separate-worker mode use `supabase`.
- `JACOBI_TRAVEL_RUNTIME=memory|redis`; distributed mode uses `redis` plus `REDIS_URL`.
- `JACOBI_TRAVEL_INLINE_WORKER=1` is development-only; set `0` with a separate worker.
- `JACOBI_TRAVEL_CAPABILITY_SECRET` must be a stable, high-entropy server secret shared by API and workers.
- `JACOBI_AGENT_STORAGE=supabase` is also required in distributed mode so worker-written evidence is visible to the API; share one `JACOBI_MANIFEST_SIGNING_KEY` across both roles.
- `ALLOWED_ORIGINS` is an explicit comma-separated frontend/extension allowlist.
- `AMADEUS_ENVIRONMENT=sandbox` uses the fixed test origin. Production additionally requires `AMADEUS_PRODUCTION_APPROVED=1` and externally approved credentials.
- `BRIGHTDATA_API_KEY` and `BRIGHTDATA_UNLOCKER_ZONE` remain optional legacy Deep Audit settings. Travel comparison does not require them.

Never expose the Supabase service key, Amadeus secret, capability secret or
Bright Data key through `NEXT_PUBLIC_*` variables or extension storage.

## Local Compose

Validate configuration, then start the schema database, Redis, API and frontend:

```powershell
docker compose config
docker compose up --build
```

The default API command is:

```text
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

The default uses Redis coordination and an inline worker because memory storage
belongs to the API process. Amadeus remains visibly `unconfigured` when its two
credentials are blank; fixture and schema checks still work.

Health checks:

```powershell
Invoke-RestMethod http://localhost:8000/api/v2/travel/health/live
Invoke-RestMethod http://localhost:8000/api/v2/travel/health/ready
Invoke-RestMethod http://localhost:8000/api/v2/travel/providers/health
```

Liveness checks only the API process. Readiness checks the required travel
runtime. Optional provider absence or failure is reported without making the API
unready when other paths remain useful.

## Separate API and worker

Distributed mode requires shared Supabase storage. In `.env`, set:

```dotenv
JACOBI_TRAVEL_STORAGE=supabase
JACOBI_TRAVEL_RUNTIME=redis
JACOBI_TRAVEL_INLINE_WORKER=0
JACOBI_AGENT_STORAGE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=server-only-service-role-key
JACOBI_TRAVEL_CAPABILITY_SECRET=shared-high-entropy-secret
JACOBI_MANIFEST_SIGNING_KEY=shared-high-entropy-evidence-key
```

Then validate and start the worker profile:

```powershell
docker compose --profile distributed config
docker compose --profile distributed up --build
```

Outside Compose, run the two process roles from `backend/`:

```powershell
python -m uvicorn main:app --host 0.0.0.0 --port 8000
python -m travel_worker
```

The worker container stays healthy only while its configured runtime is
reachable. Docker also restarts the worker if its main process exits.

## Render Blueprint production

The checked-in `render.yaml` defines two paid `starter` services because Render
does not offer free background workers:

- `jacobi-api`, a Docker web service with travel readiness health checks;
- `jacobi-travel-worker`, a Docker background worker running `python -m travel_worker`.

The API is configured fail-closed with Supabase travel, Agentcore and preserved
retail comparison storage, Redis coordination, and no inline worker. During the
initial Blueprint creation, Render prompts for these external server-side values:

- `REDIS_URL`;
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`;
- `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET`;
- `ALLOWED_ORIGINS`.

Render generates `JACOBI_TRAVEL_CAPABILITY_SECRET` and
`JACOBI_MANIFEST_SIGNING_KEY` on the API. The worker references those variables,
the external storage/runtime URLs and Amadeus credentials through
`fromService.envVarKey`, so the two roles cannot silently drift.

Apply and validate the Supabase migrations before enabling auto-deploy. Then
validate the Blueprint when the Render CLI is installed:

```powershell
render blueprints validate
```

Render documents that `sync: false` values are prompted only on initial
Blueprint creation and ignored on later Blueprint updates. Add or rotate them
through the Dashboard for an existing Blueprint. See the official
[Blueprint YAML reference](https://render.com/docs/blueprint-spec) and
[background worker guide](https://render.com/docs/background-workers).

## Migration and bootstrap

On a new local Postgres volume, Compose runs:

1. `scripts/travel-postgres-bootstrap.sql`, which creates local-only Supabase compatibility objects;
2. `supabase/migrations/202607130001_travel_market_graph.sql`.

Inspect the local schema without changing it:

```powershell
docker compose exec postgres psql -U jacobi -d jacobi -c "\dt public.travel_*"
```

For hosted Supabase, apply migrations in repository order through the approved
Supabase migration workflow, then validate with anon, two authenticated users
and service role. Local static/Compose validation does not prove hosted RLS or
grant behavior.

## Rollback

Application rollback is non-destructive:

1. stop the worker so it cannot claim new jobs;
2. deploy the previous API/frontend images;
3. preserve the additive travel tables and evidence;
4. resume only compatible workers after API health is green.

Do not drop production travel tables during an application rollback. A schema
rollback needs a separately reviewed migration, verified backup and retention
decision. For local containers, `docker compose down` preserves named volumes.
`docker compose down -v` destroys local Postgres and Redis data and is only a
deliberate development reset.

## Extension package and fixture demo

Run deterministic extension checks and package the reviewed MV3 files:

```powershell
node --test extension/tests/*.test.js
node extension/tests/chromium-extension-test.mjs
pwsh -File scripts/package-extension.ps1 -Output dist/jacobi-travel-extension.zip
```

Load `extension/` unpacked in Chrome developer mode. The browser harness uses
versioned local flight and hotel fixtures and writes screenshots under
`extension/artifacts/`; it is not proof of production-site support or Chrome Web
Store approval.

## Static validation

```powershell
python scripts/validate_travel_deployment.py
cd backend
python -m pytest -q tests/travel/test_deployment_config.py
```

The validator runs `docker compose --profile distributed config` when Docker is
available and otherwise reports an explicit skip after completing static checks.
