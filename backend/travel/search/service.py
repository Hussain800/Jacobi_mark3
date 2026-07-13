"""Application service shared by REST, MCP, CLI, extension, and workers."""

from __future__ import annotations

import base64
import asyncio
import hashlib
import hmac
import ipaddress
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from urllib.parse import urlsplit
from uuid import uuid4

from agentcore.storage import get_repo as get_agentcore_repository

from ..persistence import AccessContext, AccessDeniedError, TravelRepository
from ..providers import (
    NormalizedFlightOffer,
    ProviderRegistry,
    RevalidationStatus,
    configured_provider_registry,
    provider_catalog,
)
from ..telemetry import MetricEvent, MetricsRecorder, travel_metrics_from_env
from .fingerprint import intent_fingerprint
from .models import (
    SearchEvent,
    SearchEventType,
    SearchJob,
    SearchStatus,
    TERMINAL_STATUSES,
    validate_transition,
)
from .runtime import TravelRuntime, get_travel_runtime
from .schemas import (
    AcceptedSearch,
    FeedbackRequest,
    RedirectResponse,
    RevalidationResponse,
    SearchSnapshot,
    TravelPreferences,
    TravelSearchInput,
)


CAPABILITY_TTL_SECONDS = 900
IDEMPOTENCY_TTL_SECONDS = 900
REVALIDATION_TTL_SECONDS = 120
_DEV_SECRET = secrets.token_bytes(32)


class TravelSearchNotFound(LookupError):
    pass


class TravelSearchConflict(RuntimeError):
    pass


