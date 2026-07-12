"""Zero-cost offers extracted in a user's browser and submitted as fields.

This adapter never fetches a URL. It accepts structured observations from the
extension/current tab or user-opened comparison tabs, preserving the browser as
the evidence source and keeping the result distinct from fixtures.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Mapping
from urllib.parse import urlsplit

from ..identity import resolve_identity
from ..schemas import (
    Condition,
    CostState,
    Money,
    OfferObservation,
    PriceBreakdown,
    ProductIdentity,
    Seller,
    SellerType,
    StockStatus,
)
from .base import (
    MerchantAdapter,
    ProviderCost,
    ProviderHealth,
    ProviderKind,
    ProviderRateLimit,
)

_LIMITATIONS = [
    "Fields are supplied by the user's browser; the backend does not independently fetch the page",
    "Dynamic checkout-only fees remain unknown unless the browser observation includes them",
]


def _enum_or_default(enum_type: type, value: Any, default: Any) -> Any:
    try:
        return enum_type(value)
    except (TypeError, ValueError):
        return default


def _money(value: Any, default_currency: str) -> Money | None:
    if value is None:
        return None
    if isinstance(value, Money):
        return value
    if isinstance(value, Mapping):
        payload = dict(value)
        payload.setdefault("currency", default_currency)
        return Money.model_validate(payload)
    return Money(amount=value, currency=default_currency)


def _browser_url(value: Any) -> str:
    url = str(value or "").strip()
    parts = urlsplit(url)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("browser-submitted offers require an absolute http(s) source_url")
    return url


def structured_data_to_offer(
    payload: Mapping[str, Any],
    *,
    evidence_source: str,
    default_merchant_id: str | None = None,
    default_merchant_name: str | None = None,
) -> OfferObservation:
    """Convert observed structured fields into the common offer contract."""
    data = dict(payload)
    source_url = _browser_url(data.get("source_url") or data.get("url"))
    host = (urlsplit(source_url).hostname or "unknown").lower()
    merchant_id = str(data.get("merchant_id") or default_merchant_id or host)
    merchant_name = str(data.get("merchant_name") or default_merchant_name or host)
    raw_price = data.get("price", data.get("item_price"))
    embedded_currency = raw_price.get("currency") if isinstance(raw_price, Mapping) else None
    currency_value = data.get("currency") or embedded_currency
    if not currency_value:
        raise ValueError("browser-submitted offers require an observed currency")
    currency = str(currency_value).upper()
    item = _money(raw_price, currency)
    if item is None:
        raise ValueError("browser-submitted offers require an observed item price")

    shipping = _money(data.get("shipping"), item.currency)
    shipping_state = _enum_or_default(
        CostState,
        data.get("shipping_state"),
        CostState.known if shipping is not None else CostState.unknown,
    )
    identity_fields = {
        key: data.get(key)
        for key in (
            "title", "brand", "family", "model", "mpn", "gtin", "sku",
            "storage", "memory", "generation", "processor", "screen_size",
            "year", "region", "colour", "connectivity", "bundle",
            "accessories", "warranty_region", "warranty_text",
        )
        if key in data
    }
    identity: ProductIdentity = resolve_identity(identity_fields)
    for evidence in identity.evidence:
        evidence.source = evidence_source if evidence.source == "structured" else evidence.source
        evidence.source_url = source_url

    seller_type = _enum_or_default(SellerType, data.get("seller_type"), SellerType.unknown)
    observed_at = data.get("observed_at") or datetime.now(timezone.utc)
    warranty = data.get("warranty")
    if not isinstance(warranty, Mapping):
        warranty = {"text": data["warranty_text"]} if data.get("warranty_text") else {}
    delivery = data.get("delivery")
    if not isinstance(delivery, Mapping):
        delivery = {"text": data["delivery_text"]} if data.get("delivery_text") else {}

    return OfferObservation(
        merchant_id=merchant_id,
        merchant_name=merchant_name,
        source_url=source_url,
        observed_at=observed_at,
        product=identity,
        seller=Seller(
            name=data.get("seller") or merchant_name,
            type=seller_type,
            trust_score=data.get("seller_trust_score"),
        ),
        price=PriceBreakdown(
            item=item,
            shipping=shipping,
            shipping_state=shipping_state,
        ),
        condition=_enum_or_default(Condition, data.get("condition"), Condition.unknown),
        stock=_enum_or_default(StockStatus, data.get("stock"), StockStatus.unknown),
        delivery=dict(delivery),
        warranty=dict(warranty),
        return_terms=dict(data.get("return_terms") or {}),
        extraction_confidence=float(data.get("extraction_confidence", identity.identity_confidence)),
        evidence_ref=data.get("evidence_ref"),
        fixture=False,
    )


class BrowserSubmittedOfferAdapter(MerchantAdapter):
    """Explicit adapter for active-page or user-opened-tab observations."""

    merchant_id = "browser_submitted"
    merchant_name = "Browser-submitted pages"
    discovery_method = "browser"
    evidence_tier = "browser_submitted"
    cost_estimate_usd = 0.0
    known_limitations = _LIMITATIONS
    timeout_seconds = 1.0
    provider_kind = ProviderKind.browser_assisted
    provider_cost = ProviderCost.zero
    capabilities = (
        "current-page-extraction", "structured-metadata", "open-tab-comparison",
        "user-submitted-url",
    )
    retries = 0
    rate_limit = ProviderRateLimit(policy="bounded by submitted browser observations")
    health = ProviderHealth.healthy
    extraction_fields = (
        "title", "brand", "model", "mpn", "gtin", "sku", "variant",
        "item_price", "shipping", "seller", "condition", "stock",
        "delivery", "warranty", "returns",
    )
    explicit_invocation_required = True

    def __init__(self, observations: Iterable[Mapping[str, Any] | OfferObservation]):
        self._observations = list(observations)
        self.domains = sorted({
            (urlsplit(
                item.source_url if isinstance(item, OfferObservation)
                else str(item.get("source_url") or item.get("url") or "")
            ).hostname or "").lower()
            for item in self._observations
            if (item.source_url if isinstance(item, OfferObservation)
                else item.get("source_url") or item.get("url"))
        })
        if not self._observations:
            self.health = ProviderHealth.degraded

    async def search_offers(
        self, product: ProductIdentity, market: str
    ) -> list[OfferObservation]:
        del product, market
        return [
            item.model_copy(deep=True) if isinstance(item, OfferObservation)
            else structured_data_to_offer(item, evidence_source="browser")
            for item in self._observations
        ]
