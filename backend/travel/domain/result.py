"""Typed deterministic result contracts."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .enums import SavingClaim
from .money import Money


class SavingResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    claim: SavingClaim
    amount: Money | None = None
    reason_codes: tuple[str, ...] = Field(default_factory=tuple, max_length=64)
    explanation: str = Field(min_length=1, max_length=2000)


SavingEvaluation = SavingResult

