from __future__ import annotations

import asyncio
import logging

import httpx
import pytest

from travel.search.worker import TravelSearchWorker
from travel.telemetry import (
    TRAVEL_LOGGER_NAME,
    MetricEvent,
    OptionalMetricsRecorder,
    TravelMetricName,
    TravelObservability,
    TravelOperationalMetrics,
    travel_metrics_from_env,
    travel_observability_from_env,
)
from travel.telemetry import observability as observability_module

from test_search_service_worker import (
    _fixture,
    _provider,
    _service,
    _token_response,
    flight_input,
)


def test_travel_telemetry_is_disabled_by_default(monkeypatch, caplog) -> None:
    monkeypatch.delenv("JACOBI_TRAVEL_TELEMETRY_ENABLED", raising=False)
    monkeypatch.delenv("JACOBI_TRAVEL_OTEL_ENABLED", raising=False)
    recorder = travel_metrics_from_env()
    recorder.record(MetricEvent.identity_success, dimensions={"market": "AE"})
    assert recorder.enabled is False
    assert recorder.snapshot() == []

    operational = travel_observability_from_env()
    with caplog.at_level(logging.INFO, logger=TRAVEL_LOGGER_NAME):
        operational.log(
            correlation_id="req_safe",
            search_id="ts_safe",
            provider_id="amadeus",
            stage="provider.attempt.completed",
        )
    operational.metrics.record(TravelMetricName.searches_total)
    with operational.span("provider_call"):
        pass
    assert operational.enabled is False
    assert operational.tracing_enabled is False
    assert operational.metrics.snapshot() == []
    assert not any(hasattr(record, "travel") for record in caplog.records)


def test_structured_travel_log_has_fixed_fields_and_redacts_secrets(caplog) -> None:
    telemetry = TravelObservability(enabled=True)
    with caplog.at_level(logging.INFO, logger=TRAVEL_LOGGER_NAME):
        telemetry.log(
            correlation_id="https://provider.example/search?capability=cap_secret",
            search_id="cap_should-never-be-logged",
            provider_id="amadeus",
            stage="provider.attempt.failed",
            duration_ms=12.34567,
            result_count=0,
            sanitized_error_code="upstream",
            environment="sandbox_api",
            observation_method="provider_api",
        )

    record = next(item for item in caplog.records if hasattr(item, "travel"))
    event = record.travel
    assert set(event) == {
        "event",
        "correlation_id",
        "search_id",
        "provider_id",
        "stage",
        "duration_ms",
        "result_count",
        "sanitized_error_code",
        "environment",
        "observation_method",
    }
    assert event["correlation_id"] == "redacted"
    assert event["search_id"] == "redacted"
    assert event["provider_id"] == "amadeus"
    rendered = record.getMessage()
    assert "provider.example" not in rendered
    assert "cap_secret" not in rendered
    assert "cap_should-never-be-logged" not in rendered


def test_operational_metrics_use_exact_prd_names_and_bounded_attributes() -> None:
    assert {item.value for item in TravelMetricName} == {
        "travel_searches_total",
        "travel_search_duration_seconds",
        "travel_time_to_first_offer_seconds",
        "travel_provider_attempts_total",
        "travel_provider_errors_total",
        "travel_provider_duration_seconds",
        "travel_offers_normalized_total",
        "travel_offers_rejected_total",
        "travel_verified_savings_total",
        "travel_revalidation_changes_total",
        "travel_redirects_total",
        "travel_cache_hits_total",
        "travel_sse_connections",
        "travel_extension_parse_failures_total",
    }
    metrics = TravelOperationalMetrics(enabled=True)
    metrics.record(
        TravelMetricName.provider_attempts_total,
        attributes={"provider": "amadeus", "environment": "sandbox_api"},
    )
    assert metrics.snapshot()[0].name is TravelMetricName.provider_attempts_total
    with pytest.raises(ValueError, match="unsupported travel metric attributes"):
        metrics.record(
            TravelMetricName.searches_total,
            attributes={"search_id": "ts_private"},
        )
    with pytest.raises(ValueError, match="unsafe travel metric attribute"):
        metrics.record(
            TravelMetricName.provider_attempts_total,
            attributes={"provider": "https://provider.example?q=secret"},
        )


def test_tracing_is_inert_by_default_and_uses_redacted_otel_attributes(monkeypatch) -> None:
    monkeypatch.delenv("JACOBI_TRAVEL_TELEMETRY_ENABLED", raising=False)
    monkeypatch.delenv("JACOBI_TRAVEL_OTEL_ENABLED", raising=False)

    def unexpected_import(_name: str):
        raise AssertionError("disabled tracing must not import OpenTelemetry")

    monkeypatch.setattr(observability_module.importlib, "import_module", unexpected_import)
    with travel_observability_from_env().span("provider_call"):
        pass

    monkeypatch.setenv("JACOBI_TRAVEL_TELEMETRY_ENABLED", "true")
    monkeypatch.setenv("JACOBI_TRAVEL_OTEL_ENABLED", "true")
    configured = travel_observability_from_env()
    assert configured.enabled is True
    assert configured.tracing_enabled is True

    calls: list[tuple[str, dict]] = []

    class FakeSpanContext:
        def __enter__(self):
            return object()

        def __exit__(self, exc_type, exc, traceback):
            return False

    class FakeTracer:
        def start_as_current_span(self, name: str, **kwargs):
            calls.append((name, kwargs))
            return FakeSpanContext()

    enabled = TravelObservability(
        enabled=True,
        tracing_enabled=True,
        tracer=FakeTracer(),
    )
    with enabled.span(
        "provider_call",
        correlation_id="https://example.test/?token=secret",
        search_id="cap_private",
        provider_id="amadeus",
        environment="sandbox_api",
        observation_method="provider_api",
    ):
        pass

    name, kwargs = calls[0]
    assert name == "travel.provider_call"
    assert kwargs["record_exception"] is False
    assert kwargs["set_status_on_exception"] is False
    assert kwargs["attributes"]["travel.correlation_id"] == "redacted"
    assert kwargs["attributes"]["travel.search_id"] == "redacted"
    assert kwargs["attributes"]["travel.provider_id"] == "amadeus"


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


def test_worker_emits_redacted_provider_logs_and_prd_metrics(caplog) -> None:
    async def scenario():
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/token"):
                return _token_response()
            return httpx.Response(200, json=_fixture("flight_search_success.json"))

        service = _service(_provider(handler))
        service.observability = TravelObservability(enabled=True)
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="travel-observability-search-0001",
        )
        await TravelSearchWorker(service).process_one()
        return service.observability.metrics.snapshot()

    with caplog.at_level(logging.INFO, logger=TRAVEL_LOGGER_NAME):
        observations = asyncio.run(scenario())

    names = {item.name for item in observations}
    assert {
        TravelMetricName.searches_total,
        TravelMetricName.provider_attempts_total,
        TravelMetricName.provider_duration_seconds,
        TravelMetricName.offers_normalized_total,
        TravelMetricName.time_to_first_offer_seconds,
        TravelMetricName.search_duration_seconds,
    } <= names
    provider_events = [
        record.travel
        for record in caplog.records
        if hasattr(record, "travel")
        and record.travel["stage"] == "provider.attempt.completed"
    ]
    assert provider_events
    assert provider_events[0]["provider_id"] == "amadeus"
    assert provider_events[0]["environment"] == "sandbox_api"
    rendered = "\n".join(record.getMessage() for record in caplog.records)
    assert "access_token" not in rendered
    assert "client_secret" not in rendered
    assert "https://" not in rendered


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
