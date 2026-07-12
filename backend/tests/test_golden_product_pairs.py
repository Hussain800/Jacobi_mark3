"""Contract tests for the synthetic golden product-equivalence dataset.

The fixture is deliberately offline and fictitious.  It validates classifier
behaviour without implying support for, or observations from, live retailers.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

from compare.equivalence import classify
from compare.schemas import (
    Condition,
    EquivalenceClass,
    Money,
    OfferObservation,
    PriceBreakdown,
    ProductIdentity,
    Seller,
    SellerType,
    StockStatus,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "golden_product_pairs.jsonl"
PUBLIC_LABELS = {
    "EXACT_EQUIVALENT",
    "EQUIVALENT_WITH_DISCLOSED_TRADEOFF",
    "SIMILAR_NOT_EQUIVALENT",
    "REJECTED",
}
REQUIRED_COVERAGE_TAGS = {
    "exact_match",
    "incorrect_model",
    "different_generation",
    "storage_difference",
    "memory_difference",
    "regional_variant",
    "new_vs_refurbished",
    "new_vs_open_box",
    "bundle_difference",
    "accessory_only",
    "misleading_title",
    "marketplace_seller_trap",
    "color_only_tradeoff",
    "warranty_difference",
    "unavailable_offer",
}


def _load_pairs() -> list[dict]:
    return [
        json.loads(line)
        for line in FIXTURE_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


GOLDEN_PAIRS = _load_pairs()


def test_golden_dataset_contract_and_coverage() -> None:
    assert len(GOLDEN_PAIRS) >= 100

    ids = [pair["id"] for pair in GOLDEN_PAIRS]
    assert len(ids) == len(set(ids))
    assert all(pair["synthetic"] is True for pair in GOLDEN_PAIRS)

    labels = {pair["label"] for pair in GOLDEN_PAIRS}
    assert labels == PUBLIC_LABELS

    tag_counts = Counter(tag for pair in GOLDEN_PAIRS for tag in pair["tags"])
    assert REQUIRED_COVERAGE_TAGS <= tag_counts.keys()
    assert all(tag_counts[tag] >= 5 for tag in REQUIRED_COVERAGE_TAGS)


@pytest.mark.parametrize("pair", GOLDEN_PAIRS, ids=lambda pair: pair["id"])
def test_golden_pair_matches_expected_equivalence(pair: dict) -> None:
    current = ProductIdentity.model_validate(pair["current"])
    candidate = OfferObservation(
        merchant_id="synthetic_fixture_store",
        merchant_name="Synthetic Fixture Store",
        source_url=f"https://synthetic.invalid/offers/{pair['id']}",
        product=ProductIdentity.model_validate(pair["candidate"]),
        seller=Seller(
            name=pair["candidate_seller_name"],
            type=SellerType(pair["candidate_seller_type"]),
        ),
        price=PriceBreakdown(
            item=Money(amount="999.00", currency="AED"),
            shipping=Money(amount="0.00", currency="AED"),
        ),
        condition=Condition(pair["candidate_condition"]),
        stock=StockStatus(pair["candidate_stock"]),
        warranty=pair["candidate_warranty"],
        extraction_confidence=1.0,
        fixture=True,
    )

    result = classify(current, Condition(pair["current_condition"]), candidate)

    assert isinstance(result.classification, EquivalenceClass)
    assert result.classification.value == pair["label"]
