"""Inspectable equivalence facts and deterministic classification reduction."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..domain.enums import EquivalenceClass
from .reasons import ReasonCode


class FieldDisposition(str, Enum):
    MATCH = "match"
    TRADEOFF = "tradeoff"
    SIMILAR = "similar"
    REJECTED = "rejected"
    INSUFFICIENT = "insufficient"


class FieldComparison(BaseModel):
    model_config = ConfigDict(frozen=True)

    field: str = Field(min_length=1, max_length=128)
    disposition: FieldDisposition
    baseline: str | None = Field(default=None, max_length=500)
    candidate: str | None = Field(default=None, max_length=500)
    material: bool = True
    reason_code: ReasonCode | None = None
    explanation: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_reason(self) -> "FieldComparison":
        if self.disposition != FieldDisposition.MATCH and self.reason_code is None:
            raise ValueError("non-matching field comparisons require a reason code")
        return self


class EquivalenceResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    classification: EquivalenceClass
    reason_codes: tuple[ReasonCode, ...] = Field(default_factory=tuple)
    comparisons: tuple[FieldComparison, ...] = Field(default_factory=tuple)
    explanation: str = Field(min_length=1, max_length=4000)

    @property
    def is_exact(self) -> bool:
        return self.classification == EquivalenceClass.EXACT


def classify_comparisons(comparisons: list[FieldComparison]) -> EquivalenceResult:
    dispositions = {comparison.disposition for comparison in comparisons if comparison.material}
    if FieldDisposition.REJECTED in dispositions:
        classification = EquivalenceClass.REJECTED
    elif FieldDisposition.INSUFFICIENT in dispositions:
        classification = EquivalenceClass.INSUFFICIENT_EVIDENCE
    elif FieldDisposition.SIMILAR in dispositions:
        classification = EquivalenceClass.SIMILAR_NOT_EQUIVALENT
    elif FieldDisposition.TRADEOFF in dispositions:
        classification = EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF
    else:
        classification = EquivalenceClass.EXACT

    reasons = tuple(
        dict.fromkeys(
            comparison.reason_code
            for comparison in comparisons
            if comparison.reason_code is not None
        )
    )
    nonmatches = [
        comparison.explanation
        for comparison in comparisons
        if comparison.disposition != FieldDisposition.MATCH
    ]
    explanation = (
        "All material equivalence fields match."
        if not nonmatches
        else " ".join(nonmatches)
    )
    return EquivalenceResult(
        classification=classification,
        reason_codes=reasons,
        comparisons=tuple(comparisons),
        explanation=explanation,
    )


def comparison(
    field: str,
    disposition: FieldDisposition,
    explanation: str,
    *,
    baseline: object | None = None,
    candidate: object | None = None,
    reason_code: ReasonCode | None = None,
    material: bool = True,
) -> FieldComparison:
    return FieldComparison(
        field=field,
        disposition=disposition,
        baseline=None if baseline is None else str(baseline),
        candidate=None if candidate is None else str(candidate),
        reason_code=reason_code,
        explanation=explanation,
        material=material,
    )

