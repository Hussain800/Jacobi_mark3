"""Typed public and worker-facing travel search contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..costing import CostComponent
from ..domain import FlightIntent, HotelIntent


class FlightSearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vertical: Literal["flight"] = "flight"
    intent: FlightIntent
    baseline_costs: tuple[CostComponent, ...] = ()
    requested_providers: tuple[str, ...] = ()


class HotelSearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vertical: Literal["hotel"] = "hotel"
    intent: HotelIntent
    baseline_costs: tuple[CostComponent, ...] = ()
    requested_providers: tuple[str, ...] = ()


TravelSearchInput = Annotated[
    FlightSearchInput | HotelSearchInput,
    Field(discriminator="vertical"),
]


class AcceptedSearch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    search_id: str
    status: str
    vertical: Literal["flight", "hotel"]
    capability_token: str | None = None
    capability_expires_at: datetime | None = None
    events_url: str
    result_url: str
    idempotent_replay: bool = False


class SearchSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    search_id: str
    vertical: Literal["flight", "hotel"]
    status: str
    created_at: datetime
    updated_at: datetime
    provider_attempts: list[dict[str, Any]] = Field(default_factory=list)
    offers: list[dict[str, Any]] = Field(default_factory=list)
    ranking: list[str] = Field(default_factory=list)
    selected_offer_id: str | None = None
    saving: dict[str, Any] | None = None
    degraded_reasons: list[str] = Field(default_factory=list)


class RevalidationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_total: str | None = Field(default=None, max_length=64)
    expected_currency: str | None = Field(default=None, min_length=3, max_length=3)


class RevalidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revalidation_id: str
    search_id: str
    offer_id: str
    provider_id: str
    provider_environment: str
    status: Literal["confirmed", "changed", "unavailable", "unsupported"]
    available: bool
    currency: str | None = None
    total_amount: str | None = None
    changes: list[str] = Field(default_factory=list)
    checked_at: datetime
    expires_at: datetime
    redirect_eligible: bool = False
    reason: str | None = None


class RedirectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    search_id: str = Field(min_length=1, max_length=128)
    offer_id: str = Field(min_length=1, max_length=128)
    revalidation_id: str = Field(min_length=1, max_length=128)


class RedirectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    redirect_id: str
    target_url: str
    expires_at: datetime


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    search_id: str = Field(min_length=1, max_length=128)
    offer_id: str | None = Field(default=None, max_length=128)
    feedback_type: Literal[
        "alternative_opened",
        "false_match",
        "wrong_match",
        "price_changed",
        "route_failed",
    ]
    details: dict[str, Any] = Field(default_factory=dict)

    @field_validator("details")
    @classmethod
    def bound_details(cls, value: dict[str, Any]) -> dict[str, Any]:
        from ..domain.intent import validate_bounded_page_data

        bounded = validate_bounded_page_data(
            value,
            max_bytes=8_192,
            max_nodes=100,
            max_depth=4,
        )
        stack: list[Any] = [bounded]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                for raw_key, item in current.items():
                    key = str(raw_key).strip().casefold()
                    if key in {"url", "source_url", "target_url", "full_url"}:
                        raise ValueError("feedback must not include complete URLs")
                    stack.append(item)
            elif isinstance(current, list):
                stack.extend(current)
        return bounded


class TravelPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preferred_currency: str | None = Field(default=None, min_length=3, max_length=3)
    automatic_savings_mode: bool = False
    privacy_mode: bool = True
    flight_checked_bags: int | None = Field(default=None, ge=0, le=5)
    require_refundable_hotel: bool = False
    meaningful_saving_amount: str = Field(default="25.00", max_length=32)
    telemetry_enabled: bool = False


class UserDataDeletionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deleted_records: int = Field(ge=0)
    deleted_by_collection: dict[str, int]
    preserved_deidentified_collections: tuple[str, ...]


class TravelAPIErrorDetail(BaseModel):
    """Stable redacted error metadata returned by the travel API."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=256)
    retryable: bool = False
    request_id: str = Field(min_length=1, max_length=128)
    search_id: str | None = Field(default=None, max_length=128)


class TravelAPIErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: TravelAPIErrorDetail
