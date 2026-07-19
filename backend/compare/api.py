"""Versioned REST composition for price optimization and optional Deep Audit."""

from __future__ import annotations

import os
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Response
from agentcore.schemas import EvidenceManifest

from .adapters import (
    BrowserSubmittedOfferAdapter,
    DirectHttpStructuredMetadataAdapter,
    get_adapters,
)
from . import tooling
from .schemas import (
    ComparisonRequest,
    ComparisonStatusResult,
    DeepAuditRequest,
    DeepAuditResult,
    DiscoveryResult,
    FeedbackEvent,
    FeedbackRequest,
    FeedbackResult,
    IdentifyProductRequest,
    OptimizationResult,
    ProductIdentity,
    ProviderCapabilitiesResult,
    ProviderHealthResult,
)
from .telemetry import MetricEvent
from .service import (
    get_comparison_manifest,
    get_result,
    service,
    verify_comparison_access,
)

router = APIRouter(prefix="/api/v1", tags=["compare"])

# Per-IP sliding window. Comparison triggers adapter fan-out, so unauthenticated
# calls need the same brake the agent /verify endpoint has.
RATE_LIMIT_PER_MINUTE = int(os.getenv("JACOBI_COMPARE_RATE_LIMIT_PER_MIN", "30"))
_BUCKETS: Dict[str, List[float]] = defaultdict(list)


def reset_rate_limits_for_tests() -> None:
    _BUCKETS.clear()


def _enforce_rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.time()
    bucket = [t for t in _BUCKETS[key] if now - t < 60.0]
    if len(bucket) >= RATE_LIMIT_PER_MINUTE:
        _BUCKETS[key] = bucket
        raise HTTPException(status_code=429, detail="comparison rate limit exceeded")
    bucket.append(now)
    _BUCKETS[key] = bucket
    if len(_BUCKETS) > 10_000:
        _BUCKETS.clear()


def _request_id(response: Response, request: Request) -> str:
    value = request.headers.get("x-request-id", "").strip()[:128]
    request_id = value or f"req_{uuid.uuid4().hex}"
    response.headers["X-Request-ID"] = request_id
    return request_id


def _provider_descriptors() -> List[Dict[str, Any]]:
    direct_http = DirectHttpStructuredMetadataAdapter.__new__(
        DirectHttpStructuredMetadataAdapter
    )
    direct_http.domains = []
    providers = [
        BrowserSubmittedOfferAdapter([]),
        direct_http,
        *get_adapters(),
    ]
    result = []
    for provider in providers:
        item = provider.describe().to_dict()
        item["merchant_id"] = item["provider_id"]
        item["merchant_name"] = item["name"]
        result.append(item)
    return result


@router.get("/compare/health")
def compare_health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "schema_version": OptimizationResult.model_fields["schema_version"].default,
        "adapters": _provider_descriptors(),
        "mandatory_collection_cost_usd": 0.0,
        "paid_providers_enabled_by_default": False,
        "storage_backend": os.getenv("JACOBI_COMPARE_STORAGE", "memory"),
    }


@router.get("/providers/capabilities", response_model=ProviderCapabilitiesResult)
def provider_capabilities() -> ProviderCapabilitiesResult:
    return ProviderCapabilitiesResult(
        providers=_provider_descriptors(), default_paid_provider_count=0
    )


@router.get("/providers/health", response_model=ProviderHealthResult)
def provider_health() -> ProviderHealthResult:
    return ProviderHealthResult.model_validate({
        "providers": [
            {
                "provider_id": item["provider_id"],
                "health": item["health"],
                "fixture": item["fixture"],
                "cost": item["cost"],
            }
            for item in _provider_descriptors()
        ]
    })


@router.post(
    "/identify",
    response_model=ProductIdentity,
    summary="Identify a product from browser-observed fields",
)
def identify_product(
    body: IdentifyProductRequest,
    request: Request,
    response: Response,
) -> ProductIdentity:
    _enforce_rate_limit(request)
    _request_id(response, request)
    return ProductIdentity.model_validate(tooling.identify_product_fields(body.fields))


@router.post("/compare", response_model=OptimizationResult)
async def compare(
    req: ComparisonRequest,
    request: Request,
    response: Response,
) -> OptimizationResult:
    _enforce_rate_limit(request)
    _request_id(response, request)
    return await service.compare(req)


@router.post(
    "/discover",
    response_model=DiscoveryResult,
    summary="Discover request-approved offers with isolated provider failures",
)
async def discover(
    req: ComparisonRequest,
    request: Request,
    response: Response,
) -> DiscoveryResult:
    _enforce_rate_limit(request)
    _request_id(response, request)
    result = await service.compare(req)
    return DiscoveryResult.model_validate(tooling.discovery_view(result))


