"""MAP policy evaluation helpers for the enterprise pivot.

This module intentionally handles only the narrow first wedge: comparing an
observed effective price against a product's MAP floor with a coverage gate.
Live crawling, screenshots, and legal conclusions belong elsewhere.
"""

from __future__ import annotations

from typing import Any, Optional


MIN_COVERAGE_FOR_FINDING = 50.0


def _num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def confidence_from_coverage(coverage_pct: Optional[float]) -> str:
    """Translate observation coverage into an evidence confidence label."""
    if coverage_pct is None:
        return "medium"
    if coverage_pct >= 80:
        return "high"
    if coverage_pct >= 60:
        return "medium"
    if coverage_pct >= MIN_COVERAGE_FOR_FINDING:
        return "low"
    return "insufficient"


def severity_from_map_gap(gap_pct: float) -> str:
    """Bucket a below-MAP percentage into the dashboard severity scale."""
    if gap_pct >= 15:
        return "critical"
    if gap_pct >= 8:
        return "high"
    if gap_pct >= 3:
        return "medium"
    return "low"


def evaluate_map_observation(
    *,
    product_name: str,
    sku: str,
    seller_name: str,
    target_url: str,
    observed_price: Any,
    map_floor: Any,
    currency: str = "USD",
    coverage_pct: Any = None,
) -> dict:
    """Evaluate one product/seller observation against a MAP floor.

    Returns a structured result instead of raising so callers can distinguish
    clear rows, insufficient evidence, missing policy data, and real findings.
    """
    observed = _num(observed_price)
    floor = _num(map_floor)
    coverage = _num(coverage_pct)
    confidence = confidence_from_coverage(coverage)

    if floor is None or floor <= 0:
        return {
            "is_violation": False,
            "reason": "missing_map_floor",
            "confidence": "insufficient",
        }
    if observed is None or observed <= 0:
        return {
            "is_violation": False,
            "reason": "missing_observed_price",
            "confidence": "insufficient",
        }
    if coverage is not None and coverage < MIN_COVERAGE_FOR_FINDING:
        return {
            "is_violation": False,
            "reason": "coverage_below_gate",
            "confidence": "insufficient",
            "coverage_pct": coverage,
        }
    if observed >= floor:
        return {
            "is_violation": False,
            "reason": "price_at_or_above_floor",
            "confidence": confidence,
            "observed_price": round(observed, 2),
            "map_floor": round(floor, 2),
            "currency": currency,
        }

    gap_pct = round(((floor - observed) / floor) * 100, 2)
    gap_amount = round(floor - observed, 2)
    severity = severity_from_map_gap(gap_pct)
    summary = (
        f"{seller_name} showed {currency} {observed:.2f} for {product_name} "
        f"({sku}), {gap_pct:.2f}% below the {currency} {floor:.2f} MAP floor."
    )

    return {
        "is_violation": True,
        "type": "MAP_UNDERCUT",
        "severity": severity,
        "status": "new",
        "observed_price": round(observed, 2),
        "map_floor": round(floor, 2),
        "currency": currency,
        "spread_pct": gap_pct,
        "gap_amount": gap_amount,
        "confidence": confidence,
        "coverage_pct": coverage,
        "evidence_summary": summary,
        "target_url": target_url,
    }
