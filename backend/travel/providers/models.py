"""Normalized, provider-local travel payloads.

All money uses ``Decimal``. Unknown baggage and hotel fees stay explicit so a
downstream ranker cannot accidentally treat an omitted component as zero.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .base import ProviderBatch, ProviderEnvironment, TravelVertical


class FlightSearchRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    origin: str
    destination: str
    departure_date: str
    return_date: str | None = None
    adults: int = Field(default=1, ge=1, le=9)
    children: int = Field(default=0, ge=0, le=9)
    infants: int = Field(default=0, ge=0, le=9)
    travel_class: str | None = None
    non_stop: bool = False
    currency: str | None = None
    max_offers: int = Field(default=20, ge=1, le=100)

    @field_validator("origin", "destination")
    @classmethod
    def _iata(cls, value: str) -> str:
        value = str(value).strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("airport codes must be three ASCII letters")
        return value

    @field_validator("travel_class")
    @classmethod
    def _travel_class(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        allowed = {"ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"}
        if normalized not in allowed:
            raise ValueError(f"unsupported travel class: {value}")
        return normalized

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("currency must be a three-letter code")
        return value


class HotelSearchRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    check_in_date: str
    check_out_date: str
    adults: int = Field(default=1, ge=1, le=9)
    room_quantity: int = Field(default=1, ge=1, le=9)
    city_code: str | None = None
    hotel_ids: tuple[str, ...] = ()
    currency: str | None = None
    radius: int = Field(default=20, ge=1, le=300)
    radius_unit: Literal["KM", "MILE"] = "KM"
    max_hotels: int = Field(default=20, ge=1, le=50)

    @field_validator("city_code")
    @classmethod
    def _city_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("city_code must be a three-letter IATA city code")
        return value

    @field_validator("hotel_ids")
    @classmethod
    def _hotel_ids(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        cleaned = tuple(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))
        if any(len(item) > 64 for item in cleaned):
            raise ValueError("hotel ids must be 64 characters or fewer")
        return cleaned

    @field_validator("currency")
    @classmethod
    def _hotel_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("currency must be a three-letter code")
        return value

    def model_post_init(self, __context: Any) -> None:
        if not self.city_code and not self.hotel_ids:
            raise ValueError("city_code or hotel_ids is required")


class PriceComponent(BaseModel):
    model_config = ConfigDict(frozen=True)

    kind: str
    amount: Decimal | None = None
    currency: str | None = None
    included_in_total: bool | None = None
    known: bool = True
    description: str | None = None


class BaggageAllowance(BaseModel):
    model_config = ConfigDict(frozen=True)

    traveler_id: str
    segment_id: str
    quantity: int | None = None
    weight: Decimal | None = None
    weight_unit: str | None = None
    known: bool = False


class FlightSegment(BaseModel):
    model_config = ConfigDict(frozen=True)

    segment_id: str
    departure_airport: str
    departure_at: str
    arrival_airport: str
    arrival_at: str
    marketing_carrier: str
    marketing_flight_number: str
    operating_carrier: str | None = None
    duration: str | None = None
    stops: int = 0
    aircraft_code: str | None = None
    cabin: str | None = None
    booking_class: str | None = None
    fare_basis: str | None = None


class FlightItinerary(BaseModel):
    model_config = ConfigDict(frozen=True)

    duration: str | None = None
    segments: list[FlightSegment]


class NormalizedFlightOffer(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    kind: Literal["flight"] = "flight"
    provider_id: str = "amadeus"
    provider_offer_id: str
    environment: ProviderEnvironment
    source: str | None = None
    one_way: bool = False
    instant_ticketing_required: bool = False
    last_ticketing_date: str | None = None
    bookable_seats: int | None = None
    currency: str
    base_amount: Decimal | None = None
    total_amount: Decimal
    grand_total_amount: Decimal
    price_components: list[PriceComponent] = Field(default_factory=list)
    itineraries: list[FlightItinerary]
    baggage: list[BaggageAllowance] = Field(default_factory=list)
    baggage_known: bool = False
    mandatory_costs_complete: bool = False
    unknown_costs: list[str] = Field(default_factory=list)
    provider_payload: dict[str, Any] = Field(default_factory=dict, exclude=True, repr=False)


class FlightOfferBatch(ProviderBatch):
    vertical: TravelVertical = TravelVertical.flight
    offers: list[NormalizedFlightOffer] = Field(default_factory=list)


class HotelTax(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str | None = None
    amount: Decimal | None = None
    percentage: Decimal | None = None
    currency: str | None = None
    included: bool | None = None
    pricing_frequency: str | None = None
    pricing_mode: str | None = None
    description: str | None = None


class NormalizedHotelOffer(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    kind: Literal["hotel"] = "hotel"
    provider_id: str = "amadeus"
    provider_offer_id: str
    environment: ProviderEnvironment
    hotel_id: str
    hotel_name: str | None = None
    chain_code: str | None = None
    city_code: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    address_lines: list[str] = Field(default_factory=list)
    country_code: str | None = None
    check_in_date: str | None = None
    check_out_date: str | None = None
    adults: int | None = None
    room_quantity: int | None = None
    room_type: str | None = None
    room_category: str | None = None
    room_description: str | None = None
    board_type: str | None = None
    currency: str
    base_amount: Decimal | None = None
    total_amount: Decimal
    taxes: list[HotelTax] = Field(default_factory=list)
    payment_type: str | None = None
    cancellation_policy_known: bool = False
    mandatory_costs_complete: bool = False
    unknown_costs: list[str] = Field(default_factory=list)
    provider_payload: dict[str, Any] = Field(default_factory=dict, exclude=True, repr=False)


class HotelOfferBatch(ProviderBatch):
    vertical: TravelVertical = TravelVertical.hotel
    offers: list[NormalizedHotelOffer] = Field(default_factory=list)


class RevalidationStatus(str, Enum):
    confirmed = "confirmed"
    changed = "changed"
    unavailable = "unavailable"


class FlightRevalidationResult(BaseModel):
    provider_id: str = "amadeus"
    environment: ProviderEnvironment
    status: RevalidationStatus
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    previous_offer: NormalizedFlightOffer | None = None
    current_offer: NormalizedFlightOffer | None = None
    changes: list[str] = Field(default_factory=list)
    reason: str | None = None



