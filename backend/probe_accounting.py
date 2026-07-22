"""Dependency-light evidence and probe accounting invariants.

This module deliberately has no numerical or provider dependencies. The main
probe lifecycle, enterprise evidence persistence, and Math Engine v2 all use
the same definitions so an inferred/copy-filled agent cannot become a real
probe, extraction, or enterprise evidence row in one path but not another.
"""

from __future__ import annotations

_NULL_EXTRACTION_METHODS = (None, "none", "")
_COPIED_EXTRACTION_METHODS = ("copied",)


def is_real_probe(agent: dict) -> bool:
    """True only when the agent recorded a positive network response time."""
    return is_countable_agent(agent) and (agent.get("response_time_ms") or 0) > 0


def is_inferred_agent(agent: dict) -> bool:
    """True when the exact-uniform gate filled the agent without probing it."""
    return bool(agent.get("inferred"))


def is_copied_agent(agent: dict) -> bool:
    """True when evidence was copied instead of extracted for this agent."""
    if bool(agent.get("copied")):
        return True
    evidence = agent.get("evidence")
    if not isinstance(evidence, dict):
        return False
    method = evidence.get("extraction_method")
    return isinstance(method, str) and method.strip().lower() in _COPIED_EXTRACTION_METHODS


def is_countable_agent(agent: dict) -> bool:
    """Whether an agent may contribute to probe, evidence, or price counts."""
    return not is_inferred_agent(agent) and not is_copied_agent(agent)


def is_observed_price_agent(agent: dict) -> bool:
    """Whether an agent's price is an observed, non-failed result.

    Absent status remains accepted for backwards-compatible historical session
    data; explicit failed statuses are never allowed to repair coverage.
    """
    return is_countable_agent(agent) and agent.get("status") not in {"failed", "error"}


def is_real_extraction(agent: dict) -> bool:
    """True when a non-inferred agent has a concrete extraction method."""
    if not is_observed_price_agent(agent):
        return False
    evidence = agent.get("evidence")
    return (
        isinstance(evidence, dict)
        and evidence.get("extraction_method") not in _NULL_EXTRACTION_METHODS
    )


def compute_probe_accounting(agents: list) -> dict:
    """Return the canonical real-probe, inferred, and evidence counts."""
    return {
        "real_probes_executed": sum(1 for agent in agents if is_real_probe(agent)),
        "skipped_inferred_agents": sum(1 for agent in agents if is_inferred_agent(agent)),
        "evidence_count": sum(1 for agent in agents if is_real_extraction(agent)),
    }


def apply_probe_accounting(session: dict) -> None:
    """Populate canonical accounting fields on a session in place."""
    accounting = compute_probe_accounting(session.get("agents", []))
    session.update(accounting)
