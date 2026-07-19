"""Explicit cost-state and conditional-saving regression tests."""

from decimal import Decimal

import pytest

from compare.schemas import CostLine, CostState, Money, PriceBreakdown
from compare.total_cost import compute_payable


def _line(kind, amount, *, state=CostState.known, eligible=None):
    return CostLine(
        kind=kind,
        state=state,
        amount=Money(amount=amount) if amount is not None else None,
        user_eligible=eligible,
    )


def test_all_supported_guaranteed_costs_are_included_decimal_safely():
    result = compute_payable(PriceBreakdown(
        item=Money(amount="1000.00"),
        shipping=Money(amount="10.00"),
        marketplace_fees=[_line("marketplace_fee", "5.50")],
        payment_fees=[_line("card_fee", "2.25")],
        fx_adjustments=[_line("fx_spread", "1.25")],
        mandatory_service_costs=[_line("service", "3.00")],
        coupons=[_line("public_coupon", "20.00", eligible=True)],
        membership_discounts=[_line("public_membership", "10.00", eligible=True)],
        student_discounts=[_line("student", "50.00", eligible=False)],
        cashback=[_line("cashback", "100.00", eligible=True)],
    ), "AED")

    assert result.total_complete
    assert result.payable_total.amount == Decimal("992.00")
    assert [line.kind for line in result.conditional_savings] == ["student", "cashback"]


def test_estimated_and_unknown_components_never_create_complete_total():
    result = compute_payable(PriceBreakdown(
        item=Money(amount="1000"),
        shipping=Money(amount="20"),
        shipping_state=CostState.estimated,
        payment_fees=[CostLine(kind="payment_fee", state=CostState.unknown)],
    ), "AED")

    assert not result.total_complete
    assert result.payable_total.amount == Decimal("1020.00")
    assert result.estimated_components == ["shipping"]
    assert result.unknown_components == ["payment_fee"]


def test_not_applicable_cost_is_not_silently_treated_as_unknown():
    result = compute_payable(PriceBreakdown(
        item=Money(amount="1000"),
        shipping=Money(amount="0"),
        taxes_state=CostState.not_applicable,
        duties_state=CostState.not_applicable,
    ), "AED")
    assert result.total_complete
    assert result.unknown_components == []


def test_component_currency_mismatch_is_rejected():
    with pytest.raises(ValueError, match="currency"):
        compute_payable(PriceBreakdown(
            item=Money(amount="1000", currency="AED"),
            shipping=Money(amount="10", currency="USD"),
        ), "AED")
