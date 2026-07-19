"""Offer URL and seller/variant deduplication tests."""

import asyncio

from compare.adapters import BrowserSubmittedOfferAdapter
from compare.discovery import canonicalize_offer_url, deduplicate_offers, deduplicate_urls
from compare.schemas import ProductIdentity


def _offer(**overrides):
    payload = {
        "source_url": "https://www.shop.example/p/phone?sku=256&utm_source=mail#details",
        "merchant_id": "shop",
        "merchant_name": "Shop",
        "title": "Apple iPhone 15 Pro 256GB Black",
        "brand": "Apple",
        "model": "iPhone 15 Pro",
        "mpn": "MTV13",
        "storage": "256GB",
        "colour": "black",
        "price": "3999",
        "currency": "AED",
        "shipping": "0",
        "seller": "Shop Retail LLC",
        "condition": "new",
        "extraction_confidence": 0.9,
    }
    payload.update(overrides)
    return asyncio.run(
        BrowserSubmittedOfferAdapter([payload]).search_offers(ProductIdentity(), "AE")
    )[0]


def test_canonical_url_removes_tracking_but_preserves_variant_query():
    assert canonicalize_offer_url(
        "https://www.shop.example/p/phone/?utm_source=mail&sku=256&gclid=x#details"
    ) == "https://shop.example/p/phone?sku=256"


def test_deduplicate_urls_keeps_first_evidence_url():
    first = "https://shop.example/p/1?sku=black&utm_campaign=summer"
    duplicate = "https://www.shop.example/p/1?gclid=x&sku=black"
    distinct = "https://shop.example/p/1?sku=silver"
    assert deduplicate_urls([first, duplicate, distinct]) == [first, distinct]


def test_deduplicate_offers_collapses_tracking_and_repeated_seller_variant():
    original = _offer()
    stronger_tracking_duplicate = _offer(
        source_url="https://shop.example/p/phone?gclid=x&sku=256",
        extraction_confidence=0.98,
        price="3950",
    )
    repeated_seller_variant = _offer(
        source_url="https://shop.example/catalogue/iphone-15-pro-256",
        extraction_confidence=0.95,
    )
    different_seller = _offer(
        source_url="https://shop.example/marketplace/iphone-15-pro-256",
        seller="Marketplace Seller",
    )
    different_variant = _offer(
        source_url="https://shop.example/p/phone?sku=512",
        storage="512GB",
        mpn="MTV14",
    )

    offers = deduplicate_offers([
        original,
        stronger_tracking_duplicate,
        repeated_seller_variant,
        different_seller,
        different_variant,
    ])
    assert len(offers) == 3
    assert stronger_tracking_duplicate in offers
    assert different_seller in offers
    assert different_variant in offers
