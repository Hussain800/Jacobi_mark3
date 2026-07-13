from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from hypothesis import given, settings, strategies as st

from travel.costing import CostComponent, summarize_costs
from travel.domain import (
    CostKind,
    CostState,
    EquivalenceClass,
    FlightSegmentIdentity,
    Money,
    PassengerMix,
    RoomOccupancy,
)
from travel.ranking import RankableCandidate, rank_candidates


PROPERTY_SETTINGS = settings(max_examples=60, deadline=None)
currency_codes = st.text(
    alphabet=st.characters(min_codepoint=65, max_codepoint=90),
    min_size=3,
    max_size=3,
)
minor_units = st.integers(min_value=0, max_value=100_000_000)


@PROPERTY_SETTINGS
@given(value=minor_units, currency=currency_codes)
def test_money_preserves_decimal_minor_units_without_float_rounding(
    value: int,
    currency: str,
) -> None:
    amount = Decimal(value).scaleb(-2)
    money = Money(amount=format(amount, "f"), currency=currency.lower())

    assert money.amount == amount
    assert money.currency == currency
    assert Money.model_validate_json(money.model_dump_json()) == money


@PROPERTY_SETTINGS
@given(
    amounts=st.lists(minor_units, min_size=1, max_size=8),
    unknown_baggage=st.booleans(),
)
def test_cost_aggregation_is_permutation_invariant_and_preserves_unknowns(
    amounts: list[int],
    unknown_baggage: bool,
) -> None:
    components = [
        CostComponent(
            kind=CostKind.BASE_FARE if index == 0 else CostKind.TAXES,
            state=CostState.KNOWN,
            money=Money(amount=format(Decimal(value).scaleb(-2), "f"), currency="AED"),
        )
        for index, value in enumerate(amounts)
    ]
    if unknown_baggage:
        components.append(
            CostComponent(kind=CostKind.BAGGAGE, state=CostState.UNKNOWN)
        )

    forward = summarize_costs(components, "AED")
    reverse = summarize_costs(reversed(components), "AED")

    assert forward.known_total == sum(
        (Decimal(value).scaleb(-2) for value in amounts),
        Decimal("0"),
    )
    assert forward.known_total == reverse.known_total
    assert forward.unknown_mandatory_cost_count == int(unknown_baggage)
    assert forward.total_complete is (not unknown_baggage)


@PROPERTY_SETTINGS
@given(
    offset_hours=st.integers(min_value=-12, max_value=14),
    duration_minutes=st.integers(min_value=1, max_value=24 * 60),
)
def test_flight_segment_time_order_is_timezone_aware(
    offset_hours: int,
    duration_minutes: int,
) -> None:
    zone = timezone(timedelta(hours=offset_hours))
    departure = datetime(2027, 2, 1, 10, 0, tzinfo=zone)
    arrival = departure + timedelta(minutes=duration_minutes)

    segment = FlightSegmentIdentity(
        marketing_carrier="EK",
        operating_carrier="EK",
        flight_number="EK1",
        origin_airport="DXB",
        destination_airport="LHR",
        scheduled_departure=departure,
        scheduled_arrival=arrival,
    )

    assert segment.scheduled_arrival is not None
    assert segment.scheduled_arrival.astimezone(timezone.utc) > departure.astimezone(
        timezone.utc
    )


@PROPERTY_SETTINGS
@given(
    adults=st.integers(min_value=1, max_value=9),
    children=st.integers(min_value=0, max_value=8),
    ages=st.lists(st.integers(min_value=0, max_value=17), max_size=8),
)
def test_passenger_and_room_occupancy_constraints_remain_consistent(
    adults: int,
    children: int,
    ages: list[int],
) -> None:
    seat_children = min(children, 9 - adults)
    infants = min(adults, 9)
    passengers = PassengerMix(
        adults=adults,
        children=seat_children,
        infants=infants,
    )
    room_ages = tuple(ages[:children])
    occupancy = RoomOccupancy(
        adults=min(adults, 20),
        children=len(room_ages),
        children_ages=room_ages,
    )

    assert passengers.infants <= passengers.adults
    assert passengers.adults + passengers.children <= 9
    assert occupancy.children == len(occupancy.children_ages)


def _candidate(offer_id: str, amount: int, unknown: bool) -> RankableCandidate:
    components = [
        CostComponent(
            kind=CostKind.BASE_FARE,
            state=CostState.KNOWN,
            money=Money(amount=str(amount), currency="AED"),
        )
    ]
    if unknown:
        components.append(CostComponent(kind=CostKind.BAGGAGE, state=CostState.UNKNOWN))
    return RankableCandidate(
        offer_id=offer_id,
        equivalence=EquivalenceClass.EXACT,
        costs=summarize_costs(components, "AED"),
        revalidation_age_seconds=10,
    )


@PROPERTY_SETTINGS
@given(
    entries=st.lists(
        st.tuples(
            st.integers(min_value=1, max_value=100_000),
            st.booleans(),
        ),
        min_size=1,
        max_size=12,
    )
)
def test_lexicographic_ranking_is_stable_under_input_permutation(
    entries: list[tuple[int, bool]],
) -> None:
    candidates = [
        _candidate(f"offer-{index:02d}", amount, unknown)
        for index, (amount, unknown) in enumerate(entries)
    ]

    forward = [item.offer_id for item in rank_candidates(candidates)]
    reverse = [item.offer_id for item in rank_candidates(list(reversed(candidates)))]

    assert forward == reverse
