"""
Jacobi for Agents — MCP server (stdio).

Exposes the verification tool catalog to MCP clients (Claude Desktop, agent
frameworks). Same engine as the REST API; every tool returns a JSON-safe dict.

Run from backend/:
    python -m agentcore.mcp_server

Claude Desktop config example lives in docs/jacobi-for-agents.md.

Safety: no tool executes a purchase. purchase_authorized requests on
restricted or unknown routes return decision=block unless official_route.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from mcp.server.fastmcp import FastMCP

from . import engine
from . import policy as policy_mod
from .schemas import ConsentScope
from compare import tooling as price_tools

mcp = FastMCP("jacobi")


def _json_object(value: str, name: str) -> Dict[str, Any]:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} must be valid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{name} must be a JSON object")
    return payload


@mcp.tool()
def health_check() -> Dict[str, Any]:
    """Jacobi service health: engine version, providers, demos, budget."""
    return engine.health()


@mcp.tool()
def verify_purchase_context(
    url: Optional[str] = None,
    demo: Optional[str] = None,
    consent_scope: str = "recommend",
    displayed_total_amount: Optional[float] = None,
    displayed_total_currency: str = "USD",
    official_route: bool = False,
    agent_id: str = "mcp-client",
) -> Dict[str, Any]:
    """Verify a purchase/booking context before recommending or acting.

    Returns a DecisionEnvelope: decision (proceed/proceed_with_caution/
    ask_user/handoff_to_user/use_official_route/block), provenance score,
    reason codes, price summary, policy status, evidence manifest reference,
    and a human explanation. Use demo="fee_drift" or demo="blocked_route" for
    the deterministic fixture demos.
    """
    displayed = (
        {"amount": displayed_total_amount, "currency": displayed_total_currency}
        if displayed_total_amount is not None
        else None
    )
    env = engine.run_verify(
        demo=demo,
        url=url,
        consent_scope=consent_scope,
        displayed_total=displayed,
        official_route=official_route,
        agent_id=agent_id,
        org="mcp-local",
    )
    return env.model_dump(mode="json")


@mcp.tool()
def compare_total_price(
    url: Optional[str] = None,
    demo: Optional[str] = None,
    displayed_total_amount: Optional[float] = None,
    displayed_total_currency: str = "USD",
) -> Dict[str, Any]:
    """Compare a displayed/claimed price against observed listing and
    checkout-preparation totals. Returns price trace, deltas, mandatory fees,
    and reason codes."""
    displayed = (
        {"amount": displayed_total_amount, "currency": displayed_total_currency}
        if displayed_total_amount is not None
        else None
    )
    env = engine.run_verify(
        demo=demo, url=url, consent_scope="research_only", displayed_total=displayed,
        agent_id="mcp-client", org="mcp-local",
    )
    return {
        "request_id": env.request_id,
        "decision": env.decision.value,
        "price_summary": env.price_summary.model_dump(mode="json"),
        "reason_codes": [c.value for c in env.reason_codes],
        "manifest_id": env.evidence.manifest_id,
    }


@mcp.tool()
def check_platform_policy(
    url: str,
    consent_scope: str = "recommend",
    official_route: bool = False,
) -> Dict[str, Any]:
    """Check whether the requested action is allowed, warned, or blocked
    under Jacobi's platform policy registry."""
    decision = policy_mod.evaluate(url, ConsentScope(consent_scope), official_route)
    return decision.model_dump(mode="json")


@mcp.tool()
def create_evidence_manifest(
    url: Optional[str] = None,
    demo: Optional[str] = None,
) -> Dict[str, Any]:
    """Collect evidence for a target and return the deterministic SHA-256
    evidence manifest (artifacts, hashes, capabilities, limitations)."""
    env = engine.run_verify(demo=demo, url=url, consent_scope="research_only",
                            agent_id="mcp-client", org="mcp-local")
    man = engine.get_manifest(env.evidence.manifest_id)
    return man.model_dump(mode="json") if man else {"error": "manifest unavailable"}


