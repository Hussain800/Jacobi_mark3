"""Privacy-conscious, opt-in metrics primitives for price optimization.

This module does not transmit data.  Deployers may consume snapshots or
provide another ``MetricsRecorder`` implementation.  The built-in recorder is
disabled unless explicitly enabled and accepts only bounded, non-URL
dimensions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import math
import os
from threading import Lock
from typing import Dict, List, Mapping, Protocol, Union


MetricDimension = Union[str, int, float, bool]


class MetricEvent(str, Enum):
    identity_success = "identity_success"
    identity_uncertainty = "identity_uncertainty"
    providers_attempted = "providers_attempted"
    providers_successful = "providers_successful"
    partial_failure = "partial_failure"
    saving_found = "saving_found"
    no_saving = "no_saving"
    alternative_opened = "alternative_opened"
    latency_ms = "latency_ms"
    false_match_report = "false_match_report"
    wrong_match_feedback = "wrong_match_feedback"


SAFE_DIMENSIONS = frozenset(
    {
        "market",
        "provider",
        "outcome",
        "preference_mode",
        "reason_code",
        "evidence_tier",
    }
)


@dataclass(frozen=True)
class MetricObservation:
    event: MetricEvent
    value: float
    dimensions: Mapping[str, MetricDimension] = field(default_factory=dict)
    observed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class MetricsRecorder(Protocol):
    @property
    def enabled(self) -> bool: ...

    def record(
        self,
        event: MetricEvent,
        value: float = 1.0,
        dimensions: Mapping[str, MetricDimension] | None = None,
    ) -> None: ...


class OptionalMetricsRecorder:
    """A bounded in-process recorder suitable for self-hosted deployments.

    Recording is a no-op by default.  Raw URLs, product titles, identifiers,
    seller names, and arbitrary tags have no accepted dimension key.
    """

    def __init__(self, *, enabled: bool = False, max_observations: int = 1_000) -> None:
        if max_observations < 1:
            raise ValueError("max_observations must be positive")
        self._enabled = enabled
        self._max_observations = max_observations
        self._observations: List[MetricObservation] = []
        self._lock = Lock()

    @property
    def enabled(self) -> bool:
        return self._enabled

    def record(
        self,
        event: MetricEvent,
        value: float = 1.0,
        dimensions: Mapping[str, MetricDimension] | None = None,
    ) -> None:
        if not self._enabled:
            return
        event = MetricEvent(event)
        numeric_value = float(value)
        if not math.isfinite(numeric_value) or numeric_value < 0:
            raise ValueError("metric value must be a finite non-negative number")
        safe_dimensions = self._validate_dimensions(dimensions or {})
        observation = MetricObservation(
            event=event,
            value=numeric_value,
            dimensions=safe_dimensions,
        )
        with self._lock:
            self._observations.append(observation)
            overflow = len(self._observations) - self._max_observations
            if overflow > 0:
                del self._observations[:overflow]

    def snapshot(self) -> List[MetricObservation]:
        with self._lock:
            return list(self._observations)

    @staticmethod
    def _validate_dimensions(
        dimensions: Mapping[str, MetricDimension],
    ) -> Dict[str, MetricDimension]:
        unknown = set(dimensions) - SAFE_DIMENSIONS
        if unknown:
            raise ValueError(f"unsupported metric dimensions: {', '.join(sorted(unknown))}")
        result: Dict[str, MetricDimension] = {}
        for key, value in dimensions.items():
            if not isinstance(value, (str, int, float, bool)):
                raise ValueError(f"metric dimension {key} must be scalar")
            if isinstance(value, str):
                if "://" in value or "\n" in value or "\r" in value:
                    raise ValueError("metric dimensions must not contain URLs or line breaks")
                if len(value) > 64:
                    raise ValueError("metric dimension strings are limited to 64 characters")
            result[key] = value
        return result


def metrics_from_env() -> OptionalMetricsRecorder:
    """Create a recorder; telemetry remains off unless set to literal ``true``."""

    enabled = (
        os.getenv("JACOBI_COMPARE_TELEMETRY_ENABLED", "false").strip().lower()
        == "true"
    )
    return OptionalMetricsRecorder(enabled=enabled)
