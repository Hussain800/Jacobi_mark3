"""Auditable Decimal currency conversion."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_EVEN, ROUND_HALF_UP, ROUND_UP
from typing import Any

from ..domain.money import CurrencyConversionEvidence, Money, RoundingMethod


_ROUNDING = {
    RoundingMethod.HALF_EVEN: ROUND_HALF_EVEN,
    RoundingMethod.HALF_UP: ROUND_HALF_UP,
    RoundingMethod.DOWN: ROUND_DOWN,
    RoundingMethod.UP: ROUND_UP,
}


def convert_money(
    original: Money,
    target_currency: str,
    exchange_rate: Decimal | str | int,
    *,
    rate_source: str,
    rate_timestamp: datetime,
    rate_age_seconds: int,
    rounding_method: RoundingMethod = RoundingMethod.HALF_EVEN,
    quantum: Decimal = Decimal("0.01"),
) -> CurrencyConversionEvidence:
    if isinstance(exchange_rate, bool) or isinstance(exchange_rate, float):
        raise ValueError("exchange_rate must use Decimal semantics")
    rate = exchange_rate if isinstance(exchange_rate, Decimal) else Decimal(exchange_rate)
    if not rate.is_finite() or rate <= 0:
        raise ValueError("exchange_rate must be finite and positive")
    if not quantum.is_finite() or quantum <= 0:
        raise ValueError("quantum must be finite and positive")
    converted = Money(
        amount=(original.amount * rate).quantize(quantum, rounding=_ROUNDING[rounding_method]),
        currency=target_currency,
    )
    return CurrencyConversionEvidence(
        original=original,
        converted=converted,
        exchange_rate=rate,
        rate_source=rate_source,
        rate_timestamp=rate_timestamp,
        rate_age_seconds=rate_age_seconds,
        rounding_method=rounding_method,
    )

