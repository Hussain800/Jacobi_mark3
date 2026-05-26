"""
JACOBI — Cognee Memory Integration (Optional)

Persists probe results into Cognee's knowledge graph for cross-session
AI memory. All calls are fire-and-forget; Cognee being unavailable never
blocks a probe or raises an error to the user.

Set COGNEE_API_KEY and COGNEE_API_URL in the environment to activate.
"""

import os
import json
import logging

logger = logging.getLogger(__name__)

COGNEE_API_KEY = os.getenv("COGNEE_API_KEY", "")
COGNEE_API_URL = os.getenv(
    "COGNEE_API_URL",
    "https://cognee--cognee-saas-backend-serve.modal.run/api/v1",
)

_available: bool | None = None


def is_available() -> bool:
    global _available
    if _available is not None:
        return _available
    _available = bool(COGNEE_API_KEY)
    if not _available:
        logger.debug("Cognee not configured — skipping memory integration")
    return _available


async def remember_probe(report: dict) -> None:
    """Store a completed probe result into Cognee's knowledge graph.

    This is a fire-and-forget operation. Failures are logged but never
    propagated, so a down Cognee instance can never break the probe
    pipeline.
    """
    if not is_available():
        return

    import httpx

    session_id = report.get("session_id", "unknown")
    target_url = report.get("target_url", "")
    target_name = report.get("target_name", "")
    topology = report.get("topology_class", "unknown")
    baseline = report.get("baseline_price")
    spread = report.get("max_price_spread")
    di = report.get("discrimination_index")
    summary = report.get("summary", "")
    gradients = report.get("gradients", [])

    sig_gradients = [
        g for g in gradients if g.get("significant")
    ]

    memory_text = (
        f"JACOBI probe completed for {target_name} ({target_url}). "
        f"Topology: {topology}. "
        f"Baseline price: ${baseline:.2f}. "
        f"Price spread: ${spread:.2f}. "
        f"Discrimination index: {di:.1f}. "
        f"Significant variables: {len(sig_gradients)}. "
        f"Summary: {summary}"
    )

    structured = {
        "session_id": session_id,
        "target_url": target_url,
        "target_name": target_name,
        "topology_class": topology,
        "baseline_price": baseline,
        "max_price_spread": spread,
        "discrimination_index": di,
        "summary": summary,
        "gradients": [
            {
                "variable": g.get("variable_name"),
                "delta": g.get("delta"),
                "delta_pct": g.get("delta_pct"),
                "significant": g.get("significant"),
            }
            for g in gradients
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "Authorization": f"Bearer {COGNEE_API_KEY}",
                "Content-Type": "application/json",
            }

            # Step 1: Add the probe data
            add_payload = {
                "datasets": ["jacobi_probes"],
                "text_data": [memory_text],
                "metadata": json.dumps(structured),
            }
            r = await client.post(
                f"{COGNEE_API_URL}/add",
                json=add_payload,
                headers=headers,
            )
            if r.status_code not in (200, 201):
                logger.warning("Cognee add returned %s: %s", r.status_code, r.text[:200])
                return

            logger.info("Cognee memory stored for probe %s", session_id)

    except Exception as exc:
        logger.debug("Cognee integration skipped: %s", exc)


async def recall_probes(query: str, top_k: int = 5) -> list[dict]:
    """Query Cognee's knowledge graph for past probe results.

    Returns an empty list if Cognee is not configured or unreachable.
    """
    if not is_available():
        return []

    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Authorization": f"Bearer {COGNEE_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "search_type": "GRAPH_COMPLETION",
                "datasets": ["jacobi_probes"],
                "query": query,
                "top_k": top_k,
            }
            r = await client.post(
                f"{COGNEE_API_URL}/search",
                json=payload,
                headers=headers,
            )
            if r.status_code == 200:
                return r.json().get("results", [])
            return []
    except Exception as exc:
        logger.debug("Cognee recall failed: %s", exc)
        return []
