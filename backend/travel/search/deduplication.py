"""Deterministic duplicate suppression for provider-normalized offers."""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Iterable

from ..providers import NormalizedFlightOffer, NormalizedHotelOffer


ProviderOffer = NormalizedFlightOffer | NormalizedHotelOffer


def _total(offer: ProviderOffer) -> Decimal:
    if isinstance(offer, NormalizedFlightOffer):
        return offer.grand_total_amount
    return offer.total_amount


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def normalized_offer_key(offer: ProviderOffer) -> str:
    """Hash only material route/rate facts, while preserving distinct suppliers."""

    if isinstance(offer, NormalizedFlightOffer):
        material = {
            "kind": "flight",
            "provider": offer.provider_id,
            "currency": offer.currency,
            "total": format(offer.grand_total_amount, "f"),
            "itineraries": [item.model_dump(mode="json") for item in offer.itineraries],
            "baggage": [item.model_dump(mode="json") for item in offer.baggage],
            "baggage_known": offer.baggage_known,
            "one_way": offer.one_way,
        }
    else:
        material = {
            "kind": "hotel",
            "provider": offer.provider_id,
            "hotel_id": offer.hotel_id,
            "check_in": offer.check_in_date,
            "check_out": offer.check_out_date,
            "adults": offer.adults,
            "rooms": offer.room_quantity,
            "room_type": offer.room_type,
            "room_category": offer.room_category,
            "board_type": offer.board_type,
            "payment_type": offer.payment_type,
            "currency": offer.currency,
            "total": format(offer.total_amount, "f"),
        }
    return hashlib.sha256(_canonical(material).encode("utf-8")).hexdigest()


def deduplicate_normalized_offers(
    offers: Iterable[ProviderOffer],
) -> tuple[ProviderOffer, ...]:
    """Collapse repeated listings without merging distinct material variants.

    Conflicting payloads with the same provider offer ID retain the higher quoted
    total. This conservative rule cannot manufacture a saving from an ambiguous
    duplicate. Repeated material variants with different IDs use the smallest ID
    as a stable tie-break.
    """

    by_provider_id: dict[tuple[str, str], ProviderOffer] = {}
    for offer in offers:
        identity = (offer.provider_id, offer.provider_offer_id)
        current = by_provider_id.get(identity)
        if current is None or (_total(offer), _canonical(offer.model_dump(mode="json"))) > (
            _total(current),
            _canonical(current.model_dump(mode="json")),
        ):
            by_provider_id[identity] = offer

    by_material: dict[str, ProviderOffer] = {}
    for offer in by_provider_id.values():
        key = normalized_offer_key(offer)
        current = by_material.get(key)
        if current is None or offer.provider_offer_id < current.provider_offer_id:
            by_material[key] = offer
    return tuple(by_material[key] for key in sorted(by_material))
