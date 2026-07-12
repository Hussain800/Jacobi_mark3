"""Hermetic provider metadata, browser-submitted, and direct-HTTP tests."""

import asyncio
import json

import pytest

from compare.adapters import (
    BrowserSubmittedOfferAdapter,
    DirectHttpStructuredMetadataAdapter,
    OptionalManagedAdapter,
    ProviderHealth,
    ProviderKind,
    get_adapters,
    reset_registry_for_tests,
)
from compare.adapters.direct_http import (
    DirectHttpError,
    HttpFetchResponse,
)
from compare.schemas import CostState, ProductIdentity


def _submitted_offer(**overrides):
    payload = {
        "source_url": "https://www.amazon.ae/dp/B0EXAMPLE?tag=affiliate",
        "merchant_id": "amazon_ae",
        "merchant_name": "Amazon UAE",
        "title": "Sony WH-1000XM6 Wireless Headphones Black",
        "brand": "Sony",
        "mpn": "WH-1000XM6/B",
        "gtin": "4548736158801",
        "price": {"amount": "1499.00", "currency": "AED"},
        "seller": "Amazon UAE",
        "seller_type": "first_party",
        "condition": "new",
        "stock": "in_stock",
    }
    payload.update(overrides)
    return payload


def test_provider_kind_contract_covers_every_pdr_plugin_kind():
    assert {kind.value for kind in ProviderKind} >= {
        "current-page",
        "structured-metadata",
        "direct-http",
        "browser-assisted",
        "local-playwright",
        "merchant-search",
        "official-api",
        "optional-managed",
    }


def test_default_registry_is_fixture_only_and_honestly_described():
    reset_registry_for_tests()
    descriptions = [adapter.describe() for adapter in get_adapters()]
    assert descriptions
    assert all(item.kind == ProviderKind.fixture for item in descriptions)
    assert all(item.fixture and item.cost.value == "zero" for item in descriptions)
    assert all(item.health == ProviderHealth.healthy for item in descriptions)
    assert all("structured-offer" in item.capabilities for item in descriptions)
    assert all(item.extraction_fields and item.limitations for item in descriptions)
    assert not any(item.kind == ProviderKind.optional_managed for item in descriptions)
    reset_registry_for_tests()


class _ManagedProbe(OptionalManagedAdapter):
    merchant_id = "managed_probe"
    merchant_name = "Managed probe"
    calls = 0

    async def search_managed_offers(self, product, market):
        self.calls += 1
        return []


def test_optional_managed_provider_is_disabled_without_explicit_opt_in():
    provider = _ManagedProbe()
    assert provider.describe().health == ProviderHealth.disabled
    with pytest.raises(RuntimeError, match="disabled"):
        asyncio.run(provider.search_offers(ProductIdentity(), "AE"))
    assert provider.calls == 0


def test_browser_submitted_observation_is_live_zero_cost_and_preserves_unknown_shipping():
    adapter = BrowserSubmittedOfferAdapter([_submitted_offer()])
    offers = asyncio.run(adapter.search_offers(ProductIdentity(), "AE"))
    assert len(offers) == 1
    offer = offers[0]
    assert not offer.fixture
    assert offer.product.gtins == ["4548736158801"]
    assert offer.price.item.amount == 1499
    assert offer.price.shipping is None
    assert offer.price.shipping_state == CostState.unknown
    assert any(e.source == "browser" and e.source_url == offer.source_url for e in offer.product.evidence)

    metadata = adapter.describe()
    assert metadata.kind == ProviderKind.browser_assisted
    assert metadata.cost.value == "zero"
    assert metadata.explicit_invocation_required
    assert "open-tab-comparison" in metadata.capabilities


class _FakeTransport:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def fetch(self, url, *, timeout_seconds, max_bytes):
        self.calls.append((url, timeout_seconds, max_bytes))
        response = self.responses[url]
        if isinstance(response, Exception):
            raise response
        return response


