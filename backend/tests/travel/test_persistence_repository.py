from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from travel.persistence import (
    AccessContext,
    AccessDeniedError,
    InMemoryTravelRepository,
    PersistenceConfigurationError,
    SupabaseTravelRepository,
    create_travel_repository,
)
from travel.persistence import factory


OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"
SERVICE = AccessContext.for_service()


def _search_payload(**overrides):
    payload = {
        "fingerprint": "f" * 64,
        "vertical": "flight",
        "status": "queued",
        "market": "AE",
        "intent": {"origin": "DXB", "destination": "LHR"},
        "expires_at": "2026-07-14T00:00:00Z",
    }
    payload.update(overrides)
    return payload


def test_owner_and_capability_access_are_isolated_and_hashes_are_hidden():
    repo = InMemoryTravelRepository()
    owner_access = AccessContext.for_owner(OWNER_A)
    wrong_owner = AccessContext.for_owner(OWNER_B)

    owned = repo.create_search("search-owned", _search_payload(), owner_id=OWNER_A)
    anonymous = repo.create_search(
        "search-anon", _search_payload(), capability_token="anonymous-secret"
    )

    assert owned.links == {}
    assert anonymous.links == {}
    assert repo.get_search("search-owned", owner_access) is not None
    assert repo.get_search("search-owned", wrong_owner) is None
    assert repo.get_search(
        "search-anon", AccessContext.for_capability("anonymous-secret")
    ) is not None
    assert repo.get_search(
        "search-anon", AccessContext.for_capability("wrong-secret")
    ) is None
    with pytest.raises(AccessDeniedError, match="cannot enumerate"):
        repo.list_searches(AccessContext.for_capability("anonymous-secret"))


def test_anonymous_capability_expires_but_owner_history_remains_accessible():
    repo = InMemoryTravelRepository()
    expired = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    repo.create_search(
        "search-expired-anon",
        _search_payload(expires_at=expired),
        capability_token="expired-secret",
    )
    repo.create_search(
        "search-expired-owner",
        _search_payload(expires_at=expired),
        owner_id=OWNER_A,
    )

    assert (
        repo.get_search(
            "search-expired-anon",
            AccessContext.for_capability("expired-secret"),
        )
        is None
    )
    assert (
        repo.get_search("search-expired-owner", AccessContext.for_owner(OWNER_A))
        is not None
    )


def test_repository_contract_persists_complete_market_graph():
    repo = InMemoryTravelRepository()
    owner_access = AccessContext.for_owner(OWNER_A)
    repo.create_search("search-1", _search_payload(), owner_id=OWNER_A)
    repo.save_provider_attempt(
        "attempt-1",
        "search-1",
        {
            "provider": "fixture",
            "provider_environment": "fixture",
            "status": "succeeded",
            "request_count": 1,
        },
        owner_access,
    )
    repo.save_flight_itinerary(
        "itin-1",
        {
            "canonical_hash": "a" * 64,
            "origin": "DXB",
            "destination": "LHR",
            "departure_date": "2026-08-01",
            "segments": [{"flight": "JX1"}],
        },
        SERVICE,
    )
    repo.save_offer(
        "offer-1",
        "search-1",
        {
            "provider": "fixture",
            "vertical": "flight",
            "currency": "AED",
            "item_amount": Decimal("100.00"),
            "total_amount": Decimal("125.00"),
            "total_complete": True,
            "observed_at": "2026-07-13T12:00:00Z",
        },
        owner_access,
        provider_attempt_id="attempt-1",
        itinerary_id="itin-1",
    )
    repo.save_cost_component(
        "cost-1",
        "search-1",
        "offer-1",
        {
            "kind": "tax",
            "label": "Taxes",
            "amount": Decimal("25.00"),
            "currency": "AED",
            "mandatory": True,
            "included": True,
        },
        owner_access,
    )
    repo.save_evidence(
        "evidence-1",
        "search-1",
        {"evidence_kind": "manifest", "artifact_hash": "b" * 64},
        owner_access,
        offer_id="offer-1",
        provider_attempt_id="attempt-1",
    )
    repo.save_revalidation(
        "reval-1",
        "search-1",
        "offer-1",
        {"status": "fresh", "total_amount": Decimal("125.00")},
        owner_access,
    )
    redirect = repo.save_redirect_event(
        "redirect-1",
        "search-1",
        "offer-1",
        "reval-1",
        {"status": "authorized", "target_origin": "https://supplier.example"},
        owner_access,
        authorization_token="redirect-secret",
    )
    repo.save_feedback(
        "feedback-1",
        "search-1",
        {"feedback_type": "helpful"},
        owner_access,
        offer_id="offer-1",
    )

    assert repo.list_provider_attempts("search-1", owner_access)[0].record_id == "attempt-1"
    assert repo.list_offers("search-1", owner_access)[0].payload["total_amount"] == "125.00"
    assert repo.list_cost_components("search-1", "offer-1", owner_access)[0].record_id == "cost-1"
    assert repo.list_evidence("search-1", owner_access)[0].record_id == "evidence-1"
    assert repo.get_revalidation("reval-1", owner_access) is not None
    assert redirect.links == {
        "search_id": "search-1",
        "offer_id": "offer-1",
        "revalidation_id": "reval-1",
    }
    assert repo.list_feedback("search-1", owner_access)[0].record_id == "feedback-1"
    assert repo.get_offer("offer-1", AccessContext.for_owner(OWNER_B)) is None


