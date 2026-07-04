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

from typing import Any, Dict, Optional

from mcp.server.fastmcp import FastMCP

from . import engine
from . import policy as policy_mod
from .schemas import ConsentScope

mcp = FastMCP("jacobi")


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
        agent_id="mcp-client",
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
                            agent_id="mcp-client")
    man = engine.get_manifest(env.evidence.manifest_id)
    return man.model_dump(mode="json") if man else {"error": "manifest unavailable"}


@mcp.tool()
def explain_decision(request_id: str) -> Dict[str, Any]:
    """Convert a prior decision envelope into a short user-facing explanation
    with the recommended next step."""
    out = engine.explain(request_id)
    return out or {"error": f"decision {request_id} not found (stores are in-memory)"}


if __name__ == "__main__":
    mcp.run()
