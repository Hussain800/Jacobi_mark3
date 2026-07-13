from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v2_travel import router
from auth_user import get_optional_user
from travel.persistence import InMemoryTravelRepository
from travel.providers import ProviderRegistry
from travel.search.runtime import MemoryTravelRuntime
from travel.search.service import TravelSearchService, get_travel_search_service
from travel.search.worker import TravelSearchWorker


def flight_payload() -> dict:
    return {
        "vertical": "flight",
        "intent": {
            "trip_type": "one_way",
            "legs": [
                {
                    "origin_airport": "DXB",
                    "destination_airport": "LHR",
                    "departure_date": date(2027, 2, 1).isoformat(),
                }
            ],
            "passengers": {"adults": 1},
            "locale": "en-AE",
            "market": "AE",
            "display_currency": "AED",
            "source_page": {"site": "demo.jacobi.local", "page_kind": "flight"},
            "extracted_at": datetime(2026, 7, 13, tzinfo=timezone.utc).isoformat(),
        },
    }


def _app_and_service() -> tuple[FastAPI, TravelSearchService]:
    service = TravelSearchService(
        repository=InMemoryTravelRepository(),
        runtime=MemoryTravelRuntime(),
        providers=ProviderRegistry(),
        capability_secret=b"api-test-secret-that-is-long-enough",
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_travel_search_service] = lambda: service
    app.dependency_overrides[get_optional_user] = lambda: None
    return app, service


def test_create_get_sse_replay_and_capability_boundary() -> None:
    app, service = _app_and_service()
    with TestClient(app) as client:
        response = client.post(
            "/api/v2/travel/searches",
            headers={
                "Idempotency-Key": "api-flight-search-00001",
                "X-Jacobi-Extension-Version": "0.2.0",
            },
            json=flight_payload(),
        )
        assert response.status_code == 202
        assert response.headers["X-Jacobi-Travel-API-Version"] == "2"
        accepted = response.json()
        asyncio.run(TravelSearchWorker(service).process_one())
        headers = {"X-Jacobi-Search-Capability": accepted["capability_token"]}
        snapshot = client.get(accepted["result_url"], headers=headers)
        assert snapshot.status_code == 200
        assert snapshot.json()["status"] == "degraded"
        assert client.get(accepted["result_url"]).status_code == 404

        events = client.get(
            accepted["events_url"],
            headers={**headers, "Last-Event-ID": "1"},
        )
        assert events.status_code == 200
        assert events.headers["content-type"].startswith("text/event-stream")
        assert "event: search.degraded" in events.text
        assert "id: 1\n" not in events.text


def test_provider_labels_and_preferences_auth_boundary() -> None:
    app, _ = _app_and_service()
    with TestClient(app) as client:
        providers = client.get("/api/v2/travel/providers").json()["providers"]
        assert providers[0]["configured"] is False
        assert providers[0]["data_label"] == "sandbox_api"
        assert providers[0]["fixture"] is False
        assert client.get("/api/v2/travel/preferences").status_code == 401


def test_openapi_contains_travel_stateful_routes() -> None:
    app, _ = _app_and_service()
    paths = app.openapi()["paths"]
    assert "/api/v2/travel/searches" in paths
    assert "/api/v2/travel/searches/{search_id}/events" in paths
    assert "/api/v2/travel/searches/{search_id}/offers/{offer_id}/revalidate" in paths
    assert "/api/v2/travel/redirects" in paths


def test_feedback_rejects_complete_urls_before_persistence() -> None:
    app, service = _app_and_service()
    with TestClient(app) as client:
        accepted = client.post(
            "/api/v2/travel/searches",
            headers={"Idempotency-Key": "api-feedback-search-0001"},
            json=flight_payload(),
        ).json()
        response = client.post(
            "/api/v2/travel/feedback",
            headers={"X-Jacobi-Search-Capability": accepted["capability_token"]},
            json={
                "search_id": accepted["search_id"],
                "feedback_type": "route_failed",
                "details": {"url": "https://example.test/private-session"},
            },
        )
        assert response.status_code == 422
