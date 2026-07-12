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
from collections import defaultdict
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from .adapters import get_adapters
from .schemas import ComparisonRequest, OptimizationResult
from .service import get_result, service

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


@router.get("/compare/health")
def compare_health() -> Dict[str, Any]:
    adapters = get_adapters()
    return {
        "status": "ok",
        "schema_version": OptimizationResult.model_fields["schema_version"].default,
        "adapters": [
            {
                "merchant_id": a.merchant_id,
                "merchant_name": a.merchant_name,
                "domains": a.domains,
                "discovery_method": a.discovery_method,
                "evidence_tier": a.evidence_tier,
                "cost_estimate_usd": a.cost_estimate_usd,
                "limitations": a.known_limitations,
            }
            for a in adapters
        ],
        "mandatory_collection_cost_usd": 0.0,
    }


@router.post("/compare", response_model=OptimizationResult)
async def compare(req: ComparisonRequest, request: Request) -> OptimizationResult:
    _enforce_rate_limit(request)
    return await service.compare(req)


@router.get("/comparisons/{comparison_id}", response_model=OptimizationResult)
def get_comparison(comparison_id: str) -> OptimizationResult:
    result = get_result(comparison_id)
    if result is None:
        raise HTTPException(status_code=404, detail="comparison not found")
    return result
