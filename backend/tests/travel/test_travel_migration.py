"""Static checks for the additive travel Market Graph migration."""

from pathlib import Path

import pytest


MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607130001_travel_market_graph.sql"
)

TABLES = [
    "travel_searches",
    "travel_provider_attempts",
    "travel_flight_itineraries",
    "travel_hotel_properties",
    "travel_hotel_property_crosswalks",
    "travel_offers",
    "travel_offer_cost_components",
    "travel_evidence",
    "travel_revalidations",
    "travel_redirect_events",
    "travel_feedback",
    "travel_preferences",
]


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


@pytest.mark.parametrize("table", TABLES)
def test_every_market_graph_table_is_additive_rls_enabled_and_service_writable(table):
    sql = _sql()
    assert f"create table if not exists public.{table}" in sql
    assert f"alter table public.{table} enable row level security" in sql
    assert f"revoke all on table public.{table} from anon" in sql
    assert f"grant all on table public.{table} to service_role" in sql


def test_owner_and_capability_boundaries_are_explicit():
    sql = _sql()
    assert "travel_search_access_check" in sql
    assert "user_id is not null or capability_hash is not null" in sql
    assert "capability_hash ~ '^[0-9a-f]{64}$'" in sql
    assert "user_id = (select auth.uid())" in sql
    assert "travel_preferences_owner_all" in sql
    assert " to anon" not in sql


def test_shared_catalogs_are_not_granted_to_authenticated_clients():
    sql = _sql()
    assert "grant select on table public.travel_flight_itineraries to authenticated" not in sql
    assert "grant select on table public.travel_hotel_properties to authenticated" not in sql
    assert "grant select on table public.travel_hotel_property_crosswalks to authenticated" not in sql


def test_graph_foreign_keys_and_query_indexes_are_present():
    sql = _sql()
    assert "references public.travel_searches(search_id)" in sql
    assert "references public.travel_offers(offer_id)" in sql
    assert "references public.travel_revalidations(revalidation_id)" in sql
    assert "idx_travel_searches_fingerprint_fresh" in sql
    assert "idx_travel_offers_search_total" in sql
    assert "idx_travel_revalidations_offer_requested" in sql
    assert "idx_travel_redirect_authorization_unique" in sql


def test_raw_provider_material_and_tokens_are_not_schema_columns():
    sql = _sql()
    assert "raw_response jsonb" not in sql
    assert "raw_payload jsonb" not in sql
    assert "capability_token" not in sql.split("create table if not exists public.travel_searches", 1)[1].split(");", 1)[0]
    assert "authorization_hash text" in sql


def test_migration_is_transactional():
    sql = _sql().strip()
    assert sql.startswith("-- travel market graph persistence foundation.")
    assert "begin;" in sql
    assert sql.endswith("commit;")
