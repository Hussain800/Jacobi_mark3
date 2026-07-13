from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import pytest

from travel.costing import CostComponent
from travel.domain import (
    BaselineOffer,
    CabinClass,
    CostKind,
    CostState,
    FlightIntent,
    FlightLegIntent,
    FlightSegmentIdentity,
    HotelIntent,
    Money,
    PageContext,
    PassengerMix,
    PropertyHint,
    RoomOccupancy,
    SelectedFlightIdentity,
    TripType,
)
from travel.persistence import InMemoryTravelRepository
from travel.providers import (
    AmadeusConfig,
    AmadeusProvider,
    FlightRevalidationResult,
    ProviderCapability,
    ProviderDescriptor,
    ProviderEnvironment,
    ProviderRegistry,
    RevalidationStatus,
    TravelVertical,
    normalize_flight_offers,
)
from travel.search import FlightSearchInput, HotelSearchInput
from travel.search.runtime import MemoryTravelRuntime
from travel.search.service import RedirectNotAvailable, TravelSearchService
from travel.search.worker import TravelSearchWorker


FIXTURES = Path(__file__).parents[1] / "fixtures" / "travel" / "amadeus"
NOW = datetime(2026, 7, 13, tzinfo=timezone.utc)


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _provider(handler) -> AmadeusProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AmadeusProvider(
        AmadeusConfig(client_id="client", client_secret="secret"),
        http_client=client,
    )


def _service(provider: AmadeusProvider | None = None) -> TravelSearchService:
    registry = ProviderRegistry()
    if provider is not None:
        registry.register(provider)
    return TravelSearchService(
        repository=InMemoryTravelRepository(),
        runtime=MemoryTravelRuntime(),
        providers=registry,
        capability_secret=b"test-secret-that-is-long-enough",
    )


def _token_response() -> httpx.Response:
    return httpx.Response(200, json={"access_token": "token", "expires_in": 1800})


def flight_input() -> FlightSearchInput:
    departure = datetime(2027, 2, 1, 9)
    selected = SelectedFlightIdentity(
        segments=(
            FlightSegmentIdentity(
                marketing_carrier="EK",
                operating_carrier="EK",
                flight_number="EK1",
                origin_airport="DXB",
                destination_airport="LHR",
                scheduled_departure=departure,
                scheduled_arrival=datetime(2027, 2, 1, 13, 45),
            ),
        ),
        cabin=CabinClass.BUSINESS,
        checked_bags_included=2,
        fare_restriction_class="CLEAN",
    )
    intent = FlightIntent(
        trip_type=TripType.ONE_WAY,
        legs=(
            FlightLegIntent(
                origin_airport="DXB",
                destination_airport="LHR",
                departure_date=date(2027, 2, 1),
            ),
        ),
        passengers=PassengerMix(adults=1),
        requested_cabin=CabinClass.BUSINESS,
        selected_itinerary=selected,
        baseline_offer=BaselineOffer(
            offer_id="page-flight",
            provider_id="page",
            visible_price=Money(amount="1500.00", currency="AED"),
            observed_at=NOW,
        ),
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=PageContext(site="demo.jacobi.local", page_kind="flight"),
        extracted_at=NOW,
    )
    return FlightSearchInput(
        intent=intent,
        baseline_costs=(
            CostComponent(
                kind=CostKind.BASE_FARE,
                state=CostState.KNOWN,
                money=Money(amount="1500.00", currency="AED"),
            ),
        ),
    )


def hotel_input() -> HotelSearchInput:
    intent = HotelIntent(
        property_hint=PropertyHint(
            name="Sanitized Downtown Hotel",
            canonical_property_id="hotel-canonical-1",
        ),
        check_in=date(2027, 2, 1),
        check_out=date(2027, 2, 3),
        rooms=(RoomOccupancy(adults=2),),
        baseline_offer=BaselineOffer(
            offer_id="page-hotel",
            provider_id="page",
            visible_price=Money(amount="1000.00", currency="AED"),
            observed_at=NOW,
        ),
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=PageContext(
            site="demo.jacobi.local",
            page_kind="hotel",
            structured_data={
                "city_code": "DXB",
                "amadeus_hotel_id": "HYDXB001",
            },
        ),
        extracted_at=NOW,
    )
    return HotelSearchInput(intent=intent)


def test_flight_search_streams_ranks_and_revalidates_official_sandbox_results() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return _token_response()
        if request.url.path.endswith("/flight-offers/pricing"):
            return httpx.Response(200, json=_fixture("flight_price_same.json"))
        return httpx.Response(200, json=_fixture("flight_search_success.json"))

    async def scenario() -> None:
        provider = _provider(handler)
        service = _service(provider)
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="flight-page-request-0001",
        )
        assert await TravelSearchWorker(service).process_one()
        snapshot = service.get_snapshot(
            accepted.search_id,
            capability_token=accepted.capability_token,
        )
        assert snapshot.status == "completed"
        assert snapshot.selected_offer_id
        assert snapshot.offers[0]["provider_environment"] == "sandbox_api"
        assert snapshot.offers[0]["equivalence"]["classification"] == "exact"
        assert snapshot.offers[0]["saving"]["claim"] == "conditional"
        events = await service.runtime.events_after(accepted.search_id, None)
        assert events[0].event.value == "search.accepted"
        assert events[-1].event.value == "search.completed"

        result = await service.revalidate_offer(
            accepted.search_id,
            snapshot.selected_offer_id,
            capability_token=accepted.capability_token,
        )
        assert result.status == "confirmed"
        assert result.available is True
        assert result.provider_environment == "sandbox_api"
        assert result.redirect_eligible is False
        with pytest.raises(RedirectNotAvailable):
            await service.authorize_redirect(
                accepted.search_id,
                snapshot.selected_offer_id,
                result.revalidation_id,
                capability_token=accepted.capability_token,
            )
        await provider.aclose()

    asyncio.run(scenario())


