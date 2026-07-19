"""Typed golden-corpus records and evaluation reports."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..costing.engine import CostCompleteness, CostComponent
from ..domain.enums import (
    CostKind,
    EquivalenceClass,
    RedirectFriction,
    SupplierRiskTier,
    TravelVertical,
)
from ..equivalence.reasons import ReasonCode


class GoldenEquivalencePair(BaseModel):
    model_config = ConfigDict(frozen=True)

    dataset_version: str = Field(pattern=r"^v\d+$")
    case_id: str = Field(min_length=1, max_length=128)
    vertical: TravelVertical
    intent: dict
    candidate: dict
    expected_classification: EquivalenceClass
    expected_reason_codes: tuple[ReasonCode, ...] = Field(default_factory=tuple)
    tags: tuple[str, ...] = Field(default_factory=tuple, max_length=16)


class ClassMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)

    support: int = Field(ge=0)
    true_positive: int = Field(ge=0)
    false_positive: int = Field(ge=0)
    false_negative: int = Field(ge=0)
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)


class EvaluationReport(BaseModel):
    model_config = ConfigDict(frozen=True)

    dataset: str
    vertical: TravelVertical
    record_count: int = Field(ge=0)
    correct_count: int = Field(ge=0)
    accuracy: float = Field(ge=0, le=1)
    confusion_matrix: dict[str, dict[str, int]]
    per_class: dict[str, ClassMetrics]
    reason_code_failures: tuple[str, ...] = Field(default_factory=tuple)
    material_mismatch_exact_violations: tuple[str, ...] = Field(default_factory=tuple)

    @property
    def passed(self) -> bool:
        return (
            self.record_count > 0
            and self.correct_count == self.record_count
            and not self.reason_code_failures
            and not self.material_mismatch_exact_violations
        )


class GoldenCostLabel(BaseModel):
    """Human-labelled expected output from ``summarize_costs``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    known_total: Decimal
    estimated_total: Decimal | None = None
    completeness: CostCompleteness
    unknown_mandatory_costs: tuple[CostKind, ...] = Field(default_factory=tuple)
    estimated_mandatory_costs: tuple[CostKind, ...] = Field(default_factory=tuple)
    applicable_mandatory_cost_count: int = Field(ge=0)

    @field_validator("known_total", "estimated_total", mode="before")
    @classmethod
    def decimal_labels(cls, value: Any) -> Any:
        if isinstance(value, (bool, float)):
            raise ValueError("cost labels must use decimal strings")
        return value


class GoldenRankingCandidate(BaseModel):
    """Labelled ranker input assembled only from public travel-domain types."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    offer_id: str = Field(min_length=1, max_length=128)
    equivalence: EquivalenceClass
    cost_components: tuple[CostComponent, ...] = Field(min_length=1, max_length=16)
    hard_preference_violations: int = Field(default=0, ge=0)
    supplier_risk_tier: SupplierRiskTier | int = SupplierRiskTier.UNKNOWN
    revalidation_age_seconds: int | None = Field(default=None, ge=0)
    redirect_friction: RedirectFriction | int = RedirectFriction.UNAVAILABLE
    provider_priority: int = Field(default=100, ge=0)
    eligible: bool = True


class GoldenCostRankingCase(BaseModel):
    """One hermetic cost label and one independently labelled ranked list."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_version: str = Field(pattern=r"^v\d+$")
    case_id: str = Field(min_length=1, max_length=128)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    cost_components: tuple[CostComponent, ...] = Field(min_length=1, max_length=16)
    expected_cost: GoldenCostLabel
    ranking_candidates: tuple[GoldenRankingCandidate, ...] = Field(
        min_length=2,
        max_length=8,
    )
    expected_ranking: tuple[str, ...] = Field(min_length=1, max_length=8)
    tags: tuple[str, ...] = Field(default_factory=tuple, max_length=16)

    @model_validator(mode="after")
    def labelled_ranking_covers_eligible_candidates(self) -> "GoldenCostRankingCase":
        candidate_ids = [candidate.offer_id for candidate in self.ranking_candidates]
        if len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError("ranking candidate offer IDs must be unique")
        expected_ids = list(self.expected_ranking)
        if len(expected_ids) != len(set(expected_ids)):
            raise ValueError("expected ranking offer IDs must be unique")
        eligible_ids = {
            candidate.offer_id for candidate in self.ranking_candidates if candidate.eligible
        }
        if set(expected_ids) != eligible_ids:
            raise ValueError("expected ranking must contain every eligible candidate exactly once")
        return self


class CostRankingEvaluationReport(BaseModel):
    """Exact offline agreement metrics; never presented as live-user quality."""

    model_config = ConfigDict(frozen=True)

    dataset: str
    record_count: int = Field(ge=0)
    cost_exact_match_count: int = Field(ge=0)
    cost_accuracy: float = Field(ge=0, le=1)
    known_total_mean_absolute_error: Decimal = Field(ge=0)
    known_total_max_absolute_error: Decimal = Field(ge=0)
    ranking_exact_match_count: int = Field(ge=0)
    ranking_exact_match_rate: float = Field(ge=0, le=1)
    ranking_pair_count: int = Field(ge=0)
    ranking_agreement: float = Field(ge=0, le=1)
    cost_failures: tuple[str, ...] = Field(default_factory=tuple)
    ranking_failures: tuple[str, ...] = Field(default_factory=tuple)

    @property
    def passed(self) -> bool:
        return (
            self.record_count > 0
            and self.cost_exact_match_count == self.record_count
            and self.ranking_exact_match_count == self.record_count
            and self.ranking_agreement == 1.0
            and not self.cost_failures
            and not self.ranking_failures
        )
