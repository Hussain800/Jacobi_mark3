"""
Jacobi for Agents — REST surface (/v1/agent/*).

Thin FastAPI layer over engine.py. Mirrors the MCP tool catalog so agent
clients and the dashboard hit identical logic. No purchase execution exists
anywhere behind these endpoints.
"""

from __future__ import annotations

import json
import os
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import engine
from . import policy as policy_mod
from .schemas import ConsentScope, PolicyDecision

# /api prefix so the Next dev proxy (app/api/[...path] → backend /api/*) and
# direct prod calls share one path shape.
router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

# Per-IP sliding-window rate limit on the endpoints that trigger collection.
# The /verify raw-url path is an unauthenticated fetch trigger (SSRF-guarded
# but still egress) — without this it is an open fetch proxy / DoS amplifier.
RATE_LIMIT_PER_MINUTE = int(os.getenv("JACOBI_AGENT_RATE_LIMIT_PER_MIN", "30"))
_RATE_BUCKETS: Dict[str, List[float]] = defaultdict(list)


def _enforce_rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.time()
    bucket = [t for t in _RATE_BUCKETS[key] if now - t < 60.0]
    if len(bucket) >= RATE_LIMIT_PER_MINUTE:
        _RATE_BUCKETS[key] = bucket
        raise HTTPException(status_code=429, detail="agent verification rate limit exceeded")
    bucket.append(now)
    _RATE_BUCKETS[key] = bucket
    if len(_RATE_BUCKETS) > 10_000:  # bound the bucket map itself
        _RATE_BUCKETS.clear()


class VerifyRequest(BaseModel):
    demo: Optional[str] = Field(default=None, description="fee_drift | blocked_route")
    url: Optional[str] = None
    consent_scope: str = "recommend"
    displayed_total: Optional[Dict[str, Any]] = None  # {"amount": 2180, "currency": "AED"}
    official_route: bool = False
    agent_id: str = "unknown-agent"
    item_or_booking: Optional[Dict[str, Any]] = None
    merchant: Optional[Dict[str, Any]] = None


class PolicyCheckRequest(BaseModel):
    url: str
    consent_scope: str = "recommend"
    official_route: bool = False


@router.get("/health")
def agent_health() -> Dict[str, Any]:
    return engine.health()


@router.post("/verify")
def verify(req: VerifyRequest, request: Request):
    _enforce_rate_limit(request)
    try:
        return engine.run_verify(
            demo=req.demo,
            url=req.url,
            consent_scope=req.consent_scope,
            displayed_total=req.displayed_total,
            official_route=req.official_route,
            agent_id=req.agent_id,
            item_or_booking=req.item_or_booking,
            merchant=req.merchant,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/compare-total-price")
def compare_total_price(req: VerifyRequest, request: Request) -> Dict[str, Any]:
    _enforce_rate_limit(request)
    try:
        env = engine.run_verify(
            demo=req.demo,
            url=req.url,
            consent_scope=req.consent_scope,
            displayed_total=req.displayed_total,
            official_route=req.official_route,
            agent_id=req.agent_id,
            item_or_booking=req.item_or_booking,
            merchant=req.merchant,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {
        "request_id": env.request_id,
        "decision": env.decision,
        "price_summary": env.price_summary,
        "reason_codes": env.reason_codes,
        "manifest_id": env.evidence.manifest_id,
    }


@router.post("/policy/check")
def policy_check(req: PolicyCheckRequest) -> PolicyDecision:
    try:
        scope = ConsentScope(req.consent_scope)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid consent_scope '{req.consent_scope}'")
    return policy_mod.evaluate(req.url, scope, req.official_route)


@router.get("/decisions/{request_id}")
def get_decision(request_id: str):
    env = engine.get_envelope(request_id)
    if env is None:
        raise HTTPException(status_code=404, detail="decision not found")
    return env


@router.post("/explain")
def explain_decision(body: Dict[str, str]) -> Dict[str, str]:
    request_id = body.get("request_id", "")
    out = engine.explain(request_id)
    if out is None:
        raise HTTPException(status_code=404, detail="decision not found")
    return out


@router.get("/manifests/{manifest_id}")
def get_manifest(manifest_id: str):
    man = engine.get_manifest(manifest_id)
    if man is None:
        raise HTTPException(status_code=404, detail="manifest not found")
    return man


@router.get("/manifests/{manifest_id}/export")
def export_manifest(manifest_id: str) -> Response:
    """JSON evidence export (download)."""
    man = engine.get_manifest(manifest_id)
    if man is None:
        raise HTTPException(status_code=404, detail="manifest not found")
    payload = json.dumps(man.model_dump(mode="json"), indent=2, default=str)
    return Response(
        content=payload,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="jacobi-evidence-{manifest_id}.json"'
        },
    )
