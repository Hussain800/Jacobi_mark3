"""Mandatory-cost state preservation and Decimal-safe aggregation."""

from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Any, Iterable

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..domain.enums import CostKind, CostState
from ..domain.money import Money


class CostCompleteness(str, Enum):
    COMPLETE = "complete"
    ESTIMATED = "estimated"
    INCOMPLETE = "incomplete"
    NOT_APPLICABLE = "not_applicable"


class CostComponent(BaseModel):
    """One explicit cost fact. Unknown and not-applicable never carry zero."""

    model_config = ConfigDict(frozen=True)

    kind: CostKind
    state: CostState
    money: Money | None = None
    mandatory: bool = True
    description: str | None = Field(default=None, max_length=500)
    evidence_ref: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_state_and_amount(self) -> "CostComponent":
        if self.state in {CostState.KNOWN, CostState.ESTIMATED}:
            if self.money is None:
                raise ValueError("known and estimated costs require money")
            if self.money.amount < 0:
                raise ValueError("cost amounts cannot be negative")
        elif self.money is not None:
            raise ValueError("unknown and not-applicable costs cannot carry money")
        return self


class CostSummary(BaseModel):
    """Inspectable aggregate; an incomplete known subtotal is never a full total."""

    model_config = ConfigDict(frozen=True)

    currency: str
    known_total: Decimal
    estimated_total: Decimal | None = None
    completeness: CostCompleteness
    unknown_mandatory_costs: tuple[CostKind, ...] = Field(default_factory=tuple)
    estimated_mandatory_costs: tuple[CostKind, ...] = Field(default_factory=tuple)
    applicable_mandatory_cost_count: int = Field(ge=0)

    @field_validator("known_total", "estimated_total", mode="before")
    @classmethod
    def decimal_totals(cls, value: Any) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, bool) or isinstance(value, float):
            raise ValueError("cost totals must use Decimal semantics")
        result = value if isinstance(value, Decimal) else Decimal(value)
        if not result.is_finite():
            raise ValueError("cost totals must be finite")
        return result

    @property
    def total_complete(self) -> bool:
        return self.completeness == CostCompleteness.COMPLETE

    @property
    def unknown_mandatory_cost_count(self) -> int:
        return len(self.unknown_mandatory_costs)

    @property
    def estimated_mandatory_cost_count(self) -> int:
        return len(self.estimated_mandatory_costs)

    @property
    def comparable_known_total(self) -> Decimal:
        return self.known_total

    @property
    def best_available_total(self) -> Decimal:
        return self.estimated_total if self.estimated_total is not None else self.known_total


def summarize_costs(
    components: Iterable[CostComponent],
    currency: str | None = None,
) -> CostSummary:
    """Aggregate mandatory payable costs while retaining every uncertainty state."""

    items = tuple(components)
    normalized_currency = currency.strip().upper() if currency is not None else None
    money_currencies = {item.money.currency for item in items if item.money is not None}
    if normalized_currency is None:
        if len(money_currencies) != 1:
            raise ValueError("currency is required when costs do not establish exactly one currency")
        normalized_currency = next(iter(money_currencies))
    if len(normalized_currency) != 3 or not normalized_currency.isalpha():
        raise ValueError("currency must be a three-letter alphabetic code")
    if any(component_currency != normalized_currency for component_currency in money_currencies):
        raise ValueError("all cost components must use the summary currency")

    known = Decimal("0")
    estimated = Decimal("0")
    unknown_kinds: list[CostKind] = []
    estimated_kinds: list[CostKind] = []
    applicable_count = 0

    for item in items:
        if not item.mandatory or item.state == CostState.NOT_APPLICABLE:
            continue
        applicable_count += 1
        if item.state == CostState.UNKNOWN:
            unknown_kinds.append(item.kind)
        elif item.state == CostState.ESTIMATED:
            assert item.money is not None
            estimated += item.money.amount
            estimated_kinds.append(item.kind)
        else:
            assert item.money is not None
            known += item.money.amount

    if unknown_kinds:
        completeness = CostCompleteness.INCOMPLETE
    elif estimated_kinds:
        completeness = CostCompleteness.ESTIMATED
    elif applicable_count:
        completeness = CostCompleteness.COMPLETE
    else:
        completeness = CostCompleteness.NOT_APPLICABLE

    return CostSummary(
        currency=normalized_currency,
        known_total=known,
        estimated_total=known + estimated if estimated_kinds else None,
        completeness=completeness,
        unknown_mandatory_costs=tuple(unknown_kinds),
        estimated_mandatory_costs=tuple(estimated_kinds),
        applicable_mandatory_cost_count=applicable_count,
    )


aggregate_mandatory_costs = summarize_costs

