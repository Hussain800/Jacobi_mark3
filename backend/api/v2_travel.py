"""Versioned browser-native travel search API."""

from __future__ import annotations

import asyncio
import os
import re
import time
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
    TravelAPIErrorDetail,
    TravelAPIErrorResponse,
    TravelSearchInput,
    UserDataDeletionResponse,
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
from travel.telemetry import TravelMetricName


RATE_LIMIT_PER_MINUTE = int(os.getenv("JACOBI_TRAVEL_RATE_LIMIT_PER_MIN", "30"))
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")


def _owner_id(user: dict[str, Any] | None) -> str | None:
    value = (user or {}).get("id")
    return str(value) if value else None


def _request_id(request: Request, response: Response) -> str:
    value = request.headers.get("x-request-id", "").strip()
    request_id = value if _SAFE_REQUEST_ID.fullmatch(value) else f"req_{uuid4().hex}"
    request.state.jacobi_travel_request_id = request_id
    response.headers["X-Request-ID"] = request_id
    return request_id


def _request_context(request: Request, response: Response) -> str:
    return _request_id(request, response)


_ERROR_RESPONSES = {
    status: {"model": TravelAPIErrorResponse}
    for status in (401, 404, 409, 422, 429, 503)
}
router = APIRouter(
    prefix="/api/v2/travel",
    tags=["travel-v2"],
    dependencies=[Depends(_request_context)],
    responses=_ERROR_RESPONSES,
)


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


def _error_detail(
    *,
    request: Request,
    status_code: int,
    code: str,
    message: str,
    retryable: bool = False,
    search_id: str | None = None,
) -> HTTPException:
    request_id = getattr(request.state, "jacobi_travel_request_id", None)
    if not request_id:
        request_id = f"req_{uuid4().hex}"
    safe_search_id = (
        search_id
        if search_id is not None and _SAFE_REQUEST_ID.fullmatch(search_id)
        else None
    )
    detail = TravelAPIErrorDetail(
        code=code,
        message=message,
        retryable=retryable,
        request_id=request_id,
        search_id=safe_search_id,
    )
    return HTTPException(
        status_code=status_code,
        detail=detail.model_dump(),
        headers={"X-Request-ID": request_id},
    )


def _translate_error(
    exc: Exception,
    request: Request,
    *,
    search_id: str | None = None,
) -> HTTPException:
    if isinstance(exc, (TravelSearchNotFound, AccessDeniedError)):
        return _error_detail(
            request=request,
            status_code=404,
            code="travel_search_not_found",
            message="Travel search not found.",
            search_id=search_id,
        )
    if isinstance(exc, RedirectNotAvailable):
        return _error_detail(
            request=request,
            status_code=409,
            code="redirect_unavailable",
            message="A redirect is not available for this offer.",
            search_id=search_id,
        )
    if isinstance(exc, TravelSearchConflict):
        return _error_detail(
            request=request,
            status_code=409,
            code="travel_search_conflict",
            message="The travel search state conflicts with this operation.",
            search_id=search_id,
        )
    if isinstance(exc, ValueError):
        return _error_detail(
            request=request,
            status_code=422,
            code="travel_validation_error",
            message="The travel request could not be validated.",
            search_id=search_id,
        )
    if isinstance(exc, HTTPException):
        code = "rate_limited" if exc.status_code == 429 else f"http_{exc.status_code}"
        message = (
            "Travel search rate limit exceeded."
            if exc.status_code == 429
            else "The travel request could not be completed."
        )
        return _error_detail(
            request=request,
            status_code=exc.status_code,
            code=code,
            message=message,
            retryable=exc.status_code in {429, 503},
            search_id=search_id,
        )
    raise exc


