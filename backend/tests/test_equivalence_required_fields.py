"""Material electronics-dimension equivalence regression tests."""

from compare.equivalence import classify
from compare.schemas import (
    Condition,
    EquivalenceClass,
    Money,
    OfferObservation,
    PriceBreakdown,
    ProductIdentity,
    ReasonCode,
    Seller,
    SellerType,
    Variant,
)


def _identity(**variant):
    return ProductIdentity(
        brand="Apple",
        family="MacBook Air",
        model="A3113",
        mpn="MC8H4AE/A",
        gtins=["195949899929"],
        variant=Variant(
            storage="512GB",
            memory="16GB",
            generation="M3",
            processor="Apple M3",
            screen_size="13.6in",
            year=2024,
            region="uae",
            colour="midnight",
            warranty_region="uae",
            **variant,
        ),
    )


def _offer(product=None, *, warranty=None, seller_type=SellerType.first_party):
    return OfferObservation(
        merchant_id="synthetic",
        merchant_name="Synthetic Store",
        source_url="https://synthetic.invalid/product",
        product=product or _identity(),
        seller=Seller(name="Synthetic Store", type=seller_type, trust_score=0.95),
        price=PriceBreakdown(item=Money(amount="4000"), shipping=Money(amount="0")),
        condition=Condition.new,
        warranty=warranty if warranty is not None else {"region": "uae", "duration": "1 year"},
    )


def test_identifier_conflict_is_rejected_even_when_gtin_matches():
    candidate = _offer(product=_identity())
    candidate.product.mpn = "DIFFERENT-MPN"
    result = classify(_identity(), Condition.new, candidate)
    assert result.classification == EquivalenceClass.mismatch


def test_generation_processor_and_screen_mismatches_are_rejected():
    cases = [
        ("generation", "M2", ReasonCode.GENERATION_MISMATCH),
        ("processor", "Apple M2", ReasonCode.PROCESSOR_MISMATCH),
        ("screen_size", "15.3in", ReasonCode.SIZE_MISMATCH),
    ]
    for field, value, code in cases:
        candidate = _offer()
        setattr(candidate.product.variant, field, value)
        result = classify(_identity(), Condition.new, candidate)
        assert result.classification == EquivalenceClass.mismatch
        assert code in result.reason_codes
        assert field in result.field_explanations


def test_accessory_only_listing_is_rejected():
    candidate = _offer()
    candidate.product.variant.other["accessory_only"] = True
    result = classify(_identity(), Condition.new, candidate)
    assert result.classification == EquivalenceClass.mismatch
    assert ReasonCode.ACCESSORY_ONLY in result.reason_codes


def test_bundle_difference_is_disclosed_tradeoff():
    current = _identity(bundle=["laptop", "charger"])
    candidate = _offer(product=_identity(bundle=["laptop", "charger", "sleeve"]))
    result = classify(current, Condition.new, candidate)
    assert result.classification == EquivalenceClass.exact_tradeoff
    assert ReasonCode.BUNDLE_MISMATCH in result.reason_codes
    assert "bundle" in result.field_explanations


def test_marketplace_seller_is_disclosed_tradeoff():
    result = classify(_identity(), Condition.new, _offer(seller_type=SellerType.marketplace))
    assert result.classification == EquivalenceClass.exact_tradeoff
    assert ReasonCode.SELLER_RISK in result.reason_codes
