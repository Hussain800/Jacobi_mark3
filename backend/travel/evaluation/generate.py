"""Deterministically generate the checked-in v1 equivalence corpora."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import UUID

from ..domain.enums import (
    CabinClass,
    EquivalenceClass,
    PaymentTiming,
    TicketingStructure,
    TravelVertical,
    TripType,
)
from ..domain.flight import (
    FlightIntent,
    FlightLegIntent,
    FlightOffer,
    FlightSegmentIdentity,
    PassengerMix,
    SelectedFlightIdentity,
)
from ..domain.hotel import (
    HotelIntent,
    HotelOffer,
    PropertyHint,
    RoomOccupancy,
    SelectedHotelRate,
)
from ..domain.intent import PageContext
from ..equivalence.reasons import ReasonCode
from .evaluator import DATASET_DIRECTORY
from .models import GoldenEquivalencePair


CASES_PER_CLASS = 64
_ORDER = (
    EquivalenceClass.EXACT,
    EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF,
    EquivalenceClass.SIMILAR_NOT_EQUIVALENT,
    EquivalenceClass.REJECTED,
    EquivalenceClass.INSUFFICIENT_EVIDENCE,
)


def _page(kind: str) -> PageContext:
    return PageContext(site="golden.example", page_kind=kind, structured_data={"fixture": True})


def _flight_record(index: int, expected: EquivalenceClass) -> GoldenEquivalencePair:
    departure_date = date(2026, 9, 1) + timedelta(days=index % 20)
    departure = datetime.combine(departure_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=10)
    flight_number = f"EK{100 + index:03d}"

    def make_segment(*, marketing: str = "EK", origin: str = "DXB") -> FlightSegmentIdentity:
        return FlightSegmentIdentity(
            marketing_carrier=marketing,
            operating_carrier="EK",
            flight_number=flight_number,
            origin_airport=origin,
            destination_airport="LHR",
            scheduled_departure=departure,
            scheduled_arrival=departure + timedelta(hours=8),
        )

    selected = SelectedFlightIdentity(
        segments=(make_segment(),),
        cabin=CabinClass.ECONOMY,
        checked_bags_included=1,
        fare_restriction_class="standard",
        refundable=False,
        changeable=True,
        ticketing_structure=TicketingStructure.PROTECTED,
    )
    intent = FlightIntent(
        intent_id=UUID(int=(_ORDER.index(expected) * 1_000) + index + 1),
        trip_type=TripType.ONE_WAY,
        legs=(FlightLegIntent(
            origin_airport="DXB",
            destination_airport="LHR",
            departure_date=departure_date,
        ),),
        passengers=PassengerMix(adults=1 + index % 2),
        requested_cabin=CabinClass.ECONOMY,
        selected_itinerary=selected,
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=_page("flight"),
        extracted_at=datetime(2026, 7, 13, tzinfo=timezone.utc),
    )
    candidate_values = dict(
        trip_type=TripType.ONE_WAY,
        passengers=intent.passengers,
        segments=(make_segment(),),
        cabin=CabinClass.ECONOMY,
        checked_bags_included=1,
        fare_restriction_class="standard",
        refundable=False,
        changeable=True,
        ticketing_structure=TicketingStructure.PROTECTED,
    )
    reasons: tuple[ReasonCode, ...] = ()
    tags = [expected.value]
    if expected == EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF:
        candidate_values["segments"] = (make_segment(marketing="QF"),)
        reasons = (ReasonCode.MARKETING_CARRIER_MISMATCH,)
        tags.extend(("marketing_carrier", "disclosed_tradeoff"))
    elif expected == EquivalenceClass.SIMILAR_NOT_EQUIVALENT:
        candidate_values["fare_restriction_class"] = "basic"
        reasons = (ReasonCode.FARE_RESTRICTION_MISMATCH,)
        tags.extend(("fare_restriction", "material_variant"))
    elif expected == EquivalenceClass.REJECTED:
        candidate_values["segments"] = (make_segment(origin="AUH"),)
        reasons = (ReasonCode.AIRPORT_MISMATCH,)
        tags.extend(("airport_mismatch", "material_mismatch", "adversarial"))
    elif expected == EquivalenceClass.INSUFFICIENT_EVIDENCE:
        candidate_values["checked_bags_included"] = None
        reasons = (ReasonCode.BAGGAGE_UNKNOWN,)
        tags.extend(("missing_baggage", "adversarial"))
    candidate = FlightOffer(**candidate_values)
    return GoldenEquivalencePair(
        dataset_version="v1",
        case_id=f"flight-{expected.value}-{index:03d}",
        vertical=TravelVertical.FLIGHT,
        intent=intent.model_dump(mode="json"),
        candidate=candidate.model_dump(mode="json"),
        expected_classification=expected,
        expected_reason_codes=reasons,
        tags=tuple(tags),
    )


def _hotel_record(index: int, expected: EquivalenceClass) -> GoldenEquivalencePair:
    check_in = date(2026, 10, 1) + timedelta(days=index % 20)
    occupancy = RoomOccupancy(adults=1 + index % 2)
    deadline = datetime.combine(check_in, datetime.min.time(), tzinfo=timezone.utc) - timedelta(days=2, hours=6)
    property_id = None if expected == EquivalenceClass.INSUFFICIENT_EVIDENCE else f"property-{index:03d}"
    property_name = f"Golden Hotel {index:03d}"
    baseline_property = PropertyHint(name=property_name, canonical_property_id=property_id)
    candidate_property = PropertyHint(name=property_name, canonical_property_id=property_id)
    baseline_rate = SelectedHotelRate(
        room_name="Deluxe King Room",
        room_family="deluxe king",
        bed_configuration=("king",),
        meal_plan="breakfast",
        refundable=True,
        cancellation_deadline=deadline,
        payment_timing=PaymentTiming.PAY_NOW,
        occupancy=occupancy,
        private_bathroom=True,
        guaranteed_room=True,
    )
    intent = HotelIntent(
        intent_id=UUID(int=10_000 + (_ORDER.index(expected) * 1_000) + index + 1),
        property_hint=baseline_property,
        check_in=check_in,
        check_out=check_in + timedelta(days=2),
        rooms=(occupancy,),
        selected_rate=baseline_rate,
        locale="en-AE",
        market="AE",
        display_currency="AED",
        source_page=_page("hotel"),
        extracted_at=datetime(2026, 7, 13, tzinfo=timezone.utc),
    )
    candidate_rate_values = baseline_rate.model_dump()
    candidate_values = dict(
        property=candidate_property,
        check_in=intent.check_in,
        check_out=intent.check_out,
        rooms=intent.rooms,
        mandatory_fee_basis_complete=True,
        payment_timing_material=True,
        tradeoff_disclosed=False,
    )
    reasons: tuple[ReasonCode, ...] = ()
    tags = [expected.value]
    if expected in {
        EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF,
        EquivalenceClass.SIMILAR_NOT_EQUIVALENT,
    }:
        candidate_rate_values["payment_timing"] = PaymentTiming.PAY_AT_PROPERTY
        candidate_values["payment_timing_material"] = False
        candidate_values["tradeoff_disclosed"] = (
            expected == EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF
        )
        reasons = (ReasonCode.PAYMENT_TIMING_MISMATCH,)
        tags.extend(("payment_timing", "material_variant"))
        if expected == EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF:
            tags.append("disclosed_tradeoff")
    elif expected == EquivalenceClass.REJECTED:
        candidate_rate_values["meal_plan"] = "room only"
        reasons = (ReasonCode.MEAL_PLAN_MISMATCH,)
        tags.extend(("meal_plan", "material_mismatch", "adversarial"))
    elif expected == EquivalenceClass.INSUFFICIENT_EVIDENCE:
        reasons = (ReasonCode.PROPERTY_AMBIGUOUS,)
        tags.extend(("property_name_collision", "adversarial"))
    candidate_values["rate"] = SelectedHotelRate.model_validate(candidate_rate_values)
    candidate = HotelOffer(**candidate_values)
    return GoldenEquivalencePair(
        dataset_version="v1",
        case_id=f"hotel-{expected.value}-{index:03d}",
        vertical=TravelVertical.HOTEL,
        intent=intent.model_dump(mode="json"),
        candidate=candidate.model_dump(mode="json"),
        expected_classification=expected,
        expected_reason_codes=reasons,
        tags=tuple(tags),
    )


def build_records(vertical: TravelVertical) -> list[GoldenEquivalencePair]:
    builder = _flight_record if vertical == TravelVertical.FLIGHT else _hotel_record
    return [
        builder(index, expected)
        for expected in _ORDER
        for index in range(CASES_PER_CLASS)
    ]


def write_datasets(directory: Path = DATASET_DIRECTORY) -> dict[str, int]:
    directory.mkdir(parents=True, exist_ok=True)
    written: dict[str, int] = {}
    for vertical, name in (
        (TravelVertical.FLIGHT, "flight_equivalence_v1"),
        (TravelVertical.HOTEL, "hotel_equivalence_v1"),
    ):
        records = build_records(vertical)
        path = directory / f"{name}.jsonl"
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            for record in records:
                handle.write(json.dumps(record.model_dump(mode="json"), sort_keys=True, separators=(",", ":")))
                handle.write("\n")
        written[name] = len(records)
    return written


if __name__ == "__main__":
    print(json.dumps(write_datasets(), sort_keys=True))
