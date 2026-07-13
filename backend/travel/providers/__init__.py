"""Travel provider contracts and official provider adapters."""

from .amadeus import (
    AMADEUS_PRODUCTION_ORIGIN,
    AMADEUS_SANDBOX_ORIGIN,
    AmadeusConfig,
    AmadeusProvider,
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

__all__ = [
    "AMADEUS_PRODUCTION_ORIGIN",
    "AMADEUS_SANDBOX_ORIGIN",
    "AmadeusConfig",
    "AmadeusProvider",
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
]
