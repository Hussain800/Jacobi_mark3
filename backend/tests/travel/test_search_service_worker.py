from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from agentcore.storage import get_repo as get_agentcore_repository
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
from travel.persistence import AccessContext
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
from travel.search.schemas import TravelPreferences
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
        manifest_id = snapshot.offers[0]["evidence_manifest_id"]
        manifest = service.evidence_manifest(accepted.search_id, manifest_id)
        assert manifest is not None
        assert manifest.extractions[0].value == {
            "amount": "1210.00",
            "currency": "AED",
        }
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


def test_travel_evidence_preserves_decimal_text_and_rejects_tampering() -> None:
    offer = normalize_flight_offers(_fixture("flight_search_success.json")).offers[0]
    offer = offer.model_copy(
        update={"grand_total_amount": Decimal("9007199254740993.01")}
    )
    manifest_id, _ = TravelSearchWorker._evidence(
        "precision-search",
        "precision-offer",
        offer,
        True,
        (),
    )
    service = _service()
    manifest = service.evidence_manifest("precision-search", manifest_id)
    assert manifest is not None
    assert manifest.extractions[0].value == {
        "amount": "9007199254740993.01",
        "currency": "AED",
    }

    stored = get_agentcore_repository().get_manifest(
        manifest_id,
        "travel:precision-search",
    )
    assert stored is not None
    stored.limitations.append("tampered after creation")
    assert service.evidence_manifest("precision-search", manifest_id) is None


def test_authenticated_hard_preferences_are_snapshotted_and_explained() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return _token_response()
        return httpx.Response(200, json=_fixture("flight_search_success.json"))

    async def scenario() -> None:
        provider = _provider(handler)
        service = _service(provider)
        service.save_preferences(
            "traveller-1",
            TravelPreferences(flight_checked_bags=3),
        )
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="flight-owner-preferences-0001",
            owner_id="traveller-1",
        )
        await TravelSearchWorker(service).process_one()
        snapshot = service.get_snapshot(
            accepted.search_id,
            owner_id="traveller-1",
        )
        offer = snapshot.offers[0]
        assert offer["hard_preference_violations"] == ["flight_checked_bags"]
        assert offer["rank_key"]["hard_preference_violations"] == 1
        assert "HARD_PREFERENCE_VIOLATION" in offer["saving"]["reason_codes"]
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


def test_worker_lifecycle_persists_terminal_search_expiry() -> None:
    async def scenario() -> None:
        service = _service()
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="flight-expiry-lifecycle-0001",
        )
        await TravelSearchWorker(service).process_one()
        service_access = AccessContext.for_service()
        record = service.repository.get_search(accepted.search_id, service_access)
        assert record is not None
        payload = dict(record.payload)
        payload["expires_at"] = datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat()
        service.repository.update_search(accepted.search_id, payload, service_access)

        assert await service.expire_due_searches(now=NOW) == 1
        expired = service.repository.get_search(accepted.search_id, service_access)
        assert expired is not None
        assert expired.payload["status"] == "expired"
        events = await service.runtime.events_after(accepted.search_id, None)
        assert events[-1].event.value == "search.expired"

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


def test_equivalent_second_search_uses_fresh_provider_cache_without_network() -> None:
    flight_requests = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal flight_requests
        if request.url.path.endswith("/token"):
            return _token_response()
        flight_requests += 1
        return httpx.Response(200, json=_fixture("flight_search_success.json"))

    async def scenario() -> None:
        provider = _provider(handler)
        service = _service(provider)
        first = await service.create_search(
            flight_input(),
            idempotency_key="cache-flight-search-00001",
        )
        await TravelSearchWorker(service).process_one()
        second = await service.create_search(
            flight_input(),
            idempotency_key="cache-flight-search-00002",
        )
        await TravelSearchWorker(service).process_one()
        snapshot = service.get_snapshot(
            second.search_id,
            capability_token=second.capability_token,
        )
        assert snapshot.status == "completed"
        assert snapshot.provider_attempts[0]["status"] == "cache_hit"
        events = await service.runtime.events_after(second.search_id, None)
        assert any(event.event.value == "cache.hit" for event in events)
        await provider.aclose()

    asyncio.run(scenario())
    assert flight_requests == 1


def test_client_cancellation_is_terminal_and_worker_does_not_call_provider() -> None:
    async def scenario() -> None:
        service = _service()
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="cancel-flight-search-0001",
        )
        snapshot = await service.cancel_search(
            accepted.search_id,
            capability_token=accepted.capability_token,
        )
        assert snapshot.status == "cancelled"
        await TravelSearchWorker(service).process_one()
        events = await service.runtime.events_after(accepted.search_id, None)
        assert events[-1].event.value == "search.cancelled"

    asyncio.run(scenario())


def test_soft_deadline_is_progress_event_and_provider_timeout_is_isolated() -> None:
    class SlowProvider:
        @property
        def descriptor(self) -> ProviderDescriptor:
            return ProviderDescriptor(
                provider_id="amadeus",
                display_name="Slow provider",
                verticals=(TravelVertical.flight,),
                capabilities=(ProviderCapability.flight_search,),
                current_environment=ProviderEnvironment.sandbox_api,
                observation_method=ProviderEnvironment.sandbox_api,
                fixed_origins=("https://api.example.test",),
                official=True,
                independently_queries_market=True,
            )

        async def search_flights(self, request):
            del request
            await asyncio.sleep(0.05)
            return normalize_flight_offers(
                _fixture("flight_search_success.json"),
                environment=ProviderEnvironment.sandbox_api,
            )

        async def aclose(self) -> None:
            return None

    async def scenario() -> None:
        registry = ProviderRegistry()
        registry.register(SlowProvider())
        service = TravelSearchService(
            repository=InMemoryTravelRepository(),
            runtime=MemoryTravelRuntime(),
            providers=registry,
            capability_secret=b"timeout-test-secret-that-is-long-enough",
        )
        accepted = await service.create_search(
            flight_input(),
            idempotency_key="timeout-flight-search-0001",
        )
        await TravelSearchWorker(
            service,
            soft_deadline_seconds=0.005,
            provider_timeout_seconds=0.01,
            max_provider_attempts=1,
        ).process_one()
        snapshot = service.get_snapshot(
            accepted.search_id,
            capability_token=accepted.capability_token,
        )
        assert snapshot.status == "degraded"
        assert snapshot.provider_attempts[0]["error_code"] == "timeout"
        events = await service.runtime.events_after(accepted.search_id, None)
        assert any(event.event.value == "search.soft_deadline" for event in events)

    asyncio.run(scenario())
