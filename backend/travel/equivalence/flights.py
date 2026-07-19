"""Deterministic flight exactness and trade-off classification."""

from __future__ import annotations

from ..domain.enums import TicketingStructure
from ..domain.flight import FlightIntent, FlightOffer
from .base import FieldDisposition, EquivalenceResult, classify_comparisons, comparison
from .reasons import ReasonCode


def classify_flight_equivalence(intent: FlightIntent, candidate: FlightOffer) -> EquivalenceResult:
    facts = []

    if intent.passengers == candidate.passengers:
        facts.append(comparison("passengers", FieldDisposition.MATCH, "Passenger mix matches."))
    else:
        facts.append(comparison(
            "passengers",
            FieldDisposition.REJECTED,
            "Passenger mix differs from the requested journey.",
            baseline=intent.passengers.model_dump(mode="json"),
            candidate=candidate.passengers.model_dump(mode="json"),
            reason_code=ReasonCode.PASSENGER_MIX_MISMATCH,
        ))

    if intent.trip_type == candidate.trip_type:
        facts.append(comparison("trip_type", FieldDisposition.MATCH, "Trip type matches."))
    else:
        facts.append(comparison(
            "trip_type",
            FieldDisposition.REJECTED,
            "Trip type differs from the requested journey.",
            baseline=intent.trip_type.value,
            candidate=candidate.trip_type.value,
            reason_code=ReasonCode.TRIP_TYPE_MISMATCH,
        ))

    selected = intent.selected_itinerary
    expected_segments = selected.segments if selected is not None else None
    expected_count = len(expected_segments) if expected_segments is not None else len(intent.legs)
    if len(candidate.segments) == expected_count:
        facts.append(comparison("segment_count", FieldDisposition.MATCH, "Segment count matches."))
    else:
        facts.append(comparison(
            "segment_count",
            FieldDisposition.REJECTED if selected is not None else FieldDisposition.SIMILAR,
            "Segment count differs from the baseline journey.",
            baseline=expected_count,
            candidate=len(candidate.segments),
            reason_code=ReasonCode.SEGMENT_COUNT_MISMATCH,
        ))

    if expected_segments is not None:
        pairs = zip(expected_segments, candidate.segments)
        for index, (baseline_segment, candidate_segment) in enumerate(pairs):
            prefix = f"segments[{index}]"
            airports_match = (
                baseline_segment.origin_airport == candidate_segment.origin_airport
                and baseline_segment.destination_airport == candidate_segment.destination_airport
            )
            facts.append(comparison(
                f"{prefix}.airports",
                FieldDisposition.MATCH if airports_match else FieldDisposition.REJECTED,
                "Segment airports match." if airports_match else "Segment airports differ.",
                baseline=f"{baseline_segment.origin_airport}-{baseline_segment.destination_airport}",
                candidate=f"{candidate_segment.origin_airport}-{candidate_segment.destination_airport}",
                reason_code=None if airports_match else ReasonCode.AIRPORT_MISMATCH,
            ))
            dates_match = (
                baseline_segment.scheduled_departure.date()
                == candidate_segment.scheduled_departure.date()
            )
            facts.append(comparison(
                f"{prefix}.departure_date",
                FieldDisposition.MATCH if dates_match else FieldDisposition.REJECTED,
                "Segment departure date matches." if dates_match else "Segment departure date differs.",
                baseline=baseline_segment.scheduled_departure.date(),
                candidate=candidate_segment.scheduled_departure.date(),
                reason_code=None if dates_match else ReasonCode.DATE_MISMATCH,
            ))

            if baseline_segment.operating_carrier is None or candidate_segment.operating_carrier is None:
                facts.append(comparison(
                    f"{prefix}.operating_carrier",
                    FieldDisposition.INSUFFICIENT,
                    "Operating carrier evidence is missing for a selected itinerary.",
                    baseline=baseline_segment.operating_carrier,
                    candidate=candidate_segment.operating_carrier,
                    reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
                ))
            else:
                operating_match = baseline_segment.operating_carrier == candidate_segment.operating_carrier
                facts.append(comparison(
                    f"{prefix}.operating_carrier",
                    FieldDisposition.MATCH if operating_match else FieldDisposition.REJECTED,
                    "Operating carrier matches." if operating_match else "Operating carrier differs.",
                    baseline=baseline_segment.operating_carrier,
                    candidate=candidate_segment.operating_carrier,
                    reason_code=None if operating_match else ReasonCode.OPERATING_CARRIER_MISMATCH,
                ))

            flight_match = baseline_segment.flight_number == candidate_segment.flight_number
            facts.append(comparison(
                f"{prefix}.flight_number",
                FieldDisposition.MATCH if flight_match else FieldDisposition.REJECTED,
                "Operating flight number matches." if flight_match else "Operating flight number differs.",
                baseline=baseline_segment.flight_number,
                candidate=candidate_segment.flight_number,
                reason_code=None if flight_match else ReasonCode.FLIGHT_NUMBER_MISMATCH,
            ))

            marketing_match = baseline_segment.marketing_carrier == candidate_segment.marketing_carrier
            if not marketing_match:
                facts.append(comparison(
                    f"{prefix}.marketing_carrier",
                    FieldDisposition.TRADEOFF,
                    "Marketing carrier differs while the operating-flight facts are compared separately.",
                    baseline=baseline_segment.marketing_carrier,
                    candidate=candidate_segment.marketing_carrier,
                    reason_code=ReasonCode.MARKETING_CARRIER_MISMATCH,
                ))
    else:
        for index, (leg, segment) in enumerate(zip(intent.legs, candidate.segments)):
            airports_match = (
                leg.origin_airport == segment.origin_airport
                and leg.destination_airport == segment.destination_airport
            )
            facts.append(comparison(
                f"legs[{index}].airports",
                FieldDisposition.MATCH if airports_match else FieldDisposition.REJECTED,
                "Leg airports match." if airports_match else "Leg airports differ.",
                reason_code=None if airports_match else ReasonCode.AIRPORT_MISMATCH,
            ))
            dates_match = leg.departure_date == segment.scheduled_departure.date()
            facts.append(comparison(
                f"legs[{index}].departure_date",
                FieldDisposition.MATCH if dates_match else FieldDisposition.REJECTED,
                "Leg departure date matches." if dates_match else "Leg departure date differs.",
                reason_code=None if dates_match else ReasonCode.DATE_MISMATCH,
            ))

    expected_cabin = selected.cabin if selected is not None and selected.cabin is not None else intent.requested_cabin
    if expected_cabin is None or candidate.cabin is None:
        facts.append(comparison(
            "cabin",
            FieldDisposition.INSUFFICIENT,
            "Cabin evidence is incomplete.",
            baseline=expected_cabin,
            candidate=candidate.cabin,
            reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
        ))
    else:
        cabin_match = expected_cabin == candidate.cabin
        facts.append(comparison(
            "cabin",
            FieldDisposition.MATCH if cabin_match else FieldDisposition.REJECTED,
            "Cabin matches." if cabin_match else "Cabin differs.",
            baseline=expected_cabin.value,
            candidate=candidate.cabin.value,
            reason_code=None if cabin_match else ReasonCode.CABIN_MISMATCH,
        ))

    required_bags = None
    if intent.baggage_requirements is not None:
        required_bags = intent.baggage_requirements.checked_bags_per_passenger
    if required_bags is None and selected is not None:
        required_bags = selected.checked_bags_included
    if required_bags is None or candidate.checked_bags_included is None:
        facts.append(comparison(
            "checked_baggage",
            FieldDisposition.INSUFFICIENT,
            "Included checked-baggage evidence is incomplete.",
            baseline=required_bags,
            candidate=candidate.checked_bags_included,
            reason_code=ReasonCode.BAGGAGE_UNKNOWN,
        ))
    elif candidate.checked_bags_included < required_bags and not candidate.baggage_cost_reliable:
        facts.append(comparison(
            "checked_baggage",
            FieldDisposition.REJECTED,
            "Candidate omits required checked baggage and has no reliable cost adjustment.",
            baseline=required_bags,
            candidate=candidate.checked_bags_included,
            reason_code=ReasonCode.BAGGAGE_NOT_INCLUDED,
        ))
    else:
        baggage_match = candidate.checked_bags_included == required_bags
        facts.append(comparison(
            "checked_baggage",
            FieldDisposition.MATCH if baggage_match else FieldDisposition.TRADEOFF,
            "Checked-baggage inclusion matches." if baggage_match else "Baggage is cost-adjusted or more inclusive.",
            reason_code=None if baggage_match else ReasonCode.BAGGAGE_NOT_INCLUDED,
        ))

    if selected is not None and selected.fare_restriction_class is not None:
        if candidate.fare_restriction_class is None:
            facts.append(comparison(
                "fare_restriction_class",
                FieldDisposition.INSUFFICIENT,
                "Candidate fare restrictions are not evidenced.",
                reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
            ))
        elif selected.fare_restriction_class != candidate.fare_restriction_class:
            facts.append(comparison(
                "fare_restriction_class",
                FieldDisposition.TRADEOFF if candidate.tradeoff_disclosed else FieldDisposition.SIMILAR,
                "Fare restriction class differs from the baseline.",
                baseline=selected.fare_restriction_class,
                candidate=candidate.fare_restriction_class,
                reason_code=ReasonCode.FARE_RESTRICTION_MISMATCH,
            ))

    if selected is not None and selected.refundable is not None:
        if candidate.refundable is None:
            facts.append(comparison(
                "refundability",
                FieldDisposition.INSUFFICIENT,
                "Candidate refundability is not evidenced.",
                reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
            ))
        elif selected.refundable != candidate.refundable:
            disposition = FieldDisposition.REJECTED if selected.refundable else FieldDisposition.TRADEOFF
            facts.append(comparison(
                "refundability",
                disposition,
                "Refundability differs from the baseline.",
                baseline=selected.refundable,
                candidate=candidate.refundable,
                reason_code=ReasonCode.REFUNDABILITY_MISMATCH,
            ))

    if selected is not None and selected.changeable is not None:
        if candidate.changeable is None:
            facts.append(comparison(
                "changeability",
                FieldDisposition.INSUFFICIENT,
                "Candidate changeability is not evidenced.",
                reason_code=ReasonCode.INSUFFICIENT_EVIDENCE,
            ))
        elif selected.changeable != candidate.changeable:
            facts.append(comparison(
                "changeability",
                FieldDisposition.TRADEOFF if candidate.tradeoff_disclosed else FieldDisposition.SIMILAR,
                "Changeability differs from the baseline.",
                baseline=selected.changeable,
                candidate=candidate.changeable,
                reason_code=ReasonCode.CHANGEABILITY_MISMATCH,
            ))

    baseline_ticketing = selected.ticketing_structure if selected is not None else TicketingStructure.PROTECTED
    if candidate.ticketing_structure == TicketingStructure.SELF_TRANSFER and baseline_ticketing != TicketingStructure.SELF_TRANSFER:
        facts.append(comparison(
            "ticketing_structure",
            FieldDisposition.REJECTED,
            "A self-transfer replaces a protected itinerary.",
            reason_code=ReasonCode.SELF_TRANSFER,
        ))
    elif candidate.ticketing_structure == TicketingStructure.SEPARATE_TICKETS and baseline_ticketing != TicketingStructure.SEPARATE_TICKETS:
        facts.append(comparison(
            "ticketing_structure",
            FieldDisposition.TRADEOFF if candidate.tradeoff_disclosed else FieldDisposition.REJECTED,
            "Separate tickets replace the baseline ticketing structure.",
            reason_code=ReasonCode.SEPARATE_TICKET,
        ))

    return classify_comparisons(facts)


evaluate_flight_equivalence = classify_flight_equivalence

