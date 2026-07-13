"""Travel provider contracts, descriptors, and a small explicit registry.

Provider payloads intentionally live at this boundary.  The orchestration and
domain layers can adapt them without making provider clients depend on storage,
HTTP routes, or product-specific services.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field


class ProviderEnvironment(str, Enum):
    """Truthful evidence labels exposed to users and persisted with offers."""

    fixture = "fixture"
    sandbox_api = "sandbox_api"
    live_official_api = "live_official_api"


class TravelVertical(str, Enum):
    flight = "flight"
    hotel = "hotel"


class ProviderCapability(str, Enum):
    flight_search = "flight_search"
    flight_price_revalidation = "flight_price_revalidation"
    hotel_list = "hotel_list"
    hotel_search = "hotel_search"


class ProviderErrorCode(str, Enum):
    configuration = "configuration"
    authentication = "authentication"
    rate_limited = "rate_limited"
    timeout = "timeout"
    malformed_response = "malformed_response"
    unavailable = "unavailable"
    upstream = "upstream"


class ProviderError(RuntimeError):
    """Sanitized provider failure suitable for orchestration and telemetry."""

    def __init__(
        self,
        code: ProviderErrorCode,
        message: str,
        *,
        status_code: int | None = None,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.retry_after_seconds = retry_after_seconds


class ProviderDescriptor(BaseModel):
    """Static provider behavior. Calling ``describe`` must never perform I/O."""

    model_config = ConfigDict(frozen=True)

    provider_id: str
    display_name: str
    verticals: tuple[TravelVertical, ...]
    capabilities: tuple[ProviderCapability, ...]
    current_environment: ProviderEnvironment
    observation_method: ProviderEnvironment
    fixed_origins: tuple[str, ...]
    official: bool
    independently_queries_market: bool
    supports_progressive_results: bool = False
    supports_deeplinks: bool = False
    credentials_required: bool = True
    credential_requirements: tuple[str, ...] = ()
    production_approval_required: bool = True
    default_enabled: bool = True
    estimated_cost_per_search: Decimal | None = None
    legal_policy_reference: str | None = None
    reviewed_at: date | None = None
    rate_limit_per_second: int | None = Field(default=None, ge=1)
    flight_revalidation_supported: bool = False
    hotel_revalidation_supported: bool = False
    limitations: tuple[str, ...] = ()


class ProviderBatch(BaseModel):
    """Stable envelope shared by every provider search response."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    provider_id: str
    vertical: TravelVertical
    environment: ProviderEnvironment
    offers: list[object] = Field(default_factory=list)
    raw_offer_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


@runtime_checkable
class ProviderProtocol(Protocol):
    @property
    def descriptor(self) -> ProviderDescriptor: ...

    async def aclose(self) -> None: ...


class ProviderRegistry:
    """Explicit registry; importing this module never enables a live provider."""

    def __init__(self) -> None:
        self._providers: dict[str, ProviderProtocol] = {}

    def register(self, provider: ProviderProtocol) -> None:
        provider_id = provider.descriptor.provider_id
        if provider_id in self._providers:
            raise ValueError(f"provider already registered: {provider_id}")
        self._providers[provider_id] = provider

    def get(self, provider_id: str) -> ProviderProtocol:
        try:
            return self._providers[provider_id]
        except KeyError as exc:
            raise KeyError(f"unknown provider: {provider_id}") from exc

    def descriptors(self) -> list[ProviderDescriptor]:
        return [self._providers[key].descriptor for key in sorted(self._providers)]

    async def aclose(self) -> None:
        for provider in self._providers.values():
            await provider.aclose()

