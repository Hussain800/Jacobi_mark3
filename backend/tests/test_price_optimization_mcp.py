import asyncio
import json

from agentcore import mcp_server

from test_compare_tooling import REQUEST


def test_all_price_optimization_tools_are_registered():
    names = {tool.name for tool in mcp_server.mcp._tool_manager.list_tools()}
    assert {
        "identify_product",
        "discover_offers",
        "compare_offers",
        "find_cheapest_route",
        "verify_offer_equivalence",
        "calculate_total_cost",
        "explain_optimization",
        "fetch_evidence_manifest",
        "deep_audit_price",
    } <= names


def test_mcp_identity_equivalence_and_total_tools():
    identity = mcp_server.identify_product(json.dumps({
        "title": "Sony WH-1000XM6 Headphones",
        "brand": "Sony",
        "mpn": "WH-1000XM6/B",
    }))
    assert identity["model"] == "WH-1000XM6"

    equivalence = mcp_server.verify_offer_equivalence(
        json.dumps({"brand": "Sony", "mpn": "WH-1000XM6/B"}),
        json.dumps({
            "source_url": "https://shop.example/sony",
            "brand": "Sony",
            "mpn": "WH-1000XM6/B",
            "price": {"amount": "1499", "currency": "AED"},
            "shipping": {"amount": "0", "currency": "AED"},
            "condition": "new",
            "warranty": {"region": "UAE"},
        }),
    )
    assert equivalence["classification"] == "EXACT_EQUIVALENT"

    total = mcp_server.calculate_total_cost(json.dumps({
        "item": {"amount": "10.01", "currency": "AED"},
        "shipping": {"amount": "2.02", "currency": "AED"},
        "taxes_state": "not_applicable",
        "duties_state": "not_applicable",
    }))
    assert total["payable_total"]["amount"] == "12.03"


def test_mcp_comparison_discovery_optimization_and_evidence_tools():
    result = asyncio.run(mcp_server.compare_offers(json.dumps(REQUEST)))
    assert result["recommendation"]["status"] == "save"

    discovery = asyncio.run(mcp_server.discover_offers(json.dumps(REQUEST)))
    assert discovery["offers"]

    optimization = asyncio.run(mcp_server.find_cheapest_route(json.dumps(REQUEST)))
    assert optimization["best_offer"]["merchant_id"] == "sony_ae"

    explanation = mcp_server.explain_optimization(
        result["comparison_id"], result["comparison_access_token"]
    )
    assert explanation["status"] == "save"
    evidence = mcp_server.fetch_evidence_manifest(
        result["comparison_id"],
        result["evidence_manifest_id"],
        result["comparison_access_token"],
    )
    assert evidence["manifest_sha256"]


def test_mcp_deep_audit_is_not_automatic():
    denied = asyncio.run(mcp_server.deep_audit_price(demo="fee_drift"))
    assert "explicit=true" in denied["error"]
    result = asyncio.run(mcp_server.deep_audit_price(explicit=True, demo="fee_drift"))
    assert result["fixture_mode"] is True
