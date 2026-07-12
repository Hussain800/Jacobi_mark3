"""Fixture-backed merchant adapters — deterministic offers for development,
demos, and CI (PDR: fixture mode requires no paid infrastructure).

Each fixture file is one merchant's catalog: a list of offer records with the
same structured fields a live adapter would extract. Matching against the
query product is deliberately loose (brand or model token overlap) — the
EQUIVALENCE ENGINE is the thing that rejects wrong variants, and the fixtures
include traps (wrong storage, refurbished, colour suffix) to prove it.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from ..identity import normalize_model
from ..schemas import (
    Condition,
    Money,
    OfferObservation,
    PriceBreakdown,
    ProductIdentity,
    Seller,
    SellerType,
    StockStatus,
    Variant,
)
from .base import (
    MerchantAdapter,
    ProviderCost,
    ProviderHealth,
    ProviderKind,
    ProviderRateLimit,
)

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"

_FIXTURE_LIMITATION = "Deterministic development fixture — not a live retailer offer"


@lru_cache(maxsize=32)
def _read_fixture(path: str) -> List[Dict[str, Any]]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return raw.get("offers", [])


def _money(v: Any, currency: str) -> Money | None:
    if v is None:
        return None
    return Money(amount=str(v), currency=currency)


class FixtureMerchantAdapter(MerchantAdapter):
    discovery_method = "fixture"
    evidence_tier = "fixture"
    cost_estimate_usd = 0.0
    known_limitations = [_FIXTURE_LIMITATION]
    provider_kind = ProviderKind.fixture
    provider_cost = ProviderCost.zero
    capabilities = ("catalogue-lookup", "structured-offer")
    retries = 0
    rate_limit = ProviderRateLimit(policy="local fixture; no external requests")
    health = ProviderHealth.healthy
    extraction_fields = (
        "brand", "model", "mpn", "gtin", "variant", "item_price",
        "shipping", "mandatory_fees", "seller", "condition", "stock",
        "delivery", "warranty", "return_terms",
    )
    fixture = True

    def __init__(self, merchant_id: str, merchant_name: str, domains: List[str],
                 catalog_file: Path):
        self.merchant_id = merchant_id
        self.merchant_name = merchant_name
        self.domains = domains
        self._catalog_file = catalog_file

    def _catalog(self) -> List[Dict[str, Any]]:
        return _read_fixture(str(self._catalog_file))

    def _matches(self, product: ProductIdentity, rec: Dict[str, Any]) -> bool:
        """Loose recall filter; precision is the equivalence engine's job."""
        if product.gtins and rec.get("gtin") in product.gtins:
            return True
        rec_model = normalize_model(rec.get("model")) or ""
        rec_mpn = normalize_model(rec.get("mpn")) or ""
        q_model = normalize_model(product.model) or ""
        q_mpn = normalize_model(product.mpn) or ""
        if q_mpn and q_mpn in (rec_model, rec_mpn):
            return True
        if q_model and (q_model in rec_model or rec_model.startswith(q_model)):
            return True
        # brand + family fallback keeps near-miss traps in the candidate pool
        brand = (product.brand or "").lower()
        return bool(brand) and brand == str(rec.get("brand", "")).lower() and bool(
            set(q_model.split()) & set(rec_model.split())
        )

    async def search_offers(self, product: ProductIdentity, market: str) -> List[OfferObservation]:
        now = datetime.now(timezone.utc)
        out: List[OfferObservation] = []
        for rec in self._catalog():
            if not self._matches(product, rec):
                continue
            currency = rec.get("currency", "AED")
            price = PriceBreakdown(
                item=_money(rec["item_price"], currency),
                shipping=_money(rec.get("shipping"), currency),
                mandatory_fees=[
                    _money(f, currency) for f in rec.get("mandatory_fees", [])
                ],
            )
            out.append(OfferObservation(
                merchant_id=self.merchant_id,
                merchant_name=self.merchant_name,
                source_url=rec.get("url", f"https://{self.domains[0]}/"),
                observed_at=now,
                product=ProductIdentity(
                    brand=rec.get("brand"),
                    model=normalize_model(rec.get("model")),
                    mpn=normalize_model(rec.get("mpn")),
                    gtins=[rec["gtin"]] if rec.get("gtin") else [],
                    variant=Variant(**rec.get("variant", {})),
                    identity_confidence=0.98,  # structured fixture fields
                ),
                seller=Seller(
                    name=rec.get("seller", self.merchant_name),
                    type=SellerType(rec.get("seller_type", "first_party")),
                ),
                price=price,
                condition=Condition(rec.get("condition", "new")),
                stock=StockStatus(rec.get("stock", "in_stock")),
                delivery=rec.get("delivery", {}),
                warranty=rec.get("warranty", {}),
                return_terms=rec.get("return_terms", {}),
                extraction_confidence=0.98,
                fixture=True,
            ))
        return out


def default_fixture_adapters() -> List[FixtureMerchantAdapter]:
    return [
        FixtureMerchantAdapter(
            "amazon_ae", "Amazon UAE", ["amazon.ae"], FIXTURE_DIR / "amazon_ae.json"),
        FixtureMerchantAdapter(
            "noon_ae", "Noon", ["noon.com"], FIXTURE_DIR / "noon_ae.json"),
        FixtureMerchantAdapter(
            "sharafdg", "Sharaf DG", ["sharafdg.com"], FIXTURE_DIR / "sharafdg.json"),
        FixtureMerchantAdapter(
            "sony_ae", "Sony Store UAE", ["sony-mea.com"], FIXTURE_DIR / "sony_ae.json"),
        FixtureMerchantAdapter(
            "jumbo_ae", "Jumbo Electronics UAE", ["jumbo.ae"], FIXTURE_DIR / "jumbo_ae.json"),
    ]
