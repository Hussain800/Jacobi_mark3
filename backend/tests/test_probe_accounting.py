"""Tests for the centralized probe-accounting helpers in math_engine.py.

The invariant: only agents that actually executed a network probe (positive
response_time_ms) count as real probes; inferred agents (filled by the
exact-uniform gate) must never be charged or claimed as coverage. Evidence
count requires a non-null extraction_method.
"""
import math_engine
from enterprise_store import extract_probe_observations
from math_engine import (
    is_real_probe,
    is_inferred_agent,
    is_real_extraction,
    compute_probe_accounting,
    apply_probe_accounting,
)


def _agent(rt=None, inferred=False, evidence=None):
    a = {"agent_id": "x", "variables": {}}
    if rt is not None:
        a["response_time_ms"] = rt
    if inferred:
        a["inferred"] = True
    if evidence is not None:
        a["evidence"] = evidence
    return a


# --- is_real_probe -----------------------------------------------------------

def test_real_probe_requires_positive_response_time():
    assert is_real_probe(_agent(rt=1200)) is True
    assert is_real_probe(_agent(rt=1)) is True


def test_inferred_agent_with_zero_rt_is_not_real_probe():
    # Inferred agents have response_time_ms=0 (or missing) — NOT real probes.
    assert is_real_probe(_agent(rt=0, inferred=True)) is False
    assert is_real_probe(_agent(inferred=True)) is False


def test_inferred_flag_dominates_positive_response_time():
    assert is_real_probe(_agent(rt=1200, inferred=True)) is False


def test_none_rt_is_not_real_probe():
    assert is_real_probe(_agent()) is False
    assert is_real_probe(_agent(rt=None)) is False


# --- is_inferred_agent -------------------------------------------------------

def test_inferred_flag_detected():
    assert is_inferred_agent(_agent(inferred=True)) is True
    assert is_inferred_agent(_agent(inferred=False)) is False
    assert is_inferred_agent(_agent()) is False


# --- is_real_extraction ------------------------------------------------------

def test_real_extraction_requires_dict_with_method():
    assert is_real_extraction(_agent(evidence={"extraction_method": "scoped"})) is True


def test_null_extraction_methods_are_not_real():
    for bad in (None, "none", ""):
        assert is_real_extraction(_agent(evidence={"extraction_method": bad})) is False


def test_missing_or_non_dict_evidence_is_not_real():
    assert is_real_extraction(_agent()) is False
    assert is_real_extraction(_agent(evidence=None)) is False
    assert is_real_extraction(_agent(evidence="scoped")) is False
    assert is_real_extraction(_agent(evidence={})) is False


# --- compute_probe_accounting ------------------------------------------------

def test_accounting_counts_real_vs_inferred_vs_evidence():
    agents = [
        _agent(rt=1200, evidence={"extraction_method": "scoped"}),  # real probe + evidence
        _agent(rt=800, evidence={"extraction_method": "generic"}),  # real probe + evidence
        _agent(rt=0, inferred=True),  # inferred — NOT real
        _agent(rt=0, evidence={"extraction_method": "none"}),  # blocked — null extraction
        _agent(),  # no data at all
    ]
    acct = compute_probe_accounting(agents)
    assert acct == {"real_probes_executed": 2, "skipped_inferred_agents": 1, "evidence_count": 2}


def test_accounting_handles_empty_list():
    assert compute_probe_accounting([]) == {
        "real_probes_executed": 0,
        "skipped_inferred_agents": 0,
        "evidence_count": 0,
    }


# --- apply_probe_accounting --------------------------------------------------

def test_apply_probe_accounting_writes_fields_in_place():
    session = {"agents": [
        _agent(rt=1200, evidence={"extraction_method": "scoped"}),
        _agent(rt=0, inferred=True),
    ]}
    apply_probe_accounting(session)
    assert session["real_probes_executed"] == 1
    assert session["skipped_inferred_agents"] == 1
    assert session["evidence_count"] == 1


def test_apply_probe_accounting_handles_missing_agents_key():
    session = {}
    apply_probe_accounting(session)
    assert session["real_probes_executed"] == 0
    assert session["skipped_inferred_agents"] == 0
    assert session["evidence_count"] == 0


def test_enterprise_observations_exclude_inferred_copies():
    session = {"agents": [
        _agent(rt=900, evidence={"extraction_method": "scoped"}) | {"price": 176},
        _agent(rt=0, inferred=True, evidence={"extraction_method": "copied"}) | {"price": 176},
    ]}
    observations = extract_probe_observations(session)
    assert len(observations) == 1
    assert observations[0]["observed_price"] == 176
