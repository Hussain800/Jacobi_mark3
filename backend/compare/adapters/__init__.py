"""Jacobi Compare — merchant adapters.

Every retailer sits behind MerchantAdapter (PDR FR-5). Adapters declare their
capabilities and cost honestly; a failing adapter never fails the comparison
(service.py isolates it). The MVP registry ships fixture-backed UAE merchants
only — zero collection cost, deterministic in CI. Live adapters (direct HTTP /
local Playwright / official APIs) implement the same interface later; Bright
Data, if ever used, is one more optional adapter — never a default.
"""

from .base import (
    MerchantAdapter,
    OptionalManagedAdapter,
    ProviderCost,
    ProviderHealth,
    ProviderKind,
    ProviderMetadata,
    ProviderRateLimit,
    get_adapters,
    register_adapter,
    reset_registry_for_tests,
)
from .browser_submitted import BrowserSubmittedOfferAdapter, structured_data_to_offer
from .direct_http import DirectHttpStructuredMetadataAdapter

__all__ = [
    "MerchantAdapter",
    "OptionalManagedAdapter",
    "BrowserSubmittedOfferAdapter",
    "DirectHttpStructuredMetadataAdapter",
    "ProviderCost",
    "ProviderHealth",
    "ProviderKind",
    "ProviderMetadata",
    "ProviderRateLimit",
    "get_adapters",
    "register_adapter",
    "reset_registry_for_tests",
    "structured_data_to_offer",
]
