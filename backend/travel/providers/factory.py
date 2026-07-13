"""Provider construction and truthful configured/unconfigured health metadata."""

from __future__ import annotations

import os
from typing import Mapping

from .amadeus import AmadeusProvider, OAuthTokenCache, amadeus_descriptor
from .base import ProviderEnvironment, ProviderRegistry


def configured_provider_registry(
    environ: Mapping[str, str] | None = None,
    *,
    token_cache: OAuthTokenCache | None = None,
) -> ProviderRegistry:
    env = dict(os.environ if environ is None else environ)
    registry = ProviderRegistry()
    if env.get("AMADEUS_CLIENT_ID", "").strip() and env.get(
        "AMADEUS_CLIENT_SECRET", ""
    ).strip():
        registry.register(AmadeusProvider.from_env(env, token_cache=token_cache))
    return registry


def provider_catalog(
    registry: ProviderRegistry,
    environ: Mapping[str, str] | None = None,
) -> list[dict[str, object]]:
    env = dict(os.environ if environ is None else environ)
    configured = set(registry.provider_ids())
    environment = (
        ProviderEnvironment.live_official_api
        if env.get("AMADEUS_ENVIRONMENT", "").strip().lower() in {"production", "prod"}
        else ProviderEnvironment.sandbox_api
    )
    descriptor = amadeus_descriptor(environment)
    return [
        {
            **descriptor.model_dump(mode="json"),
            "configured": "amadeus" in configured,
            "health": "available" if "amadeus" in configured else "unconfigured",
            "data_label": descriptor.current_environment.value,
            "fixture": False,
        }
    ]
