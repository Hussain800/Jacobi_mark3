"""
Jacobi for Agents — API-key auth + object-level authorization tests.

Contract (agentcore/auth.py):
- fixture demos stay keyless
- custom-URL verifies need a key when JACOBI_AGENT_API_KEYS is configured
  (403 missing, 401 invalid)
- records are org-scoped: another org's key (or no key) gets 404
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agentcore.api import router as agent_router
from agentcore import api as api_mod

KEYS = "k-alpha:org-alpha,k-beta:org-beta"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("JACOBI_AGENT_API_KEYS", KEYS)
    api_mod._RATE_BUCKETS.clear()
    app = FastAPI()
    app.include_router(agent_router)
    yield TestClient(app)
    api_mod._RATE_BUCKETS.clear()


def test_demo_verify_stays_keyless(client):
    r = client.post("/api/v1/agent/verify", json={"demo": "fee_drift"})
    assert r.status_code == 200
    # demo records are public-readable without a key
    rid = r.json()["request_id"]
    assert client.get(f"/api/v1/agent/decisions/{rid}").status_code == 200


def test_custom_url_requires_key_when_configured(client):
    r = client.post("/api/v1/agent/verify", json={"url": "fixture://lodging/listing"})
    assert r.status_code == 403


def test_invalid_key_rejected(client):
    r = client.post(
        "/api/v1/agent/verify",
        json={"url": "fixture://lodging/listing"},
        headers={"X-Api-Key": "nope"},
    )
    assert r.status_code == 401


def test_valid_key_accepted_and_org_scoped(client):
    r = client.post(
        "/api/v1/agent/verify",
        json={"url": "fixture://lodging/listing"},
        headers={"X-Api-Key": "k-alpha"},
    )
    assert r.status_code == 200
    rid = r.json()["request_id"]
    man_id = r.json()["evidence"]["manifest_id"]

    # owner org reads fine
    assert client.get(
        f"/api/v1/agent/decisions/{rid}", headers={"X-Api-Key": "k-alpha"}
    ).status_code == 200
    assert client.get(
        f"/api/v1/agent/manifests/{man_id}", headers={"X-Api-Key": "k-alpha"}
    ).status_code == 200
    assert client.get(
        f"/api/v1/agent/decisions/{rid}/export.pdf", headers={"X-Api-Key": "k-alpha"}
    ).status_code == 200

    # cross-org key → 404 (no existence leak)
    assert client.get(
        f"/api/v1/agent/decisions/{rid}", headers={"X-Api-Key": "k-beta"}
    ).status_code == 404
    assert client.get(
        f"/api/v1/agent/manifests/{man_id}", headers={"X-Api-Key": "k-beta"}
    ).status_code == 404
    assert client.get(
        f"/api/v1/agent/decisions/{rid}/export.pdf", headers={"X-Api-Key": "k-beta"}
    ).status_code == 404

    # anonymous → 404
    assert client.get(f"/api/v1/agent/decisions/{rid}").status_code == 404
    r2 = client.post("/api/v1/agent/explain", json={"request_id": rid})
    assert r2.status_code == 404


def test_open_dev_mode_without_keys(client, monkeypatch):
    monkeypatch.delenv("JACOBI_AGENT_API_KEYS", raising=False)
    r = client.post("/api/v1/agent/verify", json={"url": "fixture://lodging/listing"})
    assert r.status_code == 200


def test_pdf_export_is_pdf(client):
    r = client.post("/api/v1/agent/verify", json={"demo": "fee_drift"})
    rid = r.json()["request_id"]
    pdf = client.get(f"/api/v1/agent/decisions/{rid}/export.pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content[:4] == b"%PDF"
    assert len(pdf.content) > 2000