def _product_html(price="1399.50"):
    product = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Sony WH-1000XM6 Wireless Headphones Black",
        "brand": {"@type": "Brand", "name": "Sony"},
        "model": "WH-1000XM6",
        "mpn": "WH-1000XM6/B",
        "gtin13": "4548736158801",
        "offers": {
            "@type": "Offer",
            "url": "https://shop.example/product?utm_source=mail",
            "price": price,
            "priceCurrency": "AED",
            "availability": "https://schema.org/InStock",
            "itemCondition": "https://schema.org/NewCondition",
            "seller": {"@type": "Organization", "name": "Example Electronics"},
            "shippingDetails": {"shippingRate": {"value": "0", "currency": "AED"}},
        },
    }
    return f'<html><script type="application/ld+json">{json.dumps(product)}</script></html>'.encode()


def test_direct_http_validates_each_redirect_and_extracts_json_ld_without_network():
    start = "https://shop.example/start"
    landing = "https://shop.example/product?utm_source=mail"
    transport = _FakeTransport({
        start: HttpFetchResponse(302, {"location": landing}, b"", start),
        landing: HttpFetchResponse(200, {"content-type": "text/html"}, _product_html(), landing),
    })
    validated = []
    adapter = DirectHttpStructuredMetadataAdapter(
        [start], transport=transport, url_validator=lambda url: validated.append(url) or url
    )

    offers = asyncio.run(adapter.search_offers(ProductIdentity(), "AE"))
    assert [call[0] for call in transport.calls] == [start, landing]
    assert validated == [start, start, landing, landing]
    assert len(offers) == 1
    assert offers[0].product.mpn == "WH-1000XM6/B"
    assert str(offers[0].price.item.amount) == "1399.50"
    assert offers[0].price.shipping.amount == 0
    assert offers[0].stock.value == "in_stock"
    assert offers[0].fixture is False
    assert adapter.describe().health == ProviderHealth.healthy


def test_direct_http_rejects_private_redirect_before_second_fetch():
    start = "https://shop.example/start"
    private = "http://127.0.0.1/secrets"
    transport = _FakeTransport({
        start: HttpFetchResponse(302, {"location": private}, b"", start),
    })

    def validator(url):
        if url == private:
            raise ValueError("private address blocked")
        return url

    adapter = DirectHttpStructuredMetadataAdapter(
        [start], transport=transport, url_validator=validator
    )
    with pytest.raises(DirectHttpError, match="private address blocked"):
        asyncio.run(adapter.search_offers(ProductIdentity(), "AE"))
    assert [call[0] for call in transport.calls] == [start]


def test_direct_http_enforces_response_size_even_for_injected_transport():
    url = "https://shop.example/product"
    transport = _FakeTransport({
        url: HttpFetchResponse(200, {"content-type": "text/html"}, b"x" * 101, url),
    })
    adapter = DirectHttpStructuredMetadataAdapter(
        [url], transport=transport, url_validator=lambda value: value, max_response_bytes=100
    )
    with pytest.raises(DirectHttpError) as error:
        asyncio.run(adapter.search_offers(ProductIdentity(), "AE"))
    assert "ResponseTooLargeError" in str(error.value)


def test_direct_http_returns_honest_partial_result_when_one_submitted_url_fails():
    bad = "https://bad.example/product"
    good = "https://shop.example/product"
    transport = _FakeTransport({
        bad: RuntimeError("connection failed"),
        good: HttpFetchResponse(200, {"content-type": "text/html"}, _product_html(), good),
    })
    adapter = DirectHttpStructuredMetadataAdapter(
        [bad, good], transport=transport, url_validator=lambda value: value
    )
    offers = asyncio.run(adapter.search_offers(ProductIdentity(), "AE"))
    assert len(offers) == 1
    assert adapter.last_errors and "connection failed" in adapter.last_errors[0]
    assert adapter.describe().health == ProviderHealth.degraded


def test_direct_http_requires_explicit_urls():
    with pytest.raises(ValueError, match="explicit"):
        DirectHttpStructuredMetadataAdapter([])
