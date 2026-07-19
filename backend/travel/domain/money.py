"""Decimal-authoritative travel money and conversion evidence."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RoundingMethod(str, Enum):
    HALF_EVEN = "half_even"
    HALF_UP = "half_up"
    DOWN = "down"
    UP = "up"


class Money(BaseModel):
    """Money represented without a binary floating-point round trip."""

    model_config = ConfigDict(frozen=True)

    amount: Decimal
    currency: str

    @field_validator("amount", mode="before")
    @classmethod
    def validate_decimal(cls, value: Any) -> Decimal:
        if isinstance(value, bool) or isinstance(value, float):
            raise ValueError("money amounts must be Decimal, integer, or decimal strings")
        try:
            amount = value if isinstance(value, Decimal) else Decimal(value)
        except Exception as exc:
            raise ValueError("invalid decimal amount") from exc
        if not amount.is_finite():
            raise ValueError("money amount must be finite")
        return amount

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: Any) -> str:
        currency = str(value).strip().upper()
        if len(currency) != 3 or not currency.isalpha():
            raise ValueError("currency must be a three-letter alphabetic code")
        return currency


class CurrencyConversionEvidence(BaseModel):
    """All facts needed to reproduce and audit a display-currency conversion."""

    model_config = ConfigDict(frozen=True)

    original: Money
    converted: Money
    exchange_rate: Decimal = Field(gt=0)
    rate_source: str = Field(min_length=1, max_length=200)
    rate_timestamp: datetime
    rate_age_seconds: int = Field(ge=0)
    rounding_method: RoundingMethod

    @field_validator("exchange_rate", mode="before")
    @classmethod
    def validate_rate(cls, value: Any) -> Decimal:
        if isinstance(value, bool) or isinstance(value, float):
            raise ValueError("exchange rates must use Decimal semantics")
        rate = value if isinstance(value, Decimal) else Decimal(value)
        if not rate.is_finite():
            raise ValueError("exchange rate must be finite")
        return rate

    @model_validator(mode="after")
    def validate_conversion(self) -> "CurrencyConversionEvidence":
        if self.original.currency == self.converted.currency and self.exchange_rate != Decimal("1"):
            raise ValueError("same-currency conversion must use an exchange rate of 1")
        return self

