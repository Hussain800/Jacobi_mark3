"""Jacobi Compare — REST surface.

POST /api/v1/compare            run a comparison from structured page context
GET  /api/v1/comparisons/{id}   fetch a stored result
GET  /api/v1/compare/health     adapters + status

Evidence manifests are served by the existing agentcore routes
(GET /api/v1/agent/manifests/{manifest_id}) — one evidence surface, not two.
"""

from __future__ import annotations

import os
import time
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Response

from .adapters import (
    BrowserSubmittedOfferAdapter,
    DirectHttpStructuredMetadataAdapter,
    get_adapters,
)
from .schemas import ComparisonRequest, OptimizationResult
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


@router.get("/providers/capabilities")
def provider_capabilities() -> Dict[str, Any]:
    return {"providers": _provider_descriptors(), "default_paid_provider_count": 0}


@router.get("/providers/health")
def provider_health() -> Dict[str, Any]:
    return {
        "providers": [
            {
                "provider_id": item["provider_id"],
                "health": item["health"],
                "fixture": item["fixture"],
                "cost": item["cost"],
            }
            for item in _provider_descriptors()
        ]
    }


@router.post("/compare", response_model=OptimizationResult)
async def compare(
    req: ComparisonRequest,
    request: Request,
    response: Response,
) -> OptimizationResult:
    _enforce_rate_limit(request)
    _request_id(response, request)
    return await service.compare(req)


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


@router.get("/comparisons/{comparison_id}/status")
def get_comparison_status(
    comparison_id: str,
    x_jacobi_access_token: Optional[str] = Header(
        default=None, alias="X-Jacobi-Access-Token"
    ),
) -> Dict[str, Any]:
    result = get_comparison(comparison_id, x_jacobi_access_token)
    return {
        "comparison_id": result.comparison_id,
        "status": result.recommendation.status,
        "created_at": result.created_at,
        "provider_errors": result.provider_errors,
        "complete": True,
    }


@router.get("/evidence/{manifest_id}")
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
