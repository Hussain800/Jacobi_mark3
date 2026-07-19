from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from travel.domain.enums import TripType
from travel.domain.flight import FlightIntent, FlightLegIntent
from travel.domain.hotel import HotelIntent, PropertyHint, RoomOccupancy
from travel.domain.intent import PageContext
from travel.search.fingerprint import intent_fingerprint


NOW = datetime(2026, 7, 13, 9, 0, tzinfo=timezone.utc)


def _page(site: str = "example") -> PageContext:
    return PageContext(site=site, page_kind="search", title="Untrusted title")


def test_flight_fingerprint_ignores_page_and_extraction_noise() -> None:
    intent = FlightIntent(
        trip_type=TripType.ONE_WAY,
        legs=(FlightLegIntent(origin_airport="DXB", destination_airport="LHR", departure_date=date(2026, 9, 1)),),
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=_page(),
        extracted_at=NOW,
    )
    noisy = intent.model_copy(
        update={"source_page": _page("other"), "extracted_at": NOW + timedelta(minutes=5)}
    )
    changed = intent.model_copy(
        update={"legs": (FlightLegIntent(origin_airport="DXB", destination_airport="CDG", departure_date=date(2026, 9, 1)),)}
    )
    assert intent_fingerprint(intent) == intent_fingerprint(noisy)
    assert intent_fingerprint(intent) != intent_fingerprint(changed)


def test_hotel_fingerprint_uses_property_stay_occupancy_and_currency() -> None:
    intent = HotelIntent(
        property_hint=PropertyHint(
            canonical_property_id="hotel-1",
            name="Example Hotel",
            latitude=Decimal("25.2048"),
            longitude=Decimal("55.2708"),
        ),
        check_in=date(2026, 10, 1),
        check_out=date(2026, 10, 3),
        rooms=(RoomOccupancy(adults=2),),
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=_page(),
        extracted_at=NOW,
    )
    same = intent.model_copy(update={"extracted_at": NOW + timedelta(hours=1)})
    changed = intent.model_copy(update={"display_currency": "USD"})
    assert intent_fingerprint(intent) == intent_fingerprint(same)
    assert intent_fingerprint(intent) != intent_fingerprint(changed)
