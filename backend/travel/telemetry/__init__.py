"""Travel-specific opt-in wiring for the shared bounded metrics recorder."""

from __future__ import annotations

import os

from compare.telemetry import MetricEvent, MetricsRecorder, OptionalMetricsRecorder

from .observability import (
    TRAVEL_LOGGER_NAME,
    TravelMetricName,
    TravelMetricObservation,
    TravelObservability,
    TravelOperationalMetrics,
    travel_observability_from_env,
)


def travel_metrics_from_env() -> OptionalMetricsRecorder:
    """Telemetry is disabled unless the literal travel opt-in is ``true``."""

    enabled = (
        os.getenv("JACOBI_TRAVEL_TELEMETRY_ENABLED", "false").strip().lower()
        == "true"
    )
    return OptionalMetricsRecorder(enabled=enabled)


__all__ = [
    "MetricEvent",
    "MetricsRecorder",
    "OptionalMetricsRecorder",
    "TRAVEL_LOGGER_NAME",
    "TravelMetricName",
    "TravelMetricObservation",
    "TravelObservability",
    "TravelOperationalMetrics",
    "travel_observability_from_env",
    "travel_metrics_from_env",
]
