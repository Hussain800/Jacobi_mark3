"""Verify Jacobi enterprise production readiness.

Usage:
    python scripts/verify_production_readiness.py
    python scripts/verify_production_readiness.py --strict

The script is safe by default: it never prints secret values and only performs
read-only checks. If SUPABASE_DB_URL is provided and psycopg/psycopg2 is
installed, it also checks that required production tables exist and RLS is
enabled in Postgres.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from ops_readiness import REQUIRED_ENTERPRISE_TABLES, build_enterprise_health  # noqa: E402


def _connect_postgres(dsn: str):
    try:
        import psycopg  # type: ignore

        return psycopg.connect(dsn)
    except ImportError:
        try:
            import psycopg2  # type: ignore

            return psycopg2.connect(dsn)
        except ImportError:
            return None


def verify_supabase_schema() -> dict[str, Any]:
    dsn = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        return {
            "status": "skipped",
            "reason": "SUPABASE_DB_URL or DATABASE_URL is not configured.",
        }
    conn = _connect_postgres(dsn)
    if conn is None:
        return {
            "status": "skipped",
            "reason": "Install psycopg or psycopg2 to verify production table/RLS state.",
        }

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT relname, relrowsecurity
                    FROM pg_class
                    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
                    WHERE pg_namespace.nspname = 'public'
                      AND relkind = 'r'
                      AND relname = ANY(%s)
                    """,
                    (REQUIRED_ENTERPRISE_TABLES,),
                )
                rows = cur.fetchall()
        found = {row[0]: bool(row[1]) for row in rows}
        missing = [table for table in REQUIRED_ENTERPRISE_TABLES if table not in found]
        rls_disabled = [table for table, enabled in found.items() if not enabled]
        return {
            "status": "pass" if not missing and not rls_disabled else "fail",
            "missing_tables": missing,
            "rls_disabled": rls_disabled,
            "checked_tables": sorted(found),
        }
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Jacobi enterprise production readiness.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any readiness check is skipped or failing.")
    args = parser.parse_args()

    health = build_enterprise_health(REPO_ROOT)
    schema = verify_supabase_schema()
    result = {
        "enterprise_health": health,
        "supabase_schema": schema,
        "manual_steps": [
            "Apply all supabase/migrations files to the production Supabase project.",
            "Run this script with SUPABASE_DB_URL to verify required tables and RLS flags.",
            "Set SCAN_WORKER_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, BRIGHTDATA_API_KEY, and BRIGHTDATA_UNLOCKER_ZONE in production.",
            "Run one pilot watchlist scan and verify scan_jobs, findings, evidence_items, evidence_exports, share_tokens, and audit_log rows.",
        ],
    }
    print(json.dumps(result, indent=2, sort_keys=True))

    if args.strict:
        health_ok = health["status"] == "ready" and health["live_scan_status"] == "ready"
        schema_ok = schema["status"] == "pass"
        return 0 if health_ok and schema_ok else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
