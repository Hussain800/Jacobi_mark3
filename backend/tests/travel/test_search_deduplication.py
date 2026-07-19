from __future__ import annotations

import json
from pathlib import Path

from travel.providers import normalize_flight_offers, normalize_hotel_offers
from travel.search.deduplication import deduplicate_normalized_offers


FIXTURES = Path(__file__).parents[1] / "fixtures" / "travel" / "amadeus"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_repeated_flight_variant_uses_deterministic_provider_id_tie_break() -> None:
    original = normalize_flight_offers(_fixture("flight_search_success.json")).offers[0]
    duplicate = original.model_copy(update={"provider_offer_id": "0-duplicate"})

    forward = deduplicate_normalized_offers([original, duplicate])
    reverse = deduplicate_normalized_offers([duplicate, original])

    assert [item.provider_offer_id for item in forward] == ["0-duplicate"]
    assert [item.provider_offer_id for item in reverse] == ["0-duplicate"]


def test_same_provider_offer_id_conflict_keeps_conservative_higher_total() -> None:
    original = normalize_flight_offers(_fixture("flight_search_success.json")).offers[0]
    conflicting = original.model_copy(
        update={"grand_total_amount": original.grand_total_amount + 100}
    )

    result = deduplicate_normalized_offers([original, conflicting])

    assert len(result) == 1
    assert result[0].grand_total_amount == original.grand_total_amount + 100


def test_hotel_room_and_price_variants_remain_distinct() -> None:
    original = normalize_hotel_offers(_fixture("hotel_offers_success.json")).offers[0]
    repeated = original.model_copy(update={"provider_offer_id": "0-repeat"})
    room_variant = original.model_copy(
        update={"provider_offer_id": "room-variant", "room_category": "SUITE"}
    )
    price_variant = original.model_copy(
        update={
            "provider_offer_id": "price-variant",
            "total_amount": original.total_amount + 50,
        }
    )

    result = deduplicate_normalized_offers(
        [price_variant, room_variant, original, repeated]
    )

    assert len(result) == 3
    assert "0-repeat" in {item.provider_offer_id for item in result}
    assert "room-variant" in {item.provider_offer_id for item in result}
    assert "price-variant" in {item.provider_offer_id for item in result}
