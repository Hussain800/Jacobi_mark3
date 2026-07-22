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
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import auth
from . import commands
from . import engine
from .pdf_export import build_evidence_pdf
from .schemas import PolicyDecision, SCHEMA_VERSION

# /api prefix so the Next dev proxy (app/api/[...path] → backend /api/*) and
# direct prod calls share one path shape.
router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

# Per-IP sliding-window rate limit on the endpoints that trigger collection.
# The /verify raw-url path is an unauthenticated fetch trigger (SSRF-guarded
# but still egress) — without this it is an open fetch proxy / DoS amplifier.
RATE_LIMIT_PER_MINUTE = int(os.getenv("JACOBI_AGENT_RATE_LIMIT_PER_MIN", "30"))
_RATE_BUCKETS: Dict[str, List[float]] = defaultdict(list)


def _rate_key(request: Request) -> str:
    """Authenticated callers are limited per API key; anonymous per IP.
    Only VALID keys get their own bucket — otherwise rotating bogus
    X-Api-Key values would mint a fresh bucket per request and bypass the
    limit. X-Forwarded-For is honored only when explicitly configured behind
    a trusted proxy — it is caller-spoofable otherwise."""
    api_key = request.headers.get("X-Api-Key")
    if api_key and api_key in auth._load_keys():
        return f"key:{api_key}"
    if os.getenv("JACOBI_TRUSTED_PROXY") == "1":
        fwd = request.headers.get("X-Forwarded-For", "")
        if fwd:
            return f"ip:{fwd.split(',')[0].strip()}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


def _enforce_rate_limit(request: Request) -> None:
    key = _rate_key(request)
    now = time.time()
    bucket = [t for t in _RATE_BUCKETS[key] if now - t < 60.0]
    if len(bucket) >= RATE_LIMIT_PER_MINUTE:
        _RATE_BUCKETS[key] = bucket
        raise commands.AgentCommandError(
            "rate_limited",
            "Agent verification rate limit exceeded.",
            http_status=429,
            retryable=True,
        )
    bucket.append(now)
    _RATE_BUCKETS[key] = bucket
    if len(_RATE_BUCKETS) > 10_000:  # bound the bucket map itself
        _RATE_BUCKETS.clear()


class VerifyRequest(BaseModel):
    schema_version: str = SCHEMA_VERSION
    demo: Optional[str] = Field(default=None, description="fee_drift | blocked_route")
    url: Optional[str] = None
    consent_scope: str = "recommend"
    displayed_total: Optional[Dict[str, Any]] = None  # {"amount": 2180, "currency": "AED"}
    official_route: bool = False
    agent_id: str = "unknown-agent"
    item_or_booking: Optional[Dict[str, Any]] = None
    merchant: Optional[Dict[str, Any]] = None


class PolicyCheckRequest(BaseModel):
    schema_version: str = SCHEMA_VERSION
    url: str
    consent_scope: str = "recommend"
    official_route: bool = False


def _command_error_response(exc: commands.AgentCommandError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content={"error": exc.as_dict()})


def _auth_error_response(exc: HTTPException) -> JSONResponse:
    code = "invalid_api_key" if exc.status_code == 401 else "api_key_required"
    error = commands.AgentCommandError(
        code,
        "The API key is invalid." if exc.status_code == 401 else "An API key is required.",
        http_status=exc.status_code,
    )
    return _command_error_response(error)


def _not_found_response(kind: str) -> JSONResponse:
    return _command_error_response(commands.AgentCommandError(
        f"{kind}_not_found",
        f"The {kind} was not found.",
        http_status=404,
    ))


@router.get("/health")
def agent_health() -> Dict[str, Any]:
    return engine.health()


@router.post("/verify")
def verify(req: VerifyRequest, request: Request):
    try:
        _enforce_rate_limit(request)
        org = auth.org_for_write(request, is_demo=bool(req.demo))
        command = commands.normalize_verify_command(req.model_dump())
        return commands.execute_verify(
            command,
            commands.CommandContext(org=org, transport="rest"),
        )
    except commands.AgentCommandError as exc:
        return _command_error_response(exc)
    except HTTPException as exc:
        return _auth_error_response(exc)


@router.post("/compare-total-price")
def compare_total_price(req: VerifyRequest, request: Request) -> Dict[str, Any]:
    try:
        _enforce_rate_limit(request)
        org = auth.org_for_write(request, is_demo=bool(req.demo))
        command = commands.normalize_verify_command(req.model_dump())
        env = commands.execute_verify(
            command,
            commands.CommandContext(org=org, transport="rest"),
        )
    except commands.AgentCommandError as exc:
        return _command_error_response(exc)
    except HTTPException as exc:
        return _auth_error_response(exc)
    return commands.compare_total_price_projection(env)


@router.post("/policy/check")
def policy_check(req: PolicyCheckRequest) -> PolicyDecision:
    try:
        command = commands.normalize_policy_command(req.model_dump())
        return commands.execute_policy(command)
    except commands.AgentCommandError as exc:
        return _command_error_response(exc)


@router.get("/decisions/{request_id}")
def get_decision(request_id: str, request: Request):
    try:
        orgs = auth.readable_orgs(request)
    except HTTPException as exc:
        return _auth_error_response(exc)
    env = engine.get_envelope(request_id, orgs)
    if env is None:
        return _not_found_response("decision")
    return env


@router.get("/decisions/{request_id}/export.pdf")
def export_decision_pdf(request_id: str, request: Request) -> Response:
    """PDF evidence receipt for a stored decision."""
    try:
        orgs = auth.readable_orgs(request)
    except HTTPException as exc:
        return _auth_error_response(exc)
    env = engine.get_envelope(request_id, orgs)
    if env is None:
        return _not_found_response("decision")
    man = engine.get_manifest(env.evidence.manifest_id, orgs)
    pdf = build_evidence_pdf(env, man)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="jacobi-evidence-{request_id}.pdf"'
        },
    )


@router.post("/explain")
def explain_decision(body: Dict[str, str], request: Request) -> Dict[str, str]:
    request_id = body.get("request_id", "")
    try:
        orgs = auth.readable_orgs(request)
    except HTTPException as exc:
        return _auth_error_response(exc)
    out = engine.explain(request_id, orgs)
    if out is None:
        return _not_found_response("decision")
    return out


@router.get("/manifests/{manifest_id}")
def get_manifest(manifest_id: str, request: Request):
    try:
        orgs = auth.readable_orgs(request)
    except HTTPException as exc:
        return _auth_error_response(exc)
    man = engine.get_manifest(manifest_id, orgs)
    if man is None:
        return _not_found_response("manifest")
    return man


@router.get("/manifests/{manifest_id}/export")
def export_manifest(manifest_id: str, request: Request) -> Response:
    """JSON evidence export (download)."""
    try:
        orgs = auth.readable_orgs(request)
    except HTTPException as exc:
        return _auth_error_response(exc)
    man = engine.get_manifest(manifest_id, orgs)
    if man is None:
        return _not_found_response("manifest")
    payload = json.dumps(man.model_dump(mode="json"), indent=2, default=str)
    return Response(
        content=payload,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="jacobi-evidence-{manifest_id}.json"'
        },
    )
