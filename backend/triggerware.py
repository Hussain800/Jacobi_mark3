"""
JACOBI — TriggerWare.ai Workflow Integration (Optional)

Fires webhook events on probe completion so TriggerWare.ai can route
them into downstream workflows (Slack alerts, email, dashboards, etc.).

Set TRIGGERWARE_WEBHOOK_URL in the environment to activate.
"""

import json
import logging
import os

import httpx

logger = logging.getLogger(__name__)

TRIGGERWARE_WEBHOOK_URL = os.getenv("TRIGGERWARE_WEBHOOK_URL", "")


def is_configured() -> bool:
    return bool(TRIGGERWARE_WEBHOOK_URL)


async def dispatch_probe_event(report: dict) -> None:
    """Fire a probe-completed event to TriggerWare.ai.

    Fire-and-forget. Never blocks the probe pipeline.
    """
    if not is_configured():
        return

    event = {
        "event": "probe.completed",
        "session_id": report.get("session_id", ""),
        "target_url": report.get("target_url", ""),
        "target_name": report.get("target_name", ""),
        "topology_class": report.get("topology_class", "unknown"),
        "baseline_price": report.get("baseline_price"),
        "max_price_spread": report.get("max_price_spread"),
        "discrimination_index": report.get("discrimination_index"),
        "discrimination_detected": report.get("discrimination_index", 0) > 10,
        "successful_agents": report.get("successful_agents", 0),
        "total_agents": report.get("total_agents", 24),
        "summary": report.get("summary", ""),
        "gradients": [
            {
                "variable": g.get("variable_name"),
                "delta": g.get("delta"),
                "delta_pct": g.get("delta_pct"),
                "significant": g.get("significant"),
            }
            for g in report.get("gradients", [])
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                TRIGGERWARE_WEBHOOK_URL,
                json=event,
                headers={"Content-Type": "application/json"},
            )
            if r.status_code not in (200, 201, 202, 204):
                logger.warning(
                    "TriggerWare.ai returned %s: %s", r.status_code, r.text[:200]
                )
            else:
                logger.info(
                    "TriggerWare.ai event dispatched for probe %s",
                    report.get("session_id"),
                )
    except Exception as exc:
        logger.debug("TriggerWare.ai dispatch skipped: %s", exc)
