import asyncio

import pytest

from agentcore.storage import reset_repo_for_tests
from compare import tooling
from compare.adapters import reset_registry_for_tests
from compare.service import reset_results_for_tests


REQUEST = {
    "source_url": "https://www.amazon.ae/dp/B0DEMO123",
    "market": "AE",
    "include_fixture_offers": True,
    "current_offer": {
        "title": "Sony WH-1000XM6 Wireless Headphones - Black",
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
def _reset_state():
    reset_registry_for_tests()
    reset_results_for_tests()
    reset_repo_for_tests()
    yield
    reset_registry_for_tests()
    reset_results_for_tests()
    reset_repo_for_tests()


def test_identity_and_total_tools_preserve_core_contracts():
    identity = tooling.identify_product_fields({
        "title": "Sony WH-1000XM6 Headphones Black",
        "brand": "Sony",
        "mpn": "WH-1000XM6/B",
    })
    assert identity["brand"] == "Sony"
    assert identity["model"] == "WH-1000XM6"
    assert identity["identity_confidence"] == 0.95

    total = tooling.calculate_total_fields({
        "item": {"amount": "100.10", "currency": "AED"},
        "shipping_state": "unknown",
        "taxes_state": "not_applicable",
        "duties_state": "not_applicable",
    })
    assert total["payable_total"]["amount"] == "100.10"
    assert total["total_complete"] is False
    assert total["unknown_components"] == ["shipping"]


def test_equivalence_tool_rejects_material_variant_mismatch():
    result = tooling.verify_offer_fields(
        {
            "brand": "Apple",
            "model": "A3102",
            "mpn": "A3102-256",
            "storage": "256GB",
        },
        {
            "source_url": "https://shop.example/product",
            "brand": "Apple",
            "model": "A3102",
            "mpn": "A3102-256",
            "storage": "512GB",
            "price": {"amount": "2000", "currency": "AED"},
            "shipping": {"amount": "0", "currency": "AED"},
            "condition": "new",
        },
    )
    assert result["classification"] == "REJECTED"
    assert "storage" in result["mismatched_dimensions"]


def test_comparison_views_and_private_evidence_use_service_result():
    result = asyncio.run(tooling.compare_request(REQUEST))
    discovery = tooling.discovery_view(result)
    optimization = tooling.optimization_view(result)

    assert discovery["offers"]
    assert optimization["recommendation"]["status"] == "save"
    assert optimization["best_offer"]["merchant_id"] == "sony_ae"
    assert optimization["excluded_offers"]

    denied = tooling.explain_stored_optimization(result.comparison_id, "wrong")
    assert denied == {"error": "comparison not found"}
    explanation = tooling.explain_stored_optimization(
        result.comparison_id, result.comparison_access_token
    )
    assert explanation["headline"] == "Save AED 200"

    manifest = tooling.fetch_stored_manifest(
        result.comparison_id,
        result.evidence_manifest_id,
        result.comparison_access_token,
    )
    assert manifest["manifest_sha256"]


def test_provider_catalog_is_descriptive_and_zero_cost():
    providers = tooling.provider_catalog()
    by_id = {provider["provider_id"]: provider for provider in providers}
    assert by_id["current_page_context"]["explicit_invocation_required"] is False
    assert by_id["browser_submitted"]["fixture"] is False
    assert by_id["direct_http_structured"]["cost"] == "zero"
    assert by_id["amazon_ae"]["explicit_invocation_required"] is True
    assert all(provider["cost"] == "zero" for provider in providers)

    health = tooling.optimization_health()
    assert health["mandatory_collection_cost_usd"] == 0.0
    assert health["paid_provider_automatic_calls"] is False
    assert health["default_provider_ids"] == ["current_page_context"]


def test_deep_audit_requires_explicit_opt_in_and_fixture_is_hermetic():
    denied = asyncio.run(tooling.deep_audit(explicit=False, demo="fee_drift"))
    assert denied["error"] == "deep audit requires explicit=true"

    result = asyncio.run(tooling.deep_audit(explicit=True, demo="fee_drift"))
    assert result["fixture_mode"] is True
    assert result["budget"]["estimated_cost_usd"] == 0.0
    assert result["managed_provider_explicitly_allowed"] is False

    live_denied = asyncio.run(tooling.deep_audit(
        explicit=True, url="https://example.com/product"
    ))
    assert live_denied["automatic_paid_provider_calls"] is False
    assert "allow_managed_provider=true" in live_denied["error"]
