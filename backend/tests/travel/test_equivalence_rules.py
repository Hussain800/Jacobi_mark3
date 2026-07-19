from datetime import date, datetime, timedelta, timezone

from travel.domain import (
    CabinClass,
    EquivalenceClass,
    FlightIntent,
    FlightLegIntent,
    FlightOffer,
    FlightSegmentIdentity,
    HotelIntent,
    HotelOffer,
    PageContext,
    PassengerMix,
    PaymentTiming,
    PropertyHint,
    RoomOccupancy,
    SelectedFlightIdentity,
    SelectedHotelRate,
    TicketingStructure,
    TripType,
)
from travel.equivalence import (
    ReasonCode,
    classify_flight_equivalence,
    classify_hotel_equivalence,
)


NOW = datetime(2026, 7, 13, tzinfo=timezone.utc)
DEPARTURE = datetime(2026, 9, 1, 10, tzinfo=timezone.utc)


def segment(*, marketing: str = "EK", origin: str = "DXB") -> FlightSegmentIdentity:
    return FlightSegmentIdentity(
        marketing_carrier=marketing,
        operating_carrier="EK",
        flight_number="EK001",
        origin_airport=origin,
        destination_airport="LHR",
        scheduled_departure=DEPARTURE,
        scheduled_arrival=DEPARTURE + timedelta(hours=8),
    )


def flight_intent() -> FlightIntent:
    selected = SelectedFlightIdentity(
        segments=(segment(),),
        cabin=CabinClass.ECONOMY,
        checked_bags_included=1,
        fare_restriction_class="standard",
        refundable=False,
        changeable=True,
        ticketing_structure=TicketingStructure.PROTECTED,
    )
    return FlightIntent(
        trip_type=TripType.ONE_WAY,
        legs=(FlightLegIntent(origin_airport="DXB", destination_airport="LHR", departure_date=date(2026, 9, 1)),),
        passengers=PassengerMix(adults=1),
        requested_cabin=CabinClass.ECONOMY,
        selected_itinerary=selected,
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=PageContext(site="example.test", page_kind="flight"),
        extracted_at=NOW,
    )


def flight_offer(**changes) -> FlightOffer:
    values = dict(
        trip_type=TripType.ONE_WAY,
        passengers=PassengerMix(adults=1),
        segments=(segment(),),
        cabin=CabinClass.ECONOMY,
        checked_bags_included=1,
        fare_restriction_class="standard",
        refundable=False,
        changeable=True,
        ticketing_structure=TicketingStructure.PROTECTED,
    )
    values.update(changes)
    return FlightOffer(**values)


def test_exact_flight_requires_all_material_fields() -> None:
    result = classify_flight_equivalence(flight_intent(), flight_offer())
    assert result.classification == EquivalenceClass.EXACT
    assert result.reason_codes == ()


def test_marketing_carrier_difference_is_a_disclosed_tradeoff() -> None:
    result = classify_flight_equivalence(
        flight_intent(),
        flight_offer(segments=(segment(marketing="QF"),)),
    )
    assert result.classification == EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF
    assert ReasonCode.MARKETING_CARRIER_MISMATCH in result.reason_codes


def test_airport_mismatch_is_rejected_and_unknown_baggage_is_insufficient() -> None:
    rejected = classify_flight_equivalence(
        flight_intent(),
        flight_offer(segments=(segment(origin="AUH"),)),
    )
    insufficient = classify_flight_equivalence(
        flight_intent(),
        flight_offer(checked_bags_included=None),
    )
    assert rejected.classification == EquivalenceClass.REJECTED
    assert ReasonCode.AIRPORT_MISMATCH in rejected.reason_codes
    assert insufficient.classification == EquivalenceClass.INSUFFICIENT_EVIDENCE
    assert ReasonCode.BAGGAGE_UNKNOWN in insufficient.reason_codes


def hotel_models(*, candidate_name: str = "Exact Hotel", property_id: str | None = "canon-1"):
    occupancy = RoomOccupancy(adults=2)
    deadline = datetime(2026, 8, 30, 18, tzinfo=timezone.utc)
    rate = SelectedHotelRate(
        room_family="Deluxe King",
        bed_configuration=("king",),
        meal_plan="breakfast",
        refundable=True,
        cancellation_deadline=deadline,
        payment_timing=PaymentTiming.PAY_NOW,
        occupancy=occupancy,
        private_bathroom=True,
        guaranteed_room=True,
    )
    baseline_property = PropertyHint(name="Exact Hotel", canonical_property_id=property_id)
    candidate_property = PropertyHint(name=candidate_name, canonical_property_id=property_id)
    intent = HotelIntent(
        property_hint=baseline_property,
        check_in=date(2026, 9, 1),
        check_out=date(2026, 9, 3),
        rooms=(occupancy,),
        selected_rate=rate,
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=PageContext(site="example.test", page_kind="hotel"),
        extracted_at=NOW,
    )
    offer = HotelOffer(
        property=candidate_property,
        check_in=intent.check_in,
        check_out=intent.check_out,
        rooms=intent.rooms,
        rate=rate,
        mandatory_fee_basis_complete=True,
    )
    return intent, offer


def test_exact_hotel_rate_and_ambiguous_name_only_property() -> None:
    intent, offer = hotel_models()
    exact = classify_hotel_equivalence(intent, offer)
    assert exact.classification == EquivalenceClass.EXACT

    ambiguous_intent, _ = hotel_models(property_id=None)
    ambiguous_offer = offer.model_copy(update={
        "property": PropertyHint(name="Exact Hotel")
    })
    ambiguous = classify_hotel_equivalence(ambiguous_intent, ambiguous_offer)
    assert ambiguous.classification == EquivalenceClass.INSUFFICIENT_EVIDENCE
    assert ReasonCode.PROPERTY_AMBIGUOUS in ambiguous.reason_codes
