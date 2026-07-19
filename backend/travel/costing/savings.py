"""Deterministic saving-claim classification."""

from __future__ import annotations

from ..domain.enums import AvailabilityStatus, EquivalenceClass, SavingClaim
from ..domain.money import Money
from ..domain.result import SavingResult
from .engine import CostSummary


def classify_saving(
    baseline: CostSummary,
    candidate: CostSummary,
    equivalence: EquivalenceClass,
    *,
    availability: AvailabilityStatus = AvailabilityStatus.CURRENT,
    revalidation_age_seconds: int | None = None,
    max_fresh_age_seconds: int = 900,
    hard_preference_violations: int = 0,
) -> SavingResult:
    """Return one PRD saving class without promoting an incomplete subtotal."""

    reasons: list[str] = []
    if baseline.currency != candidate.currency:
        return SavingResult(
            claim=SavingClaim.CANNOT_COMPARE,
            reason_codes=("CURRENCY_MISMATCH",),
            explanation="Baseline and candidate costs are in different currencies.",
        )
    if equivalence in {EquivalenceClass.REJECTED, EquivalenceClass.INSUFFICIENT_EVIDENCE}:
        return SavingResult(
            claim=SavingClaim.CANNOT_COMPARE,
            reason_codes=("EQUIVALENCE_NOT_ESTABLISHED",),
            explanation="The candidate is not sufficiently equivalent for a saving comparison.",
        )

    saving = baseline.known_total - candidate.known_total
    amount = Money(amount=saving, currency=baseline.currency) if saving > 0 else None

    any_unknown = bool(
        baseline.unknown_mandatory_cost_count or candidate.unknown_mandatory_cost_count
    )
    any_estimated = bool(
        baseline.estimated_mandatory_cost_count or candidate.estimated_mandatory_cost_count
    )
    if any_unknown:
        reasons.append("MANDATORY_FEE_UNKNOWN")
    if any_estimated:
        reasons.append("TOTAL_ESTIMATED")
    if availability != AvailabilityStatus.CURRENT:
        reasons.append("AVAILABILITY_NOT_CURRENT")
    fresh = revalidation_age_seconds is not None and revalidation_age_seconds <= max_fresh_age_seconds
    if not fresh:
        reasons.append("STALE_OFFER")
    if hard_preference_violations:
        reasons.append("HARD_PREFERENCE_VIOLATION")

    if saving <= 0:
        if baseline.total_complete and candidate.total_complete:
            return SavingResult(
                claim=SavingClaim.NONE,
                reason_codes=tuple(reasons),
                explanation="The candidate does not have a lower complete mandatory-cost total.",
            )
        return SavingResult(
            claim=SavingClaim.CANNOT_COMPARE,
            reason_codes=tuple(reasons or ["TOTAL_INCOMPLETE"]),
            explanation="Incomplete mandatory costs prevent a conclusive saving comparison.",
        )

    verified = (
        equivalence == EquivalenceClass.EXACT
        and baseline.total_complete
        and candidate.total_complete
        and availability == AvailabilityStatus.CURRENT
        and fresh
        and hard_preference_violations == 0
    )
    if verified:
        return SavingResult(
            claim=SavingClaim.VERIFIED,
            amount=amount,
            explanation="The lower price is exact, complete, current, and freshly revalidated.",
        )
    if any_unknown or equivalence == EquivalenceClass.SIMILAR_NOT_EQUIVALENT:
        claim = SavingClaim.POTENTIAL
        explanation = "The visible known subtotal is lower, but material uncertainty remains."
    else:
        claim = SavingClaim.CONDITIONAL
        explanation = "The saving depends on a disclosed trade-off, estimate, or verification condition."
    return SavingResult(
        claim=claim,
        amount=amount,
        reason_codes=tuple(reasons),
        explanation=explanation,
    )


evaluate_saving = classify_saving

