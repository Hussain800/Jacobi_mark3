"""Typed golden-corpus records and evaluation reports."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..domain.enums import EquivalenceClass, TravelVertical
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
