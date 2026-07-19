"""Typed flight intent and normalized flight facts."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .enums import CabinClass, TicketingStructure, TripType
from .intent import BaselineOffer, PageContext


def _airport(value: Any) -> str:
    code = str(value).strip().upper()
    if len(code) != 3 or not code.isalpha():
        raise ValueError("airport must be a three-letter IATA code")
    return code


class PassengerMix(BaseModel):
    model_config = ConfigDict(frozen=True)

    adults: int = Field(default=1, ge=1, le=9)
    children: int = Field(default=0, ge=0, le=9)
    infants: int = Field(default=0, ge=0, le=9)
    seat_occupying_infants: int = Field(default=0, ge=0, le=9)

    @model_validator(mode="after")
    def validate_infants(self) -> "PassengerMix":
        if self.infants > self.adults:
            raise ValueError("lap infants cannot exceed adults")
        if self.adults + self.children + self.seat_occupying_infants > 9:
            raise ValueError("seat-occupying passenger count cannot exceed 9")
        return self


class BaggageRequirements(BaseModel):
    model_config = ConfigDict(frozen=True)

    cabin_bags_per_passenger: int | None = Field(default=None, ge=0, le=3)
    checked_bags_per_passenger: int | None = Field(default=None, ge=0, le=5)
    checked_bag_weight_kg: int | None = Field(default=None, ge=1, le=70)


class FlightLegIntent(BaseModel):
    model_config = ConfigDict(frozen=True)

    origin_airport: str
    destination_airport: str
    departure_date: date

    _normalize_origin = field_validator("origin_airport", mode="before")(_airport)
    _normalize_destination = field_validator("destination_airport", mode="before")(_airport)

    @model_validator(mode="after")
    def validate_route(self) -> "FlightLegIntent":
        if self.origin_airport == self.destination_airport:
            raise ValueError("flight leg origin and destination must differ")
        return self


class FlightSegmentIdentity(BaseModel):
    model_config = ConfigDict(frozen=True)

    marketing_carrier: str | None = Field(default=None, max_length=8)
    operating_carrier: str | None = Field(default=None, max_length=8)
    flight_number: str = Field(min_length=1, max_length=16)
    origin_airport: str
    destination_airport: str
    scheduled_departure: datetime
    scheduled_arrival: datetime | None = None

    _normalize_origin = field_validator("origin_airport", mode="before")(_airport)
    _normalize_destination = field_validator("destination_airport", mode="before")(_airport)

    @field_validator("marketing_carrier", "operating_carrier", mode="before")
    @classmethod
    def normalize_carrier(cls, value: Any) -> str | None:
        return None if value is None else str(value).strip().upper()

    @field_validator("flight_number", mode="before")
    @classmethod
    def normalize_flight_number(cls, value: Any) -> str:
        return "".join(str(value).upper().split())

    @model_validator(mode="after")
    def validate_segment(self) -> "FlightSegmentIdentity":
        if self.origin_airport == self.destination_airport:
            raise ValueError("flight segment origin and destination must differ")
        if self.scheduled_arrival is not None and self.scheduled_arrival <= self.scheduled_departure:
            raise ValueError("scheduled arrival must be after departure")
        return self


class SelectedFlightIdentity(BaseModel):
    model_config = ConfigDict(frozen=True)

    segments: tuple[FlightSegmentIdentity, ...] = Field(min_length=1, max_length=16)
    cabin: CabinClass | None = None
    checked_bags_included: int | None = Field(default=None, ge=0, le=5)
    fare_restriction_class: str | None = Field(default=None, max_length=128)
    refundable: bool | None = None
    changeable: bool | None = None
    ticketing_structure: TicketingStructure = TicketingStructure.PROTECTED


class FlightIntent(BaseModel):
    model_config = ConfigDict(frozen=True)

    intent_id: UUID = Field(default_factory=uuid4)
    trip_type: TripType
    legs: tuple[FlightLegIntent, ...] = Field(min_length=1, max_length=8)
    passengers: PassengerMix = Field(default_factory=PassengerMix)
    requested_cabin: CabinClass | None = None
    selected_itinerary: SelectedFlightIdentity | None = None
    baggage_requirements: BaggageRequirements | None = None
    refundability_preference: str | None = Field(default=None, max_length=128)
    changeability_preference: str | None = Field(default=None, max_length=128)
    baseline_offer: BaselineOffer | None = None
    locale: str = Field(min_length=2, max_length=32)
    market: str = Field(min_length=2, max_length=16)
    display_currency: str
    source_page: PageContext
    extracted_at: datetime

    @field_validator("display_currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: Any) -> str:
        currency = str(value).strip().upper()
        if len(currency) != 3 or not currency.isalpha():
            raise ValueError("display_currency must be a three-letter code")
        return currency

    @model_validator(mode="after")
    def validate_trip_shape(self) -> "FlightIntent":
        if self.trip_type == TripType.ONE_WAY and len(self.legs) != 1:
            raise ValueError("one-way flight intent requires exactly one leg")
        if self.trip_type == TripType.ROUND_TRIP and len(self.legs) != 2:
            raise ValueError("round-trip flight intent requires exactly two legs")
        if self.trip_type == TripType.MULTI_CITY and len(self.legs) < 2:
            raise ValueError("multi-city flight intent requires at least two legs")
        if any(later.departure_date < earlier.departure_date for earlier, later in zip(self.legs, self.legs[1:])):
            raise ValueError("flight leg dates must be nondecreasing")
        return self


class FlightOffer(BaseModel):
    """Normalized candidate flight facts used by deterministic equivalence."""

    model_config = ConfigDict(frozen=True)

    trip_type: TripType
    passengers: PassengerMix
    segments: tuple[FlightSegmentIdentity, ...] = Field(min_length=1, max_length=16)
    cabin: CabinClass | None = None
    checked_bags_included: int | None = Field(default=None, ge=0, le=5)
    baggage_cost_reliable: bool = False
    fare_restriction_class: str | None = Field(default=None, max_length=128)
    refundable: bool | None = None
    changeable: bool | None = None
    ticketing_structure: TicketingStructure = TicketingStructure.UNKNOWN
    tradeoff_disclosed: bool = False

