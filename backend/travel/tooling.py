"""Shared travel tooling facade for CLI and MCP surfaces.

The facade translates transport-friendly JSON into the durable travel search
service. Domain validation, provider execution, persistence, revalidation and
golden-corpus evaluation remain in their owning packages.
"""

from __future__ import annotations

import statistics
import time
from typing import Any, Mapping, Protocol, Sequence

from pydantic import TypeAdapter

from .domain.enums import TravelVertical
from .domain.flight import FlightIntent
from .domain.hotel import HotelIntent
from .evaluation import (
    COST_RANKING_DATASET_FILES,
    DATASET_FILES,
    evaluate_accuracy_dataset,
    evaluate_dataset,
)
from .search import intent_fingerprint
from .search.schemas import TravelSearchInput
from .search.service import TravelSearchService, get_travel_search_service


_SEARCH_INPUT = TypeAdapter(TravelSearchInput)


class TravelToolingProtocol(Protocol):
    """Injectable boundary shared by local CLI and MCP transports."""

    def parse_intent(self, payload: Mapping[str, Any]) -> dict[str, Any]: ...
    async def search(self, payload: Mapping[str, Any]) -> dict[str, Any]: ...
    async def status(
        self, search_id: str, capability_token: str
    ) -> dict[str, Any]: ...
    async def revalidate(
        self, search_id: str, offer_id: str, capability_token: str
    ) -> dict[str, Any]: ...
    async def explain(
        self, search_id: str, capability_token: str
    ) -> dict[str, Any]: ...
    async def evidence(
        self, search_id: str, capability_token: str
    ) -> dict[str, Any]: ...
    def providers(self) -> list[dict[str, Any]]: ...
    async def health(self) -> dict[str, Any]: ...
    def evaluate(self, dataset: str) -> dict[str, Any]: ...
    def benchmark(
        self,
        *,
        dataset: str | None = None,
        iterations: int = 5,
        warmups: int = 1,
    ) -> dict[str, Any]: ...


