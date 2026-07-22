"""AgentCore command-boundary, freshness, and transport-parity tests."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agentcore import commands, engine, mcp_server, storage
from agentcore.api import _RATE_BUCKETS, router as agent_router
from agentcore.schemas import Decision, DecisionEnvelope, EvidenceTier, SCHEMA_VERSION


@pytest.fixture()
def client():
    _RATE_BUCKETS.clear()
    app = FastAPI()
    app.include_router(agent_router)
    yield TestClient(app)
    _RATE_BUCKETS.clear()


def _context(transport: str = "test") -> commands.CommandContext:
    return commands.CommandContext(org=f"{transport}-org", transport=transport)


def _normalized_envelope(payload: dict) -> dict:
    """Remove only values generated independently by each transport call."""
    normalized = deepcopy(payload)
    for key in ("request_id", "obligation_id", "created_at", "expires_at"):
        normalized[key] = f"<{key}>"
    normalized["evidence"]["manifest_id"] = "<manifest_id>"
    normalized["evidence"]["manifest_sha256"] = "<manifest_sha256>"
    return normalized


def _normalized_comparison(payload: dict) -> dict:
    normalized = deepcopy(payload)
    for key in ("request_id", "created_at", "expires_at", "manifest_id"):
        normalized[key] = f"<{key}>"
    return normalized


def test_command_normalizes_schema_and_money():
    command = commands.normalize_verify_command({
        "schema_version": SCHEMA_VERSION,
        "demo": "fee_drift",
        "consent_scope": "recommend",
        "displayed_total": {"amount": "2180", "currency": "AED"},
    })

    assert command.schema_version == SCHEMA_VERSION
    assert command.consent_scope.value == "recommend"
    assert command.displayed_total == {"amount": 2180.0, "currency": "AED", "label": None}


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({}, "missing_target"),
        ({"demo": "fee_drift", "url": "https://example.com"}, "ambiguous_target"),
        ({"demo": "not-a-demo"}, "unknown_demo"),
        ({"demo": "fee_drift", "consent_scope": "buy_now"}, "invalid_consent_scope"),
        ({"demo": "fee_drift", "schema_version": "2.0.0"}, "unsupported_schema_version"),
    ],
)
def test_command_errors_are_stable_and_do_not_echo_input(payload, code):
    with pytest.raises(commands.AgentCommandError) as caught:
        commands.normalize_verify_command(payload)

    error = caught.value.as_dict()
    assert error["schema_version"] == SCHEMA_VERSION
    assert error["code"] == code
    assert error["retryable"] is False
    assert "not-a-demo" not in error["message"]


def test_envelope_freshness_boundary_is_exclusive():
    created = datetime(2026, 7, 22, 12, 0, tzinfo=timezone.utc)
    envelope = DecisionEnvelope(created_at=created, ttl_seconds=900)

    assert envelope.expires_at == created + timedelta(seconds=900)
    assert envelope.is_fresh(created + timedelta(seconds=899)) is True
    assert envelope.is_fresh(envelope.expires_at) is False
    payload = envelope.model_dump(mode="json")
    assert payload["expires_at"] == "2026-07-22T12:15:00Z"


def test_example_client_rejects_schema_mismatch_and_stale_envelope():
    example_path = Path(__file__).resolve().parents[2] / "examples" / "agent_client_demo.py"
    spec = importlib.util.spec_from_file_location("agent_client_demo", example_path)
    assert spec is not None and spec.loader is not None
    demo_client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(demo_client)

    envelope = engine.run_verify(demo="fee_drift").model_dump(mode="json")
    created_at = datetime.fromisoformat(envelope["created_at"].replace("Z", "+00:00"))
    demo_client.validate_envelope(envelope, now=created_at)

    incompatible = deepcopy(envelope)
    incompatible["schema_version"] = "2.0.0"
    with pytest.raises(demo_client.ContractError, match="unsupported schema_version"):
        demo_client.validate_envelope(incompatible, now=created_at)

    expires_at = datetime.fromisoformat(envelope["expires_at"].replace("Z", "+00:00"))
    with pytest.raises(demo_client.ContractError, match="stale"):
        demo_client.validate_envelope(envelope, now=expires_at)


def test_unavailable_durable_storage_fails_before_collection(monkeypatch):
    calls = []
    monkeypatch.setenv("JACOBI_AGENT_STORAGE", "supabase")
    monkeypatch.setattr(storage, "get_supabase", lambda: None)
    monkeypatch.setattr(engine, "collect_stages", lambda url: calls.append(url) or [])
    storage.reset_repo_for_tests()
    command = commands.normalize_verify_command({
        "url": "https://example-hotel.example/room",
        "consent_scope": "recommend",
    })

    try:
        with pytest.raises(commands.AgentCommandError) as caught:
            commands.execute_verify(command, _context())
        assert caught.value.code == "storage_unavailable"
        assert caught.value.http_status == 503
        assert caught.value.retryable is True
        assert calls == []
    finally:
        storage.reset_repo_for_tests()


def test_unknown_storage_backend_fails_closed(monkeypatch):
    monkeypatch.setenv("JACOBI_AGENT_STORAGE", "typo-backend")
    storage.reset_repo_for_tests()
    try:
        with pytest.raises(storage.StorageUnavailableError):
            storage.get_repo()
    finally:
        storage.reset_repo_for_tests()


def test_blocked_purchase_command_performs_no_collection(monkeypatch):
    calls = []
    monkeypatch.setattr(engine, "collect_stages", lambda url: calls.append(url) or [])
    command = commands.normalize_verify_command({"demo": "blocked_route"})

    envelope = commands.execute_verify(command, _context())

    assert envelope.decision == Decision.block
    assert envelope.evidence.capability_tier == EvidenceTier.claim_only
    assert calls == []


def test_rest_and_mcp_verify_semantics_match(client):
    rest = client.post("/api/v1/agent/verify", json={
        "schema_version": SCHEMA_VERSION,
        "demo": "fee_drift",
        "consent_scope": "recommend",
    })
    mcp = mcp_server.verify_purchase_context(
        demo="fee_drift",
        consent_scope="recommend",
        schema_version=SCHEMA_VERSION,
    )

    assert rest.status_code == 200
    assert _normalized_envelope(rest.json()) == _normalized_envelope(mcp)


def test_rest_and_mcp_compare_semantics_match(client):
    rest = client.post("/api/v1/agent/compare-total-price", json={
        "schema_version": SCHEMA_VERSION,
        "demo": "fee_drift",
    })
    mcp = mcp_server.compare_total_price(
        demo="fee_drift",
        schema_version=SCHEMA_VERSION,
    )

    assert rest.status_code == 200
    assert _normalized_comparison(rest.json()) == _normalized_comparison(mcp)


def test_rest_and_mcp_command_error_semantics_match(client):
    rest = client.post("/api/v1/agent/verify", json={
        "schema_version": "2.0.0",
        "demo": "fee_drift",
    })
    mcp = mcp_server.verify_purchase_context(
        demo="fee_drift",
        schema_version="2.0.0",
    )

    assert rest.status_code == 422
    assert rest.json() == mcp
    assert rest.json()["error"]["code"] == "unsupported_schema_version"


def test_rest_not_found_and_rate_limit_errors_are_structured(client, monkeypatch):
    missing = client.get("/api/v1/agent/decisions/req_missing")
    assert missing.status_code == 404
    assert missing.json()["error"] == {
        "schema_version": SCHEMA_VERSION,
        "code": "decision_not_found",
        "message": "The decision was not found.",
        "retryable": False,
    }

    from agentcore import api as api_mod

    monkeypatch.setattr(api_mod, "RATE_LIMIT_PER_MINUTE", 0)
    limited = client.post("/api/v1/agent/verify", json={"demo": "fee_drift"})
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert limited.json()["error"]["retryable"] is True
