"""Inspectable PRD-order lexicographic travel ranking."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from ..costing.engine import CostSummary
from ..domain.enums import EquivalenceClass, RedirectFriction, SupplierRiskTier
from .policy import EQUIVALENCE_PRIORITY, UNKNOWN_REVALIDATION_AGE_SECONDS


class RankKey(BaseModel):
    """Named form of the exact PRD tuple; lower values rank first."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    equivalence_priority: int
    hard_preference_violations: int
    unknown_mandatory_cost_count: int
    comparable_known_total: Decimal
    supplier_risk_tier: int
    revalidation_age_seconds: int
    redirect_friction: int
    provider_priority: int
    offer_id: str

    def as_tuple(self) -> tuple[int, int, int, Decimal, int, int, int, int, str]:
        return (
            self.equivalence_priority,
            self.hard_preference_violations,
            self.unknown_mandatory_cost_count,
            self.comparable_known_total,
            self.supplier_risk_tier,
            self.revalidation_age_seconds,
            self.redirect_friction,
            self.provider_priority,
            self.offer_id,
        )


class RankableCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    offer_id: str = Field(min_length=1, max_length=128)
    equivalence: EquivalenceClass
    costs: CostSummary
    hard_preference_violations: int = Field(default=0, ge=0)
    supplier_risk_tier: SupplierRiskTier | int = SupplierRiskTier.UNKNOWN
    revalidation_age_seconds: int | None = Field(default=None, ge=0)
    redirect_friction: RedirectFriction | int = RedirectFriction.UNAVAILABLE
    provider_priority: int = Field(default=100, ge=0)
    eligible: bool = True

    def rank_key(self) -> RankKey:
        return build_rank_key(self)


def build_rank_key(candidate: RankableCandidate) -> RankKey:
    return RankKey(
        equivalence_priority=EQUIVALENCE_PRIORITY[candidate.equivalence],
        hard_preference_violations=candidate.hard_preference_violations,
        unknown_mandatory_cost_count=candidate.costs.unknown_mandatory_cost_count,
        comparable_known_total=candidate.costs.comparable_known_total,
        supplier_risk_tier=int(candidate.supplier_risk_tier),
        revalidation_age_seconds=(
            candidate.revalidation_age_seconds
            if candidate.revalidation_age_seconds is not None
            else UNKNOWN_REVALIDATION_AGE_SECONDS
        ),
        redirect_friction=int(candidate.redirect_friction),
        provider_priority=candidate.provider_priority,
        offer_id=candidate.offer_id,
    )


def rank_candidates(
    candidates: list[RankableCandidate] | tuple[RankableCandidate, ...],
    *,
    include_ineligible: bool = False,
) -> list[RankableCandidate]:
    eligible = candidates if include_ineligible else [item for item in candidates if item.eligible]
    return sorted(eligible, key=lambda item: build_rank_key(item).as_tuple())
