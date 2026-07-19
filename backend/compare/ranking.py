"""Jacobi Compare — filter-first ranking and result assembly (PDR FR-9/FR-10).

Order of operations:
  1. reject identity mismatches (equivalence engine already classified)
  2. reject out-of-stock and stale offers
  3. separate condition mismatches (similar) and disclosed trade-offs
  4. rank exact-eligible offers according to the explicit preference mode
  5. deterministically tie-break using route quality and observation identity
A lower scraped number never outranks a verified one: offers whose payable
total is incomplete cannot win the headline.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from .schemas import (
    CandidateResult,
    ComparisonStatus,
    Confidence,
    EquivalenceClass,
    EquivalenceResult,
    Money,
    OfferObservation,
    PreferenceMode,
    ReasonCode,
    Recommendation,
    RevalidationStatus,
    RouteLegality,
    Savings,
    SellerType,
    StockStatus,
)
from .total_cost import unknown_reason_codes


def _is_stale(offer: OfferObservation, now: datetime) -> bool:
    observed_at = offer.observed_at
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    age = (now - observed_at).total_seconds()
    return age > offer.ttl_seconds


def _stock_is_stale(offer: OfferObservation, now: datetime) -> bool:
    if offer.stock == StockStatus.unknown:
        return False
    observed_at = offer.stock_observed_at or offer.observed_at
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    return (now - observed_at).total_seconds() > offer.ttl_seconds


def _fmt(m: Money) -> str:
    q = m.quantized()
    if q == q.to_integral_value():
        return f"{m.currency} {q:,.0f}"
    return f"{m.currency} {q:,.2f}"


_EXCLUSION_EXPLANATIONS = {
    ReasonCode.CURRENCY_UNSUPPORTED: "The offer uses a currency that was not safely converted.",
    ReasonCode.OUT_OF_STOCK: "The offer is explicitly out of stock.",
    ReasonCode.OFFER_STALE: "The observed price is older than Jacobi's freshness window.",
    ReasonCode.STOCK_UNCONFIRMED: "Availability was not observed within Jacobi's freshness window.",
    ReasonCode.ROUTE_NOT_LEGAL: "The purchase route is blocked by route-legality policy.",
    ReasonCode.USER_NOT_ELIGIBLE: "The current user is not eligible for this route.",
    ReasonCode.SELLER_LEGITIMACY_LOW: "The seller was explicitly marked as not legitimate.",
}


def _number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    return default


def _seller_score(offer: OfferObservation) -> float:
    type_score = {
        SellerType.official_store: 1.0,
        SellerType.first_party: 0.9,
        SellerType.marketplace: 0.5,
        SellerType.unknown: 0.25,
    }[offer.seller.type]
    score = type_score
    if offer.seller.trust_score is not None:
        trust = min(1.0, max(0.0, float(offer.seller.trust_score)))
        score = (type_score + trust) / 2
    if offer.seller.legitimate is True:
        score = min(1.0, score + 0.05)
    elif offer.seller.legitimate is False:
        score = 0.0
    return round(score, 4)


def _local_warranty_score(offer: OfferObservation) -> int:
    region = str(
        offer.warranty.get("region")
        or offer.product.variant.warranty_region
        or ""
    ).strip().lower()
    if region in {"ae", "uae", "united arab emirates", "local", "gcc"}:
        return 2
    if region:
        return 0
    return 1


def _delivery_score(offer: OfferObservation) -> float:
    days = _number(
        offer.delivery.get("max_days", offer.delivery.get("days")),
        default=30.0,
    )
    free_bonus = 0.1 if offer.delivery.get("free") is True else 0.0
    return round(min(1.0, max(0.0, 1.0 - min(days, 30.0) / 30.0) + free_bonus), 4)


def _returns_score(offer: OfferObservation) -> float:
    days = _number(
        offer.return_terms.get("window_days", offer.return_terms.get("days")),
        default=0.0,
    )
    return round(min(max(days, 0.0), 90.0) / 90.0, 4)


def _evidence_score(offer: OfferObservation) -> float:
    tier_score = {
        "official_api": 1.0,
        "browser_submitted": 0.9,
        "local_http": 0.75,
        "structured_metadata": 0.75,
        "fixture": 0.4,
    }.get((offer.evidence_tier or "").lower(), 0.5)
    if offer.fixture:
        tier_score = min(tier_score, 0.4)
    immutable_bonus = 0.05 if offer.evidence_ref else 0.0
    extraction = min(1.0, max(0.0, offer.extraction_confidence))
    return round(min(1.0, (tier_score + extraction) / 2 + immutable_bonus), 4)


def _ranking_factors(
    candidate: CandidateResult,
    now: datetime,
) -> Dict[str, Any]:
    offer = candidate.offer
    price = offer.price
    observed_at = offer.observed_at
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    age_seconds = max(0.0, (now - observed_at).total_seconds())
    availability_score = {
        StockStatus.in_stock: 3,
        StockStatus.preorder: 2,
        StockStatus.unknown: 1,
        StockStatus.out_of_stock: 0,
    }[offer.stock]
    condition_score = {
        "new": 4,
        "open_box": 3,
        "refurbished": 2,
        "used": 1,
        "unknown": 0,
    }[offer.condition.value]
    return {
        "total_complete": price.total_complete,
        "payable_total": (
            str(price.payable_total.quantized()) if price.payable_total else None
        ),
        "equivalence_confidence": round(candidate.equivalence.score, 4),
        "seller_legitimacy": _seller_score(offer),
        "condition": condition_score,
        "uae_local_warranty": _local_warranty_score(offer),
        "delivery": _delivery_score(offer),
        "returns": _returns_score(offer),
        "availability": availability_score,
        "freshness_seconds": round(age_seconds, 3),
        "user_eligibility": 0 if offer.user_eligible is False else (2 if offer.user_eligible else 1),
        "route_legality": {
            RouteLegality.blocked: 0,
            RouteLegality.unknown: 1,
            RouteLegality.allowed: 2,
        }[offer.route_legality],
        "evidence_quality": _evidence_score(offer),
    }


def _sort_key(candidate: CandidateResult, preference_mode: PreferenceMode) -> tuple:
    factors = candidate.ranking_factors
    price = candidate.offer.price
    total = (
        price.payable_total.quantized()
        if price.total_complete and price.payable_total
        else Decimal("Infinity")
    )
    quality = (
        -factors["equivalence_confidence"],
        -factors["seller_legitimacy"],
        -factors["condition"],
        -factors["uae_local_warranty"],
        -factors["delivery"],
        -factors["returns"],
        -factors["availability"],
        -factors["user_eligibility"],
        -factors["route_legality"],
        factors["freshness_seconds"],
        -factors["evidence_quality"],
    )
    complete = 0 if factors["total_complete"] else 1
    if preference_mode == PreferenceMode.official_seller:
        preference = (0 if candidate.offer.seller.type == SellerType.official_store else 1, total)
    elif preference_mode == PreferenceMode.uae_local_warranty:
        preference = (-factors["uae_local_warranty"], total)
    else:
        # Both balanced and lowest-complete-price preserve price as the primary
        # decision. Balanced applies the full quality tuple for deterministic ties.
        preference = (total,)
    return (complete, *preference, *quality, candidate.offer.observation_id)


def rank(
    current: OfferObservation,
    candidates: List[Tuple[OfferObservation, EquivalenceResult]],
    now: Optional[datetime] = None,
    preference_mode: PreferenceMode = PreferenceMode.balanced,
) -> Tuple[
    List[CandidateResult],  # eligible (exact, complete or not), ranked
    List[CandidateResult],  # tradeoffs
    List[CandidateResult],  # similar
    List[CandidateResult],  # rejected
]:
    now = now or datetime.now(timezone.utc)
    preference_mode = PreferenceMode(preference_mode)
    eligible: List[CandidateResult] = []
    tradeoffs: List[CandidateResult] = []
    similar: List[CandidateResult] = []
    rejected: List[CandidateResult] = []

    cur_currency = current.price.item.currency

    for offer, eq in candidates:
        exclusion: List[ReasonCode] = []
        if offer.price.item.currency != cur_currency:
            exclusion.append(ReasonCode.CURRENCY_UNSUPPORTED)
        if offer.stock == StockStatus.out_of_stock:
            exclusion.append(ReasonCode.OUT_OF_STOCK)
        if _is_stale(offer, now):
            exclusion.append(ReasonCode.OFFER_STALE)
            offer.revalidation_status = RevalidationStatus.needs_revalidation
        if _stock_is_stale(offer, now):
            exclusion.append(ReasonCode.STOCK_UNCONFIRMED)
            offer.revalidation_status = RevalidationStatus.needs_revalidation

        if offer.route_legality == RouteLegality.blocked:
            exclusion.append(ReasonCode.ROUTE_NOT_LEGAL)
        if offer.user_eligible is False:
            exclusion.append(ReasonCode.USER_NOT_ELIGIBLE)
        if offer.seller.legitimate is False:
            exclusion.append(ReasonCode.SELLER_LEGITIMACY_LOW)

        if eq.classification == EquivalenceClass.mismatch:
            exclusion.extend(eq.reason_codes or [ReasonCode.VARIANT_MISMATCH])

        # Preserve order while removing duplicate codes from overlapping checks.
        exclusion = list(dict.fromkeys(exclusion))
        explanations = [
            _EXCLUSION_EXPLANATIONS.get(code, eq.explanation or code.value)
            for code in exclusion
        ]
        cand = CandidateResult(
            offer=offer,
            equivalence=eq,
            exclusion_reasons=exclusion,
            exclusion_explanations=explanations,
        )
        cand.ranking_factors = _ranking_factors(cand, now)

        if eq.classification == EquivalenceClass.mismatch or exclusion:
            cand.selection_explanation = "; ".join(explanations)
            rejected.append(cand)
        elif eq.classification == EquivalenceClass.similar:
            cand.exclusion_reasons = list(dict.fromkeys(eq.reason_codes))
            cand.exclusion_explanations = [eq.explanation]
            cand.selection_explanation = eq.explanation
            similar.append(cand)
        elif eq.classification == EquivalenceClass.exact_tradeoff:
            cand.exclusion_reasons = list(dict.fromkeys(eq.reason_codes))
            cand.exclusion_explanations = [eq.explanation]
            cand.selection_explanation = eq.explanation
            tradeoffs.append(cand)
        else:
            cand.eligible = True
            cand.selection_explanation = (
                "Eligible exact equivalent with complete all-in total."
                if offer.price.total_complete
                else "Eligible exact equivalent, but its all-in total is incomplete."
            )
            eligible.append(cand)

    key = lambda candidate: _sort_key(candidate, preference_mode)
    eligible.sort(key=key)
    tradeoffs.sort(key=key)
    similar.sort(key=key)
    rejected.sort(key=key)
    for i, c in enumerate(eligible):
        c.rank = i + 1
    return eligible, tradeoffs, similar, rejected


def build_recommendation(
    current: OfferObservation,
    eligible: List[CandidateResult],
    tradeoffs: List[CandidateResult],
    similar: List[CandidateResult],
    identity_confidence: float,
) -> Tuple[Recommendation, Savings, Optional[OfferObservation], Confidence, List[ReasonCode]]:
    codes: List[ReasonCode] = []
    cur_total = current.price.payable_total
    currency = current.price.item.currency

    if identity_confidence >= 0.95:
        codes.append(ReasonCode.PRODUCT_IDENTITY_EXACT)
    elif identity_confidence >= 0.70:
        codes.append(ReasonCode.PRODUCT_IDENTITY_PROBABLE)
    else:
        codes.append(ReasonCode.PRODUCT_IDENTITY_UNRESOLVED)
        rec = Recommendation(
            status=ComparisonStatus.insufficient_evidence,
            headline="Could not verify this exact product",
            explanation=(
                "Jacobi could not extract a reliable model number or identifier from "
                "this page, so no exact comparison is possible."
            ),
        )
        return rec, Savings(), None, Confidence.low, codes

    if not current.price.total_complete:
        codes.extend(unknown_reason_codes(current.price))

    # Best offer = cheapest exact-eligible with a COMPLETE payable total.
    complete_eligible = [c for c in eligible if c.offer.price.total_complete]
    for c in eligible + tradeoffs + similar:
        if not c.offer.price.total_complete:
            codes.extend(unknown_reason_codes(c.offer.price))

    best = complete_eligible[0] if complete_eligible else None

    if best and best.offer.seller.type == SellerType.official_store:
        codes.append(ReasonCode.OFFICIAL_ROUTE_FOUND)

    if best and cur_total and current.price.total_complete:
        best_total = best.offer.price.payable_total
        diff = cur_total.quantized() - best_total.quantized()
        if diff > 0:
            codes.append(ReasonCode.LOWER_TOTAL_FOUND)
            saving = Savings(
                amount=Money(amount=diff, currency=currency),
                percent=round(float(diff / cur_total.quantized() * 100), 1),
            )
            confidence = (
                Confidence.high
                if identity_confidence >= 0.95 and best.equivalence.score >= 0.85
                else Confidence.medium
            )
            rec = Recommendation(
                status=ComparisonStatus.save,
                headline=f"Save {_fmt(saving.amount)}",
                explanation=(
                    f"Exact same product at {best.offer.merchant_name} for "
                    f"{_fmt(best_total)} all-in, vs {_fmt(cur_total)} here."
                ),
                action_url=best.offer.source_url,
            )
            return rec, saving, best.offer, confidence, codes

        # No cheaper exact route.
        codes.append(ReasonCode.CURRENT_OFFER_ALREADY_BEST)
        nearest = ""
        if diff < 0:
            nearest = (
                f" Closest verified alternative: {best.offer.merchant_name} at "
                f"{_fmt(best_total)} ({_fmt(Money(amount=-diff, currency=currency))} more)."
            )
        rec = Recommendation(
            status=ComparisonStatus.already_best,
            headline="This is the best verified price we found",
            explanation=f"No exact equivalent beats {_fmt(cur_total)} all-in.{nearest}",
        )
        confidence = Confidence.high if identity_confidence >= 0.95 else Confidence.medium
        return rec, Savings(), best.offer if diff < 0 else None, confidence, codes

    # No exact-eligible complete offer. Is there a disclosed-tradeoff route worth showing?
    cheaper_tradeoff = None
    if cur_total and current.price.total_complete:
        for c in tradeoffs + similar:
            p = c.offer.price
            if p.total_complete and p.payable_total.quantized() < cur_total.quantized():
                cheaper_tradeoff = c
                break
    if cheaper_tradeoff:
        codes.extend(cheaper_tradeoff.equivalence.reason_codes)
        codes.append(ReasonCode.LOWER_TOTAL_FOUND)
        p = cheaper_tradeoff.offer.price.payable_total
        diff = cur_total.quantized() - p.quantized()
        saving = Savings(
            amount=Money(amount=diff, currency=currency),
            percent=round(float(diff / cur_total.quantized() * 100), 1),
        )
        rec = Recommendation(
            status=ComparisonStatus.tradeoff,
            headline=f"{_fmt(Money(amount=diff, currency=currency))} cheaper — with a trade-off",
            explanation=cheaper_tradeoff.equivalence.explanation,
            action_url=cheaper_tradeoff.offer.source_url,
        )
        return rec, saving, cheaper_tradeoff.offer, Confidence.medium, codes

    codes.append(ReasonCode.EXACT_MATCH_INSUFFICIENT)
    rec = Recommendation(
        status=ComparisonStatus.insufficient_evidence,
        headline="No verified exact match found",
        explanation=(
            "Jacobi found no offer it could verify as the exact same product with a "
            "complete all-in price. No headline saving is claimed on unverified matches."
        ),
    )
    return rec, Savings(), None, Confidence.low, codes
