"""Pure, deterministic predicates for evidence-grade result labels.

This module does not calculate prices or perform I/O.  It makes the evidence
boundary explicit so callers can consistently distinguish observed spread,
controlled attribution, and a decision that is safe to present.
"""

from __future__ import annotations

from typing import Iterable, Mapping


LIMITED_COVERAGE = "limited"


def significant_controlled_gradients(
    gradients: Iterable[Mapping[str, object]] | None,
) -> tuple[Mapping[str, object], ...]:
    """Return the significant controlled gradients from an engine result."""
    return tuple(gradient for gradient in (gradients or ()) if gradient.get("significant"))


def has_significant_controlled_gradient(
    gradients: Iterable[Mapping[str, object]] | None,
) -> bool:
    """Whether a controlled price gradient supports attribution."""
    return bool(significant_controlled_gradients(gradients))


def coverage_allows_attribution(coverage: object) -> bool:
    """Limited coverage can report observations but cannot support a verdict."""
    return coverage != LIMITED_COVERAGE


def project_evidence_outcome(
    *,
    coverage: object,
    gradients: Iterable[Mapping[str, object]] | None,
    observed_spread_pct: object = 0.0,
) -> dict[str, object]:
    """Project facts into a deterministic, evidence-safe decision label.

    ``observed_spread_pct`` is descriptive only.  It becomes an attributable
    result only when a significant controlled gradient exists and coverage is
    not limited.  The returned mapping intentionally uses stable primitive
    values so it can be reused in tests and future result projections.
    """
    significant_count = len(significant_controlled_gradients(gradients))
    try:
        has_observed_spread = float(observed_spread_pct or 0.0) >= 2.0
    except (TypeError, ValueError):
        has_observed_spread = False

    attribution_allowed = coverage_allows_attribution(coverage)
    has_attribution = significant_count > 0
    if not attribution_allowed:
        decision = "insufficient_data"
    elif not has_attribution:
        decision = "indeterminate" if has_observed_spread else "uniform"
    else:
        decision = "attributed"

    return {
        "coverage": coverage,
        "decision": decision,
        "significant_gradient_count": significant_count,
        "has_observed_spread": has_observed_spread,
        "attribution_allowed": attribution_allowed,
        "pei_eligible": attribution_allowed and has_attribution,
    }
