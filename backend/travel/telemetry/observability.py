"""Opt-in operational observability for the travel application.

The built-in implementation is deliberately local: it emits redacted JSON
logs, retains a bounded metric snapshot, and delegates spans to an already
configured OpenTelemetry provider when one is available.  It never configures
an exporter and never accepts URLs, payloads, credentials, or arbitrary tags.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import importlib
import json
import logging
import math
import os
import re
from threading import Lock
from typing import Iterator, Mapping


TRAVEL_LOGGER_NAME = "jacobi.travel"

_SAFE_LABEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
_SENSITIVE_PREFIX = re.compile(
    r"^(?:bearer|basic|cap|secret|token|sk|pk_live)[_.:-]",
    re.IGNORECASE,
)
_SAFE_METRIC_ATTRIBUTES = frozenset(
    {
        "cache",
        "environment",
        "error_code",
        "observation_method",
        "outcome",
        "provider",
        "stage",
        "status",
        "vertical",
    }
)


class TravelMetricName(str, Enum):
    """Exact operational instrument names required by the travel PRD."""

    searches_total = "travel_searches_total"
    search_duration_seconds = "travel_search_duration_seconds"
    time_to_first_offer_seconds = "travel_time_to_first_offer_seconds"
    provider_attempts_total = "travel_provider_attempts_total"
    provider_errors_total = "travel_provider_errors_total"
    provider_duration_seconds = "travel_provider_duration_seconds"
    offers_normalized_total = "travel_offers_normalized_total"
    offers_rejected_total = "travel_offers_rejected_total"
    verified_savings_total = "travel_verified_savings_total"
    revalidation_changes_total = "travel_revalidation_changes_total"
    redirects_total = "travel_redirects_total"
    cache_hits_total = "travel_cache_hits_total"
    sse_connections = "travel_sse_connections"
    extension_parse_failures_total = "travel_extension_parse_failures_total"


_GAUGES = frozenset({TravelMetricName.sse_connections})


@dataclass(frozen=True)
class TravelMetricObservation:
    name: TravelMetricName
    value: float
    attributes: Mapping[str, str] = field(default_factory=dict)
    observed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class TravelOperationalMetrics:
    """Bounded in-process observations using PRD instrument names.

    Deployers can read ``snapshot`` and bridge the values to their metrics
    backend.  Recording is a no-op unless travel telemetry was opted in.
    """

    def __init__(self, *, enabled: bool = False, max_observations: int = 2_000) -> None:
        if max_observations < 1:
            raise ValueError("max_observations must be positive")
        self._enabled = enabled
        self._max_observations = max_observations
        self._observations: list[TravelMetricObservation] = []
        self._lock = Lock()

    @property
    def enabled(self) -> bool:
        return self._enabled

    def record(
        self,
        name: TravelMetricName,
        value: float = 1.0,
        attributes: Mapping[str, str] | None = None,
    ) -> None:
        if not self._enabled:
            return
        instrument = TravelMetricName(name)
        numeric_value = float(value)
        if not math.isfinite(numeric_value):
            raise ValueError("metric value must be finite")
        if instrument not in _GAUGES and numeric_value < 0:
            raise ValueError("counter and histogram values must be non-negative")
        safe_attributes = _metric_attributes(attributes or {})
        observation = TravelMetricObservation(
            name=instrument,
            value=numeric_value,
            attributes=safe_attributes,
        )
        with self._lock:
            self._observations.append(observation)
            overflow = len(self._observations) - self._max_observations
            if overflow > 0:
                del self._observations[:overflow]

    def snapshot(self) -> list[TravelMetricObservation]:
        with self._lock:
            return list(self._observations)


class TravelObservability:
    """One privacy boundary for logs, operational metrics, and traces."""

    def __init__(
        self,
        *,
        enabled: bool = False,
        tracing_enabled: bool = False,
        metrics: TravelOperationalMetrics | None = None,
        tracer: object | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self.enabled = enabled
        self.tracing_enabled = enabled and tracing_enabled
        self.metrics = metrics or TravelOperationalMetrics(enabled=enabled)
        self._tracer = tracer
        self._tracer_resolved = tracer is not None
        self._logger = logger or logging.getLogger(TRAVEL_LOGGER_NAME)

    def log(
        self,
        *,
        correlation_id: str | None,
        search_id: str | None,
        provider_id: str | None,
        stage: str,
        duration_ms: float | int | None = None,
        result_count: int | None = None,
        sanitized_error_code: str | None = None,
        environment: str | None = None,
        observation_method: str | None = None,
    ) -> None:
        if not self.enabled:
            return
        event = _structured_event(
            correlation_id=correlation_id,
            search_id=search_id,
            provider_id=provider_id,
            stage=stage,
            duration_ms=duration_ms,
            result_count=result_count,
            sanitized_error_code=sanitized_error_code,
            environment=environment,
            observation_method=observation_method,
        )
        self._logger.info(
            json.dumps(event, sort_keys=True, separators=(",", ":")),
            extra={"travel": event},
        )

    @contextmanager
    def span(
        self,
        stage: str,
        *,
        correlation_id: str | None = None,
        search_id: str | None = None,
        provider_id: str | None = None,
        environment: str | None = None,
        observation_method: str | None = None,
    ) -> Iterator[object | None]:
        """Start a redacted OTel span without recording exception contents."""

        if not self.tracing_enabled:
            yield None
            return
        tracer = self._resolve_tracer()
        if tracer is None:
            yield None
            return
        safe_stage = _safe_label(stage)
        attributes = {
            "travel.stage": safe_stage,
            **_optional_span_attributes(
                correlation_id=correlation_id,
                search_id=search_id,
                provider_id=provider_id,
                environment=environment,
                observation_method=observation_method,
            ),
        }
        try:
            span_context = tracer.start_as_current_span(
                f"travel.{safe_stage}",
                attributes=attributes,
                record_exception=False,
                set_status_on_exception=False,
            )
        except Exception:
            yield None
            return
        with span_context as span:
            yield span

    def _resolve_tracer(self) -> object | None:
        if self._tracer_resolved:
            return self._tracer
        self._tracer_resolved = True
        try:
            trace_api = importlib.import_module("opentelemetry.trace")
            self._tracer = trace_api.get_tracer(TRAVEL_LOGGER_NAME)
        except (ImportError, AttributeError):
            self._tracer = None
        return self._tracer


def travel_observability_from_env() -> TravelObservability:
    """Build disabled-default observability from explicit travel opt-ins."""

    enabled = _literal_true("JACOBI_TRAVEL_TELEMETRY_ENABLED")
    tracing_enabled = enabled and _literal_true("JACOBI_TRAVEL_OTEL_ENABLED")
    return TravelObservability(enabled=enabled, tracing_enabled=tracing_enabled)


def _literal_true(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() == "true"


def _safe_label(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if (
        not _SAFE_LABEL.fullmatch(text)
        or _SENSITIVE_PREFIX.match(text)
        or "://" in text
        or "?" in text
    ):
        return "redacted"
    return text


def _safe_duration_ms(value: float | int | None) -> float | None:
    if value is None:
        return None
    duration = float(value)
    if not math.isfinite(duration) or duration < 0:
        return None
    return round(duration, 3)


def _safe_result_count(value: int | None) -> int | None:
    if value is None:
        return None
    return max(0, min(int(value), 10_000_000))


def _structured_event(**values: object) -> dict[str, object]:
    return {
        "event": "travel_observation",
        "correlation_id": _safe_label(values.get("correlation_id")),
        "search_id": _safe_label(values.get("search_id")),
        "provider_id": _safe_label(values.get("provider_id")),
        "stage": _safe_label(values.get("stage")),
        "duration_ms": _safe_duration_ms(values.get("duration_ms")),
        "result_count": _safe_result_count(values.get("result_count")),
        "sanitized_error_code": _safe_label(values.get("sanitized_error_code")),
        "environment": _safe_label(values.get("environment")),
        "observation_method": _safe_label(values.get("observation_method")),
    }


def _metric_attributes(attributes: Mapping[str, str]) -> dict[str, str]:
    unknown = set(attributes) - _SAFE_METRIC_ATTRIBUTES
    if unknown:
        raise ValueError(f"unsupported travel metric attributes: {', '.join(sorted(unknown))}")
    result: dict[str, str] = {}
    for key, value in attributes.items():
        safe = _safe_label(value)
        if safe in {None, "redacted"} and str(value).strip() != "redacted":
            raise ValueError(f"unsafe travel metric attribute: {key}")
        result[key] = str(safe)
    return result


def _optional_span_attributes(**values: str | None) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in values.items():
        if value is not None:
            result[f"travel.{key}"] = str(_safe_label(value))
    return result
