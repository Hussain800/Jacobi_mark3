"""Jacobi Compare — comparison orchestration.

normalize current offer -> resolve identity -> async adapter fan-out (isolated
failures, per-adapter timeouts) -> equivalence -> all-in totals -> filter-first
ranking -> recommendation + evidence manifest.

Evidence reuses agentcore's EvidenceManifest/build_manifest and the org-scoped
provenance repo unchanged — same trust layer, new workload (PDR: Agentcore is
infrastructure, not the heart).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from urllib.parse import urlsplit

from agentcore.evidence import build_manifest
from agentcore.schemas import (
    Artifact,
    CollectionAttempt,
    Extraction,
    Money as LegacyMoney,
    PriceObligation,
    ProviderCapabilities,
)
from agentcore.storage import get_repo

from .adapters import MerchantAdapter, get_adapters
from .equivalence import classify
from .identity import resolve_identity
from .ranking import build_recommendation, rank
from .schemas import (
    ComparisonRequest,
    ComparisonStatus,
    Condition,
    OfferObservation,
    OptimizationResult,
    PriceBreakdown,
    ProductIdentity,
    ProviderError,
    ReasonCode,
    Seller,
    SellerType,
)
from .total_cost import apply_total

EVIDENCE_ORG = "demo"  # public demo org — same posture as the agent demo surface
_MAX_RESULTS = 500
_RESULTS: "OrderedDict[str, OptimizationResult]" = OrderedDict()


def get_result(comparison_id: str) -> Optional[OptimizationResult]:
    return _RESULTS.get(comparison_id)


def _remember(result: OptimizationResult) -> None:
    _RESULTS[result.comparison_id] = result
    while len(_RESULTS) > _MAX_RESULTS:
        _RESULTS.popitem(last=False)


def reset_results_for_tests() -> None:
    _RESULTS.clear()


def _hostname(url: str) -> str:
    s = url if "//" in (url or "") else f"//{url or ''}"
    host = urlsplit(s.lower()).hostname or "unknown"
    return host[4:] if host.startswith("www.") else host


def _current_offer(request: ComparisonRequest, identity: ProductIdentity,
                   adapters: List[MerchantAdapter]) -> OfferObservation:
    cur = request.current_offer
    merchant_id, merchant_name = _hostname(request.source_url), _hostname(request.source_url)
    for a in adapters:
        if a.supports_url(request.source_url):
            merchant_id, merchant_name = a.merchant_id, a.merchant_name
            break
    offer = OfferObservation(
        merchant_id=merchant_id,
        merchant_name=merchant_name,
        source_url=request.source_url,
        product=identity,
        seller=Seller(name=cur.seller or merchant_name, type=SellerType.unknown),
        price=PriceBreakdown(item=cur.price, shipping=cur.shipping),
        condition=cur.condition,
        stock=cur.stock,
        warranty={"text": cur.warranty_text} if cur.warranty_text else {},
        delivery={"text": cur.delivery_text} if cur.delivery_text else {},
        extraction_confidence=identity.identity_confidence,
    )
    return apply_total(offer)


async def _search_one(
    adapter: MerchantAdapter, identity: ProductIdentity, market: str
) -> Tuple[MerchantAdapter, List[OfferObservation], Optional[str], float]:
    start = time.monotonic()
    try:
        offers = await asyncio.wait_for(
            adapter.search_offers(identity, market), timeout=adapter.timeout_seconds
        )
        return adapter, offers, None, time.monotonic() - start
    except asyncio.TimeoutError:
        return adapter, [], f"timeout after {adapter.timeout_seconds}s", time.monotonic() - start
    except Exception as exc:  # provider isolation: one bad adapter never kills the run
        return adapter, [], f"{exc.__class__.__name__}: {exc}", time.monotonic() - start


def _attempt_for(adapter: MerchantAdapter, offers: List[OfferObservation],
                 error: Optional[str], elapsed: float) -> CollectionAttempt:
    now = datetime.now(timezone.utc)
    fixture = adapter.evidence_tier == "fixture"
    extractions = [
        Extraction(
            field="offer",
            value={
                "merchant": o.merchant_id,
                "model": o.product.model,
                "mpn": o.product.mpn,
                "item_price": str(o.price.item.quantized()),
                "payable_total": str(o.price.payable_total.quantized()) if o.price.payable_total else None,
                "currency": o.price.item.currency,
                "condition": o.condition.value,
                "url": o.source_url,
            },
            method=adapter.discovery_method,
            confidence=o.extraction_confidence,
            extractor_version="compare-v0",
        )
        for o in offers
    ]
    payload = json.dumps([e.value for e in extractions], sort_keys=True).encode()
    artifacts = [Artifact(
        kind="json",
        sha256=hashlib.sha256(payload).hexdigest(),
        bytes=len(payload),
        content_type="application/json",
        fixture=fixture,
    )] if extractions else []
    return CollectionAttempt(
        provider=adapter.merchant_id,
        stage="search",
        url=f"https://{adapter.domains[0]}/" if adapter.domains else "",
        final_url=f"https://{adapter.domains[0]}/" if adapter.domains else "",
        started_at=now,
        ended_at=now,
        capabilities=ProviderCapabilities(provider=adapter.merchant_id, cost_unit="free"),
        artifacts=artifacts,
        extractions=extractions,
        limitations=list(adapter.known_limitations),
        cost_estimate_usd=adapter.cost_estimate_usd,
        error=error,
        fixture=fixture,
    )


def _build_manifest(request: ComparisonRequest, identity: ProductIdentity,
                    current: OfferObservation,
                    attempts: List[CollectionAttempt]) -> str:
    obligation = PriceObligation(
        agent_id="jacobi-compare",
        item_or_booking={
            "type": "product",
            "category": identity.category,
            "brand": identity.brand,
            "model": identity.model,
            "mpn": identity.mpn,
            "gtins": identity.gtins,
            "variant": identity.variant.model_dump(exclude_none=True),
        },
        merchant={"name": current.merchant_name},
        displayed_total_price=LegacyMoney(
            amount=float(current.price.item.quantized()),
            currency=current.price.item.currency,
        ),
        source_url_or_api_route=request.source_url,
    )
    limitations = sorted({l for a in attempts for l in a.limitations})
    limitations.append("Comparison used zero-cost local/fixture providers only.")
    manifest = build_manifest(obligation, attempts, limitations)
    get_repo().save_manifest(manifest, EVIDENCE_ORG)
    return manifest.manifest_id


class ComparisonService:
    def __init__(self, adapters: Optional[List[MerchantAdapter]] = None):
        self._adapters = adapters

    async def compare(self, request: ComparisonRequest) -> OptimizationResult:
        adapters = self._adapters if self._adapters is not None else get_adapters(request.market)
        identity = resolve_identity(request.current_offer)
        current = _current_offer(request, identity, adapters)

        provider_errors: List[ProviderError] = []
        attempts: List[CollectionAttempt] = []
        candidates = []
        fixture_mode = False

        # Identity below the probable threshold -> no discovery; be honest.
        if identity.identity_confidence >= 0.70:
            results = await asyncio.gather(
                *[_search_one(a, identity, request.market) for a in adapters]
            )
            for adapter, offers, error, elapsed in results:
                attempts.append(_attempt_for(adapter, offers, error, elapsed))
                if error:
                    provider_errors.append(ProviderError(merchant_id=adapter.merchant_id, error=error))
                    continue
                for offer in offers:
                    if offer.source_url == request.source_url:
                        continue  # the page the user is already on is not an alternative
                    offer = apply_total(offer)
                    fixture_mode = fixture_mode or offer.fixture
                    candidates.append((offer, classify(identity, current.condition, offer)))

        eligible, tradeoffs, similar, rejected = rank(current, candidates)
        rec, savings, best, confidence, codes = build_recommendation(
            current, eligible, tradeoffs, similar, identity.identity_confidence
        )
        if provider_errors:
            codes.append(ReasonCode.PROVIDER_PARTIAL_FAILURE)
            if rec.status == ComparisonStatus.insufficient_evidence and not candidates:
                rec = rec.model_copy(update={"status": ComparisonStatus.error_partial})
        codes.append(ReasonCode.DEEP_AUDIT_AVAILABLE)

        manifest_id = _build_manifest(request, identity, current, attempts)

        result = OptimizationResult(
            market=request.market,
            product=identity,
            current_offer=current,
            best_offer=best,
            eligible_offers=eligible,
            tradeoff_offers=tradeoffs,
            similar_offers=similar,
            rejected_offers=rejected,
            savings=savings,
            recommendation=rec,
            confidence=confidence,
            reason_codes=list(dict.fromkeys(codes)),  # dedupe, keep order
            provider_errors=provider_errors,
            evidence_manifest_id=manifest_id,
            fixture_mode=fixture_mode,
        )
        _remember(result)
        return result


service = ComparisonService()
