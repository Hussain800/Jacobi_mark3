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
import secrets
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

from .adapters import (
    BrowserSubmittedOfferAdapter,
    DirectHttpStructuredMetadataAdapter,
    MerchantAdapter,
    ProviderCost,
    get_adapters,
)
from .discovery import canonicalize_offer_url, deduplicate_offers
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
from .storage import ComparisonRepository, create_repository

_MAX_RESULTS = 500
_RESULTS: "OrderedDict[str, OptimizationResult]" = OrderedDict()
_ACCESS_HASHES: "OrderedDict[str, str]" = OrderedDict()
_MANIFEST_COMPARISONS: "OrderedDict[str, str]" = OrderedDict()


def get_result(comparison_id: str) -> Optional[OptimizationResult]:
    cached = _RESULTS.get(comparison_id)
    if cached is not None:
        return cached
    active_service = globals().get("service")
    if active_service is None:
        return None
    record = active_service.repository.get_comparison(comparison_id)
    if record is None:
        return None
    payload = dict(record.payload)
    payload.pop("_access_token_sha256", None)
    result = OptimizationResult.model_validate(payload)
    _remember(result)
    return result


def _remember(result: OptimizationResult) -> None:
    _RESULTS[result.comparison_id] = result
    while len(_RESULTS) > _MAX_RESULTS:
        _RESULTS.popitem(last=False)


def reset_results_for_tests() -> None:
    _RESULTS.clear()
    _ACCESS_HASHES.clear()
    _MANIFEST_COMPARISONS.clear()


def verify_comparison_access(comparison_id: str, token: Optional[str]) -> bool:
    expected = _ACCESS_HASHES.get(comparison_id)
    if expected is None:
        active_service = globals().get("service")
        record = (
            active_service.repository.get_comparison(comparison_id)
            if active_service is not None
            else None
        )
        if record is not None:
            expected = record.payload.get("_access_token_sha256")
    if expected is None or not token:
        return False
    actual = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return secrets.compare_digest(expected, actual)


def comparison_for_manifest(manifest_id: str) -> Optional[str]:
    return _MANIFEST_COMPARISONS.get(manifest_id)


def get_comparison_manifest(comparison_id: str, manifest_id: str):
    """Return an immutable manifest only through its owning comparison scope."""
    result = get_result(comparison_id)
    if result is None or result.evidence_manifest_id != manifest_id:
        return None
    return get_repo().get_manifest(manifest_id, f"comparison:{comparison_id}")


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
    adapter: MerchantAdapter,
    identity: ProductIdentity,
    market: str,
    semaphore: asyncio.Semaphore,
) -> Tuple[MerchantAdapter, List[OfferObservation], Optional[str], float]:
    start = time.monotonic()
    try:
        async with semaphore:
            offers = await asyncio.wait_for(
                adapter.search_offers(identity, market), timeout=adapter.timeout_seconds
            )
        return adapter, offers, None, time.monotonic() - start
    except asyncio.TimeoutError:
        return adapter, [], f"timeout after {adapter.timeout_seconds}s", time.monotonic() - start
    except Exception as exc:  # provider isolation: no raw provider data in public errors
        return adapter, [], f"provider failed ({exc.__class__.__name__})", time.monotonic() - start


def _attempt_for(adapter: MerchantAdapter, offers: List[OfferObservation],
                 error: Optional[str], elapsed: float) -> CollectionAttempt:
    now = datetime.now(timezone.utc)
    fixture = adapter.describe().fixture
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
                "seller": o.seller.model_dump(mode="json"),
                "stock": o.stock.value,
                "warranty": o.warranty,
                "observed_at": o.observed_at.isoformat(),
                "evidence_tier": adapter.evidence_tier,
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
        capabilities=ProviderCapabilities(
            provider=adapter.merchant_id,
            cost_unit="free" if adapter.describe().cost == ProviderCost.zero else "paid",
        ),
        artifacts=artifacts,
        extractions=extractions,
        limitations=list(adapter.known_limitations),
        cost_estimate_usd=adapter.cost_estimate_usd,
        error=error,
        fixture=fixture,
    )


