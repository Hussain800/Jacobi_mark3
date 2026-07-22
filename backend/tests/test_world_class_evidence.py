"""Evidence-kernel regression tables for the world-class result contract."""

import pytest

from evidence_adjudication import project_evidence_outcome
from math_engine import _valid_prices, compute_pei
from probe_accounting import compute_probe_accounting, is_real_extraction, is_real_probe


def _gradient(*, significant: bool) -> dict:
    return {
        "variable_name": "location",
        "delta": 40.0,
        "delta_pct": 40.0,
        "significant": significant,
        "n_high": 3,
        "n_low": 3,
    }


@pytest.mark.parametrize(
    ("coverage", "significant", "spread_pct", "expected"),
    [
        ("limited", True, 40.0, {"decision": "insufficient_data", "pei_eligible": False}),
        ("limited", False, 40.0, {"decision": "insufficient_data", "pei_eligible": False}),
        ("partial", False, 250.0, {"decision": "indeterminate", "pei_eligible": False}),
        ("strong", False, 250.0, {"decision": "indeterminate", "pei_eligible": False}),
        ("partial", True, 40.0, {"decision": "attributed", "pei_eligible": True}),
        ("strong", True, 40.0, {"decision": "attributed", "pei_eligible": True}),
    ],
)
def test_evidence_projection_table(coverage, significant, spread_pct, expected):
    projection = project_evidence_outcome(
        coverage=coverage,
        gradients=[_gradient(significant=significant)],
        observed_spread_pct=spread_pct,
    )
    assert {key: projection[key] for key in expected} == expected


def test_projection_is_deterministic_snapshot():
    inputs = {
        "coverage": "strong",
        "gradients": [_gradient(significant=False)],
        "observed_spread_pct": 250.0,
    }
    assert project_evidence_outcome(**inputs) == {
        "coverage": "strong",
        "decision": "indeterminate",
        "significant_gradient_count": 0,
        "has_observed_spread": True,
        "attribution_allowed": True,
        "pei_eligible": False,
    }


def test_huge_unattributed_spread_is_indeterminate_and_never_scores_pei():
    session = {
        "all_prices": {"a": 100.0, "b": 10_000.0},
        "coverage": "strong",
        "max_price_spread_pct": 9_900.0,
        "gradients": [_gradient(significant=False)],
        "agents": [],
    }
    pei = compute_pei(session)
    assert pei["score"] == 0.0
    assert pei["gated"] is False
    assert pei["adjudication"]["decision"] == "indeterminate"
    assert pei["dispersion_index"] > 0.0


def test_limited_significant_gradient_is_insufficient_and_never_scores_pei():
    pei = compute_pei({
        "all_prices": {"a": 100.0, "b": 140.0},
        "coverage": "limited",
        "max_price_spread_pct": 40.0,
        "gradients": [_gradient(significant=True)],
    })
    assert pei["score"] == 0.0
    assert pei["gated"] is False
    assert pei["adjudication"]["decision"] == "insufficient_data"


def test_copied_and_failed_agents_never_enter_math_price_projection_or_evidence():
    agents = [
        {"agent_id": "observed", "status": "success", "price": 100.0, "response_time_ms": 100, "evidence": {"extraction_method": "scoped"}},
        {"agent_id": "copied", "status": "success", "price": 99_999.0, "response_time_ms": 100, "evidence": {"extraction_method": "copied"}},
        {"agent_id": "failed", "status": "failed", "price": 88_888.0, "response_time_ms": 100, "evidence": {"extraction_method": "scoped"}},
        {"agent_id": "missing", "status": "failed", "price": None, "response_time_ms": 100},
    ]
    session = {"agents": agents, "all_prices": {agent["agent_id"]: agent["price"] for agent in agents}}

    assert _valid_prices(session) == [100.0]
    assert is_real_probe(agents[1]) is False
    assert is_real_extraction(agents[1]) is False
    assert compute_probe_accounting(agents) == {
        "real_probes_executed": 3,
        "skipped_inferred_agents": 0,
        "evidence_count": 1,
    }
