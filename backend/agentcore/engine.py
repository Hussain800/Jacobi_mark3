"""
Jacobi for Agents — verification orchestrator.

One pipeline (PRD 5.1): obligation → policy gate → bounded collection →
extraction analysis → reason codes → decomposed provenance score → decision
envelope + deterministic evidence manifest. No LLM anywhere; every output is
reproducible from the same inputs.

Safety: when policy blocks a purchase_authorized request, NO collection runs —
Jacobi refuses to gather evidence in service of a blocked purchase and returns
a claim-only manifest.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

from . import policy as policy_mod
from . import scoring
from .evidence import build_manifest
from .extract import money_from_extraction
from .providers import budget, collect_stages
from .schemas import (
    BudgetInfo,
    BudgetStatus,
    CollectionAttempt,
    ConsentScope,
    Decision,
    DecisionEnvelope,
    EvidenceRef,
    EvidenceTier,
    Money,
    PolicyDecision,
    PriceObligation,
    PriceSummary,
    ReasonCode,
    RouteCandidate,
    RouteLegality,
    RouteSummary,
    RouteType,
    ScoreComponents,
)

ENGINE_VERSION = "1.0.0"

# Demo presets — deterministic, fixture-backed, honestly labeled.
DEMOS: Dict[str, Dict[str, Any]] = {
    "fee_drift": {
        "url": "fixture://lodging/listing",
        "consent_scope": "recommend",
        "displayed_total": {"amount": 2180, "currency": "AED"},
        "merchant": {"name": "Marina Bay View Hotel (demo fixture)"},
        "item_or_booking": {
            "type": "hotel", "nights": 3,
            "check_in": "2026-07-15", "check_out": "2026-07-18", "guests": 2,
        },
    },
    "blocked_route": {
        # Policy check only — collection is skipped on the block path, so no
        # automated access to the restricted platform ever happens.
        "url": "https://www.booking.com/hotel/ae/demo-example.html",
        "consent_scope": "purchase_authorized",
        "displayed_total": {"amount": 1990, "currency": "AED"},
        "merchant": {"name": "StayFinder aggregator (demo)"},
        "item_or_booking": {"type": "hotel", "nights": 3},
    },
}

# Bounded in-memory stores (same posture as the probe SESSION_STORE bounds).
_MAX_STORE = 500
ENVELOPES: "OrderedDict[str, DecisionEnvelope]" = OrderedDict()
MANIFESTS: "OrderedDict[str, Any]" = OrderedDict()


def _store(d: OrderedDict, key: str, value: Any) -> None:
    d[key] = value
    while len(d) > _MAX_STORE:
        d.popitem(last=False)


def _fmt_money(m: Money) -> str:
    return f"{m.currency} {m.amount:,.0f}"


def _policy_target(url: str) -> str:
    """Fixtures evaluate against the demo policy domain."""
    return "demo.jacobi.local" if url.startswith("fixture://") else url


def _first_money(attempts: List[CollectionAttempt], stage: str, field: str) -> Optional[Money]:
    for a in attempts:
        if a.stage != stage:
            continue
        for e in a.extractions:
            if e.field == field:
                m = money_from_extraction(e)
                if m is not None:
                    return m
    return None


def _fees(attempts: List[CollectionAttempt], stage: str) -> List[Money]:
    out: List[Money] = []
    for a in attempts:
        if a.stage != stage:
            continue
        for e in a.extractions:
            if e.field == "mandatory_fee":
                m = money_from_extraction(e)
                if m is not None:
                    out.append(m)
    return out


def _has_field(attempts: List[CollectionAttempt], field: str) -> bool:
    return any(e.field == field for a in attempts for e in a.extractions)


def _analyze(
    obligation: PriceObligation,
    attempts: List[CollectionAttempt],
    pol: PolicyDecision,
) -> Tuple[List[ReasonCode], ScoreComponents, PriceSummary, List[str]]:
    codes: List[ReasonCode] = []
    notes: List[str] = []

    has_checkout = any(a.stage == "checkout_prep" for a in attempts)
    listing_total = _first_money(attempts, "listing", "displayed_total")
    checkout_total = _first_money(attempts, "checkout_prep", "displayed_total")
    observed_total = checkout_total or listing_total
    claim = obligation.displayed_total_price
    fees_checkout = _fees(attempts, "checkout_prep")
    fees_listing = _fees(attempts, "listing")
    fixture_mode = any(a.fixture for a in attempts)
    errors = [a for a in attempts if a.error]
    budget_blocked = any(a.error == "budget_blocked" for a in attempts)
    other_errors = [a for a in errors if a.error != "budget_blocked"]
    all_ext = [e for a in attempts for e in a.extractions]
    max_conf = max((e.confidence for e in all_ext), default=0.0)
    artifacts = [art for a in attempts for art in a.artifacts]

    if budget_blocked:
        codes.append(ReasonCode.BUDGET_BLOCKED)
    if other_errors:
        codes.append(ReasonCode.PROVIDER_LIMITATION)

    # Agent claim vs currently observed listing price (same stage).
    if claim and listing_total:
        if claim.currency != listing_total.currency:
            codes.append(ReasonCode.CURRENCY_SPREAD_UNCLEAR)
            notes.append(
                f"Agent claim in {claim.currency} but page shows {listing_total.currency}."
            )
        elif abs(claim.amount - listing_total.amount) / max(claim.amount, 1e-9) > 0.01:
            codes.append(ReasonCode.PRICE_STALE)

    # Listing vs checkout-prep drift.
    drift_pct: Optional[float] = None
    if listing_total and checkout_total and listing_total.currency == checkout_total.currency:
        drift_pct = (checkout_total.amount - listing_total.amount) / max(listing_total.amount, 1e-9) * 100.0
        if abs(drift_pct) > 5.0:
            codes.append(ReasonCode.PRICE_DRIFT_MAJOR)
        elif abs(drift_pct) > 1.0:
            codes.append(ReasonCode.PRICE_DRIFT_MINOR)
        else:
            codes.append(ReasonCode.PRICE_STABLE)

    # Mandatory fees appearing only at checkout-prep → late disclosure.
    fees_late = bool(fees_checkout) and not fees_listing
    if fees_late:
        codes.append(ReasonCode.MANDATORY_FEE_LATE)
        codes.append(ReasonCode.FEE_DISCLOSURE_DRIFT)

    # Inventory: only judged for the two-stage lodging flow.
    if has_checkout and not _has_field(attempts, "availability"):
        codes.append(ReasonCode.INVENTORY_STALE)

    if all_ext and max_conf < 0.6:
        codes.append(ReasonCode.LOW_EXTRACTOR_CONFIDENCE)
    if not all_ext or not artifacts:
        codes.append(ReasonCode.MANIFEST_INCOMPLETE)

    if attempts:  # v0 collection is local/fixture-only — say so honestly
        codes.append(ReasonCode.EVIDENCE_LIMITED_LOCAL_ONLY)
    if obligation.official_route:
        codes.append(ReasonCode.OFFICIAL_ROUTE_FOUND)
    if pol.decision == "warn" and pol.reason_code and pol.reason_code not in codes:
        codes.append(pol.reason_code)

    # ── Decomposed components (0-100 each; weights in scoring.WEIGHTS) ──
    if obligation.official_route:
        source_legitimacy = 95.0
    elif fixture_mode:
        source_legitimacy = 75.0
    elif pol.domain in policy_mod.RESTRICTED_DOMAINS:
        source_legitimacy = 50.0
    else:
        source_legitimacy = 60.0

    if fees_late:
        total_price_integrity = 35.0
    elif fees_listing or (fees_checkout and fees_listing):
        total_price_integrity = 85.0
    elif has_checkout and not fees_checkout:
        total_price_integrity = 75.0
    else:
        total_price_integrity = 60.0

    if ReasonCode.PRICE_DRIFT_MAJOR in codes:
        price_stability = 40.0
    elif ReasonCode.PRICE_DRIFT_MINOR in codes:
        price_stability = 65.0
    elif ReasonCode.PRICE_STABLE in codes:
        price_stability = 90.0
    else:
        price_stability = 60.0

    if _has_field(attempts, "availability"):
        inventory_freshness = 80.0
    elif ReasonCode.INVENTORY_STALE in codes:
        inventory_freshness = 40.0
    else:
        inventory_freshness = 50.0

    policy_safety = {"allow": 90.0, "warn": 55.0, "block": 0.0}[pol.decision]

    if not artifacts:
        evidence_quality = 15.0
    elif fixture_mode:
        evidence_quality = 50.0
    else:
        evidence_quality = 55.0
    if has_checkout and artifacts:
        evidence_quality += 5.0

    user_control = {
        ConsentScope.research_only: 95.0,
        ConsentScope.recommend: 90.0,
        ConsentScope.checkout_prepare: 70.0,
        ConsentScope.purchase_authorized: 40.0,
    }[obligation.user_consent_scope]

    components = ScoreComponents(
        source_legitimacy=source_legitimacy,
        total_price_integrity=total_price_integrity,
        price_stability=price_stability,
        inventory_freshness=inventory_freshness,
        policy_safety=policy_safety,
        evidence_quality=evidence_quality,
        user_control=user_control,
    )

    # ── Price summary + trace ──
    trace: List[Dict[str, Any]] = []
    if claim:
        trace.append({"stage": "agent_claim", "label": "Agent-provided price",
                      "amount": claim.amount, "currency": claim.currency})
    if listing_total:
        trace.append({"stage": "listing", "label": "Listing displayed total",
                      "amount": listing_total.amount, "currency": listing_total.currency})
    for fee in fees_checkout:
        trace.append({"stage": "checkout_prep", "label": fee.label or "Mandatory fee",
                      "amount": fee.amount, "currency": fee.currency})
    if checkout_total:
        trace.append({"stage": "checkout_prep", "label": "Checkout-prep total",
                      "amount": checkout_total.amount, "currency": checkout_total.currency})

    baseline = claim or listing_total
    delta_abs = None
    delta_pct = None
    if baseline and observed_total and baseline.currency == observed_total.currency:
        delta_abs = Money(amount=round(observed_total.amount - baseline.amount, 2),
                          currency=observed_total.currency)
        delta_pct = round((observed_total.amount - baseline.amount) / max(baseline.amount, 1e-9) * 100.0, 1)

    summary = PriceSummary(
        observed_total=observed_total,
        displayed_total=baseline,
        delta_abs=delta_abs,
        delta_pct=delta_pct,
        mandatory_fees_detected=fees_checkout or fees_listing,
        currency_notes=notes,
        price_trace=trace,
    )

    limitations = sorted({l for a in attempts for l in a.limitations})
    return codes, components, summary, limitations


def _explanation(
    decision: Decision,
    codes: List[ReasonCode],
    summary: PriceSummary,
    pol: PolicyDecision,
    fixture_mode: bool,
) -> Tuple[str, str]:
    """Deterministic user-facing explanation + short next action."""
    parts: List[str] = []
    if decision == Decision.block:
        parts.append(
            f"{pol.domain} restricts automated booking or purchasing under its terms. "
            "Jacobi blocked the automated purchase attempt before any action was taken."
        )
        next_action = "Hand the official page to the user to complete the booking manually."
    else:
        if summary.displayed_total and summary.observed_total and summary.delta_abs and summary.delta_abs.amount > 0:
            fee_count = len(summary.mandatory_fees_detected)
            fee_part = (
                f" after {fee_count} mandatory fee{'s' if fee_count != 1 else ''}"
                if fee_count else ""
            )
            parts.append(
                f"The listing shows {_fmt_money(summary.displayed_total)}, but checkout-preparation "
                f"evidence totals {_fmt_money(summary.observed_total)}{fee_part} "
                f"({_fmt_money(summary.delta_abs)} more, +{summary.delta_pct}%)."
            )
        elif summary.observed_total:
            parts.append(f"Observed total: {_fmt_money(summary.observed_total)}.")
        else:
            parts.append("Jacobi could not extract a reliable total price from the target page.")
        if ReasonCode.PRICE_STALE in codes:
            parts.append("The agent-provided price no longer matches the live listing.")
        if pol.decision == "warn":
            parts.append(pol.reason)
        next_action = {
            Decision.proceed: "Proceed with the verified total.",
            Decision.proceed_with_caution: "Proceed, but show the caveats to the user first.",
            Decision.ask_user: "Confirm the updated total with the user before recommending.",
            Decision.handoff_to_user: "Let the user review and complete this step manually.",
            Decision.use_official_route: "Route the user through the official checkout.",
            Decision.block: "Stop; inform the user.",
        }[decision]
    if fixture_mode:
        parts.append("This run used deterministic demo fixtures, not a live merchant page.")
    if ReasonCode.EVIDENCE_LIMITED_LOCAL_ONLY in codes:
        parts.append("Evidence was collected locally and does not prove real IP geography.")
    return " ".join(parts), next_action


def _routes(url: str, pol: PolicyDecision, official_route: bool) -> RouteSummary:
    candidates: List[RouteCandidate] = []
    if official_route:
        candidates.append(RouteCandidate(
            route_type=RouteType.official_api, url=url,
            legality=RouteLegality.official, confidence=0.9,
            notes="Caller flagged an official/authorized route.",
        ))
    candidates.append(RouteCandidate(
        route_type=RouteType.user_handoff, url=url if not url.startswith("fixture://") else "",
        legality=RouteLegality.user_handoff, confidence=0.95,
        notes="User completes checkout manually — always lawful.",
    ))
    if pol.decision == "block":
        legality = RouteLegality.blocked
        preferred = "user_handoff"
    elif official_route:
        legality = RouteLegality.official
        preferred = "official_api"
    else:
        legality = RouteLegality.evidence_only
        preferred = "user_handoff"
    return RouteSummary(
        source_route=url, preferred_route=preferred,
        route_legality=legality, candidates=candidates,
    )


def run_verify(
    demo: Optional[str] = None,
    url: Optional[str] = None,
    consent_scope: str = "recommend",
    displayed_total: Optional[Dict[str, Any]] = None,
    official_route: bool = False,
    agent_id: str = "unknown-agent",
    item_or_booking: Optional[Dict[str, Any]] = None,
    merchant: Optional[Dict[str, Any]] = None,
) -> DecisionEnvelope:
    """Primary entry: build obligation, gate, collect, score, decide."""
    if demo:
        preset = DEMOS.get(demo)
        if preset is None:
            raise ValueError(f"unknown demo '{demo}'; available: {sorted(DEMOS)}")
        url = preset["url"]
        consent_scope = consent_scope or preset["consent_scope"]
        if demo == "blocked_route":
            consent_scope = preset["consent_scope"]  # the point of the demo
        displayed_total = displayed_total or preset["displayed_total"]
        item_or_booking = item_or_booking or preset["item_or_booking"]
        merchant = merchant or preset["merchant"]
    if not url:
        raise ValueError("either 'demo' or 'url' is required")

    scope = ConsentScope(consent_scope)
    claim = Money(**displayed_total) if displayed_total else None
    obligation = PriceObligation(
        agent_id=agent_id,
        user_consent_scope=scope,
        item_or_booking=item_or_booking or {},
        merchant=merchant or {},
        displayed_total_price=claim,
        source_url_or_api_route=url,
        official_route=official_route,
    )

    pol = policy_mod.evaluate(_policy_target(url), scope, official_route)

    # Safety: never collect in service of a blocked purchase.
    blocked_purchase = pol.decision == "block"
    if blocked_purchase:
        attempts: List[CollectionAttempt] = []
        limitations = [
            "No collection performed: requested action blocked by platform policy.",
            "Evidence tier is claim-only (agent-provided context, not observed).",
        ]
        codes, components, summary, _ = _analyze(obligation, attempts, pol)
        if pol.reason_code and pol.reason_code not in codes:
            codes.insert(0, pol.reason_code)
    else:
        attempts = collect_stages(url)
        codes, components, summary, limitations = _analyze(obligation, attempts, pol)

    score = scoring.compute_score(components)
    decision = scoring.decide(score, codes, pol, scope)
    confidence = scoring.confidence_for(components, codes)
    instruction = scoring.agent_instruction_for(decision, codes)

    fixture_mode = any(a.fixture for a in attempts)
    manifest = build_manifest(obligation, attempts, limitations)
    explanation, next_action = _explanation(decision, codes, summary, pol, fixture_mode)

    if not attempts:
        tier = EvidenceTier.claim_only
    elif obligation.official_route:
        tier = EvidenceTier.official_api
    else:
        tier = EvidenceTier.local

    budget_status = (
        BudgetStatus.blocked
        if ReasonCode.BUDGET_BLOCKED in codes
        else budget.check(0.0)
    )
    envelope = DecisionEnvelope(
        obligation_id=obligation.obligation_id,
        decision=decision,
        provenance_score=score,
        confidence=confidence,
        score_components=components,
        reason_codes=codes,
        user_explanation=explanation,
        agent_instruction=instruction,
        next_action=next_action,
        price_summary=summary,
        route_summary=_routes(url, pol, official_route),
        policy=pol,
        evidence=EvidenceRef(
            manifest_id=manifest.manifest_id,
            manifest_sha256=manifest.manifest_sha256 or "",
            capability_tier=tier,
            limitations=limitations,
        ),
        budget=BudgetInfo(
            estimated_cost_usd=sum(a.cost_estimate_usd for a in attempts),
            budget_status=budget_status,
        ),
        fixture_mode=fixture_mode,
    )

    _store(ENVELOPES, envelope.request_id, envelope)
    _store(MANIFESTS, manifest.manifest_id, manifest)
    return envelope


def get_envelope(request_id: str) -> Optional[DecisionEnvelope]:
    return ENVELOPES.get(request_id)


def get_manifest(manifest_id: str):
    return MANIFESTS.get(manifest_id)


def explain(request_id: str) -> Optional[Dict[str, str]]:
    env = ENVELOPES.get(request_id)
    if env is None:
        return None
    return {
        "request_id": env.request_id,
        "decision": env.decision.value,
        "explanation": env.user_explanation,
        "next_action": env.next_action,
        "agent_instruction": env.agent_instruction,
    }


def health() -> Dict[str, Any]:
    from .providers import FIXTURE_URLS
    return {
        "status": "ok",
        "engine_version": ENGINE_VERSION,
        "providers": ["fixture", "local_http"],
        "fixtures_available": {k: v.exists() for k, v in FIXTURE_URLS.items()},
        "demos": sorted(DEMOS),
        "budget": {"limit_usd": budget.limit_usd, "spent_usd": round(budget.spent, 4)},
        "purchase_execution": "never — evidence and decisioning only",
    }
