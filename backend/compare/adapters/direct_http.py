"""Explicit, zero-cost direct HTTP extraction of public structured metadata.

There is no automatic crawling, stealth, CAPTCHA handling, or paid-provider
fallback here. Callers must supply the URLs. Every redirect target is validated
before it is fetched and response bodies are bounded.
"""

from __future__ import annotations

import inspect
import json
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any, Awaitable, Callable, Iterable, Mapping, Protocol
from urllib.parse import urljoin, urlsplit

import httpx

from url_guard import validate_public_url

from ..discovery import deduplicate_offers
from ..schemas import OfferObservation, ProductIdentity
from .base import (
    MerchantAdapter,
    ProviderCost,
    ProviderHealth,
    ProviderKind,
    ProviderRateLimit,
)
from .browser_submitted import structured_data_to_offer

DEFAULT_MAX_RESPONSE_BYTES = 1_000_000
MAX_SUBMITTED_URLS = 20
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
_CONTENT_TYPES = ("text/html", "application/xhtml+xml", "application/ld+json")


class DirectHttpError(RuntimeError):
    pass


class ResponseTooLargeError(DirectHttpError):
    pass


@dataclass(frozen=True)
class HttpFetchResponse:
    status_code: int
    headers: Mapping[str, str]
    content: bytes
    url: str


class HttpTransport(Protocol):
    def fetch(
        self, url: str, *, timeout_seconds: float, max_bytes: int
    ) -> HttpFetchResponse | Awaitable[HttpFetchResponse]: ...


class HttpxTransport:
    """Non-redirecting transport with streaming response-size enforcement."""

    async def fetch(
        self, url: str, *, timeout_seconds: float, max_bytes: int
    ) -> HttpFetchResponse:
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/ld+json;q=0.9",
            "User-Agent": "JacobiOpenSource/1.0 (+structured metadata only)",
        }
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout_seconds) as client:
            async with client.stream("GET", url, headers=headers) as response:
                declared = response.headers.get("content-length")
                if declared:
                    try:
                        if int(declared) > max_bytes:
                            raise ResponseTooLargeError(
                                f"response exceeds {max_bytes} byte limit"
                            )
                    except ValueError:
                        pass
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise ResponseTooLargeError(
                            f"response exceeds {max_bytes} byte limit"
                        )
                return HttpFetchResponse(
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    content=bytes(body),
                    url=str(response.url),
                )


class _MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.metadata: dict[str, str] = {}
        self.json_ld: list[Any] = []
        self._in_json_ld = False
        self._script: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs if value is not None}
        if tag.lower() == "meta":
            key = (values.get("property") or values.get("name") or "").lower()
            if key and "content" in values:
                self.metadata[key] = values["content"]
        elif tag.lower() == "script" and "ld+json" in values.get("type", "").lower():
            self._in_json_ld = True
            self._script = []

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            self._script.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "script" or not self._in_json_ld:
            return
        self._in_json_ld = False
        try:
            self.json_ld.append(json.loads("".join(self._script)))
        except (ValueError, TypeError, RecursionError):
            pass
        self._script = []


def _type_values(node: Mapping[str, Any]) -> set[str]:
    raw = node.get("@type")
    values = raw if isinstance(raw, list) else [raw]
    return {str(value).lower() for value in values if value is not None}


def _product_nodes(documents: Iterable[Any]) -> list[Mapping[str, Any]]:
    products: list[Mapping[str, Any]] = []
    stack = list(documents)
    visited = 0
    while stack and visited < 10_000:
        current = stack.pop()
        visited += 1
        if isinstance(current, Mapping):
            if "product" in _type_values(current):
                products.append(current)
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return products


def _name(value: Any) -> str | None:
    if isinstance(value, Mapping):
        value = value.get("name")
    return str(value).strip() if value not in (None, "") else None


def _offer_nodes(product: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    raw = product.get("offers")
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, Mapping)]
    return [raw] if isinstance(raw, Mapping) else []


