"""Static checks for the price-optimization migration; no Supabase required."""

from pathlib import Path

import pytest


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202607120001_price_optimization_persistence.sql"
)

TABLES = [
    "catalog_products",
    "product_aliases",
    "offer_observations",
    "comparison_runs",
    "comparison_candidates",
    "optimization_evidence_references",
    "comparison_events",
    "price_watches",
    "user_preferences",
]


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


@pytest.mark.parametrize("table", TABLES)
def test_migration_creates_and_enables_rls_for_every_table(table):
    sql = _sql()
    assert f"create table if not exists public.{table}" in sql
    assert f"alter table public.{table} enable row level security" in sql


@pytest.mark.parametrize("table", TABLES)
def test_anonymous_access_is_revoked_and_service_role_is_explicit(table):
    sql = _sql()
    assert f"revoke all on table public.{table} from anon" in sql
    assert f"grant all on table public.{table} to service_role" in sql


def test_user_owned_tables_reference_auth_users_and_have_owner_policies():
    sql = _sql()
    assert sql.count("references auth.users(id) on delete cascade") >= 7
    assert "comparison_runs_owner_select" in sql
    assert "price_watches_owner_all" in sql
    assert "user_preferences_owner_all" in sql
    assert "user_id = (select auth.uid())" in sql


def test_relational_graph_has_foreign_keys_and_query_indexes():
    sql = _sql()
    assert "references public.catalog_products(product_id)" in sql
    assert "references public.comparison_runs(comparison_id)" in sql
    assert "references public.offer_observations(observation_id)" in sql
    assert "idx_offer_observations_product_observed" in sql
    assert "idx_comparison_candidates_comparison_rank" in sql
    assert "idx_price_watches_user_active" in sql


def test_migration_is_transactional_and_does_not_grant_anonymous_reads():
    sql = _sql().strip()
    assert sql.startswith("-- price-optimization persistence foundation.")
    assert "begin;" in sql
    assert sql.endswith("commit;")
    assert " to anon" not in sql
