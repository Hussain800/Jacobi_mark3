"""
Jacobi for Agents — example agent client flow.

Simulates what a shopping/booking agent does before recommending a hotel:

  1. health_check
  2. check_platform_policy for the intended action
  3. verify_purchase_context (lodging fee-drift demo)
  4. read the decision + explanation, fetch the evidence manifest
  5. attempt a purchase_authorized verification on a restricted route
     and show that Jacobi blocks it

Two transports, same tool semantics:

  python examples/agent_client_demo.py           # REST (backend must run on :8000)
  python examples/agent_client_demo.py --mcp     # MCP stdio (spawns the server)

REST flavor needs only stdlib. MCP flavor uses the `mcp` package that is
already in backend/requirements.txt.
"""

import argparse
import asyncio
import json
import sys
import urllib.request

BASE = "http://localhost:8000"


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.load(r)


def show(title: str, env: dict) -> None:
    print(f"\n=== {title} ===")
    print(f"decision:  {env['decision']}   score: {env['provenance_score']}/100")
    print(f"reasons:   {', '.join(env['reason_codes'])}")
    print(f"explains:  {env['user_explanation']}")
    print(f"next:      {env['next_action']}")
    print(f"manifest:  {env['evidence']['manifest_id']} sha256={env['evidence']['manifest_sha256'][:16]}…")
    if env.get("fixture_mode"):
        print("note:      fixture demo data (deterministic, labeled)")


def run_rest() -> None:
    print("health:", json.dumps(_get("/api/v1/agent/health"), indent=2)[:200], "…")

    pol = _post("/api/v1/agent/policy/check", {
        "url": "https://www.booking.com/hotel/x",
        "consent_scope": "purchase_authorized",
    })
    print("\npolicy check (booking.com, purchase_authorized):",
          pol["decision"], "—", pol["reason"])

    env = _post("/api/v1/agent/verify", {"demo": "fee_drift", "consent_scope": "recommend"})
    show("Lodging fee-drift verification", env)

    man = _get(f"/api/v1/agent/manifests/{env['evidence']['manifest_id']}")
    print(f"artifacts: {len(man['artifacts'])} hashed, "
          f"limitations: {len(man['limitations'])}")

    blocked = _post("/api/v1/agent/verify", {"demo": "blocked_route"})
    show("Restricted-route purchase attempt", blocked)
    assert blocked["decision"] == "block", "policy engine must block this"
    print("\nOK — agent flow complete.")


async def run_mcp() -> None:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=sys.executable, args=["-m", "agentcore.mcp_server"], cwd="backend",
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("tools:", [t.name for t in tools.tools])

            res = await session.call_tool(
                "verify_purchase_context", {"demo": "fee_drift", "consent_scope": "recommend"}
            )
            env = json.loads(res.content[0].text)
            show("MCP: lodging fee-drift verification", env)

            res2 = await session.call_tool("verify_purchase_context", {"demo": "blocked_route"})
            env2 = json.loads(res2.content[0].text)
            show("MCP: restricted-route purchase attempt", env2)
            assert env2["decision"] == "block"
            print("\nOK — MCP agent flow complete.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mcp", action="store_true", help="drive the MCP stdio server instead of REST")
    args = ap.parse_args()
    if args.mcp:
        asyncio.run(run_mcp())
    else:
        run_rest()