@mcp.tool()
def explain_decision(request_id: str) -> Dict[str, Any]:
    """Convert a prior decision envelope into a short user-facing explanation
    with the recommended next step."""
    out = engine.explain(request_id)
    return out or {"error": f"decision {request_id} not found (stores are in-memory)"}


# Price optimization tools -------------------------------------------------


@mcp.tool()
def identify_product(product_json: str) -> Dict[str, Any]:
    """Resolve a canonical product identity from observed page fields.

    product_json is a JSON object containing fields such as title, brand,
    model, MPN, GTIN, storage, memory, region, colour, and condition. This tool
    performs no network request.
    """
    return price_tools.identify_product_fields(_json_object(product_json, "product_json"))


@mcp.tool()
async def discover_offers(request_json: str) -> Dict[str, Any]:
    """Discover offers through the canonical comparison provider pipeline.

    Providers remain zero-cost by default. Fixture offers, browser-submitted
    observations, and direct HTTP URLs are used only when the request opts in.
    """
    result = await price_tools.compare_request(_json_object(request_json, "request_json"))
    return price_tools.discovery_view(result)


@mcp.tool()
async def compare_offers(request_json: str) -> Dict[str, Any]:
    """Identify, discover, classify, cost, rank, and preserve evidence."""
    result = await price_tools.compare_request(_json_object(request_json, "request_json"))
    return result.model_dump(mode="json")


@mcp.tool()
async def find_cheapest_route(request_json: str) -> Dict[str, Any]:
    """Find the cheapest verified route and explain all excluded offers."""
    result = await price_tools.compare_request(_json_object(request_json, "request_json"))
    return price_tools.optimization_view(result)


@mcp.tool()
def verify_offer_equivalence(
    current_product_json: str,
    candidate_offer_json: str,
    current_condition: str = "new",
) -> Dict[str, Any]:
    """Classify a candidate as exact, trade-off, similar, or rejected."""
    return price_tools.verify_offer_fields(
        _json_object(current_product_json, "current_product_json"),
        _json_object(candidate_offer_json, "candidate_offer_json"),
        current_condition=current_condition,
    )


@mcp.tool()
def calculate_total_cost(price_json: str) -> Dict[str, Any]:
    """Calculate a Decimal-safe payable total without treating unknowns as zero."""
    return price_tools.calculate_total_fields(_json_object(price_json, "price_json"))


@mcp.tool()
def explain_optimization(comparison_id: str, access_token: str) -> Dict[str, Any]:
    """Explain a prior optimization using its unguessable access token."""
    return price_tools.explain_stored_optimization(comparison_id, access_token)


@mcp.tool()
def fetch_evidence_manifest(
    comparison_id: str,
    manifest_id: str,
    access_token: str,
) -> Dict[str, Any]:
    """Fetch immutable evidence belonging to an authorized comparison."""
    return price_tools.fetch_stored_manifest(comparison_id, manifest_id, access_token)


@mcp.tool()
async def deep_audit_price(
    explicit: bool = False,
    demo: Optional[str] = None,
    url: Optional[str] = None,
    displayed_total_amount: Optional[float] = None,
    displayed_total_currency: str = "AED",
    consent_scope: str = "research_only",
    tier: str = "free",
    allow_managed_provider: bool = False,
) -> Dict[str, Any]:
    """Run the optional legacy Deep Audit; explicit=true is always required.

    This is separate from normal comparison and never activates a paid
    provider automatically.
    """
    return await price_tools.deep_audit(
        explicit=explicit,
        demo=demo,
        url=url,
        displayed_total_amount=displayed_total_amount,
        displayed_total_currency=displayed_total_currency,
        consent_scope=consent_scope,
        tier=tier,
        allow_managed_provider=allow_managed_provider,
    )


if __name__ == "__main__":
    mcp.run()
