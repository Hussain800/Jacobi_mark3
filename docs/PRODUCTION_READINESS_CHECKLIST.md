# Jacobi Production Readiness Checklist

Date: 2026-06-24  
Repository: `Hussain800/Jacobi_mark3`

## Production Verdict

Jacobi now has the application-level pieces required for a paid pilot:

- durable watchlist scan worker endpoint and cron contract
- evidence locker
- MAP PDF/JSON exports with checksums
- redacted external share links with revoke
- organization roles and invites
- URL validation, scan rate limits, target caps, cost budget controls, and live-scan kill switch
- production readiness health endpoint and verification script

Final production launch still requires environment-specific operational work in the production Supabase/Vercel/BrightData accounts.

## Required Environment Variables

Backend:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SCAN_WORKER_SECRET`
- `BRIGHTDATA_API_KEY`
- `BRIGHTDATA_UNLOCKER_ZONE`
- `ENTERPRISE_LIVE_SCANS_ENABLED=1`
- `ENTERPRISE_SCAN_COST_BUDGET_USD`
- `ENTERPRISE_SCAN_MAX_TARGETS`
- `ENTERPRISE_SCAN_RATE_LIMIT_MAX_REQUESTS`
- `ENTERPRISE_SCAN_RATE_LIMIT_WINDOW_SECONDS`

Frontend:

- `NEXT_PUBLIC_API_URL`
- Supabase browser auth variables already used by the app
- Stripe variables for paid plan flows, if Pro remains checkout-backed

Optional:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SUPABASE_DB_URL` for direct production RLS verification

## Supabase Migration Checklist

Apply these migrations to production Supabase in order:

- `supabase/migrations/202606240001_enterprise_price_integrity.sql`
- `supabase/migrations/202606240002_live_scan_worker.sql`
- `supabase/migrations/202606240003_enterprise_reporting_sharing.sql`
- `supabase/migrations/202606240004_enterprise_security_controls.sql`
- `supabase/migrations/202606240005_enterprise_rls_member_management.sql`

Then run:

```bash
python scripts/verify_production_readiness.py
```

For direct table/RLS verification, run with a production DB URL:

```bash
SUPABASE_DB_URL="postgresql://..." python scripts/verify_production_readiness.py --strict
```

> `--strict` needs a Postgres driver in the run env (`pip install "psycopg[binary]"`); without it the table/RLS check is skipped silently. Then prove cross-org isolation against the live DB (create two throwaway `auth.users` first):
>
> ```bash
> SUPABASE_DB_URL="postgresql://..." RLS_TEST_USER_A="<uuid>" RLS_TEST_USER_B="<uuid>" \
>   python -m pytest backend/tests/test_rls_integration.py -q
> ```

## Smoke Test Protocol

1. Sign in as an owner.
2. Open `/dashboard/settings`.
3. Create and revoke one viewer invite.
4. Open `/dashboard/portfolio`.
5. Import `docs/PILOT_CSV_TEMPLATE.csv` after replacing the sample rows with a controlled public product URL.
6. Run imported MAP preview.
7. Run live scan.
8. Trigger the worker:

```bash
curl -X POST "$BACKEND_URL/api/enterprise/scan-worker/run" \
  -H "Authorization: Bearer $SCAN_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"max_jobs":1,"max_targets_per_job":1,"worker_id":"production-smoke"}'
```

9. Verify rows in:
   - `scan_jobs`
   - `findings`
   - `evidence_items`
   - `evidence_exports`
   - `share_tokens`
   - `audit_log`
10. Download a MAP PDF.
11. Export JSON and verify `evidence_checksum_sha256`.
12. Create a redacted external share link.
13. Open the external share link in an anonymous browser.
14. Revoke the share link and verify it returns unavailable.

## Operational Gates

- BrightData cost benchmark completed for Smart 24 and Pro 50.
- Domain health stats reviewed for pilot target domains.
- Sentry/log redaction reviewed.
- Vercel cron reaches `/api/enterprise/scan-worker/run` successfully.
- Production RLS verified with `SUPABASE_DB_URL`.
- First design-partner workspace seeded.
- Pilot report template and investor demo script reviewed.

## Launch Owner Notes

Use `/api/enterprise/health` while signed in to verify application-level readiness without exposing secrets. It returns boolean configuration flags only, never raw secret values.
