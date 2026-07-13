from __future__ import annotations

import asyncio
import json
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest

from travel.providers import (
    AMADEUS_PRODUCTION_ORIGIN,
    AMADEUS_SANDBOX_ORIGIN,
    AmadeusConfig,
    AmadeusProvider,
    FlightSearchRequest,
    HotelSearchRequest,
    ProviderEnvironment,
    ProviderError,
    ProviderErrorCode,
    RevalidationStatus,
    normalize_flight_offers,
    normalize_hotel_offers,
)


FIXTURES = Path(__file__).parents[1] / "fixtures" / "travel" / "amadeus"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _token_response() -> httpx.Response:
    return httpx.Response(200, json={"access_token": "sanitized-token", "expires_in": 1799})


def test_fixture_normalization_is_truthfully_labeled_and_preserves_money() -> None:
    batch = normalize_flight_offers(_fixture("flight_search_success.json"))

    assert batch.environment == ProviderEnvironment.fixture
    assert batch.raw_offer_count == 1
    assert batch.offers[0].grand_total_amount == Decimal("1210.00")
    assert batch.offers[0].baggage_known is True
    assert batch.offers[0].mandatory_costs_complete is True
    assert batch.offers[0].itineraries[0].segments[0].operating_carrier == "EK"


def test_missing_baggage_stays_unknown_and_blocks_cost_completeness() -> None:
    offer = normalize_flight_offers(
        _fixture("flight_search_missing_baggage.json")
    ).offers[0]

    assert offer.baggage_known is False
    assert offer.mandatory_costs_complete is False
    assert offer.unknown_costs == ["checked_baggage"]


def test_config_uses_only_fixed_official_origins_and_gates_production() -> None:
    sandbox = AmadeusConfig(client_id="id", client_secret="secret")
    assert sandbox.base_url == AMADEUS_SANDBOX_ORIGIN
    assert sandbox.environment == ProviderEnvironment.sandbox_api

    with pytest.raises(ProviderError) as exc_info:
        AmadeusConfig(
            client_id="id",
            client_secret="secret",
            environment=ProviderEnvironment.live_official_api,
        )
    assert exc_info.value.code == ProviderErrorCode.configuration

    production = AmadeusConfig(
        client_id="id",
        client_secret="secret",
        environment=ProviderEnvironment.live_official_api,
        production_approved=True,
    )
    assert production.base_url == AMADEUS_PRODUCTION_ORIGIN


def test_descriptor_declares_truthful_market_query_and_operational_limits() -> None:
    provider = AmadeusProvider(AmadeusConfig(client_id="id", client_secret="secret"))
    descriptor = provider.descriptor
    assert descriptor.official is True
    assert descriptor.independently_queries_market is True
    assert descriptor.current_environment == ProviderEnvironment.sandbox_api
    assert descriptor.observation_method == ProviderEnvironment.sandbox_api
    assert descriptor.credential_requirements == (
        "AMADEUS_CLIENT_ID",
        "AMADEUS_CLIENT_SECRET",
    )
    assert descriptor.rate_limit_per_second == 10
    assert descriptor.hotel_revalidation_supported is False


def test_oauth_is_cached_and_flight_search_uses_sandbox_origin() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        assert request.url.host == "test.api.amadeus.com"
        if request.url.path.endswith("/token"):
            form = parse_qs(request.content.decode())
            assert form == {
                "grant_type": ["client_credentials"],
                "client_id": ["id"],
                "client_secret": ["secret"],
            }
            return _token_response()
        assert request.headers["authorization"] == "Bearer sanitized-token"
        assert request.url.params["originLocationCode"] == "DXB"
        return httpx.Response(200, json=_fixture("flight_search_success.json"))

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = AmadeusProvider(
                AmadeusConfig(client_id="id", client_secret="secret"),
                http_client=client,
            )
            request = FlightSearchRequest(
                origin="dxb", destination="lhr", departure_date="2027-02-01"
            )
            first = await provider.search_flights(request)
            second = await provider.search_flights(request)
            assert first.environment == ProviderEnvironment.sandbox_api
            assert second.offers[0].provider_offer_id == "1"

    asyncio.run(scenario())
    assert calls.count("/v1/security/oauth2/token") == 1
    assert calls.count("/v2/shopping/flight-offers") == 2