def _current_page_attempt(
    request: ComparisonRequest,
    current: OfferObservation,
) -> CollectionAttempt:
    evidence = {
        "sources": request.page_evidence.get("sources", {}),
        "json_ld_found": bool(request.page_evidence.get("json_ld_found")),
        "extracted_at": request.page_evidence.get("extracted_at"),
        "source_url": request.source_url,
        "identifiers": {
            "brand": current.product.brand,
            "model": current.product.model,
            "mpn": current.product.mpn,
            "gtins": current.product.gtins,
            "sku": current.product.sku,
        },
        "raw_price": str(current.price.item.quantized()),
        "currency": current.price.item.currency,
        "seller": current.seller.model_dump(mode="json"),
        "availability": current.stock.value,
    }
    payload = json.dumps(evidence, sort_keys=True, default=str).encode("utf-8")
    now = datetime.now(timezone.utc)
    return CollectionAttempt(
        provider="current_browser_page",
        stage="current_offer",
        url=request.source_url,
        final_url=request.source_url,
        started_at=now,
        ended_at=now,
        capabilities=ProviderCapabilities(
            provider="current_browser_page",
            http_fetch=False,
            cost_unit="free",
        ),
        artifacts=[Artifact(
            kind="json",
            sha256=hashlib.sha256(payload).hexdigest(),
            bytes=len(payload),
            content_type="application/json",
        )],
        extractions=[Extraction(
            field="current_offer",
            value=evidence,
            method="browser_structured_fields",
            confidence=current.extraction_confidence,
            extractor_version="compare-v1",
        )],
        limitations=[
            "Structured fields supplied by the active browser page; raw DOM not retained",
        ],
        cost_estimate_usd=0.0,
        fixture=False,
    )


def _build_manifest(
    request: ComparisonRequest,
    identity: ProductIdentity,
    current: OfferObservation,
    attempts: List[CollectionAttempt],
    comparison_id: str,
) -> str:
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
    if all(a.cost_estimate_usd == 0 for a in attempts):
        limitations.append("Comparison used zero-cost browser, local, or fixture providers only.")
    manifest = build_manifest(obligation, attempts, limitations)
    get_repo().save_manifest(manifest, f"comparison:{comparison_id}")
    _MANIFEST_COMPARISONS[manifest.manifest_id] = comparison_id
    while len(_MANIFEST_COMPARISONS) > _MAX_RESULTS:
        _MANIFEST_COMPARISONS.popitem(last=False)
    return manifest.manifest_id


