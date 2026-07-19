"""Typed hotel intent and normalized hotel facts."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .enums import PaymentTiming
from .intent import BaselineOffer, PageContext


class PropertyHint(BaseModel):
    model_config = ConfigDict(frozen=True)

    provider_property_id: str | None = Field(default=None, max_length=128)
    canonical_property_id: str | None = Field(default=None, max_length=128)
    official_property_id: str | None = Field(default=None, max_length=128)
    name: str = Field(min_length=1, max_length=300)
    address: str | None = Field(default=None, max_length=500)
    postal_code: str | None = Field(default=None, max_length=32)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=64)
    official_domain: str | None = Field(default=None, max_length=253)
    reviewed_aliases: tuple[str, ...] = Field(default_factory=tuple, max_length=64)

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def decimal_coordinates(cls, value: Any) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, bool) or isinstance(value, float):
            raise ValueError("coordinates must use Decimal semantics")
        result = value if isinstance(value, Decimal) else Decimal(value)
        if not result.is_finite():
            raise ValueError("coordinates must be finite")
        return result


class RoomOccupancy(BaseModel):
    model_config = ConfigDict(frozen=True)

    adults: int = Field(default=1, ge=1, le=20)
    children: int = Field(default=0, ge=0, le=20)
    children_ages: tuple[int, ...] = Field(default_factory=tuple, max_length=20)

    @model_validator(mode="after")
    def validate_children(self) -> "RoomOccupancy":
        if self.children_ages and len(self.children_ages) != self.children:
            raise ValueError("children_ages count must match children")
        if any(age < 0 or age > 17 for age in self.children_ages):
            raise ValueError("child ages must be between 0 and 17")
        return self


class SelectedHotelRate(BaseModel):
    model_config = ConfigDict(frozen=True)

    room_name: str | None = Field(default=None, max_length=300)
    room_family: str | None = Field(default=None, max_length=200)
    bed_configuration: tuple[str, ...] | None = Field(default=None, max_length=8)
    meal_plan: str | None = Field(default=None, max_length=128)
    refundable: bool | None = None
    cancellation_deadline: datetime | None = None
    payment_timing: PaymentTiming | None = None
    occupancy: RoomOccupancy
    private_bathroom: bool | None = None
    guaranteed_room: bool | None = None


class HotelIntent(BaseModel):
    model_config = ConfigDict(frozen=True)

    intent_id: UUID = Field(default_factory=uuid4)
    property_hint: PropertyHint
    check_in: date
    check_out: date
    rooms: tuple[RoomOccupancy, ...] = Field(min_length=1, max_length=9)
    selected_rate: SelectedHotelRate | None = None
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
    def validate_stay(self) -> "HotelIntent":
        if self.check_out <= self.check_in:
            raise ValueError("hotel check_out must be after check_in")
        if self.selected_rate is not None and len(self.rooms) == 1:
            if self.selected_rate.occupancy != self.rooms[0]:
                raise ValueError("selected rate occupancy must match requested room occupancy")
        return self


class HotelOffer(BaseModel):
    """Normalized candidate hotel facts used by deterministic equivalence."""

    model_config = ConfigDict(frozen=True)

    property: PropertyHint
    check_in: date
    check_out: date
    rooms: tuple[RoomOccupancy, ...] = Field(min_length=1, max_length=9)
    rate: SelectedHotelRate
    mandatory_fee_basis_complete: bool | None = None
    payment_timing_material: bool = True
    tradeoff_disclosed: bool = False

