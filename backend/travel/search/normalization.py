"""Convert provider-local payloads into deterministic travel domain facts."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from decimal import Decimal
from typing import Any

from ..costing import CostComponent, CostSummary, summarize_costs
from ..domain import (
    CabinClass,
    CostKind,
    CostState,
    FlightIntent,
    FlightOffer,
    FlightSegmentIdentity,
    HotelIntent,
    HotelOffer,
    Money,
    PaymentTiming,
    PropertyHint,
    RoomOccupancy,
    SelectedHotelRate,
    TicketingStructure,
)
from ..providers import NormalizedFlightOffer, NormalizedHotelOffer


def stable_id(prefix: str, value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return f"{prefix}_{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:24]}"


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _cabin(value: str | None) -> CabinClass | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return {
        "economy": CabinClass.ECONOMY,
        "premium_economy": CabinClass.PREMIUM_ECONOMY,
        "premium economy": CabinClass.PREMIUM_ECONOMY,
        "business": CabinClass.BUSINESS,
        "first": CabinClass.FIRST,
    }.get(normalized)


def flight_domain_offer(
    intent: FlightIntent,
    offer: NormalizedFlightOffer,
) -> FlightOffer:
    segments = tuple(
        FlightSegmentIdentity(
            marketing_carrier=segment.marketing_carrier,
            operating_carrier=segment.operating_carrier,
            flight_number=f"{segment.marketing_carrier}{segment.marketing_flight_number}",
            origin_airport=segment.departure_airport,
            destination_airport=segment.arrival_airport,
            scheduled_departure=_parse_datetime(segment.departure_at),
            scheduled_arrival=_parse_datetime(segment.arrival_at),
        )
        for itinerary in offer.itineraries
        for segment in itinerary.segments
    )
    cabins = {
        _cabin(segment.cabin)
        for itinerary in offer.itineraries
        for segment in itinerary.segments
        if _cabin(segment.cabin) is not None
    }
    cabin = next(iter(cabins)) if len(cabins) == 1 else None
    bag_quantities = [
        item.quantity for item in offer.baggage if item.known and item.quantity is not None
    ]
    checked_bags = min(bag_quantities) if offer.baggage_known and bag_quantities else None
    fare_bases = {
        segment.fare_basis
        for itinerary in offer.itineraries
        for segment in itinerary.segments
        if segment.fare_basis
    }
    return FlightOffer(
        trip_type=intent.trip_type,
        passengers=intent.passengers,
        segments=segments,
        cabin=cabin,
        checked_bags_included=checked_bags,
        baggage_cost_reliable=offer.baggage_known,
        fare_restriction_class=(next(iter(fare_bases)) if len(fare_bases) == 1 else None),
        refundable=None,
        changeable=None,
        ticketing_structure=TicketingStructure.PROTECTED,
        tradeoff_disclosed=False,
    )


def flight_costs(
    offer: NormalizedFlightOffer,
) -> tuple[tuple[CostComponent, ...], CostSummary]:
    components: list[CostComponent] = [
        CostComponent(
            kind=CostKind.BASE_FARE,
            state=CostState.KNOWN,
            money=Money(amount=offer.grand_total_amount, currency=offer.currency),
            description="Provider-quoted grand total, including returned taxes and fees.",
        )
    ]
    if not offer.baggage_known:
        components.append(
            CostComponent(
                kind=CostKind.BAGGAGE,
                state=CostState.UNKNOWN,
                description="Required checked-baggage cost was not established by the provider.",
            )
        )
    return tuple(components), summarize_costs(components, offer.currency)


def _bed_configuration(
    room_type: str | None,
    description: str | None,
) -> tuple[str, ...] | None:
    value = f"{room_type or ''} {description or ''}".casefold()
    for needle, canonical in (("king", "king"), ("queen", "queen"), ("twin", "twin")):
        if needle in value:
            return (canonical,)
    return None


def _payment_timing(value: str | None) -> PaymentTiming | None:
    normalized = (value or "").strip().casefold()
    if normalized in {"deposit", "partial"}:
        return PaymentTiming.DEPOSIT
    if normalized in {"guarantee", "pay_at_hotel", "pay_at_property"}:
        return PaymentTiming.PAY_AT_PROPERTY
    if normalized in {"full", "prepay", "pay_now"}:
        return PaymentTiming.PAY_NOW
    return None


def hotel_domain_offer(
    intent: HotelIntent,
    offer: NormalizedHotelOffer,
) -> HotelOffer:
    baseline = intent.property_hint
    same_amadeus_id = (
        baseline.provider_property_id == offer.hotel_id
        or intent.source_page.structured_data.get("amadeus_hotel_id") == offer.hotel_id
    )
    property_hint = PropertyHint(
        provider_property_id=offer.hotel_id,
        canonical_property_id=(baseline.canonical_property_id if same_amadeus_id else None),
        name=offer.hotel_name or offer.hotel_id,
        address=", ".join(offer.address_lines) or None,
        latitude=offer.latitude,
        longitude=offer.longitude,
    )
    occupancy = RoomOccupancy(
        adults=offer.adults or sum(room.adults for room in intent.rooms)
    )
    rooms = tuple(occupancy for _ in range(offer.room_quantity or len(intent.rooms)))
    rate = SelectedHotelRate(
        room_name=offer.room_description,
        room_family=offer.room_category or offer.room_type,
        bed_configuration=_bed_configuration(offer.room_type, offer.room_description),
        meal_plan=offer.board_type,
        refundable=None,
        cancellation_deadline=None,
        payment_timing=_payment_timing(offer.payment_type),
        occupancy=rooms[0],
        private_bathroom=None,
        guaranteed_room=None,
    )
    if offer.check_in_date is None or offer.check_out_date is None:
        raise ValueError("hotel provider offer omitted stay dates")
    return HotelOffer(
        property=property_hint,
        check_in=datetime.fromisoformat(offer.check_in_date).date(),
        check_out=datetime.fromisoformat(offer.check_out_date).date(),
        rooms=rooms,
        rate=rate,
        mandatory_fee_basis_complete=offer.mandatory_costs_complete,
        payment_timing_material=True,
    )


def hotel_costs(
    offer: NormalizedHotelOffer,
) -> tuple[tuple[CostComponent, ...], CostSummary]:
    components: list[CostComponent] = [
        CostComponent(
            kind=CostKind.BASE_RATE,
            state=CostState.KNOWN,
            money=Money(amount=offer.total_amount, currency=offer.currency),
            description="Provider-returned hotel total.",
        )
    ]
    if not offer.mandatory_costs_complete:
        components.extend(
            (
                CostComponent(
                    kind=CostKind.RESORT_FEE,
                    state=CostState.UNKNOWN,
                    description="Property or resort fees may be payable outside the provider total.",
                ),
                CostComponent(
                    kind=CostKind.LOCAL_TAX,
                    state=CostState.UNKNOWN,
                    description="Local or pay-at-property taxes are not proven complete.",
                ),
            )
        )
    return tuple(components), summarize_costs(components, offer.currency)


def quoted_total(offer: NormalizedFlightOffer | NormalizedHotelOffer) -> Decimal:
    if isinstance(offer, NormalizedFlightOffer):
        return offer.grand_total_amount
    return offer.total_amount
