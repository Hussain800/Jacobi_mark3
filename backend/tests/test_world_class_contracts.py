"""G012 API contract fixture validation.

These tests intentionally validate checked-in, sanitized contract fixtures
without changing runtime routes. They use stdlib checks plus existing Pydantic
models where those models are the current source of truth.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CONTRACT_ROOT = REPO_ROOT / "contracts" / "api" / "v1"
FIXTURES = CONTRACT_ROOT / "fixtures"
SCHEMAS = CONTRACT_ROOT / "schemas"
HEX_64 = re.compile(r"^[a-f0-9]{64}$")
FORBIDDEN_REDACTED_KEYS = {
    "id",
    "organization_id",
    "finding_id",
    "scan_job_id",
    "watchlist_item_id",
    "product_id",
    "seller_id",
    "created_by",
    "requested_by",
    "revoked_by",
    "token",
    "token_hash",
    "probe_session_id",
    "probe_row_id",
    "extraction_evidence",
}


def _load_fixture(name: str) -> dict[str, Any]:
    with (FIXTURES / name).open(encoding="utf-8") as fh:
        return json.load(fh)


def _walk(value: Any):
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from _walk(nested)
    elif isinstance(value, list):
        for item in value:
            yield from _walk(item)


def test_contract_json_files_parse_and_carry_envelope_metadata():
    for path in sorted(FIXTURES.glob("*.json")) + sorted(SCHEMAS.glob("*.json")):
        with path.open(encoding="utf-8") as fh:
            payload = json.load(fh)
        assert isinstance(payload, dict), path

    for path in sorted(FIXTURES.glob("*.json")):
        payload = _load_fixture(path.name)
        assert payload["contract_version"] == "2026-07-22.g012"
        assert payload["mode"] == "demo_fixture"
        assert payload["source"]["kind"] == "checked_in_fixture"
        assert payload["source"]["code_reference"]
        assert "live scan" not in payload["source"]["notes"].lower() or "not a live scan" in payload["source"]["notes"].lower()


def test_audit_result_fixture_matches_current_topology_shape_and_invariants():
    from main import TopologyReport

    fixture = _load_fixture("audit-result-insufficient-data.demo.json")
    response = fixture["response"]

    # Current backend Pydantic shape still accepts the core report response.
    TopologyReport.model_validate(response)

    assert response["coverage"] == "limited"
    assert response["topology_class"] == "insufficient_data"
    assert response["gradients"] == []
    assert response["pei"]["gated"] is False
    assert response["pei"]["score"] == 0
    assert response["real_probes_executed"] == response["evidence_count"] == response["priced_agents"] == 1
    assert fixture["uncertainty"]["claim_status"] == "insufficient_data"
    assert fixture["uncertainty"]["attribution"] == "not_supported"
    assert fixture["uncertainty"]["pei_gate_open"] is False
    unsafe_claim_words = ("discrimination detected", "driver", "caused by", "violation")
    combined = " ".join([response["summary"], response["pei"]["basis"], response["pei"]["interpretation"]]).lower()
    assert all(word not in combined for word in unsafe_claim_words)


def test_enterprise_workspace_fixture_matches_current_dashboard_and_job_shapes():
    fixture = _load_fixture("enterprise-workspace.demo.json")
    response = fixture["response"]

    assert response["mode"] == "memory"
    assert response["organization"]["id"].startswith("org_demo_")
    assert response["portfolio"][0]["findingId"] == response["findings"][0]["id"]
    assert response["evidence_items"][0]["source"] == "live_probe"
    assert response["evidence_items"][0]["metadata"]["coverage_pct"] == fixture["uncertainty"]["coverage_pct"]

    for job in response["scan_jobs"]:
        assert job["status"] in {"queued", "running", "completed", "failed", "cancelled"}
        assert job["metadata"]["run_mode"] in {"live", "imported"}
        if job["metadata"]["run_mode"] == "live":
            assert job["metadata"]["source"] == "live_probe"
        assert job["target_count"] >= job["completed_count"] + job["failed_count"]

    owner_share = response["share_tokens"][0]
    assert "token_hash" not in owner_share
    assert owner_share["redacted"] is True
    assert HEX_64.match(response["evidence_exports"][0]["checksum_sha256"])


def test_enterprise_redacted_share_fixture_contains_no_internal_or_live_identifiers():
    fixture = _load_fixture("enterprise-redacted-share.demo.json")
    response = fixture["response"]

    assert response["redacted"] is True
    assert set(response["share_token"]).issubset(
        {"scope", "redacted", "expires_at", "created_at", "revoked_at", "last_accessed_at"}
    )
    assert response["packet"]["organization"] == {"name": "Demo Price Integrity Workspace"}
    assert response["packet"]["evidence_items"][0]["target_url"] == "demo-market.example"

    for obj in _walk(response):
        leaked = FORBIDDEN_REDACTED_KEYS.intersection(obj)
        assert not leaked, f"redacted share leaked internal keys: {sorted(leaked)}"


def test_agent_decision_and_manifest_fixtures_match_current_pydantic_contracts():
    from agentcore.schemas import DecisionEnvelope, EvidenceManifest

    decision = _load_fixture("agent-decision-blocked-route.demo.json")["response"]
    manifest = _load_fixture("agent-manifest-blocked-route.demo.json")["response"]

    env = DecisionEnvelope.model_validate(decision)
    man = EvidenceManifest.model_validate(manifest)

    assert env.schema_version == man.version == "1.0.0"
    assert env.expires_at.isoformat().startswith("2026-07-22T00:15:00")
    assert env.decision.value == "block"
    assert env.policy is not None and env.policy.decision == "block"
    assert env.evidence.capability_tier.value == "claim_only"
    assert env.ttl_seconds == 900
    assert HEX_64.match(env.evidence.manifest_sha256)
    assert man.collection_attempts == []
    assert man.artifacts == []
    assert man.extractions == []
    assert env.evidence.manifest_id == man.manifest_id
    assert env.obligation_id == man.obligation_id
    assert "PLATFORM_AUTOMATION_RESTRICTED" in decision["reason_codes"]


def test_error_catalog_stabilizes_status_and_codes_without_secret_shapes():
    payload = _load_fixture("errors.demo.json")
    errors = payload["errors"]
    by_code = {(row["surface"], row["code"]): row for row in errors}

    expected = {
        ("audit", "auth_required"): 401,
        ("audit", "invalid_url"): 400,
        ("audit", "quota_unavailable"): 503,
        ("audit", "quota_exceeded"): 402,
        ("enterprise", "auth_required"): 401,
        ("enterprise", "not_found"): 404,
        ("enterprise", "forbidden"): 403,
        ("enterprise", "invalid_request"): 400,
        ("enterprise_worker", "worker_secret_missing"): 503,
        ("enterprise_worker", "worker_unauthorized"): 401,
        ("agent", "validation_error"): 422,
        ("agent", "unsupported_schema_version"): 422,
        ("agent", "manifest_not_found"): 404,
        ("agent", "rate_limited"): 429,
        ("frontend_proxy", "probe_unavailable"): 503,
        ("frontend_proxy", "result_unavailable"): 503,
    }
    for key, status in expected.items():
        assert by_code[key]["status"] == status

    for row in errors:
        assert row["detail_shape"] in {"object", "string"}
        serialized = json.dumps(row).lower()
        for forbidden_value in ("secret-value", "token_hash", "api_key", "bearer "):
            assert forbidden_value not in serialized
        if row["surface"] == "frontend_proxy":
            assert row["headers"]["x-jacobi-api-mode"] == "fallback"