def _sanitized_error_code(exc: Exception) -> str:
    if isinstance(exc, (TravelSearchNotFound, AccessDeniedError)):
        return "not_found"
    if isinstance(exc, RedirectNotAvailable):
        return "redirect_unavailable"
    if isinstance(exc, TravelSearchConflict):
        return "conflict"
    if isinstance(exc, ValueError):
        return "validation"
    if isinstance(exc, HTTPException):
        return f"http_{exc.status_code}"
    return "internal_error"


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
    worker_ready = health.get("worker") in {"inline", "healthy"}
    if not runtime_ready or not worker_ready:
        response.status_code = 503
    return {
        "status": "ready" if runtime_ready and worker_ready else "not_ready",
        "runtime": health.get("runtime", "unknown"),
        "worker": health.get("worker", "unknown"),
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
    correlation_id = _request_id(request, response)
    request_started = time.monotonic()
    owner_id = _owner_id(user)
    with service.observability.span(
        "api",
        correlation_id=correlation_id,
        environment="api",
        observation_method="api",
    ):
        try:
            await _rate_limit(request, service, owner_id)
            if extension_version is not None and not 1 <= len(extension_version.strip()) <= 64:
                raise HTTPException(status_code=422, detail="invalid extension version header")
            response.headers["X-Jacobi-Travel-API-Version"] = "2"
            accepted = await service.create_search(
                body,
                idempotency_key=idempotency_key,
                owner_id=owner_id,
            )
        except Exception as exc:
            service.observability.log(
                correlation_id=correlation_id,
                search_id=None,
                provider_id=None,
                stage="api.create_search.failed",
                duration_ms=(time.monotonic() - request_started) * 1000,
                result_count=0,
                sanitized_error_code=_sanitized_error_code(exc),
                environment="api",
                observation_method="api",
            )
            raise _translate_error(exc, request) from exc
    service.observability.log(
        correlation_id=correlation_id,
        search_id=accepted.search_id,
        provider_id=None,
        stage="api.create_search.accepted",
        duration_ms=(time.monotonic() - request_started) * 1000,
        result_count=0,
        environment="api",
        observation_method="api",
    )
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
    request: Request,
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
        raise _translate_error(exc, request, search_id=search_id) from exc


@router.get(
    "/searches/{search_id}/events",
    summary="Replay and stream progressive travel results using SSE",
)
async def search_events(
    search_id: str,
    request: Request,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    if last_event_id and len(last_event_id) > 128:
        raise _error_detail(
            request=request,
            status_code=422,
            code="invalid_last_event_id",
            message="Last-Event-ID is too long.",
            search_id=search_id,
        )
    try:
        service.require_search(
            search_id,
            owner_id=_owner_id(user),
            capability_token=capability,
        )
    except Exception as exc:
        raise _translate_error(exc, request, search_id=search_id) from exc

    async def stream():
        connected_at = time.monotonic()
        service.observability.metrics.record(
            TravelMetricName.sse_connections,
            1,
            attributes={"status": "connected"},
        )
        service.observability.log(
            correlation_id=search_id,
            search_id=search_id,
            provider_id=None,
            stage="sse.connected",
            duration_ms=0,
            result_count=0,
            environment="api",
            observation_method="sse",
        )
        delivered = 0
        try:
            async for event in service.events(
                search_id,
                owner_id=_owner_id(user),
                capability_token=capability,
                last_event_id=last_event_id,
            ):
                with service.observability.span(
                    "sse_delivery",
                    correlation_id=search_id,
                    search_id=search_id,
                    environment="api",
                    observation_method="sse",
                ):
                    delivered += 1
                    yield encode_sse(event)
        finally:
            service.observability.metrics.record(
                TravelMetricName.sse_connections,
                -1,
                attributes={"status": "disconnected"},
            )
            service.observability.log(
                correlation_id=search_id,
                search_id=search_id,
                provider_id=None,
                stage="sse.disconnected",
                duration_ms=(time.monotonic() - connected_at) * 1000,
                result_count=delivered,
                environment="api",
                observation_method="sse",
            )

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
    request: Request,
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
        raise _translate_error(exc, request, search_id=search_id) from exc


@router.post(
    "/searches/{search_id}/offers/{offer_id}/revalidate",
    response_model=RevalidationResponse,
    summary="Revalidate provider price and availability before any redirect",
)
async def revalidate_offer(
    search_id: str,
    offer_id: str,
    body: RevalidationRequest,
    request: Request,
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
        raise _translate_error(exc, request, search_id=search_id) from exc


@router.post(
    "/redirects",
    response_model=RedirectResponse,
    summary="Authorize a short-lived redirect only after confirmed revalidation",
)
async def authorize_redirect(
    body: RedirectRequest,
    request: Request,
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
        raise _translate_error(exc, request, search_id=body.search_id) from exc


@router.post("/redirects/authorize", response_model=RedirectResponse, include_in_schema=False)
async def authorize_redirect_compat(
    body: RedirectRequest,
    request: Request,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
    capability: Annotated[
        str | None,
        Header(alias="X-Jacobi-Search-Capability"),
    ] = None,
) -> RedirectResponse:
    return await authorize_redirect(body, request, service, user, capability)


@router.post("/feedback", status_code=202, summary="Record bounded travel result feedback")
def feedback(
    body: FeedbackRequest,
    request: Request,
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
        raise _translate_error(exc, request, search_id=body.search_id) from exc
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
    request: Request,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
) -> TravelPreferences:
    owner_id = _owner_id(user)
    if owner_id is None:
        raise _error_detail(
            request=request,
            status_code=401,
            code="authentication_required",
            message="Authentication is required.",
        )
    return service.get_preferences(owner_id)


@router.put("/preferences", response_model=TravelPreferences)
def put_preferences(
    body: TravelPreferences,
    request: Request,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
) -> TravelPreferences:
    owner_id = _owner_id(user)
    if owner_id is None:
        raise _error_detail(
            request=request,
            status_code=401,
            code="authentication_required",
            message="Authentication is required.",
        )
    return service.save_preferences(owner_id, body)


@router.delete(
    "/user-data",
    response_model=UserDataDeletionResponse,
    summary="Delete owned travel history and preferences",
)
def delete_user_data(
    request: Request,
    service: Annotated[TravelSearchService, Depends(get_travel_search_service)],
    user: Annotated[dict[str, Any] | None, Depends(get_optional_user)],
) -> UserDataDeletionResponse:
    owner_id = _owner_id(user)
    if owner_id is None:
        raise _error_detail(
            request=request,
            status_code=401,
            code="authentication_required",
            message="Authentication is required.",
        )
    result = service.delete_user_data(owner_id)
    return UserDataDeletionResponse(
        deleted_records=result.total_deleted,
        deleted_by_collection=dict(result.deleted_by_collection),
        preserved_deidentified_collections=result.preserved_deidentified_collections,
    )


@router.get(
    "/searches/{search_id}/evidence/{manifest_id}",
    summary="Read immutable Agentcore evidence for a travel offer",
)
def evidence(
    search_id: str,
    manifest_id: str,
    request: Request,
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
        raise _translate_error(exc, request, search_id=search_id) from exc
    manifest = service.evidence_manifest(search_id, manifest_id)
    if manifest is None:
        raise _error_detail(
            request=request,
            status_code=404,
            code="evidence_not_found",
            message="Evidence was not found or failed integrity verification.",
            search_id=search_id,
        )
    return manifest