def test_hotel_search_independently_queries_city_and_preserves_unknown_fees() -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path.endswith("/token"):
            return _token_response()
        if request.url.path.endswith("/by-city"):
            return httpx.Response(200, json=_fixture("hotel_list_success.json"))
        return httpx.Response(200, json=_fixture("hotel_offers_success.json"))

    async def scenario() -> None:
        provider = _provider(handler)
        service = _service(provider)
        accepted = await service.create_search(
            hotel_input(),
            idempotency_key="hotel-page-request-00001",
        )
        await TravelSearchWorker(service).process_one()
        snapshot = service.get_snapshot(
            accepted.search_id,
            capability_token=accepted.capability_token,
        )
        assert snapshot.status == "completed"
        assert snapshot.offers[0]["provider_environment"] == "sandbox_api"
        assert snapshot.offers[0]["total_complete"] is False
        assert snapshot.offers[0]["cost_summary"]["unknown_mandatory_costs"] == [
            "resort_fee",
            "local_tax",
        ]
        assert snapshot.offers[0]["equivalence"]["classification"] == "insufficient_evidence"
        await provider.aclose()

    asyncio.run(scenario())
    assert "/v3/shopping/hotel-offers" in paths


def test_no_configured_provider_is_an_honest_degraded_terminal_result() -> None:
    async def scenario() -> None:
        service = _service()
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="flight-no-provider-001",
        )
        await TravelSearchWorker(service).process_one()
        snapshot = service.get_snapshot(
            accepted.search_id,
            capability_token=accepted.capability_token,
        )
        assert snapshot.status == "degraded"
        assert snapshot.degraded_reasons == ["no_configured_independent_provider"]
        assert snapshot.offers == []

    asyncio.run(scenario())


def test_idempotent_replay_returns_same_search_and_capability() -> None:
    async def scenario() -> None:
        service = _service()
        first = await service.create_search(
            flight_input(),
            idempotency_key="stable-flight-request-0001",
        )
        second = await service.create_search(
            flight_input(),
            idempotency_key="stable-flight-request-0001",
        )
        assert second.idempotent_replay is True
        assert second.search_id == first.search_id
        assert second.capability_token == first.capability_token

    asyncio.run(scenario())


def test_redirect_requires_confirmed_revalidation_and_provider_allowlist() -> None:
    class DeeplinkProvider:
        def __init__(self) -> None:
            self.offer = normalize_flight_offers(
                _fixture("flight_search_success.json"),
                environment=ProviderEnvironment.sandbox_api,
            ).offers[0]
            self.offer.provider_payload["deepLink"] = (
                "https://book.example.test/flight/opaque-offer"
            )

        @property
        def descriptor(self) -> ProviderDescriptor:
            return ProviderDescriptor(
                provider_id="amadeus",
                display_name="Approved deeplink test provider",
                verticals=(TravelVertical.flight,),
                capabilities=(
                    ProviderCapability.flight_search,
                    ProviderCapability.flight_price_revalidation,
                ),
                current_environment=ProviderEnvironment.sandbox_api,
                observation_method=ProviderEnvironment.sandbox_api,
                fixed_origins=("https://api.example.test",),
                official=True,
                independently_queries_market=True,
                supports_deeplinks=True,
                redirect_origins=("https://book.example.test",),
                flight_revalidation_supported=True,
            )

        async def search_flights(self, request):
            del request
            return normalize_flight_offers(
                _fixture("flight_search_success.json"),
                environment=ProviderEnvironment.sandbox_api,
            ).model_copy(update={"offers": [self.offer]})

        async def revalidate_flight(self, raw_offer):
            del raw_offer
            return FlightRevalidationResult(
                environment=ProviderEnvironment.sandbox_api,
                status=RevalidationStatus.confirmed,
                previous_offer=self.offer,
                current_offer=self.offer,
            )

        async def aclose(self) -> None:
            return None

    async def scenario() -> None:
        registry = ProviderRegistry()
        registry.register(DeeplinkProvider())
        service = TravelSearchService(
            repository=InMemoryTravelRepository(),
            runtime=MemoryTravelRuntime(),
            providers=registry,
            capability_secret=b"redirect-test-secret-that-is-long-enough",
        )
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="redirect-flight-search-0001",
        )
        await TravelSearchWorker(service).process_one()
        snapshot = service.get_snapshot(
            accepted.search_id,
            capability_token=accepted.capability_token,
        )
        result = await service.revalidate_offer(
            accepted.search_id,
            snapshot.selected_offer_id,
            capability_token=accepted.capability_token,
        )
        assert result.redirect_eligible is True
        redirect = await service.authorize_redirect(
            accepted.search_id,
            snapshot.selected_offer_id,
            result.revalidation_id,
            capability_token=accepted.capability_token,
        )
        assert redirect.target_url.startswith("https://book.example.test/")

    asyncio.run(scenario())