@pytest.mark.parametrize(
    ("status", "expected_code"),
    [(401, ProviderErrorCode.authentication), (429, ProviderErrorCode.rate_limited)],
)
def test_auth_and_rate_limit_failures_are_sanitized(
    status: int, expected_code: ProviderErrorCode
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            if status == 401:
                return httpx.Response(status, json={"error": "invalid_client"})
            return _token_response()
        return httpx.Response(status, headers={"Retry-After": "3"}, json={"errors": []})

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = AmadeusProvider(
                AmadeusConfig(client_id="id", client_secret="do-not-leak"),
                http_client=client,
            )
            with pytest.raises(ProviderError) as exc_info:
                await provider.search_flights(
                    FlightSearchRequest(
                        origin="DXB", destination="LHR", departure_date="2027-02-01"
                    )
                )
            assert exc_info.value.code == expected_code
            assert "do-not-leak" not in str(exc_info.value)
            if status == 429:
                assert exc_info.value.retry_after_seconds == 3

    asyncio.run(scenario())


def test_timeout_and_malformed_payload_are_distinct_failures() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return _token_response()
        raise httpx.ReadTimeout("timed out", request=request)

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = AmadeusProvider(
                AmadeusConfig(client_id="id", client_secret="secret"),
                http_client=client,
            )
            with pytest.raises(ProviderError) as exc_info:
                await provider.search_flights(
                    FlightSearchRequest(
                        origin="DXB", destination="LHR", departure_date="2027-02-01"
                    )
                )
            assert exc_info.value.code == ProviderErrorCode.timeout

    asyncio.run(scenario())
    with pytest.raises(ProviderError) as exc_info:
        normalize_flight_offers({"data": [{"id": "broken"}]})
    assert exc_info.value.code == ProviderErrorCode.malformed_response


@pytest.mark.parametrize(
    ("fixture_name", "expected_status", "expected_changes"),
    [
        ("flight_price_same.json", RevalidationStatus.confirmed, []),
        ("flight_price_changed.json", RevalidationStatus.changed, ["price_changed"]),
    ],
)
def test_flight_offers_price_revalidates_same_and_changed_offers(
    fixture_name: str,
    expected_status: RevalidationStatus,
    expected_changes: list[str],
) -> None:
    previous = normalize_flight_offers(
        _fixture("flight_search_success.json"),
        environment=ProviderEnvironment.sandbox_api,
    ).offers[0]

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return _token_response()
        assert request.url.path == "/v1/shopping/flight-offers/pricing"
        sent = json.loads(request.content)
        assert sent["data"]["type"] == "flight-offers-pricing"
        assert sent["data"]["flightOffers"][0]["id"] == "1"
        return httpx.Response(200, json=_fixture(fixture_name))

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = AmadeusProvider(
                AmadeusConfig(client_id="id", client_secret="secret"),
                http_client=client,
            )
            result = await provider.revalidate_flight(previous)
            assert result.status == expected_status
            assert result.changes == expected_changes

    asyncio.run(scenario())


def test_unavailable_flight_revalidation_is_not_reported_as_confirmed() -> None:
    previous = normalize_flight_offers(
        _fixture("flight_search_success.json"),
        environment=ProviderEnvironment.sandbox_api,
    ).offers[0]

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return _token_response()
        return httpx.Response(404, json={"errors": [{"detail": "gone"}]})

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = AmadeusProvider(
                AmadeusConfig(client_id="id", client_secret="secret"),
                http_client=client,
            )
            result = await provider.revalidate_flight(previous)
            assert result.status == RevalidationStatus.unavailable
            assert result.current_offer is None

    asyncio.run(scenario())


def test_first_hotel_provider_exposes_truthful_fee_and_revalidation_limits() -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path.endswith("/token"):
            return _token_response()
        if request.url.path.endswith("/by-city"):
            assert request.url.params["cityCode"] == "DXB"
            return httpx.Response(200, json=_fixture("hotel_list_success.json"))
        assert request.url.params["hotelIds"] == "HYDXB001"
        return httpx.Response(200, json=_fixture("hotel_offers_success.json"))

    async def scenario() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = AmadeusProvider(
                AmadeusConfig(client_id="id", client_secret="secret"),
                http_client=client,
            )
            batch = await provider.search_hotels(
                HotelSearchRequest(
                    city_code="dxb",
                    check_in_date="2027-02-01",
                    check_out_date="2027-02-03",
                    adults=2,
                )
            )
            offer = batch.offers[0]
            assert batch.environment == ProviderEnvironment.sandbox_api
            assert offer.longitude == Decimal("-55.2744")
            assert offer.mandatory_costs_complete is False
            assert "property_or_resort_fees" in offer.unknown_costs
            assert provider.descriptor.hotel_revalidation_supported is False
            assert any("no guaranteed hotel price-check" in item for item in batch.limitations)

    asyncio.run(scenario())
    assert "/v1/reference-data/locations/hotels/by-city" in paths
    assert "/v3/shopping/hotel-offers" in paths


def test_hotel_fixture_normalizer_never_claims_complete_mandatory_fees() -> None:
    offer = normalize_hotel_offers(_fixture("hotel_offers_success.json")).offers[0]

    assert offer.environment == ProviderEnvironment.fixture
    assert offer.total_amount == Decimal("900.00")
    assert offer.mandatory_costs_complete is False
    assert offer.cancellation_policy_known is True