class ComparisonService:
    def __init__(
        self,
        adapters: Optional[List[MerchantAdapter]] = None,
        repository: Optional[ComparisonRepository] = None,
    ):
        self._adapters = adapters
        self.repository = repository or create_repository()

    def _request_adapters(self, request: ComparisonRequest) -> List[MerchantAdapter]:
        adapters = list(self._adapters or [])
        if self._adapters is None and request.include_fixture_offers:
            adapters.extend(get_adapters(request.market))
        if request.submitted_offers:
            observations = []
            for item in request.submitted_offers:
                payload = item.current_offer.model_dump(mode="json", exclude_none=True)
                payload.update({
                    "source_url": item.source_url,
                    "merchant_id": item.merchant_id,
                    "merchant_name": item.merchant_name,
                    "observed_at": item.page_evidence.get("extracted_at"),
                })
                observations.append(payload)
            adapters.append(BrowserSubmittedOfferAdapter(observations))
        if request.comparison_urls:
            adapters.append(DirectHttpStructuredMetadataAdapter(request.comparison_urls))
        return adapters

    def _persist(
        self,
        result: OptimizationResult,
        access_hash: str,
    ) -> None:
        product_id = result.product.canonical_id or result.comparison_id
        self.repository.save_product(product_id, result.product)
        offers = [result.current_offer] if result.current_offer else []
        for candidate in (
            result.eligible_offers
            + result.tradeoff_offers
            + result.similar_offers
            + result.rejected_offers
        ):
            offers.append(candidate.offer)
        seen = set()
        for offer in offers:
            if offer.observation_id in seen:
                continue
            seen.add(offer.observation_id)
            self.repository.save_offer(
                offer.observation_id,
                offer,
                product_id=product_id,
                evidence_manifest_id=result.evidence_manifest_id,
            )

        stored = result.model_dump(mode="json")
        stored["comparison_access_token"] = None
        stored["_access_token_sha256"] = access_hash
        self.repository.save_comparison(
            result.comparison_id,
            stored,
            product_id=product_id,
            evidence_manifest_id=result.evidence_manifest_id,
        )
        for index, candidate in enumerate(
            result.eligible_offers
            + result.tradeoff_offers
            + result.similar_offers
            + result.rejected_offers
        ):
            self.repository.save_candidate(
                f"{result.comparison_id}:{index}",
                result.comparison_id,
                candidate,
                offer_observation_id=candidate.offer.observation_id,
            )
        if result.evidence_manifest_id:
            self.repository.save_evidence_reference(
                result.evidence_manifest_id,
                {
                    "manifest_id": result.evidence_manifest_id,
                    "immutable": True,
                },
                comparison_id=result.comparison_id,
            )

    async def compare(self, request: ComparisonRequest) -> OptimizationResult:
        adapters = self._request_adapters(request)
        identity = resolve_identity(request.current_offer)
        current = _current_offer(request, identity, adapters)
        comparison_id = f"cmp_{secrets.token_hex(8)}"
        access_token = secrets.token_urlsafe(32)
        access_hash = hashlib.sha256(access_token.encode("utf-8")).hexdigest()

        provider_errors: List[ProviderError] = []
        attempts: List[CollectionAttempt] = [_current_page_attempt(request, current)]
        candidate_offers: List[OfferObservation] = []
        fixture_mode = False

        # Identity below the probable threshold -> no discovery; be honest.
        if identity.identity_confidence >= 0.70 and adapters:
            semaphore = asyncio.Semaphore(request.max_concurrency)
            tasks = {
                asyncio.create_task(_search_one(adapter, identity, request.market, semaphore)): adapter
                for adapter in adapters
            }
            done, pending = await asyncio.wait(
                tasks,
                timeout=request.overall_timeout_seconds,
            )
            for task in pending:
                adapter = tasks[task]
                task.cancel()
                error = f"overall deadline after {request.overall_timeout_seconds}s"
                attempts.append(_attempt_for(adapter, [], error, request.overall_timeout_seconds))
                provider_errors.append(ProviderError(
                    merchant_id=adapter.merchant_id,
                    error="provider deadline exceeded",
                    code="PROVIDER_TIMEOUT",
                    retryable=True,
                ))
            for task in done:
                adapter, offers, error, elapsed = task.result()
                attempts.append(_attempt_for(adapter, offers, error, elapsed))
                if error:
                    provider_errors.append(ProviderError(
                        merchant_id=adapter.merchant_id,
                        error=error,
                        code="PROVIDER_TIMEOUT" if error.startswith("timeout") else "PROVIDER_FAILED",
                        retryable=error.startswith("timeout"),
                    ))
                    continue
                candidate_offers.extend(offers)

        candidates = []
        current_url = canonicalize_offer_url(request.source_url)
        for offer in deduplicate_offers(candidate_offers):
            if canonicalize_offer_url(offer.source_url) == current_url:
                continue
            try:
                offer = apply_total(offer)
            except ValueError:
                provider_errors.append(ProviderError(
                    merchant_id=offer.merchant_id,
                    error="offer cost components use incompatible currencies",
                    code="OFFER_CURRENCY_INVALID",
                ))
                continue
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

        manifest_id = _build_manifest(request, identity, current, attempts, comparison_id)
        current.evidence_ref = manifest_id
        for candidate in eligible + tradeoffs + similar + rejected:
            candidate.offer.evidence_ref = manifest_id

        result = OptimizationResult(
            comparison_id=comparison_id,
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
            comparison_access_token=access_token,
            fixture_mode=fixture_mode,
        )
        self._persist(result, access_hash)
        stored_result = result.model_copy(update={"comparison_access_token": None})
        _remember(stored_result)
        _ACCESS_HASHES[comparison_id] = access_hash
        while len(_ACCESS_HASHES) > _MAX_RESULTS:
            _ACCESS_HASHES.popitem(last=False)
        return result


service = ComparisonService()
