"""Bounded, typed evidence references for travel facts."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .enums import (
    EvidenceKind,
    EvidenceSourceType,
    EvidenceStrength,
    ObservationMethod,
    ProviderEnvironment,
)


class TravelEvidence(BaseModel):
    model_config = ConfigDict(frozen=True)

    evidence_id: str = Field(min_length=1, max_length=128)
    provider_id: str = Field(min_length=1, max_length=128)
    kind: EvidenceKind
    source_type: EvidenceSourceType
    source_reference: str = Field(min_length=1, max_length=512)
    observation_method: ObservationMethod
    provider_environment: ProviderEnvironment
    captured_at: datetime
    content_hash: str = Field(min_length=32, max_length=128)
    strength: EvidenceStrength = EvidenceStrength.DIRECT
    summary: str = Field(default="", max_length=1000)
    limitations: tuple[str, ...] = Field(default_factory=tuple, max_length=32)
    agentcore_manifest_id: str | None = Field(default=None, max_length=128)

    @field_validator("content_hash")
    @classmethod
    def validate_hash(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized.isalnum():
            raise ValueError("content_hash must be an alphanumeric digest")
        return normalized

