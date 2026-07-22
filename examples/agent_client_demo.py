"""Jacobi for Agents example client with fail-closed contract checks.

Run from the repository root:

  python examples/agent_client_demo.py       # REST; backend on localhost:8000
  python examples/agent_client_demo.py --mcp # MCP stdio; uses project deps

The REST path uses only the Python standard library. This is an example, not
an SDK: production clients should implement the same schema, capability, and
freshness checks in their own boundary layer.
"""

import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import json
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8000"
SCHEMA_VERSION = "1.0.0"
DECISIONS = {
    "proceed",
    "proceed_with_caution",
    "ask_user",
    "handoff_to_user",
    "use_official_route",
    "block",
}
EVIDENCE_TIERS = {
    "claim_only",
    "local",
    "managed_request",
    "managed_browser",
    "official_api",
}


class ContractError(RuntimeError):
    """The server response does not satisfy the documented agent contract."""


def _json_response(request: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
            error = payload.get("error", {})
            code = error.get("code", f"http_{exc.code}")
            message = error.get("message", "Jacobi rejected the command.")
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            code = f"http_{exc.code}"
            message = "Jacobi rejected the command."
        raise ContractError(f"{code}: {message}") from exc


def _post(path: str, body: dict) -> dict:
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return _json_response(request)


def _get(path: str) -> dict:
    return _json_response(urllib.request.Request(BASE + path))


def _timestamp(value: object, field: str) -> datetime:
    if not isinstance(value, str):
        raise ContractError(f"{field} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractError(f"{field} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise ContractError(f"{field} must include a timezone")
    return parsed


def validate_envelope(env: dict, *, now: datetime | None = None) -> datetime:
    """Fail closed on incompatible, incomplete, or stale decision envelopes."""
    if not isinstance(env, dict):
        raise ContractError("DecisionEnvelope must be an object")
    if env.get("schema_version") != SCHEMA_VERSION:
        raise ContractError(f"unsupported schema_version; expected {SCHEMA_VERSION}")
    if env.get("decision") not in DECISIONS:
        raise ContractError("decision is missing or unsupported")
    reasons = env.get("reason_codes")
    if not isinstance(reasons, list) or not all(isinstance(code, str) for code in reasons):
        raise ContractError("reason_codes must be a string array")
    if not isinstance(env.get("fixture_mode"), bool):
        raise ContractError("fixture_mode must be a boolean")

    evidence = env.get("evidence")
    if not isinstance(evidence, dict):
        raise ContractError("evidence must be an object")
    manifest_id = evidence.get("manifest_id")
    digest = evidence.get("manifest_sha256")
    tier = evidence.get("capability_tier")
    limitations = evidence.get("limitations")
    if not isinstance(manifest_id, str) or not manifest_id:
        raise ContractError("evidence.manifest_id is required")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(char not in "0123456789abcdef" for char in digest.lower())
    ):
        raise ContractError("evidence.manifest_sha256 must be a SHA-256 digest")
    if tier not in EVIDENCE_TIERS:
        raise ContractError("evidence.capability_tier is missing or unsupported")
    if not isinstance(limitations, list) or not all(isinstance(item, str) for item in limitations):
        raise ContractError("evidence.limitations must be a string array")
    if tier in {"claim_only", "local"} and not limitations:
        raise ContractError("claim-only/local evidence must disclose limitations")
    if env["decision"] == "block" and tier != "claim_only":
        raise ContractError("a blocked command must not claim collected evidence")

    ttl = env.get("ttl_seconds")
    if not isinstance(ttl, int) or isinstance(ttl, bool) or ttl <= 0:
        raise ContractError("ttl_seconds must be a positive integer")
    created_at = _timestamp(env.get("created_at"), "created_at")
    expires_at = _timestamp(env.get("expires_at"), "expires_at")
    if expires_at != created_at + timedelta(seconds=ttl):
        raise ContractError("expires_at does not match created_at + ttl_seconds")
    instant = now or datetime.now(timezone.utc)
    if instant >= expires_at:
        raise ContractError("decision envelope is stale; re-verify before acting")
    return expires_at


def show(title: str, env: dict) -> None:
    expires_at = validate_envelope(env)
    print(f"\n=== {title} ===")
    print(f"decision:  {env['decision']}   score: {env['provenance_score']}/100")
    print(f"reasons:   {', '.join(env['reason_codes'])}")
    print(f"explains:  {env['user_explanation']}")
    print(f"next:      {env['next_action']}")
    print(
        f"manifest:  {env['evidence']['manifest_id']} "
        f"sha256={env['evidence']['manifest_sha256'][:16]}..."
    )
    print(
        f"evidence:  {env['evidence']['capability_tier']} "
        f"(fresh until {expires_at.isoformat()})"
    )
    for limitation in env["evidence"]["limitations"]:
        print(f"limit:     {limitation}")
    if env["fixture_mode"]:
        print("note:      fixture demo data (deterministic, labeled)")


def run_rest() -> None:
    health = _get("/api/v1/agent/health")
    if health.get("schema_version") != SCHEMA_VERSION:
        raise ContractError("server health reports an incompatible schema version")
    print("health:", json.dumps(health, indent=2)[:240], "...")

    policy = _post("/api/v1/agent/policy/check", {
        "schema_version": SCHEMA_VERSION,
        "url": "https://www.booking.com/hotel/x",
        "consent_scope": "purchase_authorized",
    })
    print(
        "\npolicy check (booking.com, purchase_authorized):",
        policy["decision"],
        "-",
        policy["reason"],
    )

    envelope = _post("/api/v1/agent/verify", {
        "schema_version": SCHEMA_VERSION,
        "demo": "fee_drift",
        "consent_scope": "recommend",
    })
    show("Lodging fee-drift verification", envelope)

    manifest = _get(f"/api/v1/agent/manifests/{envelope['evidence']['manifest_id']}")
    if manifest.get("version") != SCHEMA_VERSION:
        raise ContractError("evidence manifest has an incompatible schema version")
    print(
        f"artifacts: {len(manifest['artifacts'])} hashed, "
        f"limitations: {len(manifest['limitations'])}"
    )

    blocked = _post("/api/v1/agent/verify", {
        "schema_version": SCHEMA_VERSION,
        "demo": "blocked_route",
    })
    show("Restricted-route purchase attempt", blocked)
    assert blocked["decision"] == "block", "policy engine must block this"
    assert blocked["evidence"]["capability_tier"] == "claim_only"
    print("action:    stop; hand the official page to the user (do not collect more)")
    print("\nOK - agent flow complete.")


async def run_mcp() -> None:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "agentcore.mcp_server"],
        cwd="backend",
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("tools:", [tool.name for tool in tools.tools])

            result = await session.call_tool("verify_purchase_context", {
                "schema_version": SCHEMA_VERSION,
                "demo": "fee_drift",
                "consent_scope": "recommend",
            })
            envelope = json.loads(result.content[0].text)
            show("MCP: lodging fee-drift verification", envelope)

            blocked_result = await session.call_tool("verify_purchase_context", {
                "schema_version": SCHEMA_VERSION,
                "demo": "blocked_route",
            })
            blocked = json.loads(blocked_result.content[0].text)
            show("MCP: restricted-route purchase attempt", blocked)
            assert blocked["decision"] == "block"
            assert blocked["evidence"]["capability_tier"] == "claim_only"
            print("action:    stop; hand the official page to the user (do not collect more)")
            print("\nOK - MCP agent flow complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mcp",
        action="store_true",
        help="drive the MCP stdio server instead of REST",
    )
    args = parser.parse_args()
    if args.mcp:
        asyncio.run(run_mcp())
    else:
        run_rest()
