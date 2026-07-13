"""Typed travel enums shared by domain, providers, costing, and ranking."""

from __future__ import annotations

from enum import Enum, IntEnum


class TravelVertical(str, Enum):
    FLIGHT = "flight"
    HOTEL = "hotel"


class TripType(str, Enum):
    ONE_WAY = "one_way"
    ROUND_TRIP = "round_trip"
    MULTI_CITY = "multi_city"


class CabinClass(str, Enum):
    ECONOMY = "economy"
    PREMIUM_ECONOMY = "premium_economy"
    BUSINESS = "business"
    FIRST = "first"


class CostState(str, Enum):
    KNOWN = "known"
    ESTIMATED = "estimated"
    UNKNOWN = "unknown"
    NOT_APPLICABLE = "not_applicable"


class CostKind(str, Enum):
    BASE_FARE = "base_fare"
    BASE_RATE = "base_rate"
    TAXES = "taxes"
    PROVIDER_FEE = "provider_fee"
    PAYMENT_FEE = "payment_fee"
    BAGGAGE = "baggage"
    RESORT_FEE = "resort_fee"
    DESTINATION_FEE = "destination_fee"
    SERVICE_FEE = "service_fee"
    CLEANING_FEE = "cleaning_fee"
    LOCAL_TAX = "local_tax"
    CURRENCY_CONVERSION_SPREAD = "currency_conversion_spread"


class ProviderEnvironment(str, Enum):
    """Server-derived provider environment; never accept this from a client."""

    FIXTURE = "fixture"
    SANDBOX_API = "sandbox_api"
    LIVE_OFFICIAL_API = "live_official_api"


class ObservationMethod(str, Enum):
    """PRD observation labels. A generic ``live`` label is intentionally absent."""

    FIXTURE = "fixture"
    SANDBOX_API = "sandbox_api"
    LIVE_OFFICIAL_API = "live_official_api"
    BROWSER_OBSERVED = "browser_observed"
    DIRECT_PUBLIC_METADATA = "direct_public_metadata"
    MANAGED_PROVIDER = "managed_provider"


class EvidenceSourceType(str, Enum):
    PROVIDER_API = "provider_api"
    BROWSER_PAGE = "browser_page"
    DIRECT_PUBLIC_METADATA = "direct_public_metadata"
    MANAGED_PROVIDER = "managed_provider"
    FIXTURE = "fixture"
    DERIVED = "derived"


class EvidenceKind(str, Enum):
    IDENTITY = "identity"
    PRICE = "price"
    COST = "cost"
    AVAILABILITY = "availability"
    POLICY = "policy"
    REVALIDATION = "revalidation"
    REDIRECT = "redirect"


class EvidenceStrength(str, Enum):
    DIRECT = "direct"
    CORROBORATED = "corroborated"
    INFERRED = "inferred"
    UNVERIFIED = "unverified"


class EquivalenceClass(str, Enum):
    EXACT = "exact"
    EQUIVALENT_WITH_DISCLOSED_TRADEOFF = "equivalent_with_disclosed_tradeoff"
    SIMILAR_NOT_EQUIVALENT = "similar_not_equivalent"
    REJECTED = "rejected"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class SavingClaim(str, Enum):
    VERIFIED = "verified"
    CONDITIONAL = "conditional"
    POTENTIAL = "potential"
    NONE = "none"
    CANNOT_COMPARE = "cannot_compare"


# ``SavingClass`` is the domain-language alias used by callers and tests.
SavingClass = SavingClaim


class AvailabilityStatus(str, Enum):
    CURRENT = "current"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"
    EXPIRED = "expired"


class PaymentTiming(str, Enum):
    PAY_NOW = "pay_now"
    PAY_AT_PROPERTY = "pay_at_property"
    DEPOSIT = "deposit"
    UNKNOWN = "unknown"


class TicketingStructure(str, Enum):
    PROTECTED = "protected"
    SELF_TRANSFER = "self_transfer"
    SEPARATE_TICKETS = "separate_tickets"
    UNKNOWN = "unknown"


class SupplierRiskTier(IntEnum):
    TRUSTED = 0
    STANDARD = 1
    ELEVATED = 2
    UNKNOWN = 3


class RedirectFriction(IntEnum):
    DIRECT = 0
    INTERMEDIATE = 1
    MANUAL = 2
    UNAVAILABLE = 3
