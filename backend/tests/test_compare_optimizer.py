from datetime import datetime, timedelta, timezone
import pytest

from compare.ranking import rank
from compare.schemas import (
    Condition,
    EquivalenceClass,
    EquivalenceResult,
    Money,
    OfferObservation,
    PreferenceMode,
    PriceBreakdown,
    ProductIdentity,
    ReasonCode,
    RouteLegality,
    Seller,
    SellerType,
    StockStatus,
)


NOW = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)
IDENTITY = ProductIdentity(brand="Sony", model="WH-1000XM6", identity_confidence=0.99)
EXACT = EquivalenceResult(
    classification=EquivalenceClass.exact,
    score=0.99,
    explanation="Exact identifiers and material variants match.",
)


def _offer(
    observation_id: str,
    amount: str,
    *,
    seller_type: SellerType = SellerType.marketplace,
    warranty_region: str | None = None,
    total_complete: bool = True,
    user_eligible: bool | None = None,
    route_legality: RouteLegality = RouteLegality.allowed,
    legitimate: bool | None = True,
    observed_at: datetime = NOW,
) -> OfferObservation:
    total = Money(amount=amount, currency="AED")
    return OfferObservation(
        observation_id=observation_id,
        merchant_id=observation_id,
        merchant_name=observation_id,
        source_url=f"https://{observation_id}.invalid/product",
        observed_at=observed_at,
        product=IDENTITY,
        seller=Seller(
            name=observation_id,
            type=seller_type,
            trust_score=0.9,
            legitimate=legitimate,
        ),
        price=PriceBreakdown(
            item=total,
            shipping=Money(amount="0", currency="AED"),
            payable_total=total,
            total_complete=total_complete,
        ),
        condition=Condition.new,
        stock=StockStatus.in_stock,
        warranty={"region": warranty_region} if warranty_region else {},
        delivery={"max_days": 2, "free": True},
        return_terms={"window_days": 15},
        extraction_confidence=0.95,
        evidence_tier="browser_submitted",
        evidence_ref=f"evidence:{observation_id}",
        user_eligible=user_eligible,
        route_legality=route_legality,
    )


def _current() -> OfferObservation:
    return _offer("current", "1699", seller_type=SellerType.first_party)


def _rank(offers, preference_mode=PreferenceMode.balanced):
    return rank(
        _current(),
        [(offer, EXACT) for offer in offers],
        now=NOW,
        preference_mode=preference_mode,
    )


@pytest.mark.parametrize(
    ("offer", "reason"),
    [
        (_offer("illegal", "1000", route_legality=RouteLegality.blocked), ReasonCode.ROUTE_NOT_LEGAL),
        (_offer("ineligible", "1000", user_eligible=False), ReasonCode.USER_NOT_ELIGIBLE),
        (_offer("seller-risk", "1000", legitimate=False), ReasonCode.SELLER_LEGITIMACY_LOW),
        (
            _offer("stale", "1000", observed_at=NOW - timedelta(hours=1)),
            ReasonCode.OFFER_STALE,
        ),
    ],
)
def test_invalid_routes_are_rejected_with_human_explanations(offer, reason):
    eligible, _, _, rejected = _rank([offer])
    assert eligible == []
    assert reason in rejected[0].exclusion_reasons
    assert rejected[0].exclusion_explanations
    assert rejected[0].selection_explanation


def test_official_seller_mode_can_prioritize_a_valid_official_route():
    marketplace = _offer("marketplace", "1200", seller_type=SellerType.marketplace)
    official = _offer("official", "1250", seller_type=SellerType.official_store)
    balanced, *_ = _rank([official, marketplace], PreferenceMode.balanced)
    preferred, *_ = _rank([marketplace, official], PreferenceMode.official_seller)
    assert balanced[0].offer.observation_id == "marketplace"
    assert preferred[0].offer.observation_id == "official"


def test_uae_warranty_mode_can_prioritize_a_valid_local_warranty_route():
    international = _offer("international", "1200", warranty_region="US")
    local = _offer("local", "1250", warranty_region="UAE")
    balanced, *_ = _rank([local, international], PreferenceMode.balanced)
    preferred, *_ = _rank([international, local], PreferenceMode.uae_local_warranty)
    assert balanced[0].offer.observation_id == "international"
    assert preferred[0].offer.observation_id == "local"


def test_incomplete_total_never_outranks_a_complete_total_in_any_mode():
    incomplete = _offer("incomplete", "1", total_complete=False)
    complete = _offer("complete", "1500", seller_type=SellerType.official_store)
    for mode in PreferenceMode:
        eligible, *_ = _rank([incomplete, complete], mode)
        assert eligible[0].offer.observation_id == "complete"


def test_ranking_exposes_all_required_quality_factors():
    eligible, *_ = _rank([_offer("candidate", "1400", warranty_region="UAE")])
    assert set(eligible[0].ranking_factors) == {
        "total_complete",
        "payable_total",
        "equivalence_confidence",
        "seller_legitimacy",
        "condition",
        "uae_local_warranty",
        "delivery",
        "returns",
        "availability",
        "freshness_seconds",
        "user_eligibility",
        "route_legality",
        "evidence_quality",
    }


def test_balanced_tie_break_uses_route_quality_without_hiding_price():
    weaker = _offer("weaker", "1400", warranty_region="US", legitimate=None)
    weaker.seller.trust_score = 0.2
    weaker.condition = Condition.unknown
    weaker.delivery = {"max_days": 20}
    weaker.return_terms = {}
    weaker.stock = StockStatus.unknown
    weaker.observed_at = NOW - timedelta(minutes=10)
    weaker.user_eligible = None
    weaker.route_legality = RouteLegality.unknown
    weaker.extraction_confidence = 0.2
    weaker.evidence_tier = "fixture"
    weaker.evidence_ref = None
    weaker.fixture = True

    stronger = _offer(
        "stronger",
        "1400",
        seller_type=SellerType.official_store,
        warranty_region="UAE",
        user_eligible=True,
    )
    stronger.delivery = {"max_days": 1, "free": True}
    stronger.return_terms = {"window_days": 30}
    stronger.evidence_tier = "official_api"

    eligible, *_ = _rank([weaker, stronger], PreferenceMode.balanced)
    assert eligible[0].offer.observation_id == "stronger"
    assert eligible[0].offer.price.payable_total == weaker.price.payable_total


def test_ties_have_deterministic_observation_id_fallback():
    first_run, *_ = _rank([_offer("z-last", "1400"), _offer("a-first", "1400")])
    second_run, *_ = _rank([_offer("a-first", "1400"), _offer("z-last", "1400")])
    assert [c.offer.observation_id for c in first_run] == ["a-first", "z-last"]
    assert [c.offer.observation_id for c in second_run] == ["a-first", "z-last"]


def test_identity_rejection_is_explained_even_without_engine_reason_codes():
    mismatch = EquivalenceResult(
        classification=EquivalenceClass.mismatch,
        score=0.1,
        explanation="Model number differs.",
    )
    _, _, _, rejected = rank(
        _current(),
        [(_offer("wrong-model", "500"), mismatch)],
        now=NOW,
    )
    assert rejected[0].exclusion_reasons == [ReasonCode.VARIANT_MISMATCH]
    assert rejected[0].exclusion_explanations == ["Model number differs."]
