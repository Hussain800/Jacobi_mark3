"""Redis-coordinated travel search worker and deterministic result pipeline."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from agentcore.evidence import build_manifest
from agentcore.schemas import (
    CollectionAttempt,
    Extraction,
    PriceObligation,
    ProviderCapabilities,
)
from agentcore.storage import get_repo as get_agentcore_repository
from pydantic import TypeAdapter

from ..costing import CostComponent, summarize_costs
from ..domain import (
    AvailabilityStatus,
    CostKind,
    CostState,
    EquivalenceClass,
    EvidenceKind,
    EvidenceSourceType,
    EvidenceStrength,
    Money,
    ObservationMethod,
    ProviderEnvironment as DomainProviderEnvironment,
    RedirectFriction,
    SupplierRiskTier,
    TravelEvidence,
)
from ..equivalence import classify_flight_equivalence, classify_hotel_equivalence
from ..persistence import AccessContext
from ..providers import (
    FlightSearchRequest,
    HotelSearchRequest,
    FlightOfferBatch,
    HotelOfferBatch,
    NormalizedFlightOffer,
    NormalizedHotelOffer,
    ProviderBatch,
    ProviderError,
    ProviderErrorCode,
    TravelVertical,
)
from ..ranking import RankableCandidate, rank_candidates
from ..telemetry import MetricEvent, TravelMetricName
from ..costing import classify_saving
from .models import (
    SearchEventType,
    SearchJob,
    SearchStatus,
    TERMINAL_STATUSES,
    validate_transition,
)
from .deduplication import deduplicate_normalized_offers
from .normalization import (
    flight_costs,
    flight_domain_offer,
    hotel_costs,
    hotel_domain_offer,
    stable_id,
)
from .schemas import (
    FlightSearchInput,
    HotelSearchInput,
    TravelPreferences,
    TravelSearchInput,
)
from .service import TravelSearchService, get_travel_search_service


SOFT_DEADLINE_SECONDS = 8.0
PROVIDER_TIMEOUT_SECONDS = 8.0
MAX_PROVIDER_ATTEMPTS = 2
OFFER_CACHE_TTL_SECONDS = 300
_SEARCH_INPUT_ADAPTER = TypeAdapter(TravelSearchInput)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sanitized_error(exc: BaseException) -> tuple[str, str]:
    if isinstance(exc, ProviderError):
        return exc.code.value, str(exc)[:500]
    if isinstance(exc, TimeoutError):
        return ProviderErrorCode.timeout.value, "Provider deadline exceeded."
    return ProviderErrorCode.upstream.value, f"Provider failed: {type(exc).__name__}"


class TravelSearchWorker:
    def __init__(
        self,
        service: TravelSearchService,
        *,
        worker_id: str | None = None,
        soft_deadline_seconds: float = SOFT_DEADLINE_SECONDS,
        provider_timeout_seconds: float = PROVIDER_TIMEOUT_SECONDS,
        max_provider_attempts: int = MAX_PROVIDER_ATTEMPTS,
    ) -> None:
        self.service = service
        self.worker_id = worker_id or f"worker_{uuid4().hex[:12]}"
        self._service_access = AccessContext.for_service()
        self.soft_deadline_seconds = max(0.001, soft_deadline_seconds)
        self.provider_timeout_seconds = max(0.01, provider_timeout_seconds)
        self.max_provider_attempts = max(1, min(max_provider_attempts, 5))
        self._last_expiry_sweep = 0.0

    async def process_one(self, *, claim_timeout_seconds: float = 0.1) -> bool:
        with self.service.observability.span(
            "queue_wait",
            environment="worker",
            observation_method="queue",
        ):
            job = await self.service.runtime.claim(timeout_seconds=claim_timeout_seconds)
        if job is None:
            return False
        await self.process_job(job)
        return True

    async def run_forever(self, stop: asyncio.Event | None = None) -> None:
        while stop is None or not stop.is_set():
            await self.service.runtime.heartbeat(self.worker_id)
            if time.monotonic() - self._last_expiry_sweep >= 60:
                await self.service.expire_due_searches()
                self._last_expiry_sweep = time.monotonic()
            await self.process_one(claim_timeout_seconds=1.0)

    async def _transition(
        self,
        search_id: str,
        target: SearchStatus,
        *,
        updates: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        record = self.service.repository.get_search(search_id, self._service_access)
        if record is None:
            raise LookupError("travel search disappeared")
        payload = dict(record.payload)
        current = SearchStatus(payload["status"])
        if current != target:
            validate_transition(current, target)
        payload["status"] = target.value
        payload["updated_at"] = _utcnow().isoformat()
        payload.update(updates or {})
        self.service.repository.update_search(
            search_id,
            payload,
            self._service_access,
        )
        return payload

    async def process_job(self, job: SearchJob) -> None:
        search_started = time.monotonic()
        lease_key = f"search:{job.search_id}"
        lease = await self.service.runtime.acquire_lease(lease_key, ttl_seconds=20)
        if lease is None:
            return
        tasks: list[asyncio.Task] = []
        soft_deadline_task: asyncio.Task | None = None
        metric_market = "unknown"
        operational_vertical = "unknown"
        operational_outcome = "unknown"
        operational_result_count = 0
        operational_error_code: str | None = None
        try:
            record = self.service.repository.get_search(job.search_id, self._service_access)
            if record is None or SearchStatus(record.payload["status"]) in TERMINAL_STATUSES:
                return
            metric_market = str(record.payload.get("market", "unknown"))
            search_input = _SEARCH_INPUT_ADAPTER.validate_python(
                {
                    "vertical": record.payload["vertical"],
                    "intent": record.payload["intent"],
                    "baseline_costs": record.payload.get("baseline_costs", []),
                    "requested_providers": record.payload.get("requested_providers", []),
                }
            )
            preferences = TravelPreferences.model_validate(
                record.payload.get("preferences") or {}
            )
            operational_vertical = str(search_input.vertical)
            await self._transition(job.search_id, SearchStatus.PARSED)
            await self.service.runtime.publish(
                job.search_id,
                SearchEventType.INTENT_VALIDATED,
                {"status": SearchStatus.PARSED.value, "vertical": search_input.vertical},
            )
            await self._transition(job.search_id, SearchStatus.CACHE_CHECKED)
            await self._transition(job.search_id, SearchStatus.RUNNING)

            provider_ids = list(job.requested_providers or self.service.providers.provider_ids())
            self.service.metrics.record(
                MetricEvent.providers_attempted,
                value=len(provider_ids),
                dimensions={"market": search_input.intent.market},
            )
            if not provider_ids:
                operational_outcome = "degraded"
                await self._finish_degraded(job.search_id, ["no_configured_independent_provider"])
                self.service.metrics.record(
                    MetricEvent.providers_successful,
                    value=0,
                    dimensions={"market": search_input.intent.market},
                )
                self.service.metrics.record(
                    MetricEvent.partial_failure,
                    dimensions={
                        "market": search_input.intent.market,
                        "reason_code": "no_configured_provider",
                    },
                )
                self.service.metrics.record(
                    MetricEvent.no_saving,
                    dimensions={
                        "market": search_input.intent.market,
                        "outcome": "degraded",
                    },
                )
                self.service.metrics.record(
                    MetricEvent.latency_ms,
                    value=(time.monotonic() - search_started) * 1000,
                    dimensions={
                        "market": search_input.intent.market,
                        "outcome": "degraded",
                    },
                )
                return
            tasks = [
                asyncio.create_task(self._query_provider(job, search_input, provider_id))
                for provider_id in provider_ids
            ]
            soft_deadline_task = asyncio.create_task(
                self._publish_soft_deadline(job.search_id, tasks)
            )
            candidates: list[RankableCandidate] = []
            offer_payloads: dict[str, dict[str, Any]] = {}
            degraded: list[str] = []
            successful_providers = 0
            first_offer = True
            for completed in asyncio.as_completed(tasks):
                current = self.service.repository.get_search(
                    job.search_id,
                    self._service_access,
                )
                if current is None or SearchStatus(current.payload["status"]) == SearchStatus.CANCELLED:
                    return
                provider_id, attempt_id, batch, error = await completed
                if error is not None:
                    degraded.append(f"{provider_id}:{error[0]}")
                    await self.service.runtime.publish(
                        job.search_id,
                        SearchEventType.PROVIDER_FAILED,
                        {"provider_id": provider_id, "error_code": error[0]},
                    )
                    continue
                assert batch is not None
                successful_providers += 1
                provider_offers = deduplicate_normalized_offers(batch.offers)
                self.service.observability.metrics.record(
                    TravelMetricName.offers_normalized_total,
                    len(provider_offers),
                    attributes={
                        "provider": provider_id,
                        "environment": batch.environment.value,
                        "vertical": operational_vertical,
                    },
                )
                await self.service.runtime.publish(
                    job.search_id,
                    SearchEventType.PROVIDER_COMPLETED,
                    {
                        "provider_id": provider_id,
                        "environment": batch.environment.value,
                        "offer_count": len(provider_offers),
                        "duplicate_offer_count": len(batch.offers) - len(provider_offers),
                        "warnings": batch.warnings,
                    },
                )
                for provider_offer in provider_offers:
                    with self.service.observability.span(
                        "normalization",
                        correlation_id=job.search_id,
                        search_id=job.search_id,
                        provider_id=provider_id,
                        environment=batch.environment.value,
                        observation_method=batch.environment.value,
                    ):
                        normalized = await self._persist_offer(
                            job.search_id,
                            search_input,
                            attempt_id,
                        provider_offer,
                        preferences,
                    )
                    if normalized is None:
                        self.service.observability.metrics.record(
                            TravelMetricName.offers_rejected_total,
                            attributes={
                                "provider": provider_id,
                                "environment": batch.environment.value,
                                "vertical": operational_vertical,
                            },
                        )
                        continue
                    candidate, payload = normalized
                    candidates.append(candidate)
                    offer_payloads[candidate.offer_id] = payload
                    if first_offer:
                        self.service.observability.metrics.record(
                            TravelMetricName.time_to_first_offer_seconds,
                            time.monotonic() - search_started,
                            attributes={"vertical": operational_vertical},
                        )
                        await self._transition(job.search_id, SearchStatus.PARTIAL)
                        first_offer = False
                    await self.service.runtime.publish(
                        job.search_id,
                        SearchEventType.OFFER_ADDED,
                        {
                            "offer": payload,
                            "status": SearchStatus.PARTIAL.value,
                        },
                    )
            soft_deadline_task.cancel()
            await asyncio.gather(soft_deadline_task, return_exceptions=True)
            soft_deadline_task = None

            current = self.service.repository.get_search(
                job.search_id,
                self._service_access,
            )
            if current is None or SearchStatus(current.payload["status"]) == SearchStatus.CANCELLED:
                return

            await self._transition(job.search_id, SearchStatus.VERIFYING)
            with self.service.observability.span(
                "ranking",
                correlation_id=job.search_id,
                search_id=job.search_id,
                environment="worker",
                observation_method="deterministic",
            ):
                ranked = rank_candidates(candidates)
            ranking = [item.offer_id for item in ranked]
            selected_id = ranking[0] if ranking else None
            selected_saving = (
                offer_payloads[selected_id].get("saving") if selected_id else None
            )
            self.service.metrics.record(
                MetricEvent.providers_successful,
                value=successful_providers,
                dimensions={"market": search_input.intent.market},
            )
            if degraded:
                self.service.metrics.record(
                    MetricEvent.partial_failure,
                    value=len(degraded),
                    dimensions={"market": search_input.intent.market},
                )
            updates = {
                "ranking": ranking,
                "selected_offer_id": selected_id,
                "saving": selected_saving,
                "degraded_reasons": degraded,
            }
            await self.service.runtime.publish(
                job.search_id,
                SearchEventType.RANKING_UPDATED,
                {"ranking": ranking, "selected_offer_id": selected_id},
            )
            terminal = SearchStatus.DEGRADED if degraded else SearchStatus.COMPLETED
            operational_outcome = terminal.value
            operational_result_count = len(offer_payloads)
            await self._transition(job.search_id, terminal, updates=updates)
            await self.service.runtime.publish(
                job.search_id,
                (
                    SearchEventType.SEARCH_DEGRADED
                    if terminal == SearchStatus.DEGRADED
                    else SearchEventType.SEARCH_COMPLETED
                ),
                {
                    "status": terminal.value,
                    "offer_count": len(offer_payloads),
                    "selected_offer_id": selected_id,
                    "degraded_reasons": degraded,
                },
            )
            saving_claim = (
                str(selected_saving.get("claim", "none"))
                if isinstance(selected_saving, dict)
                else "none"
            )
            if saving_claim == "verified":
                self.service.observability.metrics.record(
                    TravelMetricName.verified_savings_total,
                    attributes={"vertical": operational_vertical},
                )
            self.service.metrics.record(
                (
                    MetricEvent.saving_found
                    if saving_claim in {"verified", "conditional", "potential"}
                    else MetricEvent.no_saving
                ),
                dimensions={
                    "market": search_input.intent.market,
                    "outcome": saving_claim,
                },
            )
            self.service.metrics.record(
                MetricEvent.latency_ms,
                value=(time.monotonic() - search_started) * 1000,
                dimensions={
                    "market": search_input.intent.market,
                    "outcome": terminal.value,
                },
            )
        except Exception as exc:
            code, _ = _sanitized_error(exc)
            operational_outcome = "failed"
            operational_error_code = code
            self.service.metrics.record(
                MetricEvent.partial_failure,
                dimensions={"market": metric_market, "reason_code": code},
            )
            self.service.metrics.record(
                MetricEvent.latency_ms,
                value=(time.monotonic() - search_started) * 1000,
                dimensions={"market": metric_market, "outcome": "failed"},
            )
            try:
                record = self.service.repository.get_search(job.search_id, self._service_access)
                if record and SearchStatus(record.payload["status"]) not in TERMINAL_STATUSES:
                    await self._transition(
                        job.search_id,
                        SearchStatus.FAILED,
                        updates={"degraded_reasons": [code]},
                    )
                    await self.service.runtime.publish(
                        job.search_id,
                        SearchEventType.SEARCH_FAILED,
                        {"status": SearchStatus.FAILED.value, "error_code": code},
                    )
            except Exception:
                pass
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            if soft_deadline_task is not None:
                soft_deadline_task.cancel()
                await asyncio.gather(soft_deadline_task, return_exceptions=True)
            await self.service.runtime.release_lease(lease_key, lease)
            duration_ms = (time.monotonic() - search_started) * 1000
            self.service.observability.metrics.record(
                TravelMetricName.search_duration_seconds,
                duration_ms / 1000,
                attributes={
                    "vertical": operational_vertical,
                    "outcome": operational_outcome,
                },
            )
            self.service.observability.log(
                correlation_id=job.search_id,
                search_id=job.search_id,
                provider_id=None,
                stage="search.finished",
                duration_ms=duration_ms,
                result_count=operational_result_count,
                sanitized_error_code=operational_error_code,
                environment="worker",
                observation_method="managed_provider",
            )

    async def _publish_soft_deadline(
        self,
        search_id: str,
        tasks: list[asyncio.Task],
    ) -> None:
        await asyncio.sleep(self.soft_deadline_seconds)
        pending = sum(not task.done() for task in tasks)
        if pending:
            await self.service.runtime.publish(
                search_id,
                SearchEventType.SEARCH_SOFT_DEADLINE,
                {
                    "status": SearchStatus.RUNNING.value,
                    "pending_provider_count": pending,
                    "soft_deadline_seconds": self.soft_deadline_seconds,
                },
            )

    async def _finish_degraded(self, search_id: str, reasons: list[str]) -> None:
        await self._transition(
            search_id,
            SearchStatus.DEGRADED,
            updates={"degraded_reasons": reasons},
        )
        await self.service.runtime.publish(
            search_id,
            SearchEventType.SEARCH_DEGRADED,
            {"status": SearchStatus.DEGRADED.value, "degraded_reasons": reasons},
        )

    async def _query_provider(
        self,
        job: SearchJob,
        search_input: FlightSearchInput | HotelSearchInput,
        provider_id: str,
    ) -> tuple[str, str, ProviderBatch | None, tuple[str, str] | None]:
        attempt_id = f"pat_{uuid4().hex}"
        started = _utcnow()
        started_clock = time.monotonic()
        try:
            provider = self.service.providers.get(provider_id)
        except KeyError as exc:
            error = (ProviderErrorCode.configuration.value, "Requested provider is not configured.")
            self._save_attempt(attempt_id, job.search_id, provider_id, "unknown", started, error)
            self._record_provider_attempt(
                job=job,
                provider_id="unknown",
                environment="unknown",
                vertical=str(search_input.vertical),
                stage="provider.attempt.failed",
                started_clock=started_clock,
                result_count=0,
                error_code=error[0],
            )
            return provider_id, attempt_id, None, error
        descriptor = provider.descriptor
        self.service.repository.save_provider_attempt(
            attempt_id,
            job.search_id,
            {
                "provider": provider_id,
                "provider_environment": descriptor.current_environment.value,
                "status": "running",
                "started_at": started.isoformat(),
                "request_count": 0,
            },
            self._service_access,
        )
        await self.service.runtime.publish(
            job.search_id,
            SearchEventType.PROVIDER_STARTED,
            {"provider_id": provider_id, "environment": descriptor.current_environment.value},
        )
        with self.service.observability.span(
            "cache",
            correlation_id=job.search_id,
            search_id=job.search_id,
            provider_id=provider_id,
            environment=descriptor.current_environment.value,
            observation_method=descriptor.current_environment.value,
        ):
            cached_batch = await self._cached_provider_batch(
                provider_id,
                job.intent_fingerprint,
                search_input.vertical,
            )
        if cached_batch is not None:
            payload = {
                "provider": provider_id,
                "provider_environment": cached_batch.environment.value,
                "status": "cache_hit",
                "started_at": started.isoformat(),
                "finished_at": _utcnow().isoformat(),
                "duration_ms": int((time.monotonic() - started_clock) * 1000),
                "rate_limited": False,
                "request_count": 0,
            }
            self.service.repository.save_provider_attempt(
                attempt_id,
                job.search_id,
                payload,
                self._service_access,
            )
            await self.service.runtime.publish(
                job.search_id,
                SearchEventType.CACHE_HIT,
                {"provider_id": provider_id, "environment": cached_batch.environment.value},
            )
            cache_duration_ms = (time.monotonic() - started_clock) * 1000
            self.service.observability.metrics.record(
                TravelMetricName.cache_hits_total,
                attributes={
                    "provider": provider_id,
                    "environment": cached_batch.environment.value,
                    "vertical": str(search_input.vertical),
                },
            )
            self.service.observability.metrics.record(
                TravelMetricName.provider_duration_seconds,
                cache_duration_ms / 1000,
                attributes={
                    "provider": provider_id,
                    "environment": cached_batch.environment.value,
                    "vertical": str(search_input.vertical),
                    "cache": "hit",
                },
            )
            self.service.observability.log(
                correlation_id=job.search_id,
                search_id=job.search_id,
                provider_id=provider_id,
                stage="provider.cache_hit",
                duration_ms=cache_duration_ms,
                result_count=len(cached_batch.offers),
                environment=cached_batch.environment.value,
                observation_method=cached_batch.environment.value,
            )
            return provider_id, attempt_id, cached_batch, None
        error: tuple[str, str] | None = None
        batch: ProviderBatch | None = None
        request_count = 0
        for attempt in range(self.max_provider_attempts):
            attempt_started_clock = time.monotonic()
            remaining = (job.hard_deadline_at - _utcnow()).total_seconds()
            if remaining <= 0:
                error = (ProviderErrorCode.timeout.value, "Search hard deadline exceeded.")
                self._record_provider_attempt(
                    job=job,
                    provider_id=provider_id,
                    environment=descriptor.current_environment.value,
                    vertical=str(search_input.vertical),
                    stage="provider.attempt.failed",
                    started_clock=attempt_started_clock,
                    result_count=0,
                    error_code=error[0],
                )
                break
            allowed = await self.service.runtime.allow_rate(
                f"provider:{provider_id}",
                limit=descriptor.rate_limit_per_second or 10,
                window_seconds=1,
            )
            if not allowed:
                error = (ProviderErrorCode.rate_limited.value, "Provider rate limit reached.")
                self._record_provider_attempt(
                    job=job,
                    provider_id=provider_id,
                    environment=descriptor.current_environment.value,
                    vertical=str(search_input.vertical),
                    stage="provider.attempt.deferred",
                    started_clock=attempt_started_clock,
                    result_count=0,
                    error_code=error[0],
                )
                await asyncio.sleep(min(0.1 * (attempt + 1), remaining))
                continue
            try:
                request_count += 1
                with self.service.observability.span(
                    "provider_call",
                    correlation_id=job.search_id,
                    search_id=job.search_id,
                    provider_id=provider_id,
                    environment=descriptor.current_environment.value,
                    observation_method=descriptor.current_environment.value,
                ):
                    async with asyncio.timeout(min(self.provider_timeout_seconds, remaining)):
                        if isinstance(search_input, FlightSearchInput):
                            batch = await provider.search_flights(self._flight_request(search_input))
                        else:
                            batch = await provider.search_hotels(self._hotel_request(search_input))
                error = None
                self._record_provider_attempt(
                    job=job,
                    provider_id=provider_id,
                    environment=descriptor.current_environment.value,
                    vertical=str(search_input.vertical),
                    stage="provider.attempt.completed",
                    started_clock=attempt_started_clock,
                    result_count=len(batch.offers),
                    error_code=None,
                )
                break
            except Exception as exc:
                error = _sanitized_error(exc)
                self._record_provider_attempt(
                    job=job,
                    provider_id=provider_id,
                    environment=descriptor.current_environment.value,
                    vertical=str(search_input.vertical),
                    stage="provider.attempt.failed",
                    started_clock=attempt_started_clock,
                    result_count=0,
                    error_code=error[0],
                )
                retryable = error[0] in {
                    ProviderErrorCode.timeout.value,
                    ProviderErrorCode.rate_limited.value,
                    ProviderErrorCode.unavailable.value,
                    ProviderErrorCode.upstream.value,
                }
                if not retryable or attempt + 1 >= self.max_provider_attempts:
                    break
                await asyncio.sleep(0.1 * (attempt + 1))
        duration_ms = int((time.monotonic() - started_clock) * 1000)
        payload = {
            "provider": provider_id,
            "provider_environment": descriptor.current_environment.value,
            "status": "completed" if batch is not None else "failed",
            "started_at": started.isoformat(),
            "finished_at": _utcnow().isoformat(),
            "duration_ms": duration_ms,
            "error_code": error[0] if error else None,
            "error_message": error[1] if error else None,
            "rate_limited": bool(error and error[0] == ProviderErrorCode.rate_limited.value),
            "request_count": request_count,
        }
        self.service.repository.save_provider_attempt(
            attempt_id,
            job.search_id,
            payload,
            self._service_access,
        )
        if batch is not None:
            with self.service.observability.span(
                "cache",
                correlation_id=job.search_id,
                search_id=job.search_id,
                provider_id=provider_id,
                environment=descriptor.current_environment.value,
                observation_method=descriptor.current_environment.value,
            ):
                await self._cache_provider_batch(
                    provider_id,
                    job.intent_fingerprint,
                    batch,
                )
        return provider_id, attempt_id, batch, error

    def _record_provider_attempt(
        self,
        *,
        job: SearchJob,
        provider_id: str,
        environment: str,
        vertical: str,
        stage: str,
        started_clock: float,
        result_count: int,
        error_code: str | None,
    ) -> None:
        duration_seconds = time.monotonic() - started_clock
        attributes = {
            "provider": provider_id,
            "environment": environment,
            "vertical": vertical,
        }
        self.service.observability.metrics.record(
            TravelMetricName.provider_attempts_total,
            attributes=attributes,
        )
        self.service.observability.metrics.record(
            TravelMetricName.provider_duration_seconds,
            duration_seconds,
            attributes=attributes,
        )
        if error_code is not None:
            self.service.observability.metrics.record(
                TravelMetricName.provider_errors_total,
                attributes={**attributes, "error_code": error_code},
            )
        self.service.observability.log(
            correlation_id=job.search_id,
            search_id=job.search_id,
            provider_id=provider_id,
            stage=stage,
            duration_ms=duration_seconds * 1000,
            result_count=result_count,
            sanitized_error_code=error_code,
            environment=environment,
            observation_method=environment,
        )

    async def _cache_provider_batch(
        self,
        provider_id: str,
        fingerprint: str,
        batch: ProviderBatch,
    ) -> None:
        await self.service.runtime.cache_set(
            f"provider-result:{provider_id}:{fingerprint}",
            {
                "batch": batch.model_dump(mode="json"),
                "raw_provider_offers": [
                    dict(getattr(offer, "provider_payload", {}))
                    for offer in batch.offers
                ],
            },
            ttl_seconds=OFFER_CACHE_TTL_SECONDS,
        )

    async def _cached_provider_batch(
        self,
        provider_id: str,
        fingerprint: str,
        vertical: str,
    ) -> ProviderBatch | None:
        cached = await self.service.runtime.cache_get(
            f"provider-result:{provider_id}:{fingerprint}"
        )
        if not cached or not isinstance(cached.get("batch"), dict):
            return None
        batch_type = FlightOfferBatch if vertical == "flight" else HotelOfferBatch
        try:
            batch = batch_type.model_validate(cached["batch"])
        except Exception:
            return None
        raw_offers = cached.get("raw_provider_offers") or []
        for offer, raw in zip(batch.offers, raw_offers):
            if isinstance(raw, dict):
                offer.provider_payload.update(raw)
        return batch

    def _save_attempt(
        self,
        attempt_id: str,
        search_id: str,
        provider_id: str,
        environment: str,
        started: datetime,
        error: tuple[str, str],
    ) -> None:
        self.service.repository.save_provider_attempt(
            attempt_id,
            search_id,
            {
                "provider": provider_id,
                "provider_environment": environment,
                "status": "failed",
                "started_at": started.isoformat(),
                "finished_at": _utcnow().isoformat(),
                "duration_ms": 0,
                "error_code": error[0],
                "error_message": error[1],
                "rate_limited": False,
                "request_count": 0,
            },
            self._service_access,
        )

    @staticmethod
    def _flight_request(search_input: FlightSearchInput) -> FlightSearchRequest:
        intent = search_input.intent
        first = intent.legs[0]
        return_date = intent.legs[1].departure_date.isoformat() if len(intent.legs) == 2 else None
        return FlightSearchRequest(
            origin=first.origin_airport,
            destination=first.destination_airport,
            departure_date=first.departure_date.isoformat(),
            return_date=return_date,
            adults=intent.passengers.adults,
            children=intent.passengers.children,
            infants=intent.passengers.infants,
            travel_class=(intent.requested_cabin.value.upper() if intent.requested_cabin else None),
            currency=intent.display_currency,
        )

    @staticmethod
    def _hotel_request(search_input: HotelSearchInput) -> HotelSearchRequest:
        intent = search_input.intent
        structured = intent.source_page.structured_data
        amadeus_hotel_id = structured.get("amadeus_hotel_id")
        hotel_ids = (str(amadeus_hotel_id),) if amadeus_hotel_id else ()
        city_code = structured.get("city_code")
        return HotelSearchRequest(
            check_in_date=intent.check_in.isoformat(),
            check_out_date=intent.check_out.isoformat(),
            adults=sum(room.adults for room in intent.rooms),
            room_quantity=len(intent.rooms),
            city_code=(str(city_code) if city_code else None),
            hotel_ids=hotel_ids,
            currency=intent.display_currency,
        )

    async def _persist_offer(
        self,
        search_id: str,
        search_input: FlightSearchInput | HotelSearchInput,
        provider_attempt_id: str,
        provider_offer: object,
        preferences: TravelPreferences,
    ) -> tuple[RankableCandidate, dict[str, Any]] | None:
        preference_violations: list[str] = []
        if isinstance(provider_offer, NormalizedFlightOffer) and isinstance(search_input, FlightSearchInput):
            domain_offer = flight_domain_offer(search_input.intent, provider_offer)
            with self.service.observability.span(
                "equivalence",
                correlation_id=search_id,
                search_id=search_id,
                provider_id=provider_offer.provider_id,
                environment=provider_offer.environment.value,
                observation_method=provider_offer.environment.value,
            ):
                equivalence = classify_flight_equivalence(search_input.intent, domain_offer)
            with self.service.observability.span(
                "costing",
                correlation_id=search_id,
                search_id=search_id,
                provider_id=provider_offer.provider_id,
                environment=provider_offer.environment.value,
                observation_method=provider_offer.environment.value,
            ):
                components, cost_summary = flight_costs(provider_offer)
            if (
                preferences.flight_checked_bags is not None
                and (
                    domain_offer.checked_bags_included is None
                    or domain_offer.checked_bags_included
                    < preferences.flight_checked_bags
                )
            ):
                preference_violations.append("flight_checked_bags")
            itinerary_payload = {
                "canonical_hash": stable_id("itin", domain_offer.model_dump(mode="json")),
                "origin": domain_offer.segments[0].origin_airport,
                "destination": domain_offer.segments[-1].destination_airport,
                "departure_date": domain_offer.segments[0].scheduled_departure.date().isoformat(),
                "segments": [item.model_dump(mode="json") for item in domain_offer.segments],
            }
            itinerary_id = itinerary_payload["canonical_hash"]
            with self.service.observability.span(
                "persistence",
                correlation_id=search_id,
                search_id=search_id,
                provider_id=provider_offer.provider_id,
                environment=provider_offer.environment.value,
                observation_method=provider_offer.environment.value,
            ):
                self.service.repository.save_flight_itinerary(
                    itinerary_id,
                    itinerary_payload,
                    self._service_access,
                )
            property_id = None
            total_amount = provider_offer.grand_total_amount
        elif isinstance(provider_offer, NormalizedHotelOffer) and isinstance(search_input, HotelSearchInput):
            domain_offer = hotel_domain_offer(search_input.intent, provider_offer)
            with self.service.observability.span(
                "equivalence",
                correlation_id=search_id,
                search_id=search_id,
                provider_id=provider_offer.provider_id,
                environment=provider_offer.environment.value,
                observation_method=provider_offer.environment.value,
            ):
                equivalence = classify_hotel_equivalence(search_input.intent, domain_offer)
            with self.service.observability.span(
                "costing",
                correlation_id=search_id,
                search_id=search_id,
                provider_id=provider_offer.provider_id,
                environment=provider_offer.environment.value,
                observation_method=provider_offer.environment.value,
            ):
                components, cost_summary = hotel_costs(provider_offer)
            if (
                preferences.require_refundable_hotel
                and domain_offer.rate.refundable is not True
            ):
                preference_violations.append("require_refundable_hotel")
            property_payload = {
                "canonical_hash": stable_id("prop", domain_offer.property.model_dump(mode="json")),
                "name": domain_offer.property.name,
                "city_code": provider_offer.city_code,
                "country_code": provider_offer.country_code,
                "latitude": domain_offer.property.latitude,
                "longitude": domain_offer.property.longitude,
            }
            property_id = property_payload["canonical_hash"]
            with self.service.observability.span(
                "persistence",
                correlation_id=search_id,
                search_id=search_id,
                provider_id=provider_offer.provider_id,
                environment=provider_offer.environment.value,
                observation_method=provider_offer.environment.value,
            ):
                self.service.repository.save_hotel_property(
                    property_id,
                    property_payload,
                    self._service_access,
                )
            itinerary_id = None
            total_amount = provider_offer.total_amount
        else:
            return None

        baseline = self._baseline_costs(search_input)
        saving = classify_saving(
            baseline,
            cost_summary,
            equivalence.classification,
            availability=AvailabilityStatus.CURRENT,
            revalidation_age_seconds=None,
            hard_preference_violations=len(preference_violations),
        )
        offer_id = stable_id(
            "off",
            {
                "search_id": search_id,
                "provider": provider_offer.provider_id,
                "provider_offer_id": provider_offer.provider_offer_id,
            },
        )
        descriptor = self.service.providers.get(provider_offer.provider_id).descriptor
        manifest_id, evidence = self._evidence(
            search_id,
            offer_id,
            provider_offer,
            descriptor.official,
            tuple(getattr(provider_offer, "unknown_costs", ())),
        )
        eligible = equivalence.classification in {
            EquivalenceClass.EXACT,
            EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF,
        }
        candidate = RankableCandidate(
            offer_id=offer_id,
            equivalence=equivalence.classification,
            costs=cost_summary,
            hard_preference_violations=len(preference_violations),
            supplier_risk_tier=(SupplierRiskTier.TRUSTED if descriptor.official else SupplierRiskTier.UNKNOWN),
            revalidation_age_seconds=None,
            redirect_friction=(RedirectFriction.DIRECT if descriptor.supports_deeplinks else RedirectFriction.UNAVAILABLE),
            provider_priority=10,
            eligible=eligible,
        )
        payload = {
            "offer_id": offer_id,
            "provider": provider_offer.provider_id,
            "provider_offer_id": provider_offer.provider_offer_id,
            "supplier_id": provider_offer.provider_id,
            "vertical": search_input.vertical,
            "currency": provider_offer.currency,
            "item_amount": format(total_amount, "f"),
            "total_amount": format(total_amount, "f"),
            "total_complete": cost_summary.total_complete,
            "cost_summary": cost_summary.model_dump(mode="json"),
            "equivalence": equivalence.model_dump(mode="json"),
            "saving": saving.model_dump(mode="json"),
            "rank_key": candidate.rank_key().model_dump(mode="json"),
            "eligible": eligible,
            "hard_preference_violations": preference_violations,
            "provider_environment": provider_offer.environment.value,
            "observation_method": provider_offer.environment.value,
            "observed_at": _utcnow().isoformat(),
            "expires_at": None,
            "deep_link_ref": None,
            "evidence_manifest_id": manifest_id,
            "limitations": list(getattr(provider_offer, "unknown_costs", ())),
        }
        with self.service.observability.span(
            "persistence",
            correlation_id=search_id,
            search_id=search_id,
            provider_id=provider_offer.provider_id,
            environment=provider_offer.environment.value,
            observation_method=provider_offer.environment.value,
        ):
            self.service.repository.save_offer(
                offer_id,
                search_id,
                payload,
                self._service_access,
                provider_attempt_id=provider_attempt_id,
                itinerary_id=itinerary_id,
                hotel_property_id=property_id,
            )
            for index, component in enumerate(components):
                self.service.repository.save_cost_component(
                    f"cost_{offer_id}_{index}",
                    search_id,
                    offer_id,
                    component,
                    self._service_access,
                )
            self.service.repository.save_evidence(
                evidence.evidence_id,
                search_id,
                evidence,
                self._service_access,
                offer_id=offer_id,
                provider_attempt_id=provider_attempt_id,
            )
        with self.service.observability.span(
            "cache",
            correlation_id=search_id,
            search_id=search_id,
            provider_id=provider_offer.provider_id,
            environment=provider_offer.environment.value,
            observation_method=provider_offer.environment.value,
        ):
            await self.service.runtime.cache_set(
                f"offer-revalidation:{search_id}:{offer_id}",
                {
                    "raw_provider_offer": provider_offer.provider_payload,
                    "deep_link_url": provider_offer.provider_payload.get("deepLink"),
                },
                ttl_seconds=OFFER_CACHE_TTL_SECONDS,
            )
        return candidate, payload

    @staticmethod
    def _baseline_costs(search_input: FlightSearchInput | HotelSearchInput):
        if search_input.baseline_costs:
            return summarize_costs(search_input.baseline_costs, search_input.intent.display_currency)
        visible = search_input.intent.baseline_offer.visible_price if search_input.intent.baseline_offer else None
        base_kind = CostKind.BASE_FARE if isinstance(search_input, FlightSearchInput) else CostKind.BASE_RATE
        components = [
            CostComponent(
                kind=base_kind,
                state=CostState.KNOWN if visible else CostState.UNKNOWN,
                money=visible,
                description="Current-page visible price." if visible else "Current-page price was not extracted.",
            ),
            CostComponent(
                kind=CostKind.SERVICE_FEE,
                state=CostState.UNKNOWN,
                description="Current page did not prove complete mandatory costs.",
            ),
        ]
        return summarize_costs(components, search_input.intent.display_currency)

    @staticmethod
    def _evidence(
        search_id: str,
        offer_id: str,
        provider_offer: NormalizedFlightOffer | NormalizedHotelOffer,
        official: bool,
        limitations: tuple[str, ...],
    ) -> tuple[str, TravelEvidence]:
        normalized = provider_offer.model_dump(mode="json")
        digest = hashlib.sha256(
            json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        total = (
            provider_offer.grand_total_amount
            if isinstance(provider_offer, NormalizedFlightOffer)
            else provider_offer.total_amount
        )
        attempt = CollectionAttempt(
            provider=provider_offer.provider_id,
            stage="api",
            capabilities=ProviderCapabilities(
                provider=provider_offer.provider_id,
                official_api=official,
                cost_unit="provider_account",
            ),
            extractions=[
                Extraction(
                    field="total_price",
                    value={"amount": format(total, "f"), "currency": provider_offer.currency},
                    method="official_api_normalizer",
                    confidence=1.0,
                    extractor_version="travel-v1",
                )
            ],
            limitations=list(limitations),
            fixture=provider_offer.environment.value == "fixture",
        )
        manifest = build_manifest(
            PriceObligation(
                agent_id="jacobi-travel",
                item_or_booking={"type": "travel_offer", "offer_id": offer_id},
                merchant={"name": provider_offer.provider_id},
                source_url_or_api_route=f"provider:{provider_offer.provider_id}",
                official_route=official,
            ),
            [attempt],
            list(limitations),
        )
        get_agentcore_repository().save_manifest(manifest, f"travel:{search_id}")
        environment = DomainProviderEnvironment(provider_offer.environment.value)
        observation = ObservationMethod(provider_offer.environment.value)
        evidence = TravelEvidence(
            evidence_id=f"tev_{uuid4().hex}",
            provider_id=provider_offer.provider_id,
            kind=EvidenceKind.PRICE,
            source_type=(
                EvidenceSourceType.FIXTURE
                if provider_offer.environment.value == "fixture"
                else EvidenceSourceType.PROVIDER_API
            ),
            source_reference=f"provider:{provider_offer.provider_id}:{provider_offer.provider_offer_id}",
            observation_method=observation,
            provider_environment=environment,
            captured_at=_utcnow(),
            content_hash=digest,
            strength=EvidenceStrength.DIRECT,
            summary="Normalized provider offer; raw response was not persisted.",
            limitations=limitations,
            agentcore_manifest_id=manifest.manifest_id,
        )
        return manifest.manifest_id, evidence


def get_travel_search_worker() -> TravelSearchWorker:
    return TravelSearchWorker(get_travel_search_service())
