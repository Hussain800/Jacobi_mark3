import asyncio

import pytest

from compare.schemas import ComparisonRequest
from compare.service import ComparisonService
from compare.telemetry import MetricEvent, OptionalMetricsRecorder, metrics_from_env
from test_compare_tooling import REQUEST


def test_telemetry_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("JACOBI_COMPARE_TELEMETRY_ENABLED", raising=False)
    recorder = metrics_from_env()
    recorder.record(MetricEvent.identity_success, dimensions={"market": "AE"})
    assert not recorder.enabled
    assert recorder.snapshot() == []


def test_explicitly_enabled_recorder_covers_pdr_events_and_is_bounded():
    recorder = OptionalMetricsRecorder(enabled=True, max_observations=2)
    recorder.record(MetricEvent.providers_attempted, 4, {"market": "AE"})
    recorder.record(MetricEvent.providers_successful, 3, {"market": "AE"})
    recorder.record(MetricEvent.partial_failure, 1, {"reason_code": "TIMEOUT"})
    observations = recorder.snapshot()
    assert [item.event for item in observations] == [
        MetricEvent.providers_successful,
        MetricEvent.partial_failure,
    ]
    assert observations[0].value == 3


@pytest.mark.parametrize(
    "event",
    [
        MetricEvent.identity_success,
        MetricEvent.identity_uncertainty,
        MetricEvent.providers_attempted,
        MetricEvent.providers_successful,
        MetricEvent.partial_failure,
        MetricEvent.saving_found,
        MetricEvent.no_saving,
        MetricEvent.alternative_opened,
        MetricEvent.latency_ms,
        MetricEvent.false_match_report,
        MetricEvent.wrong_match_feedback,
    ],
)
def test_all_required_metric_events_are_recordable(event):
    recorder = OptionalMetricsRecorder(enabled=True)
    recorder.record(event)
    assert recorder.snapshot()[0].event == event


def test_telemetry_rejects_urls_and_arbitrary_sensitive_dimensions():
    recorder = OptionalMetricsRecorder(enabled=True)
    with pytest.raises(ValueError, match="unsupported metric dimensions"):
        recorder.record(MetricEvent.saving_found, dimensions={"source_url": "https://shop.example/p"})
    with pytest.raises(ValueError, match="must not contain URLs"):
        recorder.record(MetricEvent.providers_attempted, dimensions={"provider": "https://shop.example"})


def test_env_opt_in_requires_literal_true(monkeypatch):
    monkeypatch.setenv("JACOBI_COMPARE_TELEMETRY_ENABLED", "1")
    assert not metrics_from_env().enabled
    monkeypatch.setenv("JACOBI_COMPARE_TELEMETRY_ENABLED", "true")
    assert metrics_from_env().enabled


def test_comparison_service_records_only_bounded_outcome_metrics():
    recorder = OptionalMetricsRecorder(enabled=True)
    service = ComparisonService(metrics=recorder)
    result = asyncio.run(service.compare(ComparisonRequest.model_validate(REQUEST)))
    assert result.savings.amount is not None
    events = {observation.event for observation in recorder.snapshot()}
    assert {
        MetricEvent.identity_success,
        MetricEvent.providers_attempted,
        MetricEvent.providers_successful,
        MetricEvent.saving_found,
        MetricEvent.latency_ms,
    } <= events
    assert all("source_url" not in observation.dimensions for observation in recorder.snapshot())
