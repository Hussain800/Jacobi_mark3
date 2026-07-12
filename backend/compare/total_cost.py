"""Jacobi Compare — all-in payable total (PDR FR-7).

payable_total = item + shipping + taxes + duties + mandatory_fees
                - verified_instant_discount

Unknown components are NEVER treated as zero: payable_total is the
known-components subtotal, `total_complete` says whether it is the full
price, and `unknown_components` names what is missing. Ranking only awards
the "Save AED X" headline to complete totals.
"""

from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from .schemas import CostLine, CostState, Money, OfferObservation, PriceBreakdown, ReasonCode

_UNKNOWN_CODE = {
    "shipping": ReasonCode.SHIPPING_UNKNOWN,
    "taxes": ReasonCode.TAX_UNKNOWN,
    "duties": ReasonCode.DUTY_UNKNOWN,
}

def compute_payable(price: PriceBreakdown, currency: str) -> PriceBreakdown:
    """Calculate guaranteed payable total without erasing uncertainty."""
    unknown: List[str] = []
    estimated: List[str] = []
    conditional: List[CostLine] = []
    total: Decimal = price.item.quantized()

    def checked_amount(money: Money, name: str) -> Decimal:
        if money.currency != currency:
            raise ValueError(
                f"{name} currency {money.currency} does not match total currency {currency}"
            )
        return money.quantized()

    checked_amount(price.item, "item")

    for name in ("shipping", "taxes", "duties"):
        component: Optional[Money] = getattr(price, name)
        state: CostState = getattr(price, f"{name}_state")
        if state == CostState.not_applicable:
            continue
        if state == CostState.unknown:
            unknown.append(name)
            continue
        if component is None:
            raise ValueError(f"{name} state {state.value} requires an amount")
        total += checked_amount(component, name)
        if state == CostState.estimated:
            estimated.append(name)

    for fee in price.mandatory_fees:
        total += checked_amount(fee, "mandatory_fee")

    def add_cost_lines(lines: List[CostLine]) -> None:
        nonlocal total
        for line in lines:
            if line.state == CostState.not_applicable:
                continue
            if line.state == CostState.unknown:
                unknown.append(line.kind)
                continue
            total += checked_amount(line.amount, line.kind)
            if line.state == CostState.estimated:
                estimated.append(line.kind)

    add_cost_lines(price.marketplace_fees)
    add_cost_lines(price.payment_fees)
    add_cost_lines(price.fx_adjustments)
    add_cost_lines(price.mandatory_service_costs)

    def apply_discounts(lines: List[CostLine]) -> None:
        nonlocal total
        for line in lines:
            guaranteed = (
                line.state == CostState.known
                and line.amount is not None
                and line.user_eligible is not False
                and (line.user_eligible is True or not line.eligibility)
            )
            if guaranteed:
                total -= checked_amount(line.amount, line.kind)
            else:
                conditional.append(line)

    apply_discounts(price.coupons)
    apply_discounts(price.membership_discounts)
    apply_discounts(price.student_discounts)
    conditional.extend(price.cashback)

    if price.verified_discount is not None:
        total -= checked_amount(price.verified_discount, "verified_discount")

    return price.model_copy(update={
        "payable_total": Money(amount=total, currency=currency),
        "total_complete": not unknown and not estimated,
        "unknown_components": list(dict.fromkeys(unknown)),
        "estimated_components": list(dict.fromkeys(estimated)),
        "conditional_savings": conditional,
    })


def apply_total(offer: OfferObservation) -> OfferObservation:
    """Return the offer with its payable breakdown computed."""
    return offer.model_copy(update={
        "price": compute_payable(offer.price, offer.price.item.currency),
    })


def unknown_reason_codes(price: PriceBreakdown) -> List[ReasonCode]:
    return [_UNKNOWN_CODE[c] for c in price.unknown_components if c in _UNKNOWN_CODE]
