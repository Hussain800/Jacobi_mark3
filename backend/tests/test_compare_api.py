"""
Jacobi Compare — service orchestration + REST contract tests.

Fixture adapters only: deterministic, zero network, zero collection cost.
Covers the PDR side-panel API contract, provider-failure isolation, evidence
manifest persistence, and the no-BrightData guarantee.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

from main import app

from compare.adapters import reset_registry_for_tests
from compare.adapters.base import MerchantAdapter
from compare.api import reset_rate_limits_for_tests
from compare.schemas import (
    ComparisonRequest,
    ComparisonStatus,
    CurrentOfferInput,
    Money,
    ReasonCode,
)
from compare.service import ComparisonService, get_result, reset_results_for_tests, service


SONY_REQUEST = {
    "source_url": "https://www.amazon.ae/dp/B0DEMO123",
    "market": "AE",
    "include_fixture_offers": True,
    "current_offer": {
        "title": "Sony WH-1000XM6 Wireless Noise Cancelling Headphones - Black",
        "brand": "Sony",
        "mpn": "WH-1000XM6/B",
        "gtin": "4548736158801",
        "price": {"amount": "1699", "currency": "AED"},
        "shipping": {"amount": "0", "currency": "AED"},
        "condition": "new",
        "stock": "in_stock",
    },
}


@pytest.fixture(autouse=True)
def _clean_state():
    reset_registry_for_tests()
    reset_results_for_tests()
    reset_rate_limits_for_tests()
    yield
    reset_registry_for_tests()
    reset_results_for_tests()
    reset_rate_limits_for_tests()


@pytest.fixture
def client():
    return TestClient(app)


# ── end-to-end fixture flow (the PDR appendix scenario) ─────────────────────

def test_compare_endpoint_finds_verified_saving(client):
    r = client.post("/api/v1/compare", json=SONY_REQUEST)
    assert r.status_code == 200
    body = r.json()

    assert body["recommendation"]["status"] == "save"
    assert body["recommendation"]["headline"] == "Save AED 200"
    assert body["savings"]["amount"]["amount"] == "200.00"
    assert body["best_offer"]["merchant_id"] == "sony_ae"
    assert body["best_offer"]["price"]["payable_total"]["amount"] == "1499.00"
    assert body["recommendation"]["action_url"].startswith("https://www.sony-mea.com/")
    assert body["fixture_mode"] is True                    # honest labeling
    assert body["confidence"] == "high"
    codes = body["reason_codes"]
    assert "PRODUCT_IDENTITY_EXACT" in codes
    assert "LOWER_TOTAL_FOUND" in codes
    assert "OFFICIAL_ROUTE_FOUND" in codes
    assert "SHIPPING_UNKNOWN" in codes                     # noon black offer lacks shipping

    # Refurbished trap lands in similar, colour variant in tradeoffs — never headline.
    similar = {o["offer"]["merchant_id"] for o in body["similar_offers"]}
    assert "sharafdg" in similar
    tradeoff_models = {o["offer"]["product"]["model"] for o in body["tradeoff_offers"]}
    assert "WH-1000XM6/S" in tradeoff_models

    # Result is retrievable and evidence manifest is persisted + fetchable.
    cid = body["comparison_id"]
    access_token = body["comparison_access_token"]
    assert access_token
    r2 = client.get(
        f"/api/v1/comparisons/{cid}",
        headers={"X-Jacobi-Access-Token": access_token},
    )
    assert r2.status_code == 200
    assert r2.json()["comparison_id"] == cid
    assert r2.json()["comparison_access_token"] is None
    assert client.get(f"/api/v1/comparisons/{cid}").status_code == 404

    manifest_id = body["evidence_manifest_id"]
    assert client.get(f"/api/v1/agent/manifests/{manifest_id}").status_code == 404
    r3 = client.get(
        f"/api/v1/evidence/{manifest_id}?comparison_id={cid}",
        headers={"X-Jacobi-Access-Token": access_token},
    )
    assert r3.status_code == 200
    man = r3.json()
    assert man["manifest_sha256"]
    assert any(a["provider"] == "sony_ae" for a in man["collection_attempts"])
    optimizer_attempt = next(
        attempt for attempt in man["collection_attempts"]
        if attempt["provider"] == "jacobi_optimizer"
    )
    assert optimizer_attempt["extractions"][0]["value"]["candidates"]
    envelope = body["optimization_envelope"]
    assert envelope["immutable_evidence"] is True
    assert envelope["evidence_manifest_id"] == manifest_id


def test_protected_result_survives_process_cache_reset(client):
    body = client.post("/api/v1/compare", json=SONY_REQUEST).json()
    comparison_id = body["comparison_id"]
    token = body["comparison_access_token"]

    reset_results_for_tests()

    response = client.get(
        f"/api/v1/comparisons/{comparison_id}",
        headers={"X-Jacobi-Access-Token": token},
    )
    assert response.status_code == 200
    assert response.json()["comparison_id"] == comparison_id


def test_comparison_capability_expires_with_result_ttl(client):
    body = client.post("/api/v1/compare", json=SONY_REQUEST).json()
    comparison_id = body["comparison_id"]
    record = service.repository.get_comparison(comparison_id)
    payload = dict(record.payload)
    payload["created_at"] = "2000-01-01T00:00:00+00:00"
    service.repository.save_comparison(
        comparison_id,
        payload,
        product_id=record.links.get("product_id"),
        evidence_manifest_id=record.links.get("evidence_manifest_id"),
    )
    reset_results_for_tests()
    response = client.get(
        f"/api/v1/comparisons/{comparison_id}",
        headers={"X-Jacobi-Access-Token": body["comparison_access_token"]},
    )
    assert response.status_code == 404


def test_browser_submitted_offer_is_real_zero_cost_route(client):
    request = {
        "source_url": "https://shop.example/current",
        "current_offer": {
            "title": "Sony WH-1000XM6 Wireless Headphones Black",
            "brand": "Sony",
            "mpn": "WH-1000XM6/B",
            "gtin": "4548736158801",
            "price": {"amount": "1699", "currency": "AED"},
            "shipping": {"amount": "0", "currency": "AED"},
            "condition": "new",
            "stock": "in_stock",
        },
        "submitted_offers": [
            {
                "source_url": "https://other.example/sony-xm6",
                "merchant_id": "other_browser_tab",
                "merchant_name": "Other browser tab",
                "current_offer": {
                    "title": "Sony WH-1000XM6 Wireless Headphones Black",
                    "brand": "Sony",
                    "mpn": "WH-1000XM6/B",
                    "gtin": "4548736158801",
                    "price": {"amount": "1499", "currency": "AED"},
                    "shipping": {"amount": "0", "currency": "AED"},
                    "condition": "new",
                    "stock": "in_stock",
                },
            }
        ],
    }
    response = client.post("/api/v1/compare", json=request)
    assert response.status_code == 200
    body = response.json()
    assert body["recommendation"]["status"] == "tradeoff"
    assert body["best_offer"]["merchant_id"] == "other_browser_tab"
    assert body["fixture_mode"] is False
    assert body["savings"]["amount"]["amount"] == "200.00"
    assert "WARRANTY_UNKNOWN" in body["tradeoff_offers"][0]["equivalence"]["reason_codes"]


def test_storage_mismatch_never_recommended(client):
    req = {
        "source_url": "https://www.amazon.ae/dp/B0MBA256",
        "market": "AE",
        "include_fixture_offers": True,
        "current_offer": {
            "title": "Apple MacBook Air 13-inch M3 8GB/256GB - Midnight",
            "brand": "Apple",
            "model": "MacBook Air 13 M3",
            "mpn": "MRXN3",
            "gtin": "195949125301",
            "price": {"amount": "4499", "currency": "AED"},
            "shipping": {"amount": "0", "currency": "AED"},
        },
    }
    body = client.post("/api/v1/compare", json=req).json()
    assert body["recommendation"]["status"] == "save"
    assert body["best_offer"]["merchant_id"] == "sharafdg"          # exact 256GB at 4199
    assert body["savings"]["amount"]["amount"] == "300.00"
    # noon's cheaper-per-GB 512GB variant must be rejected, not recommended
    rejected = {o["offer"]["product"]["mpn"] for o in body["rejected_offers"]}
    assert "MRXQ3" in rejected


def test_unresolved_identity_returns_honest_uncertainty(client):
    req = {
        "source_url": "https://www.amazon.ae/dp/B0UNKNOWN",
        "current_offer": {
            "title": "Great wireless headphones",
            "price": {"amount": "500", "currency": "AED"},
        },
    }
    body = client.post("/api/v1/compare", json=req).json()
    assert body["recommendation"]["status"] == "insufficient_evidence"
    assert "PRODUCT_IDENTITY_UNRESOLVED" in body["reason_codes"]
    assert body["savings"]["amount"] is None
    assert body["best_offer"] is None


def test_comparison_not_found_404(client):
    assert client.get("/api/v1/comparisons/cmp_nope").status_code == 404


def test_compare_health_declares_zero_cost(client):
    body = client.get("/api/v1/compare/health").json()
    assert body["mandatory_collection_cost_usd"] == 0.0
    ids = {a["merchant_id"] for a in body["adapters"]}
    assert {"amazon_ae", "noon_ae", "sharafdg", "sony_ae"} <= ids
    assert all(a["cost_estimate_usd"] == 0.0 for a in body["adapters"])

    capabilities = client.get("/api/v1/providers/capabilities").json()
    kinds = {provider["kind"] for provider in capabilities["providers"]}
    assert {"browser-assisted", "direct-http", "fixture"} <= kinds
    assert capabilities["default_paid_provider_count"] == 0

    health = client.get("/api/v1/providers/health").json()
    assert all(provider["cost"] == "zero" for provider in health["providers"])


def test_versioned_identify_discover_optimize_status_and_submit_routes(client):
    identified = client.post(
        "/api/v1/identify",
        json={"fields": SONY_REQUEST["current_offer"]},
        headers={"X-Request-ID": "test-request-id"},
    )
    assert identified.status_code == 200
    assert identified.headers["X-Request-ID"] == "test-request-id"
    assert identified.json()["mpn"] == "WH-1000XM6/B"

    discovered = client.post("/api/v1/discover", json=SONY_REQUEST)
    assert discovered.status_code == 200
    assert discovered.json()["offers"]

    optimized = client.post(
        "/api/v1/optimize",
        json={**SONY_REQUEST, "preference_mode": "official_seller"},
    )
    assert optimized.status_code == 200
    optimized_body = optimized.json()
    assert optimized_body["preference_mode"] == "official_seller"
    assert optimized_body["best_offer"]["seller"]["type"] == "official_store"

    comparison_id = optimized_body["comparison_id"]
    token = optimized_body["comparison_access_token"]
    status = client.get(
        f"/api/v1/comparisons/{comparison_id}/status",
        headers={"X-Jacobi-Access-Token": token},
    )
    assert status.status_code == 200
    assert status.json()["complete"] is True

    submitted_request = {
        **SONY_REQUEST,
        "include_fixture_offers": False,
        "submitted_offers": [{
            "source_url": "https://submitted.example/xm6",
            "current_offer": {
                **SONY_REQUEST["current_offer"],
                "price": {"amount": "1499", "currency": "AED"},
                "warranty_text": "UAE warranty",
            },
        }],
    }
    submitted = client.post("/api/v1/offers/submit", json=submitted_request)
    assert submitted.status_code == 200
    assert submitted.json()["fixture_mode"] is False
    assert client.post("/api/v1/offers/submit", json=SONY_REQUEST).status_code == 422


def test_deep_audit_route_is_explicit_and_fixture_safe(client):
    denied = client.post("/api/v1/deep-audit", json={"demo": "fee_drift"})
    assert denied.status_code == 400
    allowed = client.post(
        "/api/v1/deep-audit",
        json={"explicit": True, "demo": "fee_drift"},
    )
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["automatic_paid_provider_calls"] is False
    assert body["result"]["fixture_mode"] is True


def test_feedback_is_optional_token_scoped_and_url_free(client):
    comparison = client.post("/api/v1/compare", json=SONY_REQUEST).json()
    payload = {
        "comparison_id": comparison["comparison_id"],
        "event": "wrong_match_feedback",
        "offer_observation_id": comparison["best_offer"]["observation_id"],
    }
    assert client.post("/api/v1/feedback", json=payload).status_code == 404
    accepted = client.post(
        "/api/v1/feedback",
        json=payload,
        headers={"X-Jacobi-Access-Token": comparison["comparison_access_token"]},
    )
    assert accepted.status_code == 200
    events = service.repository.list_events(comparison["comparison_id"])
    assert events[-1].payload["event"] == "wrong_match_feedback"
    assert "source_url" not in events[-1].payload


def test_untrusted_structured_inputs_are_bounded(client):
    raw_html = {
        **SONY_REQUEST,
        "page_evidence": {"raw_html": "<html>not accepted</html>"},
    }
    assert client.post("/api/v1/compare", json=raw_html).status_code == 422

    huge_title = {
        **SONY_REQUEST,
        "current_offer": {**SONY_REQUEST["current_offer"], "title": "x" * 1001},
    }
    assert client.post("/api/v1/compare", json=huge_title).status_code == 422


def test_openapi_contains_complete_price_optimization_surface(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert {
        "/api/v1/identify",
        "/api/v1/discover",
        "/api/v1/compare",
        "/api/v1/optimize",
        "/api/v1/offers/submit",
        "/api/v1/comparisons/{comparison_id}",
        "/api/v1/comparisons/{comparison_id}/status",
        "/api/v1/evidence/{manifest_id}",
        "/api/v1/providers/health",
        "/api/v1/providers/capabilities",
        "/api/v1/deep-audit",
    } <= set(paths)


# ── provider isolation ───────────────────────────────────────────────────────

class _ExplodingAdapter(MerchantAdapter):
    merchant_id = "boom"
    merchant_name = "Boom Store"
    domains = ["boom.example"]

    async def search_offers(self, product, market):
        raise RuntimeError("adapter exploded")


class _SlowAdapter(MerchantAdapter):
    merchant_id = "slow"
    merchant_name = "Slow Store"
    domains = ["slow.example"]
    timeout_seconds = 0.05

    async def search_offers(self, product, market):
        await asyncio.sleep(1.0)
        return []


def test_provider_failure_is_isolated():
    from compare.adapters.fixture_store import default_fixture_adapters

    svc = ComparisonService(adapters=[_ExplodingAdapter(), _SlowAdapter(),
                                      *default_fixture_adapters()])
    req = ComparisonRequest(
        source_url=SONY_REQUEST["source_url"],
        current_offer=CurrentOfferInput(
            title=SONY_REQUEST["current_offer"]["title"],
            brand="Sony", mpn="WH-1000XM6/B", gtin="4548736158801",
            price=Money(amount="1699"),
            shipping=Money(amount="0"),
        ),
    )
    result = asyncio.run(svc.compare(req))
    # Both broken providers reported honestly; healthy fixtures still win.
    errs = {e.merchant_id for e in result.provider_errors}
    assert errs == {"boom", "slow"}
    assert ReasonCode.PROVIDER_PARTIAL_FAILURE in result.reason_codes
    assert result.recommendation.status == ComparisonStatus.save
    assert result.best_offer.merchant_id == "sony_ae"
    assert get_result(result.comparison_id).comparison_id == result.comparison_id


# ── zero-BrightData guarantee ────────────────────────────────────────────────

def test_compare_package_never_imports_brightdata():
    """The consumer path must work with no Bright Data env/config at all."""
    import pathlib

    pkg = pathlib.Path(__file__).resolve().parents[1] / "compare"
    for py in pkg.rglob("*.py"):
        src = py.read_text(encoding="utf-8").lower()
        assert "brightdata" not in src and "bright_data" not in src, py
