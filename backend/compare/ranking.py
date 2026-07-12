"""Jacobi Compare — filter-first ranking and result assembly (PDR FR-9/FR-10).

Order of operations:
  1. reject identity mismatches (equivalence engine already classified)
  2. reject out-of-stock and stale offers
  3. separate condition mismatches (similar) and disclosed trade-offs
  4. rank exact-eligible offers by complete payable total
  5. tie-break by equivalence score, then extraction confidence
A lower scraped number never outranks a verified one: offers whose payable
total is incomplete cannot win the headline.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional, Tuple

from .schemas import (
    CandidateResult,
    ComparisonStatus,
    Confidence,
    EquivalenceClass,
    EquivalenceResult,
    Money,
    OFFER_TTL_SECONDS,
    OfferObservation,
    ReasonCode,
    Recommendation,
    Savings,
    SellerType,
    StockStatus,
)
from .total_cost import unknown_reason_codes


def _is_stale(offer: OfferObservation, now: datetime) -> bool:
    age = (now - offer.observed_at).total_seconds()
    return age > OFFER_TTL_SECONDS


def _fmt(m: Money) -> str:
    q = m.quantized()
    if q == q.to_integral_value():
        return f"{m.currency} {q:,.0f}"
    return f"{m.currency} {q:,.2f}"


def rank(
    current: OfferObservation,
    candidates: List[Tuple[OfferObservation, EquivalenceResult]],
    now: Optional[datetime] = None,
) -> Tuple[
    List[CandidateResult],  # eligible (exact, complete or not), ranked
    List[CandidateResult],  # tradeoffs
    List[CandidateResult],  # similar
    List[CandidateResult],  # rejected
]:
    now = now or datetime.now(timezone.utc)
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

        cand = CandidateResult(offer=offer, equivalence=eq, exclusion_reasons=exclusion)

        if eq.classification == EquivalenceClass.mismatch or exclusion:
            rejected.append(cand)
        elif eq.classification == EquivalenceClass.similar:
            similar.append(cand)
        elif eq.classification == EquivalenceClass.exact_tradeoff:
            tradeoffs.append(cand)
        else:
            cand.eligible = True
            eligible.append(cand)

    def _key(c: CandidateResult):
        p = c.offer.price
        return (
            0 if p.total_complete else 1,               # verified totals first
            p.payable_total.quantized() if p.payable_total else Decimal("Infinity"),
            -c.equivalence.score,
            -c.offer.extraction_confidence,
        )

    eligible.sort(key=_key)
    tradeoffs.sort(key=_key)
    similar.sort(key=_key)
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
        p = cheaper_tradeoff.offer.price.payable_total
        diff = cur_total.quantized() - p.quantized()
        rec = Recommendation(
            status=ComparisonStatus.tradeoff,
            headline=f"{_fmt(Money(amount=diff, currency=currency))} cheaper — with a trade-off",
            explanation=cheaper_tradeoff.equivalence.explanation,
            action_url=cheaper_tradeoff.offer.source_url,
        )
        return rec, Savings(), cheaper_tradeoff.offer, Confidence.medium, codes

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
