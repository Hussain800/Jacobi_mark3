from __future__ import annotations

import asyncio

import httpx

from travel.search.worker import TravelSearchWorker
from travel.telemetry import MetricEvent, OptionalMetricsRecorder, travel_metrics_from_env

from test_search_service_worker import (
    _fixture,
    _provider,
    _service,
    _token_response,
    flight_input,
)


def test_travel_telemetry_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("JACOBI_TRAVEL_TELEMETRY_ENABLED", raising=False)
    recorder = travel_metrics_from_env()
    recorder.record(MetricEvent.identity_success, dimensions={"market": "AE"})
    assert recorder.enabled is False
    assert recorder.snapshot() == []


def test_travel_search_records_only_bounded_outcome_metrics() -> None:
    async def scenario() -> list:
        recorder = OptionalMetricsRecorder(enabled=True)

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/token"):
                return _token_response()
            return httpx.Response(200, json=_fixture("flight_search_success.json"))

        service = _service(_provider(handler))
        service.metrics = recorder
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="travel-telemetry-search-0001",
        )
        await TravelSearchWorker(service).process_one()
        service.get_snapshot(
            accepted.search_id,
            capability_token=accepted.capability_token,
        )
        return recorder.snapshot()

    observations = asyncio.run(scenario())
    events = {item.event for item in observations}
    assert {
        MetricEvent.identity_success,
        MetricEvent.providers_attempted,
        MetricEvent.providers_successful,
        MetricEvent.saving_found,
        MetricEvent.latency_ms,
    } <= events
    assert all(
        "source_url" not in item.dimensions and "search_id" not in item.dimensions
        for item in observations
    )


def test_travel_telemetry_rejects_sensitive_dimensions() -> None:
    recorder = OptionalMetricsRecorder(enabled=True)
    try:
        recorder.record(
            MetricEvent.providers_attempted,
            dimensions={"search_id": "ts_private"},
        )
    except ValueError as exc:
        assert "unsupported metric dimensions" in str(exc)
    else:
        raise AssertionError("sensitive metric dimension was accepted")
