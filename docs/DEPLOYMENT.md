# Deployment contract

The supported deployment story for this repository is:

```text
Vercel (frontend/) -> Render Docker service (root Dockerfile, backend/main.py)
```

The frontend proxy points to the Render backend through `NEXT_PUBLIC_API_URL`
or `BACKEND_API_URL`. The Render service owns FastAPI, provider credentials,
Supabase service access, and the protected scan-worker endpoint.

`backend/vercel.json` is retained as a historical alternative for reference;
it is not part of the supported deployment path and must not be treated as
proof that the backend worker is durable. A pilot still requires production
Supabase/RLS verification, a separately scheduled worker invocation, provider
and observability configuration, and the controlled smoke protocol in
`docs/PRODUCTION_READINESS_CHECKLIST.md`.

No deployment is performed by this mission.
