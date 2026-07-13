from __future__ import annotations

from pathlib import Path
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from agentcore.schemas import EvidenceManifest
from agentcore.storage import MemoryRepo
from api.v2_travel import router
from auth_user import get_optional_user
from travel.persistence import (
    AccessContext,
    AccessDeniedError,
    DEIDENTIFIED_MARKET_COLLECTIONS,
    InMemoryTravelRepository,
    PersistenceConfigurationError,
    create_travel_repository,
)
from travel.persistence import factory as persistence_factory
from travel.providers import ProviderRegistry, provider_catalog
from travel.search.runtime import MemoryTravelRuntime
from travel.search.service import TravelSearchService, get_travel_search_service
import travel.search.service as service_module


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from validate_travel_policy import validate_policy_contract  # noqa: E402


OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"
SERVICE = AccessContext.for_service()


def _search_payload(fingerprint: str) -> dict[str, object]:
    return {
        "fingerprint": fingerprint,
        "vertical": "flight",
        "status": "completed",
        "market": "AE",
        "intent": {"origin": "DXB", "destination": "LHR"},
        "expires_at": "2027-07-14T00:00:00Z",
    }


def _service(repository: InMemoryTravelRepository) -> TravelSearchService:
    return TravelSearchService(
        repository=repository,
        runtime=MemoryTravelRuntime(),
        providers=ProviderRegistry(),
        capability_secret=b"deletion-contract-secret-that-is-long-enough",
    )


def _seed_owned_graph(repository: InMemoryTravelRepository) -> None:
    access = AccessContext.for_owner(OWNER_A)
    repository.create_search(
        "search-owned",
        _search_payload("a" * 64),
        owner_id=OWNER_A,
    )
    repository.save_provider_attempt(
        "attempt-owned",
        "search-owned",
        {
            "provider": "fixture",
            "provider_environment": "fixture",
            "status": "succeeded",
        },
        access,
    )
    repository.save_flight_itinerary(
        "itinerary-market",
        {
            "canonical_hash": "b" * 64,
            "origin": "DXB",
            "destination": "LHR",
            "departure_date": "2027-07-20",
            "segments": [],
        },
        SERVICE,
    )
    repository.save_offer(
        "offer-owned",
        "search-owned",
        {
            "provider": "fixture",
            "vertical": "flight",
            "currency": "AED",
            "item_amount": "100.00",
            "total_amount": "125.00",
            "total_complete": True,
            "observed_at": "2026-07-13T12:00:00Z",
        },
        access,
        provider_attempt_id="attempt-owned",
        itinerary_id="itinerary-market",
    )
    repository.save_cost_component(
        "cost-owned",
        "search-owned",
        "offer-owned",
        {
            "kind": "tax",
            "label": "Taxes",
            "amount": "25.00",
            "currency": "AED",
            "mandatory": True,
            "included": True,
        },
        access,
    )
    repository.save_evidence(
        "evidence-owned",
        "search-owned",
        {"evidence_kind": "manifest", "artifact_hash": "c" * 64},
        access,
        offer_id="offer-owned",
        provider_attempt_id="attempt-owned",
    )
    repository.save_revalidation(
        "revalidation-owned",
        "search-owned",
        "offer-owned",
        {"status": "fresh", "total_amount": "125.00"},
        access,
    )
    repository.save_redirect_event(
        "redirect-owned",
        "search-owned",
        "offer-owned",
        "revalidation-owned",
        {"status": "authorized", "target_origin": "https://supplier.example"},
        access,
    )
    repository.save_feedback(
        "feedback-owned",
        "search-owned",
        {"feedback_type": "helpful"},
        access,
        offer_id="offer-owned",
    )
    repository.save_preferences(OWNER_A, {"preferred_currency": "AED"}, access)


def test_machine_policy_and_planned_provider_states_are_honest() -> None:
    assert validate_policy_contract() == []
    catalog = provider_catalog(ProviderRegistry(), environ={})
    planned = {item["provider_id"]: item for item in catalog[1:]}
    assert set(planned) == {
        "booking_demand_api",
        "expedia_rapid_api",
        "skyscanner_travel_api",
    }
    for state in planned.values():
        assert state["configured"] is False
        assert state["health"] == "blocked_external"
        assert state["implementation_status"] == "not_implemented"
        assert state["default_enabled"] is False
        assert state["data_label"] == "unavailable"
        assert state["disabled_reasons"]


