"""Travel provider contracts and official provider adapters."""

from .amadeus import (
    AMADEUS_PRODUCTION_ORIGIN,
    AMADEUS_SANDBOX_ORIGIN,
    AmadeusConfig,
    AmadeusProvider,
    amadeus_descriptor,
    normalize_flight_offers,
    normalize_hotel_offers,
)
from .base import (
    ProviderBatch,
    ProviderCapability,
    ProviderDescriptor,
    ProviderEnvironment,
    ProviderError,
    ProviderErrorCode,
    ProviderProtocol,
    ProviderRegistry,
    TravelVertical,
)
from .models import (
    FlightOfferBatch,
    FlightRevalidationResult,
    FlightSearchRequest,
    HotelOfferBatch,
    HotelSearchRequest,
    NormalizedFlightOffer,
    NormalizedHotelOffer,
    RevalidationStatus,
)
from .factory import configured_provider_registry, provider_catalog
from .policy import POLICY_LEDGER_PATH, disabled_future_provider_states, load_policy_ledger

__all__ = [
    "AMADEUS_PRODUCTION_ORIGIN",
    "AMADEUS_SANDBOX_ORIGIN",
    "AmadeusConfig",
    "AmadeusProvider",
    "amadeus_descriptor",
    "FlightOfferBatch",
    "FlightRevalidationResult",
    "FlightSearchRequest",
    "HotelOfferBatch",
    "HotelSearchRequest",
    "NormalizedFlightOffer",
    "NormalizedHotelOffer",
    "ProviderBatch",
    "ProviderCapability",
    "ProviderDescriptor",
    "ProviderEnvironment",
    "ProviderError",
    "ProviderErrorCode",
    "ProviderProtocol",
    "ProviderRegistry",
    "RevalidationStatus",
    "TravelVertical",
    "normalize_flight_offers",
    "normalize_hotel_offers",
    "configured_provider_registry",
    "provider_catalog",
    "POLICY_LEDGER_PATH",
    "disabled_future_provider_states",
    "load_policy_ledger",
]
