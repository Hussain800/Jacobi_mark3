"""
Jacobi for Agents — MCP server (stdio).

Exposes the verification tool catalog to MCP clients (Claude Desktop, agent
frameworks). Same engine as the REST API; every tool returns a JSON-safe dict.

Run from backend/:
    python -m agentcore.mcp_server

Claude Desktop config example lives in docs/jacobi-for-agents.md.

Safety: no tool executes a purchase. purchase_authorized requests on
restricted or unknown routes return decision=block unless the official-route
claim is authorized by the server-owned official-route registry.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from mcp.server.fastmcp import FastMCP

from . import commands
from . import engine
from .schemas import SCHEMA_VERSION

mcp = FastMCP("jacobi")


def _mcp_error(exc: commands.AgentCommandError) -> Dict[str, Any]:
    return {"error": exc.as_dict()}


def _execute_verify(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        command = commands.normalize_verify_command(payload)
        envelope = commands.execute_verify(
            command,
            commands.CommandContext(org="mcp-local", transport="mcp"),
        )
    except commands.AgentCommandError as exc:
        return _mcp_error(exc)
    return envelope.model_dump(mode="json")


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
    schema_version: str = SCHEMA_VERSION,
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
    return _execute_verify({
        "schema_version": schema_version,
        "demo": demo,
        "url": url,
        "consent_scope": consent_scope,
        "displayed_total": displayed,
        "official_route": official_route,
        "agent_id": agent_id,
    })


@mcp.tool()
def compare_total_price(
    url: Optional[str] = None,
    demo: Optional[str] = None,
    displayed_total_amount: Optional[float] = None,
    displayed_total_currency: str = "USD",
    schema_version: str = SCHEMA_VERSION,
) -> Dict[str, Any]:
    """Compare a displayed/claimed price against observed listing and
    checkout-preparation totals. Returns price trace, deltas, mandatory fees,
    and reason codes."""
    displayed = (
        {"amount": displayed_total_amount, "currency": displayed_total_currency}
        if displayed_total_amount is not None
        else None
    )
    result = _execute_verify({
        "schema_version": schema_version,
        "demo": demo,
        "url": url,
        "consent_scope": "research_only",
        "displayed_total": displayed,
        "agent_id": "mcp-client",
    })
    if "error" in result:
        return result
    from .schemas import DecisionEnvelope

    return commands.compare_total_price_projection(DecisionEnvelope.model_validate(result))


@mcp.tool()
def check_platform_policy(
    url: str,
    consent_scope: str = "recommend",
    official_route: bool = False,
    schema_version: str = SCHEMA_VERSION,
) -> Dict[str, Any]:
    """Check whether the requested action is allowed, warned, or blocked
    under Jacobi's platform policy registry."""
    try:
        command = commands.normalize_policy_command({
            "schema_version": schema_version,
            "url": url,
            "consent_scope": consent_scope,
            "official_route": official_route,
        })
    except commands.AgentCommandError as exc:
        return _mcp_error(exc)
    return commands.execute_policy(command).model_dump(mode="json")


@mcp.tool()
def create_evidence_manifest(
    url: Optional[str] = None,
    demo: Optional[str] = None,
    schema_version: str = SCHEMA_VERSION,
) -> Dict[str, Any]:
    """Collect evidence for a target and return the deterministic SHA-256
    evidence manifest (artifacts, hashes, capabilities, limitations)."""
    result = _execute_verify({
        "schema_version": schema_version,
        "demo": demo,
        "url": url,
        "consent_scope": "research_only",
        "agent_id": "mcp-client",
    })
    if "error" in result:
        return result
    manifest_id = result["evidence"]["manifest_id"]
    manifest = engine.get_manifest(manifest_id)
    if manifest is None:
        return _mcp_error(commands.AgentCommandError(
            "manifest_unavailable",
            "The evidence manifest is unavailable.",
            http_status=503,
            retryable=True,
        ))
    return manifest.model_dump(mode="json")


@mcp.tool()
def explain_decision(request_id: str) -> Dict[str, Any]:
    """Convert a prior decision envelope into a short user-facing explanation
    with the recommended next step."""
    out = engine.explain(request_id)
    if out is None:
        return _mcp_error(commands.AgentCommandError(
            "decision_not_found",
            "The decision was not found.",
            http_status=404,
        ))
    return out


if __name__ == "__main__":
    mcp.run()
