from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from travel.domain import (
    FlightIntent,
    FlightLegIntent,
    HotelIntent,
    Money,
    PageContext,
    PassengerMix,
    PropertyHint,
    RoomOccupancy,
    TripType,
)


NOW = datetime(2026, 7, 13, tzinfo=timezone.utc)


def page() -> PageContext:
    return PageContext(site="example.test", page_kind="search", structured_data={"query": "DXB-LHR"})


def test_money_is_decimal_authoritative_and_normalizes_currency() -> None:
    money = Money(amount="184.10", currency="aed")

    assert money.amount == Decimal("184.10")
    assert money.currency == "AED"
    with pytest.raises(ValidationError):
        Money(amount=184.10, currency="AED")


def test_flight_intent_validates_trip_shape_without_identity_fields() -> None:
    intent = FlightIntent(
        trip_type=TripType.ONE_WAY,
        legs=(FlightLegIntent(origin_airport="dxb", destination_airport="lhr", departure_date=date(2026, 9, 1)),),
        passengers=PassengerMix(adults=2, children=1),
        locale="en-AE",
        market="AE",
        display_currency="aed",
        source_page=page(),
        extracted_at=NOW,
    )

    assert intent.legs[0].origin_airport == "DXB"
    assert intent.display_currency == "AED"
    assert "ProductIdentity" not in type(intent).__module__


def test_page_context_rejects_raw_html_and_passenger_identity() -> None:
    with pytest.raises(ValidationError, match="raw page HTML"):
        PageContext(site="example.test", page_kind="flight", structured_data={"raw_html": "<html>"})
    with pytest.raises(ValidationError, match="sensitive"):
        PageContext(site="example.test", page_kind="flight", structured_data={"passenger_name": "private"})


def test_hotel_intent_validates_dates_and_occupancy() -> None:
    occupancy = RoomOccupancy(adults=2, children=1, children_ages=(7,))
    intent = HotelIntent(
        property_hint=PropertyHint(name="Test Hotel", provider_property_id="hotel-1"),
        check_in=date(2026, 9, 1),
        check_out=date(2026, 9, 3),
        rooms=(occupancy,),
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=page(),
        extracted_at=NOW,
    )

    assert intent.rooms == (occupancy,)
    with pytest.raises(ValidationError, match="check_out"):
        intent.model_copy(update={"check_out": date(2026, 8, 31)}).__class__.model_validate(
            {**intent.model_dump(), "check_out": date(2026, 8, 31)}
        )
