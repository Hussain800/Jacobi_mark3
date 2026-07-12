"""MerchantAdapter contract + registry."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List

from ..schemas import OfferObservation, ProductIdentity


class MerchantAdapter(ABC):
    merchant_id: str = "abstract"
    merchant_name: str = "Abstract"
    domains: List[str] = []
    categories: List[str] = ["electronics"]
    # Honest capability/limitation declaration (PDR adapter contract).
    discovery_method: str = "none"     # fixture | http_search | official_api | browser
    evidence_tier: str = "fixture"     # fixture | local_http | official_api | managed
    cost_estimate_usd: float = 0.0
    known_limitations: List[str] = []
    timeout_seconds: float = 5.0

    def supports_url(self, url: str) -> bool:
        u = (url or "").lower()
        return any(d in u for d in self.domains)

    @abstractmethod
    async def search_offers(
        self, product: ProductIdentity, market: str
    ) -> List[OfferObservation]:
        """Return candidate offers for the product in the market. Must not
        invent fields it cannot observe — unknown stays None/unknown."""


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