def _percentile(values: Sequence[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(
        len(ordered) - 1,
        max(0, int(round((len(ordered) - 1) * percentile))),
    )
    return ordered[index]


class TravelToolingService:
    """Transport-neutral adapter over :class:`TravelSearchService`."""

    def __init__(self, search_service: TravelSearchService | None = None) -> None:
        self.search_service = search_service or get_travel_search_service()

    @staticmethod
    def _unwrap_intent(
        payload: Mapping[str, Any],
    ) -> tuple[TravelVertical, Mapping[str, Any]]:
        raw = payload.get("intent", payload)
        if not isinstance(raw, Mapping):
            raise ValueError("intent must be a JSON object")
        raw_vertical = payload.get("vertical")
        if raw_vertical is None:
            if "legs" in raw:
                raw_vertical = TravelVertical.FLIGHT.value
            elif "property_hint" in raw:
                raw_vertical = TravelVertical.HOTEL.value
            else:
                raise ValueError("vertical is required when intent shape is ambiguous")
        try:
            vertical = TravelVertical(str(raw_vertical).strip().lower())
        except ValueError as exc:
            raise ValueError("travel vertical must be 'flight' or 'hotel'") from exc
        return vertical, raw

    @classmethod
    def _intent(
        cls, payload: Mapping[str, Any]
    ) -> tuple[TravelVertical, FlightIntent | HotelIntent]:
        vertical, raw = cls._unwrap_intent(payload)
        if vertical == TravelVertical.FLIGHT:
            return vertical, FlightIntent.model_validate(raw)
        return vertical, HotelIntent.model_validate(raw)

    def parse_intent(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        vertical, intent = self._intent(payload)
        return {
            "vertical": vertical.value,
            "intent": intent.model_dump(mode="json"),
            "intent_fingerprint": intent_fingerprint(intent),
            "network_requests_performed": 0,
        }

    async def search(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        body = dict(payload)
        idempotency_key = body.pop("idempotency_key", None)
        if idempotency_key is not None and not isinstance(idempotency_key, str):
            raise ValueError("idempotency_key must be a string")
        search_input = _SEARCH_INPUT.validate_python(body)
        accepted = await self.search_service.create_search(
            search_input,
            idempotency_key=idempotency_key,
        )
        result = accepted.model_dump(mode="json")
        result.update(
            {
                "execution_mode": "durable_job",
                "network_request_completed": False,
                "note": "Search was accepted; use status/events for progressive results.",
            }
        )
        return result

    async def status(
        self, search_id: str, capability_token: str
    ) -> dict[str, Any]:
        return self.search_service.get_snapshot(
            search_id,
            capability_token=capability_token,
        ).model_dump(mode="json")

    async def revalidate(
        self, search_id: str, offer_id: str, capability_token: str
    ) -> dict[str, Any]:
        return (
            await self.search_service.revalidate_offer(
                search_id,
                offer_id,
                capability_token=capability_token,
            )
        ).model_dump(mode="json")

    async def explain(
        self, search_id: str, capability_token: str
    ) -> dict[str, Any]:
        snapshot = self.search_service.get_snapshot(
            search_id,
            capability_token=capability_token,
        )
        if snapshot.status in {"completed", "degraded"} and snapshot.offers:
            explanation = (
                f"Search {snapshot.status} with {len(snapshot.offers)} normalized offer(s). "
                "Review equivalence, mandatory-cost completeness and fresh revalidation "
                "before redirect."
            )
        elif snapshot.status in {"failed", "degraded"}:
            explanation = (
                "The search cannot currently support a savings claim. Review provider "
                "attempts and degraded reasons."
            )
        else:
            explanation = (
                f"Search is {snapshot.status}; provider work and deterministic ranking may "
                "still be in progress."
            )
        return {
            "search_id": search_id,
            "status": snapshot.status,
            "explanation": explanation,
            "provider_attempts": snapshot.provider_attempts,
            "degraded_reasons": snapshot.degraded_reasons,
            "selected_offer_id": snapshot.selected_offer_id,
            "saving": snapshot.saving,
        }

    async def evidence(
        self, search_id: str, capability_token: str
    ) -> dict[str, Any]:
        access = self.search_service.access(None, capability_token)
        self.search_service.require_search(
            search_id,
            capability_token=capability_token,
        )
        evidence = [
            record.payload
            for record in self.search_service.repository.list_evidence(search_id, access)
        ]
        revalidations = [
            record.payload
            for record in self.search_service.repository.list_revalidations(
                search_id, access
            )
        ]
        return {
            "search_id": search_id,
            "evidence": evidence,
            "revalidations": revalidations,
            "raw_provider_payloads_included": False,
        }

    def providers(self) -> list[dict[str, Any]]:
        return [
            {**dict(item), "health_check_network_request": False}
            for item in self.search_service.provider_capabilities()
        ]

    async def health(self) -> dict[str, Any]:
        health = dict(await self.search_service.provider_health())
        providers = list(health.get("providers") or [])
        runtime_healthy = health.get("runtime") == "healthy"
        worker_healthy = health.get("worker") in {"inline", "healthy"}
        return {
            "status": (
                "ready"
                if runtime_healthy
                and worker_healthy
                and any(item.get("configured") for item in providers)
                else "degraded"
            ),
            "runtime": health.get("runtime", "unknown"),
            "worker": health.get("worker", "unknown"),
            "configured_provider_count": sum(
                1 for item in providers if item.get("configured")
            ),
            "providers": providers,
            "provider_health_network_requests": 0,
            "fixture_data_reported_as_live": False,
        }

    def evaluate(self, dataset: str) -> dict[str, Any]:
        if dataset.removesuffix(".jsonl") in COST_RANKING_DATASET_FILES:
            report = evaluate_accuracy_dataset(dataset)
            payload = report.model_dump(mode="json")
            payload.update(
                {
                    "passed": report.passed,
                    "evidence_label": "fixture",
                    "real_user_validation": False,
                }
            )
            return payload
        report = evaluate_dataset(dataset)
        payload = report.model_dump(mode="json")
        payload.update(
            {
                "passed": report.passed,
                "evidence_label": "fixture",
                "real_user_validation": False,
                "cost_accuracy": None,
                "ranking_agreement": None,
                "unsupported_metrics_reason": (
                    "equivalence corpora do not contain payable-cost or ranked-list labels"
                ),
            }
        )
        return payload

    def benchmark(
        self,
        *,
        dataset: str | None = None,
        iterations: int = 5,
        warmups: int = 1,
    ) -> dict[str, Any]:
        if iterations < 1 or iterations > 1_000:
            raise ValueError("iterations must be between 1 and 1000")
        if warmups < 0 or warmups > 100:
            raise ValueError("warmups must be between 0 and 100")
        datasets = [dataset] if dataset else sorted(DATASET_FILES)
        for _ in range(warmups):
            for name in datasets:
                evaluate_dataset(name)
        timings: list[float] = []
        reports = []
        for _ in range(iterations):
            started = time.perf_counter()
            reports = [evaluate_dataset(name) for name in datasets]
            timings.append((time.perf_counter() - started) * 1000)
        return {
            "workload": "travel_equivalence_fixture_corpora",
            "datasets": [report.dataset for report in reports],
            "case_count_per_iteration": sum(report.record_count for report in reports),
            "iterations": iterations,
            "warmups": warmups,
            "median_ms": round(statistics.median(timings), 3),
            "p95_ms": round(_percentile(timings, 0.95), 3),
            "max_ms": round(max(timings), 3),
            "all_evaluations_passed": all(report.passed for report in reports),
            "evidence_label": "fixture",
            "includes_live_provider_latency": False,
        }


_SERVICE: TravelToolingProtocol | None = None


def get_travel_tooling_service() -> TravelToolingProtocol:
    global _SERVICE
    if _SERVICE is None:
        _SERVICE = TravelToolingService()
    return _SERVICE


def set_travel_tooling_service_for_tests(
    service: TravelToolingProtocol | None,
) -> None:
    global _SERVICE
    _SERVICE = service


def reset_travel_tooling_service_for_tests() -> None:
    set_travel_tooling_service_for_tests(None)