def _price(offer: Mapping[str, Any]) -> Any:
    value = offer.get("price", offer.get("lowPrice"))
    if isinstance(value, Mapping):
        return value.get("value")
    return value


def _shipping(offer: Mapping[str, Any]) -> Any:
    details = offer.get("shippingDetails")
    if isinstance(details, list):
        details = details[0] if details else None
    if not isinstance(details, Mapping):
        return None
    rate = details.get("shippingRate")
    if isinstance(rate, Mapping):
        return rate.get("value", rate.get("price"))
    return rate


def _stock(value: Any) -> str:
    text = str(value or "").lower()
    if "outofstock" in text or "soldout" in text:
        return "out_of_stock"
    if "preorder" in text:
        return "preorder"
    if "instock" in text:
        return "in_stock"
    return "unknown"


def _condition(value: Any) -> str:
    text = str(value or "").lower()
    if "refurb" in text:
        return "refurbished"
    if "used" in text:
        return "used"
    if "new" in text:
        return "new"
    return "unknown"


def extract_structured_offers(
    html: str, source_url: str, *, extraction_method: str = "direct_http_json_ld"
) -> list[OfferObservation]:
    """Extract JSON-LD Product offers, with Open Graph as a narrow fallback."""
    parser = _MetadataParser()
    try:
        parser.feed(html)
        parser.close()
    except (ValueError, RecursionError):
        return []

    host = (urlsplit(source_url).hostname or "unknown").lower()
    observations: list[OfferObservation] = []
    for product in _product_nodes(parser.json_ld):
        gtin = next(
            (product.get(key) for key in ("gtin14", "gtin13", "gtin12", "gtin8", "gtin")
             if product.get(key)),
            None,
        )
        for offer in _offer_nodes(product):
            item_price = _price(offer)
            if item_price in (None, ""):
                continue
            seller = _name(offer.get("seller"))
            merchant = _name(offer.get("offeredBy")) or host
            payload = {
                "source_url": urljoin(source_url, str(offer.get("url") or source_url)),
                "merchant_id": host,
                "merchant_name": merchant,
                "title": _name(product.get("name")),
                "brand": _name(product.get("brand")),
                "model": product.get("model"),
                "mpn": product.get("mpn"),
                "gtin": gtin,
                "sku": product.get("sku"),
                "colour": product.get("color"),
                "price": item_price,
                "currency": offer.get("priceCurrency"),
                "shipping": _shipping(offer),
                "seller": seller or merchant,
                "seller_type": "unknown",
                "condition": _condition(offer.get("itemCondition")),
                "stock": _stock(offer.get("availability")),
                "extraction_confidence": 0.97,
            }
            observations.append(
                structured_data_to_offer(payload, evidence_source=extraction_method)
            )

    if observations:
        return deduplicate_offers(observations)

    meta = parser.metadata
    price = meta.get("product:price:amount") or meta.get("og:price:amount")
    title = meta.get("og:title")
    if price and title:
        payload = {
            "source_url": urljoin(source_url, meta.get("og:url") or source_url),
            "merchant_id": host,
            "merchant_name": host,
            "title": title,
            "brand": meta.get("product:brand"),
            "price": price,
            "currency": meta.get("product:price:currency"),
            "stock": _stock(meta.get("product:availability")),
            "condition": _condition(meta.get("product:condition")),
            "extraction_confidence": 0.75,
        }
        return [structured_data_to_offer(payload, evidence_source="open_graph")]
    return []


