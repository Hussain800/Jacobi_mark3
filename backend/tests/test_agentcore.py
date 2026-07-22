"""
Jacobi for Agents — contract, policy, manifest-hash, and flow tests.

Fixture-only: no network. The two demo flows (lodging fee-drift, restricted
route block) are the PRD acceptance demos.
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agentcore import engine
from agentcore import policy as policy_mod
from agentcore.api import router as agent_router
from agentcore.evidence import build_manifest, canonical_manifest_hash, verify_manifest
from agentcore.extract import extract_price_fields
from agentcore.providers import FIXTURE_URLS, BudgetTracker, collect_stages
from agentcore.schemas import (
    Artifact,
    CollectionAttempt,
    ConsentScope,
    Decision,
    DecisionEnvelope,
    EvidenceTier,
    Money,
    PriceObligation,
    ReasonCode,
)


# ── Policy registry ─────────────────────────────────────────────────────────

def test_policy_blocks_purchase_on_restricted_domain():
    d = policy_mod.evaluate(
        "https://www.booking.com/hotel/x", ConsentScope.purchase_authorized
    )
    assert d.decision == "block"
    assert d.reason_code == ReasonCode.PLATFORM_AUTOMATION_RESTRICTED


def test_policy_blocks_purchase_on_unknown_domain_by_default():
    d = policy_mod.evaluate(
        "https://some-random-shop.example", ConsentScope.purchase_authorized
    )
    assert d.decision == "block"
    assert d.reason_code == ReasonCode.POLICY_FORBIDS_AUTOMATION


def test_policy_allows_purchase_with_configured_official_route(monkeypatch):
    monkeypatch.setenv("JACOBI_OFFICIAL_ROUTE_DOMAINS", "booking.com")
    d = policy_mod.evaluate(
        "https://www.booking.com/hotel/x",
        ConsentScope.purchase_authorized,
        official_route=True,
    )
    assert d.decision == "allow"


def test_policy_rejects_forged_official_route_claim(monkeypatch):
    monkeypatch.delenv("JACOBI_OFFICIAL_ROUTE_DOMAINS", raising=False)
    d = policy_mod.evaluate(
        "https://www.booking.com/hotel/x",
        ConsentScope.purchase_authorized,
        official_route=True,
    )
    assert d.decision == "block"
    assert d.official_route is False


def test_policy_warns_checkout_prepare_on_restricted():
    d = policy_mod.evaluate("https://airbnb.com/rooms/1", ConsentScope.checkout_prepare)
    assert d.decision == "warn"
    assert d.reason_code == ReasonCode.PLATFORM_AUTOMATION_RESTRICTED


def test_policy_allows_research_on_unknown_domain():
    d = policy_mod.evaluate("https://example-hotel.example", ConsentScope.recommend)
    assert d.decision == "allow"


def test_policy_env_override(monkeypatch):
    monkeypatch.setenv(
        "JACOBI_POLICY_OVERRIDES", json.dumps({"trusted-partner.example": "purchase_authorized_allowed"})
    )
    d = policy_mod.evaluate(
        "https://trusted-partner.example/p/1", ConsentScope.purchase_authorized
    )
    assert d.decision == "allow"


# ── Evidence manifest hashing ───────────────────────────────────────────────

def _attempt_with_artifact(sha: str) -> CollectionAttempt:
    return CollectionAttempt(
        attempt_id="fixedattempt",
        provider="fixture",
        artifacts=[Artifact(kind="html", sha256=sha, fixture=True)],
        fixture=True,
    )


def _fixed_manifest(sha: str):
    ob = PriceObligation(
        obligation_id="obl_fixed",
        source_url_or_api_route="https://demo.jacobi.local/x",
    )
    m = build_manifest(ob, [_attempt_with_artifact(sha)], ["test limitation"])
    # Freeze the non-deterministic fields so two builds are comparable.
    m.manifest_id = "man_fixed"
    m.created_at = m.created_at.replace(
        year=2026, month=7, day=5, hour=0, minute=0, second=0, microsecond=0
    )
    for a in m.collection_attempts:
        a.started_at = None
        a.ended_at = None
    m.manifest_sha256 = canonical_manifest_hash(m)
    return m


def test_manifest_hash_deterministic():
    m1 = _fixed_manifest("a" * 64)
    m2 = _fixed_manifest("a" * 64)
    assert m1.manifest_sha256 == m2.manifest_sha256
    assert verify_manifest(m1)


def test_manifest_hash_changes_when_artifact_changes():
    m1 = _fixed_manifest("a" * 64)
    m2 = _fixed_manifest("b" * 64)
    assert m1.manifest_sha256 != m2.manifest_sha256


def test_manifest_signature_from_env(monkeypatch):
    monkeypatch.setenv("JACOBI_MANIFEST_SIGNING_KEY", "test-signing-key")
    ob = PriceObligation(source_url_or_api_route="https://demo.jacobi.local/x")
    m = build_manifest(ob, [], [])
    assert m.signature and len(m.signature) == 64
    assert verify_manifest(m)  # signature excluded from hash


# ── Extractor + fixtures ────────────────────────────────────────────────────

def test_fixture_files_exist():
    for path in FIXTURE_URLS.values():
        assert path.exists(), path


def test_extractor_reads_listing_fixture():
    html = FIXTURE_URLS["fixture://lodging/listing"].read_text(encoding="utf-8")
    ex = extract_price_fields(html)
    totals = [e for e in ex if e.field == "displayed_total"]
    assert totals and totals[0].value["amount"] == 2180
    assert totals[0].value["currency"] == "AED"
    assert totals[0].confidence >= 0.9


def test_extractor_generic_fallback():
    ex = extract_price_fields("<html><title>Widget</title><body>Only USD 1,299.00 today</body></html>")
    totals = [e for e in ex if e.field == "displayed_total"]
    assert totals and totals[0].value["amount"] == 1299.0
    assert totals[0].confidence < 0.6  # honestly low


def test_collect_stages_fee_drift_pair():
    attempts = collect_stages("fixture://lodging/listing")
    assert [a.stage for a in attempts] == ["listing", "checkout_prep"]
    assert all(a.fixture for a in attempts)
    fees = [e for a in attempts for e in a.extractions if e.field == "mandatory_fee"]
    assert len(fees) == 3
    assert sum(f.value["amount"] for f in fees) == 350


# ── Verify flows (PRD acceptance demos) ─────────────────────────────────────

def test_fee_drift_demo_returns_ask_user_with_evidence():
    env = engine.run_verify(demo="fee_drift")
    assert isinstance(env, DecisionEnvelope)
    assert env.decision in (Decision.ask_user, Decision.proceed_with_caution)
    for code in (
        ReasonCode.MANDATORY_FEE_LATE,
        ReasonCode.FEE_DISCLOSURE_DRIFT,
        ReasonCode.PRICE_DRIFT_MAJOR,
        ReasonCode.EVIDENCE_LIMITED_LOCAL_ONLY,
    ):
        assert code in env.reason_codes, code
    assert env.fixture_mode is True
    assert env.price_summary.delta_abs.amount == 350.0
    assert env.price_summary.delta_pct == 16.1
    assert len(env.price_summary.mandatory_fees_detected) == 3
    assert env.user_explanation and env.next_action
    # Manifest: hashes, capability flags, extractor method, limitations, checksum.
    man = engine.get_manifest(env.evidence.manifest_id)
    assert man is not None and verify_manifest(man)
    assert man.capability_summary.fixture_mode is True
    assert len(man.artifacts) == 2
    assert all(len(a.sha256) == 64 for a in man.artifacts)
    assert man.limitations
    assert any(e.extractor_version for e in man.extractions)


def test_blocked_route_demo_blocks_without_collection():
    env = engine.run_verify(demo="blocked_route")
    assert env.decision == Decision.block
    assert ReasonCode.PLATFORM_AUTOMATION_RESTRICTED in env.reason_codes
    assert env.evidence.capability_tier == EvidenceTier.claim_only
    man = engine.get_manifest(env.evidence.manifest_id)
    assert man is not None and man.collection_attempts == []


def test_official_route_not_blocked():
    env = engine.run_verify(
        demo=None,
        url="fixture://lodging/listing",
        consent_scope="purchase_authorized",
        official_route=True,
        displayed_total={"amount": 2180, "currency": "AED"},
    )
    assert env.decision != Decision.block
    assert ReasonCode.OFFICIAL_ROUTE_FOUND in env.reason_codes


def test_envelope_json_schema_valid_roundtrip():
    env = engine.run_verify(demo="fee_drift")
    payload = env.model_dump(mode="json")
    again = DecisionEnvelope.model_validate(payload)
    assert again.request_id == env.request_id
    assert payload["ttl_seconds"] == 900  # evidence freshness window
    json.dumps(payload)  # JSON-serializable end to end


# ── Budget guardrails ───────────────────────────────────────────────────────

def test_budget_tracker_blocks_over_limit(monkeypatch):
    monkeypatch.setenv("JACOBI_AGENT_BUDGET_USD", "0.05")
    t = BudgetTracker()
    assert t.check(0.01).value in ("ok", "near_limit")
    t.add(0.04)
    assert t.check(0.02).value == "blocked"


def test_budget_blocked_reason_reaches_envelope(monkeypatch):
    def fake_collect(url):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        return [CollectionAttempt(
            provider="managed_stub", stage="listing", url=url, final_url=url,
            error="budget_blocked", started_at=now, ended_at=now,
            limitations=["Collection skipped: budget exceeded"],
            cost_estimate_usd=1.0,
        )]

    monkeypatch.setattr(engine, "collect_stages", fake_collect)
    env = engine.run_verify(url="https://example-hotel.example/p", consent_scope="recommend")
    assert ReasonCode.BUDGET_BLOCKED in env.reason_codes
    assert env.decision == Decision.ask_user
    assert env.budget.budget_status.value == "blocked"


# ── REST surface ────────────────────────────────────────────────────────────

@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(agent_router)
    return TestClient(app)


def test_api_verify_and_export(client):
    r = client.post("/api/v1/agent/verify", json={"demo": "fee_drift"})
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] in ("ask_user", "proceed_with_caution")
    man_id = body["evidence"]["manifest_id"]

    r2 = client.get(f"/api/v1/agent/manifests/{man_id}")
    assert r2.status_code == 200
    assert r2.json()["manifest_sha256"]

    r3 = client.get(f"/api/v1/agent/manifests/{man_id}/export")
    assert r3.status_code == 200
    assert "attachment" in r3.headers["content-disposition"]

    r4 = client.get(f"/api/v1/agent/decisions/{body['request_id']}")
    assert r4.status_code == 200

    r5 = client.post("/api/v1/agent/explain", json={"request_id": body["request_id"]})
    assert r5.status_code == 200 and r5.json()["next_action"]


def test_api_health_and_policy(client):
    r = client.get("/api/v1/agent/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    r2 = client.post(
        "/api/v1/agent/policy/check",
        json={"url": "https://www.booking.com/x", "consent_scope": "purchase_authorized"},
    )
    assert r2.status_code == 200
    assert r2.json()["decision"] == "block"


def test_api_404s(client):
    assert client.get("/api/v1/agent/manifests/man_nope").status_code == 404
    assert client.get("/api/v1/agent/decisions/req_nope").status_code == 404
    assert client.post("/api/v1/agent/verify", json={"demo": "nope"}).status_code == 422


def test_api_verify_rate_limited(client, monkeypatch):
    from agentcore import api as api_mod

    monkeypatch.setattr(api_mod, "RATE_LIMIT_PER_MINUTE", 2)
    api_mod._RATE_BUCKETS.clear()
    assert client.post("/api/v1/agent/verify", json={"demo": "fee_drift"}).status_code == 200
    assert client.post("/api/v1/agent/verify", json={"demo": "fee_drift"}).status_code == 200
    r = client.post("/api/v1/agent/verify", json={"demo": "fee_drift"}).status_code
    assert r == 429
    api_mod._RATE_BUCKETS.clear()  # don't poison other tests