@router.post(
    "/optimize",
    response_model=OptimizationResult,
    summary="Find and explain the cheapest valid purchase route",
)
async def optimize(
    req: ComparisonRequest,
    request: Request,
    response: Response,
) -> OptimizationResult:
    _enforce_rate_limit(request)
    _request_id(response, request)
    return await service.compare(req)


@router.post(
    "/offers/submit",
    response_model=OptimizationResult,
    summary="Compare browser-observed offers submitted from open tabs",
)
async def submit_offers(
    req: ComparisonRequest,
    request: Request,
    response: Response,
) -> OptimizationResult:
    if not req.submitted_offers:
        raise HTTPException(status_code=422, detail="submitted_offers must not be empty")
    _enforce_rate_limit(request)
    _request_id(response, request)
    return await service.compare(req)


@router.post(
    "/deep-audit",
    response_model=DeepAuditResult,
    summary="Explicitly run the preserved advanced audit",
)
async def deep_audit(
    body: DeepAuditRequest,
    request: Request,
    response: Response,
) -> DeepAuditResult:
    _enforce_rate_limit(request)
    _request_id(response, request)
    payload = await tooling.deep_audit(**body.model_dump())
    if "error" in payload:
        raise HTTPException(status_code=400, detail=payload["error"])
    return DeepAuditResult(
        status="complete",
        automatic_paid_provider_calls=bool(
            payload.get("automatic_paid_provider_calls", False)
        ),
        managed_provider_explicitly_allowed=bool(
            payload.get("managed_provider_explicitly_allowed", False)
        ),
        paid_provider_usage=str(payload.get("paid_provider_usage", "unknown")),
        result=payload,
    )


@router.post(
    "/feedback",
    response_model=FeedbackResult,
    summary="Record optional privacy-conscious comparison feedback",
)
def record_feedback(
    body: FeedbackRequest,
    request: Request,
    response: Response,
    x_jacobi_access_token: Optional[str] = Header(
        default=None, alias="X-Jacobi-Access-Token"
    ),
) -> FeedbackResult:
    _enforce_rate_limit(request)
    _request_id(response, request)
    if not verify_comparison_access(body.comparison_id, x_jacobi_access_token):
        raise HTTPException(status_code=404, detail="comparison not found")
    event_id = f"evt_{uuid.uuid4().hex[:16]}"
    service.repository.append_event(
        event_id,
        body.comparison_id,
        {
            "event": body.event.value,
            "offer_observation_id": body.offer_observation_id,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    metric = {
        FeedbackEvent.alternative_opened: MetricEvent.alternative_opened,
        FeedbackEvent.false_match_report: MetricEvent.false_match_report,
        FeedbackEvent.wrong_match_feedback: MetricEvent.wrong_match_feedback,
    }[body.event]
    result = get_result(body.comparison_id)
    service.metrics.record(
        metric,
        dimensions={"market": result.market if result else "unknown"},
    )
    return FeedbackResult(event_id=event_id)


@router.get("/comparisons/{comparison_id}", response_model=OptimizationResult)
def get_comparison(
    comparison_id: str,
    x_jacobi_access_token: Optional[str] = Header(
        default=None, alias="X-Jacobi-Access-Token"
    ),
) -> OptimizationResult:
    if not verify_comparison_access(comparison_id, x_jacobi_access_token):
        raise HTTPException(status_code=404, detail="comparison not found")
    result = get_result(comparison_id)
    if result is None:
        raise HTTPException(status_code=404, detail="comparison not found")
    return result


@router.get(
    "/comparisons/{comparison_id}/status",
    response_model=ComparisonStatusResult,
)
def get_comparison_status(
    comparison_id: str,
    x_jacobi_access_token: Optional[str] = Header(
        default=None, alias="X-Jacobi-Access-Token"
    ),
) -> ComparisonStatusResult:
    result = get_comparison(comparison_id, x_jacobi_access_token)
    return ComparisonStatusResult.model_validate({
        "comparison_id": result.comparison_id,
        "status": result.recommendation.status,
        "created_at": result.created_at,
        "provider_errors": result.provider_errors,
        "complete": True,
    })


@router.get("/evidence/{manifest_id}", response_model=EvidenceManifest)
def get_optimization_evidence(
    manifest_id: str,
    comparison_id: str,
    x_jacobi_access_token: Optional[str] = Header(
        default=None, alias="X-Jacobi-Access-Token"
    ),
):
    if not verify_comparison_access(comparison_id, x_jacobi_access_token):
        raise HTTPException(status_code=404, detail="evidence not found")
    manifest = get_comparison_manifest(comparison_id, manifest_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="evidence not found")
    return manifest
