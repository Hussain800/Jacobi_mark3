"""Cost-completeness predicates used by saving and ranking policy."""

from __future__ import annotations

from .engine import CostCompleteness, CostSummary


def has_complete_known_mandatory_costs(summary: CostSummary) -> bool:
    return summary.completeness == CostCompleteness.COMPLETE


def has_unknown_mandatory_costs(summary: CostSummary) -> bool:
    return summary.unknown_mandatory_cost_count > 0


def is_price_comparable(baseline: CostSummary, candidate: CostSummary) -> bool:
    return (
        baseline.currency == candidate.currency
        and baseline.total_complete
        and candidate.total_complete
    )