def test_catalog_is_service_only_and_provider_payloads_are_sanitized():
    repo = InMemoryTravelRepository()
    owner_access = AccessContext.for_owner(OWNER_A)
    repo.create_search("search-1", _search_payload(), owner_id=OWNER_A)

    with pytest.raises(AccessDeniedError, match="service access"):
        repo.save_flight_itinerary("itin-1", {"canonical_hash": "a" * 64}, owner_access)
    with pytest.raises(ValueError, match="cannot be persisted"):
        repo.save_provider_attempt(
            "attempt-1",
            "search-1",
            {"status": "failed", "raw_response": "not retained"},
            owner_access,
        )


def test_preferences_require_matching_owner_and_memory_is_bounded():
    repo = InMemoryTravelRepository(max_records=2)
    owner_access = AccessContext.for_owner(OWNER_A)
    repo.save_preferences(OWNER_A, {"currency": "AED"}, owner_access)
    assert repo.get_preferences(OWNER_A, owner_access).payload == {"currency": "AED"}
    with pytest.raises(AccessDeniedError, match="owner mismatch"):
        repo.get_preferences(OWNER_A, AccessContext.for_owner(OWNER_B))

    for index in range(3):
        repo.create_search(
            f"search-{index}", _search_payload(fingerprint=str(index) * 64), owner_id=OWNER_A
        )
    assert repo.get_search("search-0", owner_access) is None
    assert [record.record_id for record in repo.list_searches(owner_access)] == [
        "search-1",
        "search-2",
    ]


def test_factory_defaults_to_memory_but_production_fails_closed(monkeypatch):
    monkeypatch.delenv(factory.STORAGE_ENV, raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    assert isinstance(create_travel_repository(), InMemoryTravelRepository)

    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(PersistenceConfigurationError, match="requires"):
        create_travel_repository()
    with pytest.raises(PersistenceConfigurationError, match="not allowed"):
        create_travel_repository("memory")
    with pytest.raises(PersistenceConfigurationError, match="unsupported"):
        create_travel_repository("sqlite")


class _FakeQuery:
    def __init__(self, table, rows):
        self.table = table
        self.rows = rows
        self.operation = "select"
        self.row = None
        self.filters = []

    def select(self, _columns):
        self.operation = "select"
        return self

    def upsert(self, row):
        self.operation = "upsert"
        self.row = row
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def is_(self, column, value):
        self.filters.append((column, None if value == "null" else value))
        return self

    def limit(self, _limit):
        return self

    def order(self, *_args):
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        if self.operation == "upsert":
            self.rows.setdefault(self.table, []).append(dict(self.row))
            return SimpleNamespace(data=[self.row])
        selected = [
            row
            for row in self.rows.get(self.table, [])
            if all(row.get(column) == value for column, value in self.filters)
        ]
        if self.operation == "delete":
            self.rows[self.table] = [
                row
                for row in self.rows.get(self.table, [])
                if not all(
                    row.get(column) == value for column, value in self.filters
                )
            ]
        return SimpleNamespace(data=selected)


class _FakeSupabase:
    def __init__(self):
        self.rows = {}

    def table(self, table):
        return _FakeQuery(table, self.rows)


def test_supabase_adapter_projects_columns_and_never_persists_raw_capability():
    fake = _FakeSupabase()
    repo = SupabaseTravelRepository(client=fake)
    saved = repo.create_search(
        "search-1",
        _search_payload(),
        owner_id=OWNER_A,
        capability_token="search-secret",
    )

    row = fake.rows["travel_searches"][0]
    assert row["vertical"] == "flight"
    assert row["intent"] == {"origin": "DXB", "destination": "LHR"}
    assert row["capability_hash"] != "search-secret"
    assert len(row["capability_hash"]) == 64
    assert saved.links == {}


def test_supabase_owner_deletion_preserves_service_market_catalogue():
    fake = _FakeSupabase()
    repo = SupabaseTravelRepository(client=fake)
    owner_access = AccessContext.for_owner(OWNER_A)
    other_access = AccessContext.for_owner(OWNER_B)
    repo.create_search("owned", _search_payload(), owner_id=OWNER_A)
    repo.save_preferences(OWNER_A, {"currency": "AED"}, owner_access)
    repo.create_search(
        "other",
        _search_payload(fingerprint="b" * 64),
        owner_id=OWNER_B,
    )
    repo.save_flight_itinerary(
        "market-itinerary",
        {
            "canonical_hash": "c" * 64,
            "origin": "DXB",
            "destination": "LHR",
            "departure_date": "2027-01-01",
            "segments": [],
        },
        SERVICE,
    )

    result = repo.delete_owner_data(OWNER_A, owner_access)

    assert result.total_deleted == 2
    assert repo.get_search("owned", owner_access) is None
    assert repo.get_search("other", other_access) is not None
    assert repo.get_flight_itinerary("market-itinerary", SERVICE) is not None
