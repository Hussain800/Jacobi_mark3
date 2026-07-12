"""
Jacobi Compare — identity, equivalence, total-cost, and ranking unit tests.

Fixture-only: no network. These are the exact-match guarantees the pivot MVP
stands on: wrong storage/model/condition must never produce a headline saving,
and unknown costs must never be silently treated as zero.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from compare.equivalence import classify
from compare.identity import (
    guess_model_from_title,
    normalize_gtin,
    parse_capacities,
    parse_colour,
    resolve_identity,
    split_model_colour_suffix,
)
from compare.ranking import build_recommendation, rank
from compare.schemas import (
    ComparisonStatus,
    Condition,
    CurrentOfferInput,
    EquivalenceClass,
    Money,
    OfferObservation,
    PriceBreakdown,
    ProductIdentity,
    ReasonCode,
    Seller,
    SellerType,
    StockStatus,
    Variant,
)
from compare.total_cost import apply_total, compute_payable


# ── helpers ──────────────────────────────────────────────────────────────────

def _offer(model="WH-1000XM6/B", mpn="WH-1000XM6/B", gtin="4548736158801",
           item="1499", shipping="0", condition=Condition.new,
           colour="black", storage=None, memory=None, region=None,
           warranty=None, stock=StockStatus.in_stock, currency="AED",
           observed_at=None, merchant="sony_ae", url="https://x.example/1",
           seller_type=SellerType.official_store) -> OfferObservation:
    return OfferObservation(
        merchant_id=merchant,
        merchant_name=merchant,
        source_url=url,
        observed_at=observed_at or datetime.now(timezone.utc),
        product=ProductIdentity(
            brand="Sony", model=model, mpn=mpn,
            gtins=[gtin] if gtin else [],
            variant=Variant(colour=colour, storage=storage, memory=memory, region=region),
            identity_confidence=0.98,
        ),
        seller=Seller(name=merchant, type=seller_type),
        price=PriceBreakdown(
            item=Money(amount=item, currency=currency),
            shipping=Money(amount=shipping, currency=currency) if shipping is not None else None,
        ),
        condition=condition,
        stock=stock,
        warranty=warranty if warranty is not None else {"region": "UAE", "duration": "1 year"},
        extraction_confidence=0.98,
    )


def _current(**kw) -> OfferObservation:
    kw.setdefault("item", "1699")
    kw.setdefault("merchant", "amazon_ae")
    kw.setdefault("url", "https://www.amazon.ae/dp/CURRENT")
    kw.setdefault("seller_type", SellerType.first_party)
    return apply_total(_offer(**kw))


CUR_ID = _current().product


# ── identity ─────────────────────────────────────────────────────────────────

def test_identity_from_structured_fields():
    ident = resolve_identity(CurrentOfferInput(
        title="Sony WH-1000XM6 Wireless Noise Cancelling Headphones - Black",
        brand="Sony", mpn="WH-1000XM6/B", gtin="4548736158801",
        price=Money(amount="1699"),
    ))
    assert ident.brand == "Sony"
    assert ident.model == "WH-1000XM6"          # colour suffix split off
    assert ident.mpn == "WH-1000XM6/B"
    assert ident.gtins == ["4548736158801"]
    assert ident.variant.colour == "black"
    assert ident.identity_confidence >= 0.95


def test_identity_from_title_only():
    ident = resolve_identity({"title": "Sony WH-1000XM6 Headphones Black", "price": None})
    assert ident.model == "WH-1000XM6"
    assert 0.6 <= ident.identity_confidence < 0.95


def test_identity_unresolved_without_model():
    ident = resolve_identity({"title": "Great wireless headphones", "price": None})
    assert ident.identity_confidence < 0.7


def test_capacity_parsing():
    assert parse_capacities("MacBook Air 13 M3 8GB/256GB") == ("256GB", "8GB")
    assert parse_capacities("16GB RAM 1TB SSD Laptop") == ("1TB", "16GB")
    assert parse_capacities("iPhone 15 Pro 256GB") == ("256GB", None)
    assert parse_capacities("no capacities here") == (None, None)


def test_model_colour_suffix_and_gtin_norm():
    assert split_model_colour_suffix("WH-1000XM6/B") == ("WH-1000XM6", "black")
    assert split_model_colour_suffix("WH-1000XM6") == ("WH-1000XM6", None)
    assert normalize_gtin(" 4548736-158801 ") == "4548736158801"
    assert normalize_gtin("12") is None
    assert parse_colour("Midnight Blue over-ear") == "midnight blue"
    assert guess_model_from_title("Sony WH-1000XM6 Headphones", "Sony") == "WH-1000XM6"


# ── equivalence ──────────────────────────────────────────────────────────────

def test_exact_match_eligible():
    eq = classify(CUR_ID, Condition.new, _offer())
    assert eq.classification == EquivalenceClass.exact
    assert "model" in eq.matched_dimensions
    assert eq.score >= 0.85


def test_model_mismatch_rejected():
    eq = classify(CUR_ID, Condition.new, _offer(model="WH-1000XM5/B", mpn="WH-1000XM5/B", gtin=None))
    assert eq.classification == EquivalenceClass.mismatch
    assert ReasonCode.VARIANT_MISMATCH in eq.reason_codes


def test_gtin_conflict_hard_reject():
    eq = classify(CUR_ID, Condition.new, _offer(gtin="4548736159999"))
    assert eq.classification == EquivalenceClass.mismatch


def test_storage_mismatch_rejected():
    cur = _current(model="MacBook Air 13 M3", mpn="MRXN3", gtin="195949125301",
                   storage="256GB", memory="8GB", colour="midnight").product
    cand = _offer(model="MacBook Air 13 M3", mpn=None, gtin=None,
                  storage="512GB", memory="8GB", colour="midnight")
    eq = classify(cur, Condition.new, cand)
    assert eq.classification == EquivalenceClass.mismatch
    assert ReasonCode.VARIANT_MISMATCH in eq.reason_codes
    assert "storage" in eq.mismatched_dimensions


def test_memory_mismatch_rejected():
    cur = _current(model="XPS 13", mpn=None, gtin=None, storage="512GB", memory="16GB").product
    eq = classify(cur, Condition.new,
                  _offer(model="XPS 13", mpn=None, gtin=None, storage="512GB", memory="8GB"))
    assert eq.classification == EquivalenceClass.mismatch


def test_region_mismatch_rejected():
    cur = _current(region="uae").product
    eq = classify(cur, Condition.new, _offer(region="us"))
    assert eq.classification == EquivalenceClass.mismatch
    assert ReasonCode.REGION_MISMATCH in eq.reason_codes


def test_condition_mismatch_is_similar_not_exact():
    eq = classify(CUR_ID, Condition.new, _offer(condition=Condition.refurbished))
    assert eq.classification == EquivalenceClass.similar
    assert ReasonCode.CONDITION_MISMATCH in eq.reason_codes


def test_colour_difference_is_tradeoff():
    eq = classify(CUR_ID, Condition.new,
                  _offer(model="WH-1000XM6/S", mpn=None, gtin=None, colour="silver"))
    assert eq.classification == EquivalenceClass.exact_tradeoff


def test_unknown_warranty_downgrades_to_tradeoff():
    eq = classify(CUR_ID, Condition.new, _offer(warranty={}))
    assert eq.classification == EquivalenceClass.exact_tradeoff
    assert ReasonCode.WARRANTY_UNKNOWN in eq.reason_codes


def test_no_shared_identifier_capped_at_similar():
    eq = classify(CUR_ID, Condition.new, _offer(model=None, mpn=None, gtin=None))
    assert eq.classification == EquivalenceClass.similar
    assert ReasonCode.EXACT_MATCH_INSUFFICIENT in eq.reason_codes


# ── total cost ───────────────────────────────────────────────────────────────

def test_total_cost_sums_components_decimal_safe():
    p = compute_payable(PriceBreakdown(
        item=Money(amount="1399.99"),
        shipping=Money(amount="50.01"),
        mandatory_fees=[Money(amount="10")],
    ), "AED")
    assert p.total_complete
    assert p.payable_total.quantized() == Decimal("1460.00")


def test_unknown_shipping_is_not_zero():
    p = compute_payable(PriceBreakdown(item=Money(amount="1450")), "AED")
    assert not p.total_complete
    assert "shipping" in p.unknown_components
    # known-components subtotal still present for display, but flagged incomplete
    assert p.payable_total.quantized() == Decimal("1450.00")


# ── ranking ──────────────────────────────────────────────────────────────────

def _ranked(current, offers):
    cands = [(apply_total(o), classify(current.product, current.condition, o)) for o in offers]
    return rank(current, cands)


def test_verified_saving_wins():
    current = _current()
    eligible, tradeoffs, similar, rejected = _ranked(current, [
        _offer(item="1499"),
        _offer(item="1399", condition=Condition.refurbished, merchant="sharafdg"),
        _offer(item="4299", model="WH-1000XM5/B", mpn="WH-1000XM5/B", gtin=None),
    ])
    rec, savings, best, confidence, codes = build_recommendation(
        current, eligible, tradeoffs, similar, 0.98)
    assert rec.status == ComparisonStatus.save
    assert savings.amount.quantized() == Decimal("200.00")
    assert best.merchant_id == "sony_ae"
    assert ReasonCode.LOWER_TOTAL_FOUND in codes
    assert ReasonCode.OFFICIAL_ROUTE_FOUND in codes


def test_incomplete_total_cannot_win_headline():
    current = _current()
    # cheaper exact offer with UNKNOWN shipping vs slightly dearer verified one
    eligible, tradeoffs, similar, rejected = _ranked(current, [
        _offer(item="1450", shipping=None, merchant="noon_ae"),
        _offer(item="1499"),
    ])
    rec, savings, best, _, codes = build_recommendation(
        current, eligible, tradeoffs, similar, 0.98)
    assert best.merchant_id == "sony_ae"          # complete total wins
    assert savings.amount.quantized() == Decimal("200.00")
    assert ReasonCode.SHIPPING_UNKNOWN in codes   # uncertainty surfaced, not hidden


def test_already_best():
    current = _current(item="1499")
    eligible, tradeoffs, similar, rejected = _ranked(current, [_offer(item="1549")])
    rec, savings, best, _, codes = build_recommendation(
        current, eligible, tradeoffs, similar, 0.98)
    assert rec.status == ComparisonStatus.already_best
    assert ReasonCode.CURRENT_OFFER_ALREADY_BEST in codes
    assert savings.amount is None


def test_stale_offer_excluded():
    current = _current()
    stale = _offer(item="999", observed_at=datetime.now(timezone.utc) - timedelta(hours=2))
    eligible, tradeoffs, similar, rejected = _ranked(current, [stale])
    assert not eligible
    assert rejected and ReasonCode.OFFER_STALE in rejected[0].exclusion_reasons


def test_out_of_stock_excluded():
    current = _current()
    eligible, _, _, rejected = _ranked(current, [_offer(item="999", stock=StockStatus.out_of_stock)])
    assert not eligible
    assert ReasonCode.OUT_OF_STOCK in rejected[0].exclusion_reasons


def test_currency_mismatch_excluded():
    current = _current()
    eligible, _, _, rejected = _ranked(current, [_offer(item="399", currency="USD")])
    assert not eligible
    assert ReasonCode.CURRENCY_UNSUPPORTED in rejected[0].exclusion_reasons


def test_unresolved_identity_never_claims_saving():
    current = _current()
    rec, savings, best, confidence, codes = build_recommendation(current, [], [], [], 0.3)
    assert rec.status == ComparisonStatus.insufficient_evidence
    assert ReasonCode.PRODUCT_IDENTITY_UNRESOLVED in codes
    assert savings.amount is None and best is None
