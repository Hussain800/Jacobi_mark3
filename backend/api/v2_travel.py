"""Versioned browser-native travel search API."""

from __future__ import annotations

import asyncio
import os
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from auth_user import get_optional_user
from travel.persistence import AccessDeniedError
from travel.search.schemas import (
    AcceptedSearch,
    FeedbackRequest,
    RedirectRequest,
    RedirectResponse,
    RevalidationRequest,
    RevalidationResponse,
    SearchSnapshot,
    TravelPreferences,
    TravelSearchInput,
)
from travel.search.service import (
    RedirectNotAvailable,
    TravelSearchConflict,
    TravelSearchNotFound,
    TravelSearchService,
    get_travel_search_service,
)
from travel.search.sse import encode_sse
from travel.search.worker import TravelSearchWorker


router = APIRouter(prefix="/api/v2/travel", tags=["travel-v2"])
RATE_LIMIT_PER_MINUTE = int(os.getenv("JACOBI_TRAVEL_RATE_LIMIT_PER_MIN", "30"))


def _owner_id(user: dict[str, Any] | None) -> str | None:
    value = (user or {}).get("id")
    return str(value) if value else None


def _request_id(request: Request, response: Response) -> str:
    value = request.headers.get("x-request-id", "").strip()[:128]
    request_id = value or f"req_{uuid4().hex}"
    response.headers["X-Request-ID"] = request_id
    return request_id


async def _rate_limit(
    request: Request,
    service: TravelSearchService,
    owner_id: str | None,
) -> None:
    address = request.client.host if request.client else "unknown"
    key = f"api:{owner_id or address}"
    if not await service.runtime.allow_rate(
        key,
        limit=RATE_LIMIT_PER_MINUTE,
        window_seconds=60,
    ):
        raise HTTPException(status_code=429, detail="travel search rate limit exceeded")


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (TravelSearchNotFound, AccessDeniedError)):
        return HTTPException(status_code=404, detail="travel search not found")
    if isinstance(exc, RedirectNotAvailable):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, TravelSearchConflict):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    raise exc


@router.get("/health/live", summary="Travel API process liveness")
def travel_liveness() -> dict[str, str]:
    """Process-only liveness; it deliberately performs no provider calls."""

    return {"status": "live", "service": "travel-api"}


@router.get("/health/ready", summary="Travel API runtime readiness")
async def travel_readiness(
    response: Response,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
) -> dict[str, object]:
    """Fail readiness only for required runtime coordination, not optional supply."""

    health = await service.provider_health()
    runtime_ready = health.get("runtime") == "healthy"
    if not runtime_ready:
        response.status_code = 503
    return {
        "status": "ready" if runtime_ready else "not_ready",
        "runtime": health.get("runtime", "unknown"),
        "storage": os.getenv("JACOBI_TRAVEL_STORAGE", "automatic") or "automatic",
        "worker_mode": (
            "inline_development"
            if os.getenv("JACOBI_TRAVEL_INLINE_WORKER", "").strip() == "1"
            else "separate"
        ),
        "providers": health.get("providers", []),
    }


@router.post(
    "/searches",
    response_model=AcceptedSearch,
    status_code=202,
    summary="Create an independent flight or hotel provider search",
)
async def create_search(
    body: TravelSearchInput,
    request: Request,
    response: Response,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    extension_version: Annotated[
        str | None,
        Header(alias="X-Jacobi-Extension-Version"),
    ] = None,
) -> AcceptedSearch:
    owner_id = _owner_id(user)
    await _rate_limit(request, service, owner_id)
    _request_id(request, response)
    if extension_version is not None and not 1 <= len(extension_version.strip()) <= 64:
        raise HTTPException(status_code=422, detail="invalid extension version header")
    response.headers["X-Jacobi-Travel-API-Version"] = "2"
    try:
        accepted = await service.create_search(
            body,
            idempotency_key=idempotency_key,
            owner_id=owner_id,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
    if os.getenv("JACOBI_TRAVEL_INLINE_WORKER", "").strip() == "1":
        asyncio.create_task(TravelSearchWorker(service).process_one())
    return accepted


@router.get(
    "/searches/{search_id}",
    response_model=SearchSnapshot,
    summary="Read a capability-scoped progressive travel result",
)
def get_search(
    search_id: str,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
) -> SearchSnapshot:
    try:
        return service.get_snapshot(
            search_id,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/searches/{search_id}/events",
    summary="Replay and stream progressive travel results using SSE",
)
async def search_events(
    search_id: str,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    if last_event_id and len(last_event_id) > 128:
        raise HTTPException(status_code=422, detail="Last-Event-ID is too long")
    try:
        service.require_search(
            search_id,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc

    async def stream():
        async for event in service.events(
            search_id,
            owner_id=_owner_id(user),
            capability_token=capability,
            last_event_id=last_event_id,
        ):
            yield encode_sse(event)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/searches/{search_id}/cancel",
    response_model=SearchSnapshot,
    summary="Cancel a stale SPA search without cancelling unrelated searches",
)
async def cancel_search(
    search_id: str,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
) -> SearchSnapshot:
    try:
        return await service.cancel_search(
            search_id,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/searches/{search_id}/offers/{offer_id}/revalidate",
    response_model=RevalidationResponse,
    summary="Revalidate provider price and availability before any redirect",
)
async def revalidate_offer(
    search_id: str,
    offer_id: str,
    body: RevalidationRequest,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
) -> RevalidationResponse:
    del body
    try:
        return await service.revalidate_offer(
            search_id,
            offer_id,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/redirects",
    response_model=RedirectResponse,
    summary="Authorize a short-lived redirect only after confirmed revalidation",
)
async def authorize_redirect(
    body: RedirectRequest,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
) -> RedirectResponse:
    try:
        return await service.authorize_redirect(
            body.search_id,
            body.offer_id,
            body.revalidation_id,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.post("/redirects/authorize", response_model=RedirectResponse, include_in_schema=False)
async def authorize_redirect_compat(
    body: RedirectRequest,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
) -> RedirectResponse:
    return await authorize_redirect(body, service, user, capability)


@router.post("/feedback", status_code=202, summary="Record bounded travel result feedback")
def feedback(
    body: FeedbackRequest,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
) -> dict[str, str]:
    try:
        feedback_id = service.record_feedback(
            body,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
    return {"feedback_id": feedback_id}


@router.get("/providers", summary="List truthful configured and unconfigured supply")
def providers(
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
) -> dict[str, object]:
    return {"providers": service.provider_capabilities()}


@router.get("/providers/health", summary="Read provider and Redis health")
async def provider_health(
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
) -> dict[str, object]:
    return await service.provider_health()


@router.get("/preferences", response_model=TravelPreferences)
def get_preferences(
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
) -> TravelPreferences:
    owner_id = _owner_id(user)
    if owner_id is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return service.get_preferences(owner_id)


@router.put("/preferences", response_model=TravelPreferences)
def put_preferences(
    body: TravelPreferences,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
) -> TravelPreferences:
    owner_id = _owner_id(user)
    if owner_id is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return service.save_preferences(owner_id, body)


@router.get(
    "/searches/{search_id}/evidence/{manifest_id}",
    summary="Read immutable Agentcore evidence for a travel offer",
)
def evidence(
    search_id: str,
    manifest_id: str,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
):
    try:
        service.require_search(
            search_id,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
    manifest = service.evidence_manifest(search_id, manifest_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="evidence not found")
    return manifest
