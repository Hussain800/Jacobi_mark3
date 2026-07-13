"""Official Amadeus travel provider with fixed egress endpoints.

The client supports OAuth client credentials, Flight Offers Search, Flight
Offers Price, Hotel List by City, and Hotel Offers Search.  It never accepts a
caller-provided base URL and never claims hotel mandatory-fee completeness or
hotel price revalidation that Amadeus does not prove.
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Mapping

import httpx

from .base import (
    ProviderCapability,
    ProviderDescriptor,
    ProviderEnvironment,
    ProviderError,
    ProviderErrorCode,
    TravelVertical,
)
from .models import (
    BaggageAllowance,
    FlightItinerary,
    FlightOfferBatch,
    FlightRevalidationResult,
    FlightSearchRequest,
    FlightSegment,
    HotelOfferBatch,
    HotelSearchRequest,
    HotelTax,
    NormalizedFlightOffer,
    NormalizedHotelOffer,
    PriceComponent,
    RevalidationStatus,
)


AMADEUS_SANDBOX_ORIGIN = "https://test.api.amadeus.com"
AMADEUS_PRODUCTION_ORIGIN = "https://api.amadeus.com"
TOKEN_PATH = "/v1/security/oauth2/token"
FLIGHT_SEARCH_PATH = "/v2/shopping/flight-offers"
FLIGHT_PRICE_PATH = "/v1/shopping/flight-offers/pricing"
HOTELS_BY_CITY_PATH = "/v1/reference-data/locations/hotels/by-city"
HOTEL_OFFERS_PATH = "/v3/shopping/hotel-offers"
DEFAULT_TIMEOUT_SECONDS = 8.0
MAX_RESPONSE_BYTES = 5_000_000

HOTEL_LIMITATIONS = (
    "Amadeus Hotel Offers is not exhaustive and availability varies by market and account.",
    "Property, resort, destination, local and pay-at-property fees may be omitted; mandatory costs remain incomplete.",
    "This integration has no guaranteed hotel price-check endpoint, so hotel offers are conditional and cannot authorize a verified-savings redirect.",
)

FLIGHT_LIMITATIONS = (
    "Amadeus inventory is not exhaustive and sandbox inventory is synthetic or limited.",
    "Missing checked-baggage evidence remains unknown and blocks mandatory-cost completeness.",
    "A Flight Offers Price response is required before any offer can be treated as freshly revalidated.",
)


def amadeus_descriptor(
    environment: ProviderEnvironment = ProviderEnvironment.sandbox_api,
) -> ProviderDescriptor:
    """Describe Amadeus without constructing credentials or performing I/O."""

    production = environment == ProviderEnvironment.live_official_api
    return ProviderDescriptor(
        provider_id="amadeus",
        display_name="Amadeus Self-Service APIs",
        verticals=(TravelVertical.flight, TravelVertical.hotel),
        capabilities=(
            ProviderCapability.flight_search,
            ProviderCapability.flight_price_revalidation,
            ProviderCapability.hotel_list,
            ProviderCapability.hotel_search,
        ),
        current_environment=environment,
        observation_method=environment,
        fixed_origins=(AMADEUS_PRODUCTION_ORIGIN if production else AMADEUS_SANDBOX_ORIGIN,),
        official=True,
        independently_queries_market=True,
        supports_progressive_results=False,
        supports_deeplinks=False,
        credentials_required=True,
        credential_requirements=("AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET"),
        production_approval_required=True,
        default_enabled=True,
        estimated_cost_per_search=None,
        legal_policy_reference="docs/travel/PROVIDER_POLICY.md#amadeus-self-service",
        reviewed_at=date(2026, 7, 13),
        rate_limit_per_second=40 if production else 10,
        flight_revalidation_supported=True,
        hotel_revalidation_supported=False,
        limitations=FLIGHT_LIMITATIONS + HOTEL_LIMITATIONS,
    )


@dataclass(frozen=True)
class AmadeusConfig:
    client_id: str
    client_secret: str
    environment: ProviderEnvironment = ProviderEnvironment.sandbox_api
    production_approved: bool = False
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS

    def __post_init__(self) -> None:
        if not self.client_id.strip() or not self.client_secret.strip():
            raise ProviderError(
                ProviderErrorCode.configuration,
                "Amadeus credentials are not configured.",
            )
        if self.environment == ProviderEnvironment.fixture:
            raise ProviderError(
                ProviderErrorCode.configuration,
                "Fixture evidence cannot be used as an Amadeus network environment.",
            )
        if (
            self.environment == ProviderEnvironment.live_official_api
            and not self.production_approved
        ):
            raise ProviderError(
                ProviderErrorCode.configuration,
                "Amadeus production access requires explicit approval.",
            )
        if not 0 < self.timeout_seconds <= 30:
            raise ProviderError(
                ProviderErrorCode.configuration,
                "Amadeus timeout must be between 0 and 30 seconds.",
            )

    @property
    def base_url(self) -> str:
        if self.environment == ProviderEnvironment.live_official_api:
            return AMADEUS_PRODUCTION_ORIGIN
        return AMADEUS_SANDBOX_ORIGIN

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "AmadeusConfig":
        source = os.environ if environ is None else environ
        raw_environment = source.get("AMADEUS_ENVIRONMENT", "sandbox").strip().lower()
        if raw_environment in {"sandbox", "test", "sandbox_api"}:
            environment = ProviderEnvironment.sandbox_api
        elif raw_environment in {"production", "live", "live_official_api"}:
            environment = ProviderEnvironment.live_official_api
        else:
            raise ProviderError(
                ProviderErrorCode.configuration,
                f"Unsupported Amadeus environment: {raw_environment or '(empty)' }.",
            )
        try:
            timeout_seconds = float(
                source.get("AMADEUS_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
            )
        except (TypeError, ValueError) as exc:
            raise ProviderError(
                ProviderErrorCode.configuration,
                "Amadeus timeout must be a number.",
            ) from exc
        return cls(
            client_id=source.get("AMADEUS_CLIENT_ID", ""),
            client_secret=source.get("AMADEUS_CLIENT_SECRET", ""),
            environment=environment,
            production_approved=source.get("AMADEUS_PRODUCTION_APPROVED") == "1",
            timeout_seconds=timeout_seconds,
        )


class AmadeusClient:
    """OAuth-aware JSON client. Every request stays on a fixed Amadeus origin."""

    def __init__(
        self,
        config: AmadeusConfig,
        *,
        http_client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config
        self._clock = clock
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()
        self._owns_http = http_client is None
        self._http = http_client or httpx.AsyncClient(
            timeout=httpx.Timeout(config.timeout_seconds),
            follow_redirects=False,
        )

    async def aclose(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    def _url(self, path: str) -> str:
        if not path.startswith("/") or "://" in path:
            raise ProviderError(
                ProviderErrorCode.configuration,
                "Amadeus request path must be a fixed relative API path.",
            )
        return f"{self.config.base_url}{path}"

    async def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = await self._http.request(method, self._url(path), **kwargs)
        except httpx.TimeoutException as exc:
            raise ProviderError(
                ProviderErrorCode.timeout,
                "Amadeus request timed out.",
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                ProviderErrorCode.unavailable,
                "Amadeus could not be reached.",
            ) from exc
        if len(response.content) > MAX_RESPONSE_BYTES:
            raise ProviderError(
                ProviderErrorCode.malformed_response,
                "Amadeus response exceeded the provider safety limit.",
                status_code=response.status_code,
            )
        return response

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except (ValueError, TypeError) as exc:
            raise ProviderError(
                ProviderErrorCode.malformed_response,
                "Amadeus returned malformed JSON.",
                status_code=response.status_code,
            ) from exc
        if not isinstance(payload, dict):
            raise ProviderError(
                ProviderErrorCode.malformed_response,
                "Amadeus returned an unexpected JSON shape.",
                status_code=response.status_code,
            )
        return payload

    @staticmethod
    def _retry_after(response: httpx.Response) -> float | None:
        raw = response.headers.get("retry-after")
        if not raw:
            return None
        try:
            return max(0.0, float(raw))
        except ValueError:
            return None

    def _raise_status(self, response: httpx.Response, *, auth_request: bool = False) -> None:
        status = response.status_code
        if status in {401, 403} or (auth_request and status == 400):
            code = ProviderErrorCode.authentication
            message = "Amadeus authentication failed."
        elif status == 429:
            code = ProviderErrorCode.rate_limited
            message = "Amadeus rate limit reached."
        elif status in {404, 408, 409, 410} or status >= 500:
            code = ProviderErrorCode.unavailable
            message = "Amadeus offer or service is unavailable."
        else:
            code = ProviderErrorCode.upstream
            message = f"Amadeus request failed with HTTP {status}."
        raise ProviderError(
            code,
            message,
            status_code=status,
            retry_after_seconds=self._retry_after(response),
        )

    async def access_token(self) -> str:
        if self._token and self._clock() < self._token_expires_at - 30:
            return self._token
        async with self._token_lock:
            if self._token and self._clock() < self._token_expires_at - 30:
                return self._token
            response = await self._send(
                "POST",
                TOKEN_PATH,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=self.config.timeout_seconds,
            )
            if response.status_code < 200 or response.status_code >= 300:
                self._raise_status(response, auth_request=True)
            payload = self._json(response)
            token = payload.get("access_token")
            try:
                expires_in = int(payload.get("expires_in", 0))
            except (TypeError, ValueError):
                expires_in = 0
            if not isinstance(token, str) or not token or expires_in <= 0:
                raise ProviderError(
                    ProviderErrorCode.malformed_response,
                    "Amadeus OAuth response omitted a usable access token.",
                    status_code=response.status_code,
                )
            self._token = token
            self._token_expires_at = self._clock() + expires_in
            return token

    async def request_json(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        json_body: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        for attempt in range(2):
            token = await self.access_token()
            response = await self._send(
                method,
                path,
                params=dict(params or {}),
                json=dict(json_body) if json_body is not None else None,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                timeout=self.config.timeout_seconds,
            )
            if response.status_code == 401 and attempt == 0:
                self._token = None
                self._token_expires_at = 0
                continue
            if response.status_code < 200 or response.status_code >= 300:
                self._raise_status(response)
            return self._json(response)
        raise ProviderError(ProviderErrorCode.authentication, "Amadeus authentication failed.")


class _MalformedOffer(ValueError):
    pass


def _required_str(value: Any, field: str) -> str:
    if value is None:
        raise _MalformedOffer(f"missing {field}")
    normalized = str(value).strip()
    if not normalized:
        raise _MalformedOffer(f"missing {field}")
    return normalized


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _decimal(value: Any, field: str, *, required: bool = False) -> Decimal | None:
    if value in (None, ""):
        if required:
            raise _MalformedOffer(f"missing {field}")
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise _MalformedOffer(f"invalid {field}") from exc
    if not result.is_finite() or result < 0:
        raise _MalformedOffer(f"invalid {field}")
    return result


def _coordinate(value: Any, field: str) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise _MalformedOffer(f"invalid {field}") from exc
    if not result.is_finite():
        raise _MalformedOffer(f"invalid {field}")
    return result


def _integer(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        result = int(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None


def _bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value.lower() == "true":
            return True
        if value.lower() == "false":
            return False
    return None


def _flight_offer(raw: Mapping[str, Any], environment: ProviderEnvironment) -> NormalizedFlightOffer:
    offer_id = _required_str(raw.get("id"), "flight offer id")
    price = raw.get("price")
    if not isinstance(price, Mapping):
        raise _MalformedOffer("missing flight price")
    currency = _required_str(price.get("currency"), "flight currency").upper()
    total = _decimal(price.get("total"), "flight total", required=True)
    grand_total = _decimal(
        price.get("grandTotal", price.get("total")),
        "flight grand total",
        required=True,
    )
    base = _decimal(price.get("base"), "flight base")
    assert total is not None and grand_total is not None

    traveler_pricings = raw.get("travelerPricings")
    if not isinstance(traveler_pricings, list):
        traveler_pricings = []
    fare_by_segment: dict[str, Mapping[str, Any]] = {}
    baggage: list[BaggageAllowance] = []
    baggage_known = bool(traveler_pricings)
    for traveler in traveler_pricings:
        if not isinstance(traveler, Mapping):
            baggage_known = False
            continue
        traveler_id = _optional_str(traveler.get("travelerId")) or "unknown"
        details = traveler.get("fareDetailsBySegment")
        if not isinstance(details, list) or not details:
            baggage_known = False
            continue
        for detail in details:
            if not isinstance(detail, Mapping):
                baggage_known = False
                continue
            segment_id = _optional_str(detail.get("segmentId")) or "unknown"
            fare_by_segment.setdefault(segment_id, detail)
            included = detail.get("includedCheckedBags")
            if not isinstance(included, Mapping):
                baggage_known = False
                baggage.append(
                    BaggageAllowance(
                        traveler_id=traveler_id,
                        segment_id=segment_id,
                        known=False,
                    )
                )
                continue
            quantity = _integer(included.get("quantity"))
            weight = _decimal(included.get("weight"), "baggage weight")
            known = quantity is not None or weight is not None
            baggage_known = baggage_known and known
            baggage.append(
                BaggageAllowance(
                    traveler_id=traveler_id,
                    segment_id=segment_id,
                    quantity=quantity,
                    weight=weight,
                    weight_unit=_optional_str(included.get("weightUnit")),
                    known=known,
                )
            )

    itineraries_raw = raw.get("itineraries")
    if not isinstance(itineraries_raw, list) or not itineraries_raw:
        raise _MalformedOffer("missing flight itineraries")
    itineraries: list[FlightItinerary] = []
    for itinerary in itineraries_raw:
        if not isinstance(itinerary, Mapping):
            raise _MalformedOffer("invalid flight itinerary")
        segments_raw = itinerary.get("segments")
        if not isinstance(segments_raw, list) or not segments_raw:
            raise _MalformedOffer("missing flight segments")
        segments: list[FlightSegment] = []
        for segment in segments_raw:
            if not isinstance(segment, Mapping):
                raise _MalformedOffer("invalid flight segment")
            departure = segment.get("departure")
            arrival = segment.get("arrival")
            if not isinstance(departure, Mapping) or not isinstance(arrival, Mapping):
                raise _MalformedOffer("missing flight endpoint")
            segment_id = _required_str(segment.get("id"), "segment id")
            fare = fare_by_segment.get(segment_id, {})
            operating = segment.get("operating")
            segments.append(
                FlightSegment(
                    segment_id=segment_id,
                    departure_airport=_required_str(
                        departure.get("iataCode"), "departure airport"
                    ).upper(),
                    departure_at=_required_str(departure.get("at"), "departure time"),
                    arrival_airport=_required_str(
                        arrival.get("iataCode"), "arrival airport"
                    ).upper(),
                    arrival_at=_required_str(arrival.get("at"), "arrival time"),
                    marketing_carrier=_required_str(
                        segment.get("carrierCode"), "marketing carrier"
                    ).upper(),
                    marketing_flight_number=_required_str(
                        segment.get("number"), "flight number"
                    ),
                    operating_carrier=(
                        _optional_str(operating.get("carrierCode"))
                        if isinstance(operating, Mapping)
                        else None
                    ),
                    duration=_optional_str(segment.get("duration")),
                    stops=_integer(segment.get("numberOfStops")) or 0,
                    aircraft_code=(
                        _optional_str(segment.get("aircraft", {}).get("code"))
                        if isinstance(segment.get("aircraft"), Mapping)
                        else None
                    ),
                    cabin=_optional_str(fare.get("cabin")),
                    booking_class=_optional_str(fare.get("class")),
                    fare_basis=_optional_str(fare.get("fareBasis")),
                )
            )
        itineraries.append(
            FlightItinerary(
                duration=_optional_str(itinerary.get("duration")),
                segments=segments,
            )
        )

    components: list[PriceComponent] = []
    if base is not None:
        components.append(
            PriceComponent(
                kind="base_fare",
                amount=base,
                currency=currency,
                included_in_total=True,
            )
        )
        if total >= base:
            components.append(
                PriceComponent(
                    kind="taxes_and_mandatory_fees",
                    amount=total - base,
                    currency=currency,
                    included_in_total=True,
                )
            )
    fees = price.get("fees")
    if isinstance(fees, list):
        for fee in fees:
            if not isinstance(fee, Mapping):
                continue
            components.append(
                PriceComponent(
                    kind=f"provider_fee:{_optional_str(fee.get('type')) or 'unknown'}",
                    amount=_decimal(fee.get("amount"), "provider fee"),
                    currency=currency,
                    included_in_total=True,
                )
            )
    unknown_costs = [] if baggage_known else ["checked_baggage"]
    return NormalizedFlightOffer(
        provider_offer_id=offer_id,
        environment=environment,
        source=_optional_str(raw.get("source")),
        one_way=bool(raw.get("oneWay", False)),
        instant_ticketing_required=bool(raw.get("instantTicketingRequired", False)),
        last_ticketing_date=_optional_str(raw.get("lastTicketingDate")),
        bookable_seats=_integer(raw.get("numberOfBookableSeats")),
        currency=currency,
        base_amount=base,
        total_amount=total,
        grand_total_amount=grand_total,
        price_components=components,
        itineraries=itineraries,
        baggage=baggage,
        baggage_known=baggage_known,
        mandatory_costs_complete=baggage_known,
        unknown_costs=unknown_costs,
        provider_payload=dict(raw),
    )


def normalize_flight_offers(
    payload: Mapping[str, Any],
    *,
    environment: ProviderEnvironment = ProviderEnvironment.fixture,
) -> FlightOfferBatch:
    data = payload.get("data")
    if not isinstance(data, list):
        raise ProviderError(
            ProviderErrorCode.malformed_response,
            "Amadeus flight response omitted the data array.",
        )
    offers: list[NormalizedFlightOffer] = []
    warnings: list[str] = []
    seen: set[str] = set()
    for index, raw in enumerate(data):
        if not isinstance(raw, Mapping):
            warnings.append(f"flight_offer_{index}: invalid object")
            continue
        try:
            offer = _flight_offer(raw, environment)
        except _MalformedOffer as exc:
            warnings.append(f"flight_offer_{index}: {exc}")
            continue
        if offer.provider_offer_id in seen:
            warnings.append(f"flight_offer_{index}: duplicate provider offer id")
            continue
        seen.add(offer.provider_offer_id)
        offers.append(offer)
    if data and not offers:
        raise ProviderError(
            ProviderErrorCode.malformed_response,
            "Amadeus flight response contained no usable offers.",
        )
    return FlightOfferBatch(
        provider_id="amadeus",
        environment=environment,
        offers=offers,
        raw_offer_count=len(data),
        warnings=warnings,
        limitations=list(FLIGHT_LIMITATIONS),
    )


def _hotel_offer(
    hotel_entry: Mapping[str, Any],
    raw: Mapping[str, Any],
    environment: ProviderEnvironment,
) -> NormalizedHotelOffer:
    hotel = hotel_entry.get("hotel")
    if not isinstance(hotel, Mapping):
        raise _MalformedOffer("missing hotel")
    price = raw.get("price")
    if not isinstance(price, Mapping):
        raise _MalformedOffer("missing hotel price")
    hotel_id = _required_str(hotel.get("hotelId"), "hotel id")
    offer_id = _required_str(raw.get("id"), "hotel offer id")
    currency = _required_str(price.get("currency"), "hotel currency").upper()
    total = _decimal(price.get("total"), "hotel total", required=True)
    base = _decimal(price.get("base"), "hotel base")
    assert total is not None
    geo = hotel.get("geoCode") if isinstance(hotel.get("geoCode"), Mapping) else {}
    address = hotel.get("address") if isinstance(hotel.get("address"), Mapping) else {}
    room = raw.get("room") if isinstance(raw.get("room"), Mapping) else {}
    estimated = (
        room.get("typeEstimated") if isinstance(room.get("typeEstimated"), Mapping) else {}
    )
    description = room.get("description") if isinstance(room.get("description"), Mapping) else {}
    guests = raw.get("guests") if isinstance(raw.get("guests"), Mapping) else {}
    policies = raw.get("policies") if isinstance(raw.get("policies"), Mapping) else {}
    taxes: list[HotelTax] = []
    raw_taxes = price.get("taxes")
    if isinstance(raw_taxes, list):
        for tax in raw_taxes:
            if not isinstance(tax, Mapping):
                continue
            taxes.append(
                HotelTax(
                    code=_optional_str(tax.get("code")),
                    amount=_decimal(tax.get("amount"), "hotel tax"),
                    percentage=_decimal(tax.get("percentage"), "hotel tax percentage"),
                    currency=_optional_str(tax.get("currency")) or currency,
                    included=_bool(tax.get("included")),
                    pricing_frequency=_optional_str(tax.get("pricingFrequency")),
                    pricing_mode=_optional_str(tax.get("pricingMode")),
                    description=_optional_str(tax.get("description")),
                )
            )
    cancellations = policies.get("cancellations")
    address_lines = address.get("lines")
    if not isinstance(address_lines, list):
        address_lines = []
    return NormalizedHotelOffer(
        provider_offer_id=offer_id,
        environment=environment,
        hotel_id=hotel_id,
        hotel_name=_optional_str(hotel.get("name")),
        chain_code=_optional_str(hotel.get("chainCode")),
        city_code=_optional_str(hotel.get("iataCode")),
        latitude=_coordinate(geo.get("latitude"), "hotel latitude"),
        longitude=_coordinate(geo.get("longitude"), "hotel longitude"),
        address_lines=[str(line) for line in address_lines if line is not None],
        country_code=_optional_str(address.get("countryCode")),
        check_in_date=_optional_str(raw.get("checkInDate")),
        check_out_date=_optional_str(raw.get("checkOutDate")),
        adults=_integer(guests.get("adults")),
        room_quantity=_integer(raw.get("roomQuantity")),
        room_type=_optional_str(room.get("type")),
        room_category=_optional_str(estimated.get("category")),
        room_description=_optional_str(description.get("text")),
        board_type=_optional_str(raw.get("boardType")),
        currency=currency,
        base_amount=base,
        total_amount=total,
        taxes=taxes,
        payment_type=_optional_str(policies.get("paymentType")),
        cancellation_policy_known=isinstance(cancellations, list) and bool(cancellations),
        mandatory_costs_complete=False,
        unknown_costs=["property_or_resort_fees", "local_or_pay_at_property_taxes"],
        provider_payload=dict(raw),
    )


def normalize_hotel_offers(
    payload: Mapping[str, Any],
    *,
    environment: ProviderEnvironment = ProviderEnvironment.fixture,
) -> HotelOfferBatch:
    data = payload.get("data")
    if not isinstance(data, list):
        raise ProviderError(
            ProviderErrorCode.malformed_response,
            "Amadeus hotel response omitted the data array.",
        )
    offers: list[NormalizedHotelOffer] = []
    warnings: list[str] = []
    seen: set[tuple[str, str]] = set()
    raw_count = 0
    for hotel_index, hotel_entry in enumerate(data):
        if not isinstance(hotel_entry, Mapping):
            warnings.append(f"hotel_{hotel_index}: invalid object")
            continue
        raw_offers = hotel_entry.get("offers")
        if not isinstance(raw_offers, list):
            warnings.append(f"hotel_{hotel_index}: missing offers")
            continue
        raw_count += len(raw_offers)
        for offer_index, raw in enumerate(raw_offers):
            if not isinstance(raw, Mapping):
                warnings.append(f"hotel_{hotel_index}_offer_{offer_index}: invalid object")
                continue
            try:
                offer = _hotel_offer(hotel_entry, raw, environment)
            except _MalformedOffer as exc:
                warnings.append(f"hotel_{hotel_index}_offer_{offer_index}: {exc}")
                continue
            key = (offer.hotel_id, offer.provider_offer_id)
            if key in seen:
                warnings.append(f"hotel_{hotel_index}_offer_{offer_index}: duplicate offer")
                continue
            seen.add(key)
            offers.append(offer)
    if raw_count and not offers:
        raise ProviderError(
            ProviderErrorCode.malformed_response,
            "Amadeus hotel response contained no usable offers.",
        )
    return HotelOfferBatch(
        provider_id="amadeus",
        environment=environment,
        offers=offers,
        raw_offer_count=raw_count,
        warnings=warnings,
        limitations=list(HOTEL_LIMITATIONS),
    )


def _flight_fingerprint(offer: NormalizedFlightOffer) -> tuple[Any, ...]:
    return tuple(
        (
            segment.departure_airport,
            segment.departure_at,
            segment.arrival_airport,
            segment.arrival_at,
            segment.marketing_carrier,
            segment.marketing_flight_number,
            segment.operating_carrier,
            segment.cabin,
        )
        for itinerary in offer.itineraries
        for segment in itinerary.segments
    )


class AmadeusProvider:
    provider_id = "amadeus"

    def __init__(
        self,
        config: AmadeusConfig,
        *,
        http_client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config
        self.client = AmadeusClient(config, http_client=http_client, clock=clock)

    @classmethod
    def from_env(
        cls,
        environ: Mapping[str, str] | None = None,
        *,
        http_client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> "AmadeusProvider":
        return cls(
            AmadeusConfig.from_env(environ),
            http_client=http_client,
            clock=clock,
        )

    @property
    def descriptor(self) -> ProviderDescriptor:
        return amadeus_descriptor(self.config.environment)

    async def aclose(self) -> None:
        await self.client.aclose()

    async def search_flights(self, request: FlightSearchRequest) -> FlightOfferBatch:
        params: dict[str, Any] = {
            "originLocationCode": request.origin,
            "destinationLocationCode": request.destination,
            "departureDate": request.departure_date,
            "adults": request.adults,
            "nonStop": str(request.non_stop).lower(),
            "max": request.max_offers,
        }
        if request.return_date:
            params["returnDate"] = request.return_date
        if request.children:
            params["children"] = request.children
        if request.infants:
            params["infants"] = request.infants
        if request.travel_class:
            params["travelClass"] = request.travel_class
        if request.currency:
            params["currencyCode"] = request.currency
        payload = await self.client.request_json("GET", FLIGHT_SEARCH_PATH, params=params)
        return normalize_flight_offers(payload, environment=self.config.environment)

    async def revalidate_flight(
        self,
        offer: NormalizedFlightOffer | Mapping[str, Any],
    ) -> FlightRevalidationResult:
        if isinstance(offer, NormalizedFlightOffer):
            previous = offer
            raw_offer = offer.provider_payload
        else:
            raw_offer = dict(offer)
            previous_batch = normalize_flight_offers(
                {"data": [raw_offer]}, environment=self.config.environment
            )
            previous = previous_batch.offers[0]
        if not raw_offer:
            raise ProviderError(
                ProviderErrorCode.malformed_response,
                "Selected Amadeus offer omitted its pricing payload.",
            )
        try:
            payload = await self.client.request_json(
                "POST",
                FLIGHT_PRICE_PATH,
                json_body={
                    "data": {
                        "type": "flight-offers-pricing",
                        "flightOffers": [raw_offer],
                    }
                },
            )
        except ProviderError as exc:
            if exc.code == ProviderErrorCode.unavailable:
                return FlightRevalidationResult(
                    environment=self.config.environment,
                    status=RevalidationStatus.unavailable,
                    previous_offer=previous,
                    reason=str(exc),
                )
            raise
        data = payload.get("data")
        if not isinstance(data, Mapping) or not isinstance(data.get("flightOffers"), list):
            raise ProviderError(
                ProviderErrorCode.malformed_response,
                "Amadeus pricing response omitted flightOffers.",
            )
        priced = normalize_flight_offers(
            {"data": data["flightOffers"]}, environment=self.config.environment
        )
        if not priced.offers:
            return FlightRevalidationResult(
                environment=self.config.environment,
                status=RevalidationStatus.unavailable,
                previous_offer=previous,
                reason="Amadeus pricing returned no available flight offers.",
            )
        current = priced.offers[0]
        changes: list[str] = []
        if previous.currency != current.currency:
            changes.append("currency_changed")
        if previous.grand_total_amount != current.grand_total_amount:
            changes.append("price_changed")
        if _flight_fingerprint(previous) != _flight_fingerprint(current):
            changes.append("itinerary_changed")
        if previous.baggage_known != current.baggage_known or previous.baggage != current.baggage:
            changes.append("baggage_changed")
        if previous.bookable_seats != current.bookable_seats:
            changes.append("availability_changed")
        return FlightRevalidationResult(
            environment=self.config.environment,
            status=(RevalidationStatus.changed if changes else RevalidationStatus.confirmed),
            previous_offer=previous,
            current_offer=current,
            changes=changes,
        )

    async def search_hotels(self, request: HotelSearchRequest) -> HotelOfferBatch:
        hotel_ids = list(request.hotel_ids)
        warnings: list[str] = []
        if not hotel_ids:
            location_payload = await self.client.request_json(
                "GET",
                HOTELS_BY_CITY_PATH,
                params={
                    "cityCode": request.city_code,
                    "radius": request.radius,
                    "radiusUnit": request.radius_unit,
                    "hotelSource": "ALL",
                },
            )
            rows = location_payload.get("data")
            if not isinstance(rows, list):
                raise ProviderError(
                    ProviderErrorCode.malformed_response,
                    "Amadeus hotel-list response omitted the data array.",
                )
            for row in rows:
                if isinstance(row, Mapping) and row.get("hotelId"):
                    hotel_ids.append(str(row["hotelId"]))
            hotel_ids = list(dict.fromkeys(hotel_ids))[: request.max_hotels]
            if not hotel_ids:
                return HotelOfferBatch(
                    provider_id=self.provider_id,
                    environment=self.config.environment,
                    offers=[],
                    raw_offer_count=0,
                    warnings=["no_hotels_found"],
                    limitations=list(HOTEL_LIMITATIONS),
                )
        else:
            hotel_ids = hotel_ids[: request.max_hotels]
        params: dict[str, Any] = {
            "hotelIds": ",".join(hotel_ids),
            "adults": request.adults,
            "checkInDate": request.check_in_date,
            "checkOutDate": request.check_out_date,
            "roomQuantity": request.room_quantity,
            "bestRateOnly": "true",
        }
        if request.currency:
            params["currency"] = request.currency
        payload = await self.client.request_json("GET", HOTEL_OFFERS_PATH, params=params)
        batch = normalize_hotel_offers(payload, environment=self.config.environment)
        batch.warnings[:0] = warnings
        return batch