class DirectHttpStructuredMetadataAdapter(MerchantAdapter):
    """Fetch only caller-supplied public URLs and extract structured fields."""

    merchant_id = "direct_http_structured"
    merchant_name = "Direct public HTTP"
    discovery_method = "direct_http_structured"
    evidence_tier = "local_http"
    cost_estimate_usd = 0.0
    known_limitations = [
        "Explicit caller-supplied URLs only; no automatic crawling",
        "Structured JSON-LD/Open Graph only; JavaScript-rendered fields may be absent",
        "No CAPTCHA handling, stealth, proxy, or geography simulation",
    ]
    timeout_seconds = 8.0
    provider_kind = ProviderKind.direct_http
    provider_cost = ProviderCost.zero
    capabilities = ("public-http", "structured-metadata", "json-ld", "open-graph")
    retries = 0
    rate_limit = ProviderRateLimit(
        requests=MAX_SUBMITTED_URLS,
        window_seconds=None,
        policy="one request per submitted URL plus validated redirects",
    )
    health = ProviderHealth.unknown
    extraction_fields = (
        "title", "brand", "model", "mpn", "gtin", "sku", "colour",
        "item_price", "shipping", "seller", "condition", "availability",
    )
    explicit_invocation_required = True

    def __init__(
        self,
        urls: Iterable[str],
        *,
        transport: HttpTransport | None = None,
        url_validator: Callable[[str], str | None] = validate_public_url,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
        max_redirects: int = 5,
    ) -> None:
        self._urls = [str(url).strip() for url in urls if str(url).strip()]
        if not self._urls:
            raise ValueError("direct HTTP provider requires explicit submitted URLs")
        if len(self._urls) > MAX_SUBMITTED_URLS:
            raise ValueError(f"at most {MAX_SUBMITTED_URLS} URLs may be submitted")
        if max_response_bytes < 1:
            raise ValueError("max_response_bytes must be positive")
        if max_redirects < 0:
            raise ValueError("max_redirects cannot be negative")
        self._transport = transport or HttpxTransport()
        self._validate_url = url_validator
        self._max_response_bytes = max_response_bytes
        self._max_redirects = max_redirects
        self.last_errors: list[str] = []
        self.domains = sorted({
            (urlsplit(url).hostname or "").lower() for url in self._urls
        })

    async def _transport_fetch(self, url: str) -> HttpFetchResponse:
        result = self._transport.fetch(
            url,
            timeout_seconds=self.timeout_seconds,
            max_bytes=self._max_response_bytes,
        )
        return await result if inspect.isawaitable(result) else result

    async def _fetch(self, start_url: str) -> HttpFetchResponse:
        current = start_url
        for redirect_count in range(self._max_redirects + 1):
            self._validate_url(current)
            response = await self._transport_fetch(current)
            response_url = response.url or current
            self._validate_url(response_url)
            if len(response.content) > self._max_response_bytes:
                raise ResponseTooLargeError(
                    f"response exceeds {self._max_response_bytes} byte limit"
                )
            if response.status_code not in REDIRECT_STATUSES:
                return response
            if redirect_count >= self._max_redirects:
                raise DirectHttpError("redirect limit exceeded")
            location = response.headers.get("location") or response.headers.get("Location")
            if not location:
                raise DirectHttpError("redirect response omitted Location header")
            current = urljoin(response_url, location)
        raise DirectHttpError("redirect limit exceeded")

    async def search_offers(
        self, product: ProductIdentity, market: str
    ) -> list[OfferObservation]:
        del product, market
        self.last_errors = []
        offers: list[OfferObservation] = []
        for url in self._urls:
            try:
                response = await self._fetch(url)
                if response.status_code < 200 or response.status_code >= 300:
                    raise DirectHttpError(f"HTTP {response.status_code}")
                content_type = str(response.headers.get("content-type", "")).lower()
                if content_type and not any(value in content_type for value in _CONTENT_TYPES):
                    raise DirectHttpError(f"unsupported content type: {content_type}")
                html = response.content.decode("utf-8", errors="replace")
                extracted = extract_structured_offers(html, response.url or url)
                if not extracted:
                    self.last_errors.append(f"{url}: no product structured metadata found")
                offers.extend(extracted)
            except Exception as exc:
                self.last_errors.append(f"{url}: {exc.__class__.__name__}: {exc}")

        if offers:
            self.health = ProviderHealth.degraded if self.last_errors else ProviderHealth.healthy
            return deduplicate_offers(offers)
        self.health = ProviderHealth.degraded
        if self.last_errors:
            raise DirectHttpError("; ".join(self.last_errors))
        return []
