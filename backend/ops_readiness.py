"""Production readiness checks for the Jacobi enterprise pivot."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


REQUIRED_MIGRATIONS = [
    "202606240001_enterprise_price_integrity.sql",
    "202606240002_live_scan_worker.sql",
    "202606240003_enterprise_reporting_sharing.sql",
    "202606240004_enterprise_security_controls.sql",
    "202606240005_enterprise_rls_member_management.sql",
]

REQUIRED_ENTERPRISE_TABLES = [
    "organizations",
    "organization_members",
    "organization_invites",
    "products",
    "sellers",
    "watchlists",
    "watchlist_items",
    "scan_jobs",
    "findings",
    "evidence_items",
    "evidence_exports",
    "share_tokens",
    "audit_log",
]


def _has_env(name: str) -> bool:
    return bool((os.getenv(name) or "").strip())


def migration_status(repo_root: Path | None = None) -> list[dict[str, Any]]:
    root = repo_root or Path(__file__).resolve().parents[1]
    migration_dir = root / "supabase" / "migrations"
    return [
        {
            "file": name,
            "present": (migration_dir / name).exists(),
        }
        for name in REQUIRED_MIGRATIONS
    ]


def build_enterprise_health(repo_root: Path | None = None) -> dict[str, Any]:
    migrations = migration_status(repo_root)
    config = {
        "supabase_url": _has_env("SUPABASE_URL"),
        "supabase_service_key": _has_env("SUPABASE_SERVICE_KEY"),
        "scan_worker_secret": _has_env("SCAN_WORKER_SECRET") or _has_env("CRON_SECRET"),
        "brightdata_api_key": _has_env("BRIGHTDATA_API_KEY"),
        "brightdata_zone": _has_env("BRIGHTDATA_UNLOCKER_ZONE"),
        "enterprise_live_scans_enabled": os.getenv("ENTERPRISE_LIVE_SCANS_ENABLED", "1") != "0",
        "sentry_dsn": _has_env("SENTRY_DSN") or _has_env("NEXT_PUBLIC_SENTRY_DSN"),
        "scan_cost_budget_usd": os.getenv("ENTERPRISE_SCAN_COST_BUDGET_USD", "25"),
        "scan_max_targets": os.getenv("ENTERPRISE_SCAN_MAX_TARGETS", "250"),
        "scan_rate_limit_max": os.getenv("ENTERPRISE_SCAN_RATE_LIMIT_MAX_REQUESTS", "20"),
    }
    critical_ready = all([
        config["supabase_url"],
        config["supabase_service_key"],
        config["scan_worker_secret"],
        all(row["present"] for row in migrations),
    ])
    live_scan_ready = all([
        critical_ready,
        config["brightdata_api_key"],
        config["brightdata_zone"],
        config["enterprise_live_scans_enabled"],
    ])
    return {
        "status": "ready" if critical_ready else "action_required",
        "live_scan_status": "ready" if live_scan_ready else "action_required",
        "config": config,
        "required_tables": REQUIRED_ENTERPRISE_TABLES,
        "migrations": migrations,
        "notes": [
            "This endpoint never returns secret values.",
            "Production readiness still requires applying migrations and verifying Supabase RLS in the production project.",
        ],
    }
