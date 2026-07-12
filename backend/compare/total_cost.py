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

from .schemas import Money, OfferObservation, PriceBreakdown, ReasonCode

_UNKNOWN_CODE = {
    "shipping": ReasonCode.SHIPPING_UNKNOWN,
    "taxes": ReasonCode.TAX_UNKNOWN,
    "duties": ReasonCode.DUTY_UNKNOWN,
}

# MVP scope is UAE-domestic (PDR: cross-border out of scope): taxes are
# displayed VAT-inclusive and import duty does not apply, so a missing
# taxes/duties field means "not applicable", not "unknown". Shipping is the
# one component that genuinely varies per merchant and MUST be observed.
_REQUIRED_COMPONENTS = ("shipping",)


def compute_payable(price: PriceBreakdown, currency: str) -> PriceBreakdown:
    """Fill payable_total / total_complete / unknown_components. Pure."""
    unknown: List[str] = []
    total: Decimal = price.item.quantized()

    for name in ("shipping", "taxes", "duties"):
        component: Optional[Money] = getattr(price, name)
        if component is None:
            if name in _REQUIRED_COMPONENTS:
                unknown.append(name)
            continue
        total += component.quantized()

    for fee in price.mandatory_fees:
        total += fee.quantized()

    if price.verified_discount is not None:
        total -= price.verified_discount.quantized()

    return price.model_copy(update={
        "payable_total": Money(amount=total, currency=currency),
        "total_complete": not unknown,
        "unknown_components": unknown,
    })


def apply_total(offer: OfferObservation) -> OfferObservation:
    """Return the offer with its payable breakdown computed."""
    return offer.model_copy(update={
        "price": compute_payable(offer.price, offer.price.item.currency),
    })


def unknown_reason_codes(price: PriceBreakdown) -> List[ReasonCode]:
    return [_UNKNOWN_CODE[c] for c in price.unknown_components if c in _UNKNOWN_CODE]
