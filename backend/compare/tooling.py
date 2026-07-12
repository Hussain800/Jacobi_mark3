"""Shared price-optimization facade for MCP and command-line clients.

The facade is intentionally thin: orchestration stays in ComparisonService,
while focused calculations call the same identity, equivalence, and total-cost
functions used by that service.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from agentcore import engine as agent_engine

from .adapters import (
    BrowserSubmittedOfferAdapter,
    DirectHttpStructuredMetadataAdapter,
    MerchantAdapter,
    get_adapters,
)
from .adapters.browser_submitted import structured_data_to_offer
from .equivalence import classify
from .identity import resolve_identity
from .schemas import (
    ComparisonRequest,
    Condition,
    OptimizationResult,
    PriceBreakdown,
)
from .service import (
    get_comparison_manifest,
    get_result,
    service,
    verify_comparison_access,
)
from .total_cost import compute_payable


def _json(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json")


def identify_product_fields(fields: Mapping[str, Any]) -> dict[str, Any]:
    """Resolve canonical product identity from already-observed page fields."""
    return _json(resolve_identity(dict(fields)))


async def compare_request(payload: Mapping[str, Any]) -> OptimizationResult:
    """Validate and run the canonical comparison pipeline."""
    request = ComparisonRequest.model_validate(dict(payload))
    return await service.compare(request)


def discovery_view(result: OptimizationResult) -> dict[str, Any]:
    """Project a comparison result into an offer-discovery response."""
    candidates = (
        result.eligible_offers
        + result.tradeoff_offers
        + result.similar_offers
        + result.rejected_offers
    )
    return {
        "comparison_id": result.comparison_id,
        "comparison_access_token": result.comparison_access_token,
        "product": _json(result.product),
        "offers": [_json(candidate.offer) for candidate in candidates],
        "provider_errors": [_json(error) for error in result.provider_errors],
        "evidence_manifest_id": result.evidence_manifest_id,
        "fixture_mode": result.fixture_mode,
    }


def optimization_view(result: OptimizationResult) -> dict[str, Any]:
    """Project a result into the cheapest-route decision and exclusions."""
    excluded = result.tradeoff_offers + result.similar_offers + result.rejected_offers
    return {
        "comparison_id": result.comparison_id,
        "comparison_access_token": result.comparison_access_token,
        "recommendation": _json(result.recommendation),
        "best_offer": _json(result.best_offer) if result.best_offer else None,
        "savings": _json(result.savings),
        "confidence": result.confidence.value,
        "reason_codes": [code.value for code in result.reason_codes],
        "excluded_offers": [
            {
                "offer": _json(candidate.offer),
                "equivalence": _json(candidate.equivalence),
                "exclusion_reasons": [code.value for code in candidate.exclusion_reasons],
            }
            for candidate in excluded
        ],
        "provider_errors": [_json(error) for error in result.provider_errors],
        "evidence_manifest_id": result.evidence_manifest_id,
        "fixture_mode": result.fixture_mode,
    }


def verify_offer_fields(
    current_fields: Mapping[str, Any],
    candidate_fields: Mapping[str, Any],
    *,
    current_condition: str = "new",
) -> dict[str, Any]:
    """Classify one observed candidate against current observed fields."""
    current = resolve_identity(dict(current_fields))
    candidate = structured_data_to_offer(
        dict(candidate_fields), evidence_source="submitted_tool_input"
    )
    result = classify(current, Condition(current_condition), candidate)
    return _json(result)


def calculate_total_fields(price_fields: Mapping[str, Any]) -> dict[str, Any]:
    """Calculate the known payable total while preserving unknown states."""
    price = PriceBreakdown.model_validate(dict(price_fields))
    return _json(compute_payable(price, price.item.currency))


def explain_stored_optimization(comparison_id: str, access_token: str) -> dict[str, Any]:
    """Explain a stored comparison after capability-token authorization."""
    if not verify_comparison_access(comparison_id, access_token):
        return {"error": "comparison not found"}
    result = get_result(comparison_id)
    if result is None:
        return {"error": "comparison not found"}
    return {
        "comparison_id": result.comparison_id,
        "status": result.recommendation.status.value,
        "headline": result.recommendation.headline,
        "explanation": result.recommendation.explanation,
        "action_url": result.recommendation.action_url,
        "confidence": result.confidence.value,
        "reason_codes": [code.value for code in result.reason_codes],
        "provider_errors": [_json(error) for error in result.provider_errors],
        "evidence_manifest_id": result.evidence_manifest_id,
    }


def fetch_stored_manifest(
    comparison_id: str,
    manifest_id: str,
    access_token: str,
) -> dict[str, Any]:
    """Fetch immutable evidence through the comparison capability boundary."""
    if not verify_comparison_access(comparison_id, access_token):
        return {"error": "evidence manifest not found"}
    manifest = get_comparison_manifest(comparison_id, manifest_id)
    return _json(manifest) if manifest else {"error": "evidence manifest not found"}


def _describe_provider(provider: MerchantAdapter | type[MerchantAdapter]) -> dict[str, Any]:
    return MerchantAdapter.describe(provider).to_dict()


def provider_catalog() -> list[dict[str, Any]]:
    """Return capabilities without invoking any provider or network path."""
    providers = [{
        "provider_id": "current_page_context",
        "name": "Current browser page context",
        "kind": "current-page",
        "domains": [],
        "capabilities": ["current-page-extraction", "structured-metadata"],
        "cost": "zero",
        "cost_estimate_usd": 0.0,
        "evidence_tier": "browser_submitted",
        "timeout_seconds": 0.0,
        "retries": 0,
        "limitations": ["Uses only fields submitted by the user's active page"],
        "rate_limit": {"requests": None, "window_seconds": None, "policy": "one active page"},
        "health": "healthy",
        "extraction_fields": ["identity", "price", "seller", "availability"],
        "explicit_invocation_required": False,
        "fixture": False,
    }]
    fixture_providers = [_describe_provider(adapter) for adapter in get_adapters("AE")]
    for provider in fixture_providers:
        # Fixtures are registered for deterministic development, but a normal
        # request activates them only with include_fixture_offers=true.
        provider["explicit_invocation_required"] = True
    providers.extend(fixture_providers)
    providers.extend([
        _describe_provider(BrowserSubmittedOfferAdapter),
        _describe_provider(DirectHttpStructuredMetadataAdapter),
    ])
    return providers


def optimization_health() -> dict[str, Any]:
    providers = provider_catalog()
    return {
        "status": "ok",
        "mandatory_collection_cost_usd": 0.0,
        "paid_provider_automatic_calls": False,
        "providers": providers,
        "default_provider_ids": [
            provider["provider_id"]
            for provider in providers
            if not provider["explicit_invocation_required"]
        ],
    }


async def deep_audit(
    *,
    explicit: bool,
    demo: Optional[str] = None,
    url: Optional[str] = None,
    displayed_total_amount: Optional[float] = None,
    displayed_total_currency: str = "AED",
    consent_scope: str = "research_only",
    tier: str = "free",
    allow_managed_provider: bool = False,
) -> dict[str, Any]:
    """Run the preserved legacy audit only after an explicit caller opt-in."""
    if not explicit:
        return {
            "error": "deep audit requires explicit=true",
            "automatic_paid_provider_calls": False,
        }
    if tier not in {"free", "pro"}:
        return {"error": "tier must be 'free' or 'pro'"}
    if url and not demo:
        if not allow_managed_provider:
            return {
                "error": (
                    "the 24/50-profile Deep Audit requires "
                    "allow_managed_provider=true because the legacy engine may use "
                    "configured deployer-managed provider credentials"
                ),
                "automatic_paid_provider_calls": False,
            }
        # Lazy import avoids coupling normal comparison startup to main.py. The
        # full synthetic matrix remains owned by the preserved legacy engine.
        from main import run_full_probe

        result = await run_full_probe(url, url, tier=tier)
        return {
            "audit_type": "synthetic_price_discrimination_matrix",
            "managed_provider_explicitly_allowed": True,
            "result": result,
        }
    displayed_total = (
        {"amount": displayed_total_amount, "currency": displayed_total_currency}
        if displayed_total_amount is not None
        else None
    )
    envelope = agent_engine.run_verify(
        demo=demo,
        url=url,
        consent_scope=consent_scope,
        displayed_total=displayed_total,
        agent_id="price-optimization-tool",
        org="mcp-local",
    )
    result = _json(envelope)
    result["audit_type"] = "agentcore_fixture_price_context"
    result["managed_provider_explicitly_allowed"] = False
    return result
