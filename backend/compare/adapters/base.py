"""Merchant adapter contract, capability metadata, and zero-cost defaults."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any, Dict, List, Tuple

from ..schemas import OfferObservation, ProductIdentity


class ProviderKind(str, Enum):
    current_page = "current-page"
    structured_metadata = "structured-metadata"
    direct_http = "direct-http"
    browser_assisted = "browser-assisted"
    local_playwright = "local-playwright"
    merchant_search = "merchant-search"
    official_api = "official-api"
    optional_managed = "optional-managed"
    fixture = "fixture"


class ProviderCost(str, Enum):
    zero = "zero"
    paid = "paid"


class ProviderHealth(str, Enum):
    healthy = "healthy"
    degraded = "degraded"
    unavailable = "unavailable"
    disabled = "disabled"
    unknown = "unknown"


@dataclass(frozen=True)
class ProviderRateLimit:
    requests: int | None = None
    window_seconds: int | None = None
    policy: str = "provider-specific"


@dataclass(frozen=True)
class ProviderMetadata:
    provider_id: str
    name: str
    kind: ProviderKind
    domains: Tuple[str, ...]
    capabilities: Tuple[str, ...]
    cost: ProviderCost
    cost_estimate_usd: float
    evidence_tier: str
    timeout_seconds: float
    retries: int
    limitations: Tuple[str, ...]
    rate_limit: ProviderRateLimit
    health: ProviderHealth
    extraction_fields: Tuple[str, ...]
    explicit_invocation_required: bool
    fixture: bool

    def to_dict(self) -> Dict[str, Any]:
        """Return JSON-ready metadata for REST, CLI, and MCP surfaces."""
        payload = asdict(self)
        payload["kind"] = self.kind.value
        payload["cost"] = self.cost.value
        payload["health"] = self.health.value
        return payload


class MerchantAdapter(ABC):
    merchant_id: str = "abstract"
    merchant_name: str = "Abstract"
    domains: List[str] = []
    categories: List[str] = ["electronics"]
    # Legacy attributes remain available to the existing comparison service.
    discovery_method: str = "none"     # fixture | http_search | official_api | browser
    evidence_tier: str = "fixture"     # fixture | local_http | official_api | managed
    cost_estimate_usd: float = 0.0
    known_limitations: List[str] = []
    timeout_seconds: float = 5.0
    provider_kind: ProviderKind = ProviderKind.structured_metadata
    provider_cost: ProviderCost = ProviderCost.zero
    capabilities: Tuple[str, ...] = ()
    retries: int = 0
    rate_limit: ProviderRateLimit = ProviderRateLimit()
    health: ProviderHealth = ProviderHealth.unknown
    extraction_fields: Tuple[str, ...] = ()
    explicit_invocation_required: bool = False
    fixture: bool = False

    def supports_url(self, url: str) -> bool:
        from urllib.parse import urlsplit

        host = (urlsplit(url or "").hostname or "").lower().rstrip(".")
        return any(host == d.lower() or host.endswith(f".{d.lower()}") for d in self.domains)

    def describe(self) -> ProviderMetadata:
        """Describe provider behavior without invoking it or performing I/O."""
        return ProviderMetadata(
            provider_id=self.merchant_id,
            name=self.merchant_name,
            kind=self.provider_kind,
            domains=tuple(self.domains),
            capabilities=tuple(self.capabilities),
            cost=self.provider_cost,
            cost_estimate_usd=self.cost_estimate_usd,
            evidence_tier=self.evidence_tier,
            timeout_seconds=self.timeout_seconds,
            retries=self.retries,
            limitations=tuple(self.known_limitations),
            rate_limit=self.rate_limit,
            health=self.health,
            extraction_fields=tuple(self.extraction_fields),
            explicit_invocation_required=self.explicit_invocation_required,
            fixture=self.fixture,
        )

    @abstractmethod
    async def search_offers(
        self, product: ProductIdentity, market: str
    ) -> List[OfferObservation]:
        """Return candidate offers for the product in the market. Must not
        invent fields it cannot observe — unknown stays None/unknown."""


class OptionalManagedAdapter(MerchantAdapter, ABC):
    """Base for paid plugins that are inert unless explicitly enabled.

    No subclass is registered by the default zero-cost registry. A deployer
    must both construct one and opt in before its provider-specific method can
    run.
    """

    provider_kind = ProviderKind.optional_managed
    provider_cost = ProviderCost.paid
    evidence_tier = "managed"
    explicit_invocation_required = True
    health = ProviderHealth.disabled

    def __init__(self, *, enabled: bool = False) -> None:
        self.enabled = enabled
        self.health = ProviderHealth.unknown if enabled else ProviderHealth.disabled

    async def search_offers(
        self, product: ProductIdentity, market: str
    ) -> List[OfferObservation]:
        if not self.enabled:
            raise RuntimeError("optional managed provider is disabled")
        return await self.search_managed_offers(product, market)

    @abstractmethod
    async def search_managed_offers(
        self, product: ProductIdentity, market: str
    ) -> List[OfferObservation]: ...


_REGISTRY: Dict[str, MerchantAdapter] = {}


def register_adapter(adapter: MerchantAdapter) -> None:
    _REGISTRY[adapter.merchant_id] = adapter


def get_adapters(market: str = "AE") -> List[MerchantAdapter]:
    if not _REGISTRY:
        _register_defaults()
    return list(_REGISTRY.values())


def reset_registry_for_tests() -> None:
    _REGISTRY.clear()


def _register_defaults() -> None:
    from .fixture_store import default_fixture_adapters

    for a in default_fixture_adapters():
        register_adapter(a)
