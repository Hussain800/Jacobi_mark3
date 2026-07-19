from decimal import Decimal
from types import SimpleNamespace

import pytest

from compare.schemas import Money, ProductIdentity
from compare import storage
from compare.storage import (
    InMemoryComparisonRepository,
    PersistenceConfigurationError,
    SupabaseComparisonRepository,
    create_repository,
    json_safe,
)


def test_json_safe_preserves_decimal_precision_for_models_and_nested_values():
    payload = json_safe(
        {
            "price": Money(amount=Decimal("1499.90"), currency="AED"),
            "fee": Decimal("0.000001"),
        }
    )

    assert payload["price"]["amount"] == "1499.90"
    assert payload["fee"] == "0.000001"
    assert not isinstance(payload["price"]["amount"], float)


def test_memory_repository_is_bounded_and_keeps_stable_insertion_order():
    repo = InMemoryComparisonRepository(max_records=2)
    repo.save_product("prod-1", {"model": "one"})
    repo.save_product("prod-2", {"model": "two"})
    repo.save_product("prod-2", {"model": "two-updated"})
    repo.save_product("prod-3", {"model": "three"})

    assert repo.get_product("prod-1") is None
    assert [record.record_id for record in repo.list_products()] == ["prod-2", "prod-3"]
    assert repo.get_product("prod-2").payload == {"model": "two-updated"}


def test_memory_repository_copies_values_on_write_and_read():
    repo = InMemoryComparisonRepository()
    source = {"nested": {"amount": Decimal("1.20")}}
    repo.save_product("prod-copy", source)
    source["nested"]["amount"] = Decimal("999")

    loaded = repo.get_product("prod-copy")
    loaded.payload["nested"]["amount"] = "888"

    assert repo.get_product("prod-copy").payload["nested"]["amount"] == "1.20"


def test_memory_repository_owner_scope_does_not_leak_records():
    repo = InMemoryComparisonRepository()
    repo.save_comparison("cmp-1", {"status": "save"}, owner_id="user-a")
    repo.save_watch(
        "watch-1",
        {"target_amount": Decimal("1200.00")},
        owner_id="user-a",
        product_id="prod-1",
    )

    assert repo.get_comparison("cmp-1", owner_id="user-a") is not None
    assert repo.get_comparison("cmp-1", owner_id="user-b") is None
    assert repo.get_comparison("cmp-1") is None
    assert repo.list_watches(owner_id="user-b") == []
    assert repo.delete_watch("watch-1", owner_id="user-b") is False
    assert repo.delete_watch("watch-1", owner_id="user-a") is True


def test_repository_interface_covers_comparison_graph():
    repo = InMemoryComparisonRepository()
    identity = ProductIdentity(canonical_id="prod-1", brand="Sony", model="WH1000XM5")

    repo.save_product("prod-1", identity)
    repo.save_alias("alias-1", "prod-1", {"alias_type": "mpn", "value": "WH1000XM5"})
    repo.save_offer(
        "off-1",
        {"price": {"amount": Decimal("1199.00"), "currency": "AED"}},
        owner_id="user-a",
        product_id="prod-1",
        evidence_manifest_id="manifest-1",
    )
    repo.save_comparison(
        "cmp-1",
        {"status": "save"},
        owner_id="user-a",
        product_id="prod-1",
        evidence_manifest_id="manifest-1",
    )
    repo.save_candidate(
        "candidate-1",
        "cmp-1",
        {"classification": "EXACT_EQUIVALENT"},
        owner_id="user-a",
        offer_observation_id="off-1",
    )
    repo.save_evidence_reference(
        "evidence-1",
        {"manifest_id": "manifest-1", "sha256": "a" * 64},
        owner_id="user-a",
        comparison_id="cmp-1",
    )
    repo.save_preferences("user-a", {"mode": "lowest_complete_total"})
    repo.append_event(
        "event-1", "cmp-1", {"event_type": "alternative_opened"}, owner_id="user-a"
    )

    assert repo.list_aliases("prod-1")[0].links == {"product_id": "prod-1"}
    assert repo.list_offers(owner_id="user-a", product_id="prod-1")[0].record_id == "off-1"
    assert repo.list_candidates("cmp-1", owner_id="user-a")[0].record_id == "candidate-1"
    assert repo.list_evidence_references(
        owner_id="user-a", comparison_id="cmp-1"
    )[0].record_id == "evidence-1"
    assert repo.get_preferences("user-a").payload["mode"] == "lowest_complete_total"
    assert repo.list_events("cmp-1", owner_id="user-a")[0].record_id == "event-1"


def test_evidence_reference_requires_a_parent():
    repo = InMemoryComparisonRepository()
    with pytest.raises(ValueError, match="must link"):
        repo.save_evidence_reference("evidence-1", {"manifest_id": "manifest-1"})

    with pytest.raises(ValueError, match="must link"):
        repo.save_watch("watch-1", {"target_amount": "100.00"}, owner_id="user-a")


def test_factory_defaults_to_memory_and_rejects_unknown_backend(monkeypatch):
    monkeypatch.delenv(storage.STORAGE_ENV, raising=False)
    assert isinstance(create_repository(), InMemoryComparisonRepository)

    with pytest.raises(PersistenceConfigurationError, match="unsupported"):
        create_repository("sqlite")


def test_explicit_supabase_selection_fails_closed(monkeypatch):
    monkeypatch.setattr(storage, "get_supabase", lambda: None)
    with pytest.raises(PersistenceConfigurationError, match="not configured"):
        create_repository("supabase")


class _UpsertQuery:
    def __init__(self, table_name, rows):
        self.table_name = table_name
        self.rows = rows
        self.row = None

    def upsert(self, row):
        self.row = row
        return self

    def execute(self):
        self.rows.append((self.table_name, self.row))
        return SimpleNamespace(data=[self.row])


class _FakeSupabase:
    def __init__(self):
        self.rows = []

    def table(self, table_name):
        return _UpsertQuery(table_name, self.rows)


def test_supabase_adapter_writes_decimal_safe_json_without_network_calls():
    fake = _FakeSupabase()
    repo = SupabaseComparisonRepository(client=fake)

    saved = repo.save_offer(
        "off-1",
        {"amount": Decimal("999.9900")},
        owner_id="11111111-1111-1111-1111-111111111111",
        product_id="prod-1",
    )

    table, row = fake.rows[0]
    assert table == "offer_observations"
    assert row["payload"]["amount"] == "999.9900"
    assert row["user_id"] == "11111111-1111-1111-1111-111111111111"
    assert saved.payload["amount"] == "999.9900"
