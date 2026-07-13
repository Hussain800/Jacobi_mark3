from datetime import datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from travel.costing import CostComponent, classify_saving, convert_money, summarize_costs
from travel.domain import (
    AvailabilityStatus,
    CostKind,
    CostState,
    EquivalenceClass,
    Money,
    RoundingMethod,
    SavingClaim,
)


def component(kind: CostKind, state: CostState, amount: str | None) -> CostComponent:
    return CostComponent(
        kind=kind,
        state=state,
        money=None if amount is None else Money(amount=amount, currency="AED"),
    )


def test_cost_states_do_not_encode_unknown_as_zero() -> None:
    unknown = component(CostKind.BAGGAGE, CostState.UNKNOWN, None)
    assert unknown.money is None
    with pytest.raises(ValidationError):
        component(CostKind.BAGGAGE, CostState.UNKNOWN, "0")
    with pytest.raises(ValidationError):
        component(CostKind.TAXES, CostState.KNOWN, None)


def test_summary_preserves_known_estimated_and_unknown_mandatory_costs() -> None:
    summary = summarize_costs(
        (
            component(CostKind.BASE_FARE, CostState.KNOWN, "500"),
            component(CostKind.TAXES, CostState.ESTIMATED, "25.50"),
            component(CostKind.BAGGAGE, CostState.UNKNOWN, None),
            component(CostKind.PAYMENT_FEE, CostState.NOT_APPLICABLE, None),
        ),
        "AED",
    )

    assert summary.known_total == Decimal("500")
    assert summary.estimated_total == Decimal("525.50")
    assert summary.unknown_mandatory_cost_count == 1
    assert not summary.total_complete


def test_verified_saving_requires_all_strict_gates() -> None:
    baseline = summarize_costs((component(CostKind.BASE_FARE, CostState.KNOWN, "600"),), "AED")
    candidate = summarize_costs((component(CostKind.BASE_FARE, CostState.KNOWN, "500"),), "AED")

    result = classify_saving(
        baseline,
        candidate,
        EquivalenceClass.EXACT,
        availability=AvailabilityStatus.CURRENT,
        revalidation_age_seconds=30,
    )

    assert result.claim == SavingClaim.VERIFIED
    assert result.amount == Money(amount="100", currency="AED")


def test_unknown_mandatory_cost_can_only_produce_potential_saving() -> None:
    baseline = summarize_costs((component(CostKind.BASE_FARE, CostState.KNOWN, "600"),), "AED")
    candidate = summarize_costs(
        (
            component(CostKind.BASE_FARE, CostState.KNOWN, "450"),
            component(CostKind.BAGGAGE, CostState.UNKNOWN, None),
        ),
        "AED",
    )

    result = classify_saving(
        baseline,
        candidate,
        EquivalenceClass.EXACT,
        revalidation_age_seconds=10,
    )

    assert result.claim == SavingClaim.POTENTIAL
    assert "MANDATORY_FEE_UNKNOWN" in result.reason_codes


def test_conversion_retains_original_rate_age_source_and_rounding() -> None:
    conversion = convert_money(
        Money(amount="100", currency="USD"),
        "AED",
        Decimal("3.6725"),
        rate_source="test-feed",
        rate_timestamp=datetime(2026, 7, 13, tzinfo=timezone.utc),
        rate_age_seconds=60,
        rounding_method=RoundingMethod.HALF_EVEN,
    )

    assert conversion.original.amount == Decimal("100")
    assert conversion.converted == Money(amount="367.25", currency="AED")
    assert conversion.exchange_rate == Decimal("3.6725")