class RedirectNotAvailable(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _production_like() -> bool:
    return any(
        os.getenv(name, "").strip().lower() in {"production", "prod", "1", "true"}
        for name in ("APP_ENV", "VERCEL_ENV", "ENV", "NODE_ENV", "JACOBI_PRODUCTION")
    )


def _capability_secret(explicit: bytes | None = None) -> bytes:
    if explicit is not None:
        return explicit
    configured = os.getenv("JACOBI_TRAVEL_CAPABILITY_SECRET", "").encode("utf-8")
    if configured:
        return configured
    if _production_like():
        raise RuntimeError(
            "production travel searches require JACOBI_TRAVEL_CAPABILITY_SECRET"
        )
    return _DEV_SECRET


def _hmac_token(secret: bytes, purpose: str, value: str) -> str:
    digest = hmac.new(secret, f"{purpose}:{value}".encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _access(owner_id: str | None, capability_token: str | None) -> AccessContext:
    if owner_id:
        return AccessContext.for_owner(owner_id)
    if capability_token:
        return AccessContext.for_capability(capability_token)
    raise AccessDeniedError("search capability is required")


def _safe_redirect_target(target: str, allowed_origins: tuple[str, ...]) -> str:
    parsed = urlsplit(target)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise RedirectNotAvailable("redirect target must be an HTTPS URL without credentials")
    host = parsed.hostname.rstrip(".").casefold()
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise RedirectNotAvailable("redirect target cannot use an IP address")
    allowed_hosts = {
        urlsplit(origin).hostname.rstrip(".").casefold()
        for origin in allowed_origins
        if urlsplit(origin).hostname
    }
    if host not in allowed_hosts:
        raise RedirectNotAvailable("redirect target is outside the provider allowlist")
    return target


class TravelSearchService:
    def __init__(
        self,
        *,
        repository: TravelRepository,
        runtime: TravelRuntime,
        providers: ProviderRegistry,
        capability_secret: bytes | None = None,
        metrics: MetricsRecorder | None = None,
    ) -> None:
        self.repository = repository
        self.runtime = runtime
        self.providers = providers
        self.metrics = metrics or travel_metrics_from_env()
        self._secret = _capability_secret(capability_secret)

    async def create_search(
        self,
        search_input: TravelSearchInput,
        *,
        idempotency_key: str | None,
        owner_id: str | None = None,
    ) -> AcceptedSearch:
        fingerprint = intent_fingerprint(search_input.intent)
        supplied_key = (idempotency_key or "").strip()
        if supplied_key and not 16 <= len(supplied_key) <= 256:
            raise ValueError("Idempotency-Key must contain between 16 and 256 characters")
        request_key = supplied_key or secrets.token_urlsafe(24)
        scope = f"{owner_id or 'anonymous'}:{request_key}"
        search_id = f"ts_{_hmac_token(self._secret, 'search', scope)[:28]}"
        capability_token = None if owner_id else f"cap_{_hmac_token(self._secret, 'capability', scope)}"
        existing_id = await self.runtime.remember_idempotency(
            scope,
            search_id,
            ttl_seconds=IDEMPOTENCY_TTL_SECONDS,
        )
        expires_at = _utcnow() + timedelta(seconds=CAPABILITY_TTL_SECONDS)
        access = _access(owner_id, capability_token)
        existing = self.repository.get_search(existing_id, access)
        if existing is not None:
            payload = existing.payload
            return AcceptedSearch(
                search_id=existing_id,
                status=payload["status"],
                vertical=payload["vertical"],
                capability_token=capability_token,
                capability_expires_at=(expires_at if capability_token else None),
                events_url=f"/api/v2/travel/searches/{existing_id}/events",
                result_url=f"/api/v2/travel/searches/{existing_id}",
                idempotent_replay=True,
            )

        identity_certain = (
            getattr(search_input.intent, "selected_itinerary", None) is not None
            if search_input.vertical == "flight"
            else any(
                (
                    search_input.intent.property_hint.canonical_property_id,
                    search_input.intent.property_hint.official_property_id,
                    search_input.intent.property_hint.provider_property_id,
                )
            )
        )
        self.metrics.record(
            MetricEvent.identity_success
            if identity_certain
            else MetricEvent.identity_uncertainty,
            dimensions={"market": search_input.intent.market},
        )

        now = _utcnow()
        payload = {
            "fingerprint": fingerprint,
            "vertical": search_input.vertical,
            "status": SearchStatus.ACCEPTED.value,
            "market": search_input.intent.market,
            "intent": search_input.intent.model_dump(mode="json"),
            "baseline_costs": [item.model_dump(mode="json") for item in search_input.baseline_costs],
            "requested_providers": list(search_input.requested_providers),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "ranking": [],
            "selected_offer_id": None,
            "saving": None,
            "degraded_reasons": [],
        }
        try:
            self.repository.create_search(
                search_id,
                payload,
                owner_id=owner_id,
                capability_token=capability_token,
            )
        except ValueError as exc:
            existing = self.repository.get_search(search_id, access)
            if existing is None:
                raise
            payload = existing.payload
        hard_deadline = now + timedelta(seconds=15)
        await self.runtime.enqueue(
            SearchJob(
                search_id=search_id,
                intent_fingerprint=fingerprint,
                requested_providers=search_input.requested_providers,
                hard_deadline_at=hard_deadline,
            )
        )
        await self.runtime.publish(
            search_id,
            SearchEventType.SEARCH_ACCEPTED,
            {
                "status": SearchStatus.ACCEPTED.value,
                "vertical": search_input.vertical,
                "provider_count": len(search_input.requested_providers),
            },
        )
        return AcceptedSearch(
            search_id=search_id,
            status=SearchStatus.ACCEPTED.value,
            vertical=search_input.vertical,
            capability_token=capability_token,
            capability_expires_at=(expires_at if capability_token else None),
            events_url=f"/api/v2/travel/searches/{search_id}/events",
            result_url=f"/api/v2/travel/searches/{search_id}",
        )

    def access(self, owner_id: str | None, capability_token: str | None) -> AccessContext:
        return _access(owner_id, capability_token)

    def require_search(
        self,
        search_id: str,
        *,
        owner_id: str | None = None,
        capability_token: str | None = None,
    ):
        record = self.repository.get_search(
            search_id,
            self.access(owner_id, capability_token),
        )
        if record is None:
            raise TravelSearchNotFound("travel search not found")
        return record

    def get_snapshot(
        self,
        search_id: str,
        *,
        owner_id: str | None = None,
        capability_token: str | None = None,
    ) -> SearchSnapshot:
        access = self.access(owner_id, capability_token)
        search = self.repository.get_search(search_id, access)
        if search is None:
            raise TravelSearchNotFound("travel search not found")
        payload = search.payload
        attempts = [record.payload for record in self.repository.list_provider_attempts(search_id, access)]
        offers = [record.payload for record in self.repository.list_offers(search_id, access)]
        return SearchSnapshot(
            search_id=search_id,
            vertical=payload["vertical"],
            status=payload["status"],
            created_at=payload["created_at"],
            updated_at=payload["updated_at"],
            provider_attempts=attempts,
            offers=offers,
            ranking=payload.get("ranking", []),
            selected_offer_id=payload.get("selected_offer_id"),
            saving=payload.get("saving"),
            degraded_reasons=payload.get("degraded_reasons", []),
        )

    async def events(
        self,
        search_id: str,
        *,
        owner_id: str | None = None,
        capability_token: str | None = None,
        last_event_id: str | None = None,
        heartbeat_seconds: float = 15.0,
    ) -> AsyncIterator[SearchEvent]:
        self.require_search(
            search_id,
            owner_id=owner_id,
            capability_token=capability_token,
        )
        async for event in self.runtime.subscribe(
            search_id,
            last_event_id,
            heartbeat_seconds=heartbeat_seconds,
        ):
            yield event

    async def cancel_search(
        self,
        search_id: str,
        *,
        owner_id: str | None = None,
        capability_token: str | None = None,
    ) -> SearchSnapshot:
        access = self.access(owner_id, capability_token)
        record = self.repository.get_search(search_id, access)
        if record is None:
            raise TravelSearchNotFound("travel search not found")
        payload = dict(record.payload)
        current = SearchStatus(payload["status"])
        if current not in TERMINAL_STATUSES:
            validate_transition(current, SearchStatus.CANCELLED)
            payload["status"] = SearchStatus.CANCELLED.value
            payload["updated_at"] = _utcnow().isoformat()
            payload["degraded_reasons"] = ["cancelled_by_client"]
            self.repository.update_search(search_id, payload, access)
            await self.runtime.publish(
                search_id,
                SearchEventType.SEARCH_CANCELLED,
                {"status": SearchStatus.CANCELLED.value},
            )
        return self.get_snapshot(
            search_id,
            owner_id=owner_id,
            capability_token=capability_token,
        )

    async def revalidate_offer(
        self,
        search_id: str,
        offer_id: str,
        *,
        owner_id: str | None = None,
        capability_token: str | None = None,
    ) -> RevalidationResponse:
        access = self.access(owner_id, capability_token)
        search = self.repository.get_search(search_id, access)
        offer_record = self.repository.get_offer(offer_id, access)
        if search is None or offer_record is None:
            raise TravelSearchNotFound("travel offer not found")
        offer_payload = offer_record.payload
        provider_id = str(offer_payload["provider"])
        try:
            provider = self.providers.get(provider_id)
        except KeyError as exc:
            raise TravelSearchConflict("offer provider is not configured") from exc
        cached = await self.runtime.cache_get(f"offer-revalidation:{search_id}:{offer_id}")
        now = _utcnow()
        expires_at = now + timedelta(seconds=REVALIDATION_TTL_SECONDS)
        revalidation_id = f"rev_{uuid4().hex}"
        status = "unsupported"
        available = False
        currency = offer_payload.get("currency")
        total_amount = offer_payload.get("total_amount")
        changes: list[str] = []
        reason: str | None = None
        target_url: str | None = None

        if cached is None:
            status = "unavailable"
            reason = "The short-lived provider pricing payload expired; run a new search."
        elif offer_payload.get("vertical") == "flight" and hasattr(provider, "revalidate_flight"):
            raw_offer = cached.get("raw_provider_offer")
            try:
                async with asyncio.timeout(8):
                    result = await provider.revalidate_flight(raw_offer)
            except Exception as exc:
                status = "unavailable"
                reason = f"Provider revalidation failed: {type(exc).__name__}"
            else:
                status = result.status.value
                available = result.status in {RevalidationStatus.confirmed, RevalidationStatus.changed}
                changes = list(result.changes)
                current = result.current_offer
                if current is not None:
                    currency = current.currency
                    total_amount = format(current.grand_total_amount, "f")
                reason = result.reason
                target_url = cached.get("deep_link_url")
        else:
            reason = "This provider does not expose a trustworthy price-revalidation route for this offer."

        descriptor = provider.descriptor
        redirect_eligible = bool(
            status == "confirmed"
            and target_url
            and descriptor.supports_deeplinks
            and descriptor.redirect_origins
        )
        if redirect_eligible:
            target_url = _safe_redirect_target(str(target_url), descriptor.redirect_origins)
            await self.runtime.cache_set(
                f"redirect-target:{revalidation_id}",
                {"target_url": target_url},
                ttl_seconds=REVALIDATION_TTL_SECONDS,
            )
        response = RevalidationResponse(
            revalidation_id=revalidation_id,
            search_id=search_id,
            offer_id=offer_id,
            provider_id=provider_id,
            provider_environment=str(offer_payload["provider_environment"]),
            status=status,
            available=available,
            currency=currency,
            total_amount=(str(total_amount) if total_amount is not None else None),
            changes=changes,
            checked_at=now,
            expires_at=expires_at,
            redirect_eligible=redirect_eligible,
            reason=reason,
        )
        self.repository.save_revalidation(
            revalidation_id,
            search_id,
            offer_id,
            response,
            access,
        )
        return response

    async def authorize_redirect(
        self,
        search_id: str,
        offer_id: str,
        revalidation_id: str,
        *,
        owner_id: str | None = None,
        capability_token: str | None = None,
    ) -> RedirectResponse:
        access = self.access(owner_id, capability_token)
        revalidation = self.repository.get_revalidation(revalidation_id, access)
        if revalidation is None or (revalidation.links or {}).get("offer_id") != offer_id:
            raise TravelSearchNotFound("revalidation not found")
        payload = revalidation.payload
        if payload.get("status") != "confirmed" or not payload.get("redirect_eligible"):
            raise RedirectNotAvailable("offer must be freshly confirmed before redirect")
        expires_at = datetime.fromisoformat(str(payload["expires_at"]))
        if expires_at <= _utcnow():
            raise RedirectNotAvailable("revalidation expired")
        target = await self.runtime.cache_get(f"redirect-target:{revalidation_id}")
        if not target or not target.get("target_url"):
            raise RedirectNotAvailable("redirect target expired")
        offer = self.repository.get_offer(offer_id, access)
        assert offer is not None
        provider = self.providers.get(str(offer.payload["provider"]))
        target_url = _safe_redirect_target(
            str(target["target_url"]),
            provider.descriptor.redirect_origins,
        )
        redirect_id = f"redir_{uuid4().hex}"
        self.repository.save_redirect_event(
            redirect_id,
            search_id,
            offer_id,
            revalidation_id,
            {
                "status": "authorized",
                "authorized_at": _utcnow().isoformat(),
                "expires_at": expires_at.isoformat(),
                "supplier_id": offer.payload.get("supplier_id"),
                "target_origin": f"https://{urlsplit(target_url).hostname}",
            },
            access,
        )
        search = self.repository.get_search(search_id, access)
        self.metrics.record(
            MetricEvent.alternative_opened,
            dimensions={
                "market": str(
                    search.payload.get("market", "unknown")
                    if search is not None
                    else "unknown"
                ),
                "provider": str(offer.payload["provider"]),
            },
        )
        return RedirectResponse(
            redirect_id=redirect_id,
            target_url=target_url,
            expires_at=expires_at,
        )

    def record_feedback(
        self,
        body: FeedbackRequest,
        *,
        owner_id: str | None = None,
        capability_token: str | None = None,
    ) -> str:
        access = self.access(owner_id, capability_token)
        self.require_search(
            body.search_id,
            owner_id=owner_id,
            capability_token=capability_token,
        )
        feedback_id = f"fb_{uuid4().hex}"
        self.repository.save_feedback(
            feedback_id,
            body.search_id,
            {
                "feedback_type": body.feedback_type,
                "details": body.details,
                "created_at": _utcnow().isoformat(),
            },
            access,
            offer_id=body.offer_id,
        )
        feedback_metric = {
            "false_match": MetricEvent.false_match_report,
            "wrong_match": MetricEvent.wrong_match_feedback,
            "alternative_opened": MetricEvent.alternative_opened,
        }.get(body.feedback_type)
        if feedback_metric is not None:
            search = self.repository.get_search(body.search_id, access)
            self.metrics.record(
                feedback_metric,
                dimensions={
                    "market": str(
                        search.payload.get("market", "unknown")
                        if search is not None
                        else "unknown"
                    )
                },
            )
        return feedback_id

    def get_preferences(self, owner_id: str) -> TravelPreferences:
        record = self.repository.get_preferences(owner_id, AccessContext.for_owner(owner_id))
        return TravelPreferences.model_validate(record.payload if record else {})

    def save_preferences(self, owner_id: str, preferences: TravelPreferences) -> TravelPreferences:
        self.repository.save_preferences(
            owner_id,
            preferences,
            AccessContext.for_owner(owner_id),
        )
        return preferences

    def provider_capabilities(self) -> list[dict[str, object]]:
        return provider_catalog(self.providers)

    async def provider_health(self) -> dict[str, object]:
        return {
            "runtime": "healthy" if await self.runtime.healthy() else "unhealthy",
            "providers": self.provider_capabilities(),
        }

    def evidence_manifest(self, search_id: str, manifest_id: str):
        return get_agentcore_repository().get_manifest(manifest_id, f"travel:{search_id}")


_SERVICE: TravelSearchService | None = None


def get_travel_search_service() -> TravelSearchService:
    global _SERVICE
    if _SERVICE is None:
        from ..persistence import create_travel_repository

        runtime = get_travel_runtime()
        _SERVICE = TravelSearchService(
            repository=create_travel_repository(),
            runtime=runtime,
            providers=configured_provider_registry(token_cache=runtime),
        )
    return _SERVICE


def reset_travel_search_service_for_tests() -> None:
    global _SERVICE
    _SERVICE = None
