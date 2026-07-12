"""Regression coverage for the complete, provenance-aware product identity."""

from compare.identity import resolve_identity
from compare.schemas import CurrentOfferInput, Money


def test_structured_identity_preserves_required_electronics_fields():
    identity = resolve_identity(CurrentOfferInput(
        title="ASUS Zenbook 14 UX3405MA 2025 Intel Core Ultra 7 16GB RAM 1TB SSD Blue",
        brand="ASUS",
        family="Zenbook 14",
        model="UX3405MA",
        mpn="UX3405MA-PZ218W",
        gtin="4711387567890",
        sku="SKU-123",
        storage="1TB",
        memory="16GB",
        generation="2025",
        processor="Intel Core Ultra 7",
        screen_size="14in",
        year=2025,
        region="UAE",
        colour="Blue",
        connectivity="wifi",
        bundle=["laptop", "charger"],
        accessories=["sleeve"],
        warranty_region="UAE",
        price=Money(amount="4999"),
    ))

    assert identity.canonical_id.startswith("prod_")
    assert identity.brand == "Asus"
    assert identity.family == "Zenbook 14"
    assert identity.model == "UX3405MA"
    assert identity.mpn == "UX3405MA-PZ218W"
    assert identity.gtins == ["4711387567890"]
    assert identity.sku == "SKU-123"
    assert identity.variant.storage == "1TB"
    assert identity.variant.memory == "16GB"
    assert identity.variant.generation == "2025"
    assert identity.variant.processor == "Intel Core Ultra 7"
    assert identity.variant.screen_size == "14in"
    assert identity.variant.year == 2025
    assert identity.variant.region == "uae"
    assert identity.variant.colour == "blue"
    assert identity.variant.bundle == ["laptop", "charger"]
    assert identity.variant.accessories == ["sleeve"]
    assert identity.variant.warranty_region == "uae"
    assert identity.aliases["brand"] == ["ASUS"]
    assert not identity.contradictions
    assert "model" in identity.confidence_by_field
    assert "category" not in identity.unknown_fields


def test_identity_records_structured_title_contradictions():
    identity = resolve_identity({
        "title": "Apple IPHONE15PRO 256GB",
        "brand": "Samsung",
        "model": "SM-S928B",
        "price": {"amount": "3999", "currency": "AED"},
    })

    contradictions = {item.field: item for item in identity.contradictions}
    assert contradictions["brand"].values == ["Samsung", "Apple"]
    assert contradictions["model"].values == ["SM-S928B", "IPHONE15PRO"]
    assert identity.identity_confidence < 0.88


def test_identity_exposes_unknowns_instead_of_implicit_nulls():
    identity = resolve_identity({
        "title": "Sony WH-1000XM6 headphones",
        "price": {"amount": "1499", "currency": "AED"},
    })

    assert {"mpn", "gtin", "sku", "storage", "memory", "region"} <= set(identity.unknown_fields)
    assert all(evidence.value for evidence in identity.evidence)
