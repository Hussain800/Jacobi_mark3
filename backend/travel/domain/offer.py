"""Vertical-safe normalized offer envelope."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import AvailabilityStatus, ObservationMethod, ProviderEnvironment, TravelVertical
from .flight import FlightOffer
from .hotel import HotelOffer


class NormalizedOffer(BaseModel):
    model_config = ConfigDict(frozen=True)

    offer_id: str = Field(min_length=1, max_length=128)
    provider_offer_id: str = Field(min_length=1, max_length=256)
    provider_id: str = Field(min_length=1, max_length=128)
    supplier_id: str = Field(min_length=1, max_length=128)
    vertical: TravelVertical
    observation_method: ObservationMethod
    provider_environment: ProviderEnvironment
    observed_at: datetime
    expires_at: datetime | None = None
    availability: AvailabilityStatus = AvailabilityStatus.UNKNOWN
    flight: FlightOffer | None = None
    hotel: HotelOffer | None = None
    evidence_refs: tuple[str, ...] = Field(default_factory=tuple, max_length=64)

    @model_validator(mode="after")
    def validate_vertical_payload(self) -> "NormalizedOffer":
        if self.vertical == TravelVertical.FLIGHT:
            if self.flight is None or self.hotel is not None:
                raise ValueError("flight offers require only a flight payload")
        elif self.hotel is None or self.flight is not None:
            raise ValueError("hotel offers require only a hotel payload")
        if self.expires_at is not None and self.expires_at <= self.observed_at:
            raise ValueError("offer expiry must be after observation")
        return self

