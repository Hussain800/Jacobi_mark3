"""Machine-readable provider/page-adapter policy ledger helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


POLICY_LEDGER_PATH = Path(__file__).with_name("policy_ledger.json")


def load_policy_ledger() -> dict[str, Any]:
    """Load the checked-in ledger; malformed policy fails closed."""

    try:
        payload = json.loads(POLICY_LEDGER_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:  # pragma: no cover - packaging guard
        raise RuntimeError("travel provider policy ledger is unavailable") from exc
    if payload.get("schema_version") != 1 or not isinstance(payload.get("sources"), list):
        raise RuntimeError("travel provider policy ledger has an unsupported schema")
    return payload


def disabled_future_provider_states() -> list[dict[str, object]]:
    """Return honest public states for planned providers, never fake descriptors."""

    states: list[dict[str, object]] = []
    for source in load_policy_ledger()["sources"]:
        if source.get("source_kind") != "provider":
            continue
        if source.get("implementation_status") != "not_implemented":
            continue
        approval = source.get("approval") or {}
        states.append(
            {
                "provider_id": source["source_id"],
                "display_name": source["display_name"],
                "verticals": source["verticals"],
                "capabilities": [],
                "current_environment": "unavailable",
                "observation_method": "unavailable",
                "fixed_origins": [],
                "official": True,
                "independently_queries_market": False,
                "supports_progressive_results": False,
                "supports_deeplinks": False,
                "redirect_origins": [],
                "credentials_required": True,
                "credential_requirements": [],
                "production_approval_required": True,
                "default_enabled": False,
                "limitations": ["Provider adapter is not implemented or approved."],
                "configured": False,
                "health": "blocked_external",
                "data_label": "unavailable",
                "fixture": False,
                "implementation_status": "not_implemented",
                "approval_status": approval.get("production_status", "blocked_external"),
                "disabled_reasons": approval.get("required_external", []),
            }
        )
    return states
