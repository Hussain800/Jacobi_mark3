from decimal import Decimal

from travel.costing import CostComponent, summarize_costs
from travel.domain import CostKind, CostState, EquivalenceClass, Money, SupplierRiskTier
from travel.ranking import RankableCandidate, build_rank_key, rank_candidates


def costs(amount: str, *, unknown_baggage: bool = False):
    items = [
        CostComponent(
            kind=CostKind.BASE_FARE,
            state=CostState.KNOWN,
            money=Money(amount=amount, currency="AED"),
        )
    ]
    if unknown_baggage:
        items.append(CostComponent(kind=CostKind.BAGGAGE, state=CostState.UNKNOWN))
    return summarize_costs(items, "AED")


def test_rank_key_is_inspectable_and_matches_prd_tuple_order() -> None:
    candidate = RankableCandidate(
        offer_id="offer-z",
        equivalence=EquivalenceClass.EXACT,
        costs=costs("500"),
        hard_preference_violations=0,
        supplier_risk_tier=SupplierRiskTier.STANDARD,
        revalidation_age_seconds=20,
        redirect_friction=1,
        provider_priority=5,
    )
    key = build_rank_key(candidate)

    assert key.as_tuple() == (0, 0, 0, Decimal("500"), 1, 20, 1, 5, "offer-z")
    assert key.comparable_known_total == Decimal("500")


def test_lexicographic_policy_prioritizes_completeness_before_lower_subtotal() -> None:
    complete = RankableCandidate(
        offer_id="complete",
        equivalence=EquivalenceClass.EXACT,
        costs=costs("500"),
        revalidation_age_seconds=10,
    )
    misleading_lower_subtotal = RankableCandidate(
        offer_id="incomplete",
        equivalence=EquivalenceClass.EXACT,
        costs=costs("300", unknown_baggage=True),
        revalidation_age_seconds=10,
    )

    ranked = rank_candidates([misleading_lower_subtotal, complete])
    assert [item.offer_id for item in ranked] == ["complete", "incomplete"]


def test_exact_equivalence_outranks_tradeoff_before_price() -> None:
    exact = RankableCandidate(
        offer_id="exact",
        equivalence=EquivalenceClass.EXACT,
        costs=costs("600"),
        revalidation_age_seconds=10,
    )
    tradeoff = RankableCandidate(
        offer_id="tradeoff",
        equivalence=EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF,
        costs=costs("400"),
        revalidation_age_seconds=10,
    )

    assert [item.offer_id for item in rank_candidates([tradeoff, exact])] == ["exact", "tradeoff"]
