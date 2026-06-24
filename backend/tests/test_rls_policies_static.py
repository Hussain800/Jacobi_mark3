"""P1-4: static RLS-completeness check over the migration SQL.

Runs without a database. Guards against RLS regressions: every enterprise table
must have RLS enabled, and the organization lifecycle tables must have the
member-management policies added in 202606240005.
"""

from pathlib import Path

import pytest

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

ENTERPRISE_TABLES = [
    "organizations",
    "organization_members",
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
    "organization_invites",
]


def _all_sql() -> str:
    assert MIGRATIONS_DIR.is_dir(), f"migrations dir not found: {MIGRATIONS_DIR}"
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted(MIGRATIONS_DIR.glob("*.sql")))


@pytest.mark.parametrize("table", ENTERPRISE_TABLES)
def test_rls_enabled_on_enterprise_table(table):
    sql = _all_sql().lower()
    assert f"alter table public.{table} enable row level security" in sql, (
        f"RLS not enabled on {table}"
    )


def test_org_member_management_policies_exist():
    sql = _all_sql().lower()
    # organizations: must now have a DELETE policy.
    assert "on public.organizations for delete" in sql
    # organization_members: must now have UPDATE and DELETE policies.
    assert "on public.organization_members for update" in sql
    assert "on public.organization_members for delete" in sql
    # role-aware helper present.
    assert "function public.has_org_role" in sql
