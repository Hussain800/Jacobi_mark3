"""Tests for Math Engine v2 (math_engine.py).

The load-bearing test is the GATE: a large raw price spread with NO significant
controlled gradient must score PEI = 0 — that's the invariant that stops Jacobi
re-introducing the Booking.com "aggressive" false positive.
"""
import math_engine
from math_engine import (
    apply_math_engine_v2,
    build_sensitivity_matrix,
    compute_pei,
)


def _grad(var, delta, dpct, t, sig, nh=3, nl=3):
    return {
        "variable_name": var,
        "delta": delta,
        "delta_pct": dpct,
        "t_statistic": t,
        "significant": sig,
        "n_high": nh,
        "n_low": nl,
    }


def _session(prices, gradients, coverage="strong", agents=None, lang=None):
    return {
        "all_prices": {f"a{i}": p for i, p in enumerate(prices)},
        "gradients": gradients,
        "coverage": coverage,
        "agents": agents or [],
        "language_observations": lang or [],
    }


# --- The gate -------------------------------------------------------------

def test_pei_zero_without_significant_gradient():
    """Huge spread, but NO controlled variable significant → PEI must be 0."""
    s = _session(
        [100, 150, 200, 90, 300, 110, 95, 280, 130, 100, 105, 99],
        [_grad("location", 5.0, 5.0, 1.1, False)],
        coverage="strong",
    )
    pei = compute_pei(s)
    assert pei["score"] == 0.0
    assert pei["gated"] is False
    # Dispersion is still reported, descriptively — just not as a verdict.
    assert pei["dispersion_index"] > 0


def test_pei_zero_at_limited_coverage_even_with_significant_gradient():
    s = _session(
        [100, 140, 120],
        [_grad("location", 40, 40, 16.0, True)],
        coverage="limited",
    )
    pei = compute_pei(s)
    assert pei["score"] == 0.0
    assert pei["gated"] is False


def test_pei_positive_with_significant_gradient_and_strong_coverage():
    s = _session(
        [100] * 8 + [140] * 4,
        [_grad("location", 40.0, 40.0, 16.6, True)],
        coverage="strong",
    )
    pei = compute_pei(s)
    assert pei["gated"] is True
    assert pei["score"] > 0
    assert 0.0 <= pei["score"] <= 100.0
    assert pei["components"]["jacobian_norm"] > 0


def test_partial_coverage_penalises_score():
    grads = [_grad("location", 40.0, 40.0, 16.6, True)]
    strong = compute_pei(_session([100] * 8 + [140] * 4, grads, coverage="strong"))
    partial = compute_pei(_session([100] * 8 + [140] * 4, grads, coverage="partial"))
    assert partial["score"] < strong["score"]


# --- Robust baseline ------------------------------------------------------

def test_trimmed_median_resists_outlier():
    clean = [100, 101, 99, 100, 102, 98, 100, 101, 99, 100]
    poisoned = clean + [999999.0]
    base_clean = math_engine._ROBUST.compute_trimmed_median(clean)
    base_poison = math_engine._ROBUST.compute_trimmed_median(poisoned)
    assert abs(base_clean - base_poison) < 5.0  # the outlier barely moves it


# --- Sensitivity matrix ---------------------------------------------------

def test_sensitivity_matrix_shape_and_language_row():
    s = _session(
        [100] * 8 + [140] * 4,
        [_grad("location", 40, 40, 16.6, True), _grad("device", 5, 5, 0.6, False)],
        lang=[{
            "controlled": True,
            "delta_usd": 0.0,
            "delta_pct": 0.0,
            "difference_detected": False,
            "variant_language_label": "Arabic (UAE)",
        }],
    )
    m = build_sensitivity_matrix(s)
    assert m["outputs"] == ["price"]
    assert len(m["rows"]) == 3  # 2 gradient rows + 1 controlled language pair
    assert m["significant_count"] == 1
    assert m["jacobian_norm"] > 0
    assert any(r["kind"] == "controlled_pair" for r in m["rows"])


def test_jacobian_norm_zero_without_significant():
    m = build_sensitivity_matrix(
        _session([100, 110, 90], [_grad("location", 5, 5, 1.0, False)])
    )
    assert m["jacobian_norm"] == 0.0


# --- Monotonic (Spearman) signal -----------------------------------------

def test_monotonic_signal_requires_three_ordered_tiers():
    two_tiers = {"agents": [
        {"network_tier": 0, "price": 100},
        {"network_tier": 1, "price": 120},
        {"network_tier": 0, "price": 105},
    ]}
    assert math_engine._ordered_monotonic_signal(two_tiers) == 0.0

    three_tiers = {"agents": [
        {"network_tier": 0, "price": 100},
        {"network_tier": 1, "price": 120},
        {"network_tier": 2, "price": 140},
    ]}
    assert math_engine._ordered_monotonic_signal(three_tiers) > 0.0


# --- Public entrypoint ----------------------------------------------------

def test_apply_populates_fields():
    s = _session([100] * 8 + [140] * 4, [_grad("location", 40, 40, 16.6, True)], coverage="strong")
    apply_math_engine_v2(s)
    assert "robust_baseline" in s
    assert "mad_normalized_spread" in s
    assert "sensitivity_matrix" in s
    assert s["pei"]["score"] > 0


def test_apply_fail_soft_on_empty():
    s = {"all_prices": {}, "gradients": [], "coverage": "limited", "agents": []}
    apply_math_engine_v2(s)  # must not raise
    assert s["pei"]["score"] == 0.0
    assert s["sensitivity_matrix"]["rows"] == []
