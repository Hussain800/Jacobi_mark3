"""JACOBI Math Engine v2 — robust statistics, the Jacobian sensitivity matrix,
and the attribution-gated Price Exploitation Index (PEI).

This layer sits inside ``finalize_pricing_session`` (main.py), AFTER the
gradient + t-test stack has run, and turns what the engine already computes
into the math artifacts JACOBI was named for — without ever overriding the
verdict gate.

Design invariant (the credibility moat)
---------------------------------------
The PEI is **severity**, never **verdict**. A price spread that no controlled
buyer-context variable significantly moved (|t| <= 2) is NOT scored as
exploitation, no matter how large the raw dispersion. The significant-gradient
vector ``‖J_sig‖`` is a NECESSARY gate; Gini / MAD / Spearman only sharpen an
already-attributed signal — they can never manufacture one. This is exactly
what keeps Jacobi from re-introducing the Booking.com "aggressive" false
positive.

Robust primitives (Gini, MAD, Spearman, trimmed median) are reused from
``pricing_engine.JacobiPricingEngine`` so there is a single source of truth.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np

from pricing_engine import JacobiPricingEngine

_EPS = 1e-9


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class PEIConfig:
    """Tunable weights for the Price Exploitation Index.

    Exposed and env-overridable so the index can be calibrated and reviewed
    BEFORE it is ever shown to a customer. Defaults keep ``‖J_sig‖`` dominant
    so the attributed gradient — not raw dispersion — drives the score.
    """

    alpha_jacobian: float = field(default_factory=lambda: _env_float("PEI_ALPHA", 1.0))
    beta_gini: float = field(default_factory=lambda: _env_float("PEI_BETA", 0.35))
    gamma_mad: float = field(default_factory=lambda: _env_float("PEI_GAMMA", 0.25))
    delta_spearman: float = field(default_factory=lambda: _env_float("PEI_DELTA", 0.15))
    lambda_uncertainty: float = field(default_factory=lambda: _env_float("PEI_LAMBDA", 0.60))
    p_norm: float = field(default_factory=lambda: _env_float("PEI_PNORM", 2.0))
    # Steepness chosen so a ~17% multi-variable spread reads ≈"Moderate" and a
    # ~50% spread reads ≈"High". Calibrate via PEI_STEEP before customer exposure.
    sigmoid_steepness: float = field(default_factory=lambda: _env_float("PEI_STEEP", 3.0))
    trim_pct: float = field(default_factory=lambda: _env_float("PEI_TRIM", 0.10))


_CFG = PEIConfig()
# Single source of truth for the robust primitives. trim_pct drives the
# trimmed-median baseline; p / lambda mirror the PEI aggregation parameters.
_ROBUST = JacobiPricingEngine(
    p=max(1.0, _CFG.p_norm),
    lambda_0=max(_EPS, _CFG.sigmoid_steepness),
    trim_pct=min(0.49, max(0.0, _CFG.trim_pct)),
)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _valid_prices(session: dict) -> List[float]:
    return [p for p in (session.get("all_prices") or {}).values() if p is not None]


def _raw_mad(prices: List[float]) -> float:
    """Raw (unnormalised) Median Absolute Deviation — a robust dispersion scale."""
    if len(prices) < 2:
        return 0.0
    arr = np.asarray(prices, dtype=np.float64)
    med = float(np.median(arr))
    return float(np.median(np.abs(arr - med)))


def _robust_effect_size(delta: float, mad_abs: float) -> float:
    """Robust standardised effect: ``delta`` scaled by a MAD-derived sigma.

    ``1.4826 * MAD ≈ σ`` for a normal distribution, so this is a median-anchored
    cousin of Cohen's d that ignores outliers — appropriate for noisy scraped
    price vectors.
    """
    sigma = 1.4826 * mad_abs
    if sigma < _EPS:
        return 0.0
    return round(delta / sigma, 3)


def _confidence(significant: bool, n: int) -> str:
    if significant and n >= 4:
        return "high"
    if significant:
        return "moderate"
    return "observational"


def _jacobian_norm(gradients: List[dict]) -> float:
    """``‖J_sig‖_p`` — Minkowski p-norm of the SIGNIFICANT gradient components,
    each expressed as a fractional price move ``|Δ%| / 100``. Zero when nothing
    is significant (the gate)."""
    comps = [
        abs(g.get("delta_pct") or 0.0) / 100.0
        for g in gradients
        if g.get("significant")
    ]
    if not comps:
        return 0.0
    p = max(1.0, _CFG.p_norm)
    return round(sum(c ** p for c in comps) ** (1.0 / p), 6)


def _ordered_monotonic_signal(session: dict) -> float:
    """``|Spearman ρ|`` between an ordinal network tier and price — but ONLY when
    there are >= 3 distinct ordered tiers with >= 3 samples. Otherwise 0.0; we
    do not run rank-correlation theatre on 2 points or a binary axis."""
    pairs = []
    for a in session.get("agents", []):
        tier = a.get("network_tier")
        price = a.get("price")
        if tier is None or price is None:
            continue
        try:
            pairs.append((float(tier), float(price)))
        except (TypeError, ValueError):
            continue
    if len(pairs) < 3:
        return 0.0
    if len({t for t, _ in pairs}) < 3:
        return 0.0
    try:
        rho = _ROBUST.compute_spearman([t for t, _ in pairs], [p for _, p in pairs])
    except Exception:
        return 0.0
    return abs(rho)


# ---------------------------------------------------------------------------
# Jacobian sensitivity matrix
# ---------------------------------------------------------------------------

def build_sensitivity_matrix(session: dict) -> dict:
    """The Jacobian sensitivity matrix: the partial sensitivity of price to each
    identity variable — i.e. the *price row* of the Jacobian.

    Rows are the controlled gradients the engine already computed, plus the
    controlled browser-language pairs (only Accept-Language varied; everything
    else held constant). Today the matrix has ONE output-row class (price);
    multi-output rows (fees, availability, ranking) are a roadmap item and are
    declared honestly so the artifact never over-claims to be a full multi-output
    Jacobian.
    """
    prices = _valid_prices(session)
    mad_abs = _raw_mad(prices)
    gradients = session.get("gradients") or []

    rows: List[dict] = []
    for g in gradients:
        n = (g.get("n_high") or 0) + (g.get("n_low") or 0)
        rows.append({
            "variable": g.get("variable_name"),
            "kind": "controlled_gradient",
            "delta_usd": g.get("delta"),
            "delta_pct": g.get("delta_pct"),
            "t_statistic": g.get("t_statistic"),
            "effect_size": _robust_effect_size(g.get("delta") or 0.0, mad_abs),
            "n": n,
            "significant": bool(g.get("significant")),
            "confidence": _confidence(bool(g.get("significant")), n),
        })

    # Controlled language pairs — the strongest evidence class (a true matched
    # experiment: only Accept-Language changed).
    for obs in (session.get("language_observations") or []):
        if not obs.get("controlled"):
            continue
        delta_usd = obs.get("delta_usd")
        label = obs.get("variant_language_label") or obs.get("variant_language") or "variant"
        rows.append({
            "variable": f"language:{label}",
            "kind": "controlled_pair",
            "delta_usd": delta_usd,
            "delta_pct": obs.get("delta_pct"),
            "t_statistic": None,  # a single matched pair, not a t-test
            "effect_size": _robust_effect_size(delta_usd or 0.0, mad_abs),
            "n": 2,
            "significant": bool(obs.get("difference_detected")),
            "confidence": "controlled_pair",
        })

    return {
        "outputs": ["price"],
        "note": (
            "Single-output Jacobian (price row): each value is the partial "
            "sensitivity of price to one identity variable. Multi-output rows "
            "(fees, availability, ranking) are roadmap."
        ),
        "rows": rows,
        "jacobian_norm": _jacobian_norm(gradients),
        "significant_count": sum(
            1 for r in rows if r["significant"] and r["kind"] == "controlled_gradient"
        ),
    }


# ---------------------------------------------------------------------------
# Price Exploitation Index (attribution-gated)
# ---------------------------------------------------------------------------

def _interpret_pei(score: float) -> str:
    if score < 15:
        return "Minimal — attributed pricing differences are small."
    if score < 35:
        return "Low — minor verified price differentiation."
    if score < 55:
        return "Moderate — clear attributed price differentiation."
    if score < 75:
        return "High — strong attributed differential pricing."
    return "Severe — extreme attributed differential pricing."


def _config_dict() -> Dict[str, float]:
    return {
        "alpha_jacobian": _CFG.alpha_jacobian,
        "beta_gini": _CFG.beta_gini,
        "gamma_mad": _CFG.gamma_mad,
        "delta_spearman": _CFG.delta_spearman,
        "lambda_uncertainty": _CFG.lambda_uncertainty,
        "p_norm": _CFG.p_norm,
        "sigmoid_steepness": _CFG.sigmoid_steepness,
    }


def compute_pei(session: dict) -> dict:
    """Attribution-gated Price Exploitation Index ∈ [0, 100].

    ``PEI = 100 · sigmoid( α‖J_sig‖ₚ + βGini + γMAD + δ|ρ_s| − λ·uncertainty )``

    HARD-GATED: if no controlled variable significantly moved the price, or
    coverage is ``limited``, ``PEI = 0`` and only a descriptive
    ``dispersion_index`` is reported. The PEI scores VERIFIED, attributed
    exploitation — never raw spread.
    """
    prices = _valid_prices(session)
    coverage = session.get("coverage", "limited")
    gradients = session.get("gradients") or []
    sig_count = sum(1 for g in gradients if g.get("significant"))

    gini = round(_ROBUST.compute_gini(prices), 6) if len(prices) >= 2 else 0.0
    mad_norm = round(_ROBUST.compute_mad_dispersion(prices), 6) if len(prices) >= 2 else 0.0
    # Descriptive only — "how unequal are the observed prices", NOT a verdict.
    dispersion_index = round(100.0 * min(1.0, 0.6 * gini + 0.4 * mad_norm), 1)

    gated_open = sig_count >= 1 and coverage != "limited"

    if not gated_open:
        reason = "No controlled buyer-context variable significantly moved the price (|t| <= 2)"
        if coverage == "limited":
            reason += ", and coverage is limited"
        return {
            "score": 0.0,
            "gated": False,
            "basis": reason + " — exploitation is not scored. Observed dispersion is reported descriptively.",
            "dispersion_index": dispersion_index,
            "components": {
                "jacobian_norm": 0.0,
                "gini": gini,
                "mad_normalized": mad_norm,
                "monotonic_signal": 0.0,
                "uncertainty_penalty": 0.0,
            },
            "interpretation": "No verified exploitation",
            "config": _config_dict(),
        }

    j_norm = _jacobian_norm(gradients)
    rho_s = _ordered_monotonic_signal(session)
    uncertainty = 0.0 if coverage == "strong" else 0.5  # 'partial' carries a penalty

    z = (
        _CFG.alpha_jacobian * j_norm
        + _CFG.beta_gini * gini
        + _CFG.gamma_mad * mad_norm
        + _CFG.delta_spearman * rho_s
        - _CFG.lambda_uncertainty * uncertainty
    )
    z = max(0.0, z)
    unit = 2.0 / (1.0 + math.exp(-_CFG.sigmoid_steepness * z)) - 1.0
    score = round(100.0 * unit, 1)

    return {
        "score": score,
        "gated": True,
        "basis": (
            f"{sig_count} controlled variable(s) significantly moved the price; "
            f"||J_sig||={j_norm:.3f}. Exploitation scored from the attributed "
            f"gradient, sharpened by dispersion (Gini={gini:.2f}, MAD={mad_norm:.2f}) "
            f"under {coverage} coverage."
        ),
        "dispersion_index": dispersion_index,
        "components": {
            "jacobian_norm": j_norm,
            "gini": gini,
            "mad_normalized": mad_norm,
            "monotonic_signal": round(rho_s, 4),
            "uncertainty_penalty": round(_CFG.lambda_uncertainty * uncertainty, 4),
        },
        "interpretation": _interpret_pei(score),
        "config": _config_dict(),
    }


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

def apply_math_engine_v2(session: dict) -> None:
    """Populate the Math Engine v2 fields on a finalized session, in place.

    Safe to call once at the end of ``finalize_pricing_session``: it reads only
    already-computed fields (``all_prices``, ``gradients``, ``coverage``,
    ``agents``, ``language_observations``) and NEVER mutates the verdict
    (``topology_class`` / ``discrimination_score``). Fail-soft — any error
    leaves the session fully usable.
    """
    try:
        prices = _valid_prices(session)
        if prices:
            session["robust_baseline"] = round(_ROBUST.compute_trimmed_median(prices), 2)
            session["mad_normalized_spread"] = round(_ROBUST.compute_mad_dispersion(prices), 4)
            session["gini_all"] = round(_ROBUST.compute_gini(prices), 4)
        session["sensitivity_matrix"] = build_sensitivity_matrix(session)
        session["pei"] = compute_pei(session)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[MATH-V2] non-fatal: {exc!r}", flush=True)
        session.setdefault("sensitivity_matrix", {"rows": [], "outputs": ["price"], "jacobian_norm": 0.0})
        session.setdefault("pei", {"score": 0.0, "gated": False, "interpretation": "unavailable"})