def test_owner_deletion_removes_history_but_preserves_market_catalogue() -> None:
    repository = InMemoryTravelRepository()
    _seed_owned_graph(repository)
    other_access = AccessContext.for_owner(OWNER_B)
    repository.create_search(
        "search-other",
        _search_payload("d" * 64),
        owner_id=OWNER_B,
    )
    repository.save_preferences(OWNER_B, {"preferred_currency": "USD"}, other_access)

    result = repository.delete_owner_data(OWNER_A, AccessContext.for_owner(OWNER_A))

    assert result.total_deleted == 9
    assert result.preserved_deidentified_collections == DEIDENTIFIED_MARKET_COLLECTIONS
    assert repository.list_searches(AccessContext.for_owner(OWNER_A)) == []
    assert repository.get_preferences(OWNER_A, AccessContext.for_owner(OWNER_A)) is None
    assert repository.get_search("search-other", other_access) is not None
    assert repository.get_preferences(OWNER_B, other_access) is not None
    assert repository.get_flight_itinerary("itinerary-market", SERVICE) is not None
    assert repository.delete_owner_data(
        OWNER_A, AccessContext.for_owner(OWNER_A)
    ).total_deleted == 0
    with pytest.raises(AccessDeniedError, match="owner mismatch"):
        repository.delete_owner_data(OWNER_A, AccessContext.for_owner(OWNER_B))


def test_retained_market_catalogue_rejects_user_or_session_linkage() -> None:
    repository = InMemoryTravelRepository()
    forbidden_payloads = (
        {"search_id": "search-private"},
        {"source_url": "https://travel.example/private"},
        {"segments": [{"passenger_identity": "not-retainable"}]},
    )
    for index, forbidden in enumerate(forbidden_payloads):
        with pytest.raises(ValueError, match="cannot be retained"):
            repository.save_flight_itinerary(
                f"market-{index}",
                {"canonical_hash": "f" * 64, **forbidden},
                SERVICE,
            )


def test_service_deletes_search_scoped_provenance_before_owned_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = InMemoryTravelRepository()
    _seed_owned_graph(repository)
    provenance = MemoryRepo()
    owned_manifest = EvidenceManifest(manifest_id="manifest-owned")
    retained_manifest = EvidenceManifest(manifest_id="manifest-retained")
    provenance.save_manifest(owned_manifest, "travel:search-owned")
    provenance.save_manifest(retained_manifest, "travel:other-search")
    monkeypatch.setattr(service_module, "get_agentcore_repository", lambda: provenance)

    result = _service(repository).delete_user_data(OWNER_A)

    assert result.total_deleted == 9
    assert provenance.get_manifest("manifest-owned", "travel:search-owned") is None
    assert (
        provenance.get_manifest("manifest-retained", "travel:other-search")
        is not None
    )


def test_authenticated_delete_api_and_production_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = InMemoryTravelRepository()
    repository.create_search(
        "search-owned",
        _search_payload("e" * 64),
        owner_id=OWNER_A,
    )
    repository.save_preferences(
        OWNER_A,
        {"preferred_currency": "AED"},
        AccessContext.for_owner(OWNER_A),
    )
    service = _service(repository)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_travel_search_service] = lambda: service
    app.dependency_overrides[get_optional_user] = lambda: {"id": OWNER_A}
    with TestClient(app) as client:
        response = client.delete("/api/v2/travel/user-data")
        assert response.status_code == 200
        assert response.json()["deleted_records"] == 2
        assert response.json()["preserved_deidentified_collections"] == list(
            DEIDENTIFIED_MARKET_COLLECTIONS
        )
    app.dependency_overrides[get_optional_user] = lambda: None
    with TestClient(app) as client:
        assert client.delete("/api/v2/travel/user-data").status_code == 401

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv(persistence_factory.STORAGE_ENV, raising=False)
    with pytest.raises(PersistenceConfigurationError, match="requires"):
        create_travel_repository()
    with pytest.raises(PersistenceConfigurationError, match="not allowed"):
        create_travel_repository("memory")
    monkeypatch.delenv("JACOBI_AGENT_STORAGE", raising=False)
    with pytest.raises(RuntimeError, match="JACOBI_AGENT_STORAGE=supabase"):
        service_module._require_production_agent_storage()
