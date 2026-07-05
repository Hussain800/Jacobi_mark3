"""
Jacobi for Agents — Price Provenance Score + decision logic.

Deterministic: weighted 0-100 provenance score, a confidence bucket, and a
PRD-ordered decision that turns the score + reason codes + policy into one of
the Decision enum values plus an imperative instruction for the calling agent.
No LLM — everything is a fixed table.

Dependency-light: pydantic (via schemas) + stdlib only.
"""

from __future__ import annotations

from .schemas import (
    Confidence,
    ConsentScope,
    Decision,
    PolicyDecision,
    ReasonCode,
    ScoreComponents,
)

WEIGHTS = {
    "source_legitimacy": 0.20,
    "total_price_integrity": 0.20,
    "price_stability": 0.15,
    "inventory_freshness": 0.10,
    "policy_safety": 0.15,
    "evidence_quality": 0.15,
    "user_control": 0.05,
}

# Reason codes that mean "something is off" — presence blocks a "high"
# confidence rating.
_WARN_CODES = {
    ReasonCode.PRICE_STALE,
    ReasonCode.PRICE_DRIFT_MINOR,
    ReasonCode.PRICE_DRIFT_MAJOR,
    ReasonCode.MANDATORY_FEE_LATE,
    ReasonCode.FEE_DISCLOSURE_DRIFT,
    ReasonCode.CURRENCY_SPREAD_UNCLEAR,
    ReasonCode.INVENTORY_STALE,
    ReasonCode.PLATFORM_AUTOMATION_RESTRICTED,
    ReasonCode.POLICY_FORBIDS_AUTOMATION,
    ReasonCode.EVIDENCE_LIMITED_LOCAL_ONLY,
    ReasonCode.PROVIDER_LIMITATION,
    ReasonCode.LOW_EXTRACTOR_CONFIDENCE,
    ReasonCode.MANIFEST_INCOMPLETE,
    ReasonCode.BUDGET_BLOCKED,
}


def compute_score(components: ScoreComponents) -> float:
    """Weighted 0-100 provenance score, rounded to 1 decimal place."""
    total = sum(getattr(components, field) * weight for field, weight in WEIGHTS.items())
    return round(total, 1)


def confidence_for(
    components: ScoreComponents,
    reason_codes: list[ReasonCode],
) -> Confidence:
    codes = set(reason_codes)
    if (
        components.evidence_quality < 40
        or ReasonCode.LOW_EXTRACTOR_CONFIDENCE in codes
        or ReasonCode.MANIFEST_INCOMPLETE in codes
    ):
        return Confidence.low
    # Strong inputs + no warning codes → high.
    strong = (
        components.source_legitimacy >= 70
        and components.total_price_integrity >= 70
        and components.evidence_quality >= 70
    )
    if strong and not (codes & _WARN_CODES):
        return Confidence.high
    return Confidence.medium


def decide(
    score: float,
    reason_codes: list[ReasonCode],
    policy: PolicyDecision | None,
    scope: ConsentScope,
) -> Decision:
    """PRD decision rules, applied in priority order."""
    codes = set(reason_codes)

    # 1. Policy hard block.
    if policy is not None and policy.decision == "block":
        return Decision.block
    # 2. Budget block → ask the user.
    if ReasonCode.BUDGET_BLOCKED in codes:
        return Decision.ask_user
    # 3. Platform restriction on a purchase attempt → block.
    if (
        ReasonCode.PLATFORM_AUTOMATION_RESTRICTED in codes
        and scope == ConsentScope.purchase_authorized
    ):
        return Decision.block
    # 4. Material price/fee surprises → ask the user.
    if codes & {
        ReasonCode.MANDATORY_FEE_LATE,
        ReasonCode.PRICE_DRIFT_MAJOR,
        ReasonCode.FEE_DISCLOSURE_DRIFT,
    }:
        return Decision.ask_user
    # 5. Prefer an official route when preparing/purchasing.
    if ReasonCode.OFFICIAL_ROUTE_FOUND in codes and scope in (
        ConsentScope.checkout_prepare,
        ConsentScope.purchase_authorized,
    ):
        return Decision.use_official_route
    # 6. Score bands.
    if score >= 85:
        return Decision.proceed
    if score >= 70:
        return Decision.proceed_with_caution
    if score >= 50:
        return Decision.handoff_to_user
    # Below 50: block if policy warns/blocks, else hand off.
    if policy is not None and policy.decision in ("warn", "block"):
        return Decision.block
    return Decision.handoff_to_user


# Deterministic imperative instruction per decision. A leading reason-code
# clause is prepended for the codes that most change what the agent should do.
_INSTRUCTION_BY_DECISION = {
    Decision.proceed: "Proceed with the purchase using the verified price and evidence.",
    Decision.proceed_with_caution: "Proceed but surface the flagged price caveats to the user before committing.",
    Decision.ask_user: "Pause and ask the user to confirm before continuing.",
    Decision.handoff_to_user: "Hand off to the user to complete this step manually.",
    Decision.use_official_route: "Switch to the official route and complete the purchase there.",
    Decision.block: "Do not automate this purchase; stop and inform the user.",
}

_CODE_CLAUSE = {
    ReasonCode.BUDGET_BLOCKED: "The estimated cost exceeds the budget.",
    ReasonCode.MANDATORY_FEE_LATE: "A mandatory fee appeared late in the flow.",
    ReasonCode.PRICE_DRIFT_MAJOR: "The price changed materially since observation.",
    ReasonCode.FEE_DISCLOSURE_DRIFT: "Fee disclosure changed between stages.",
    ReasonCode.PLATFORM_AUTOMATION_RESTRICTED: "This platform restricts automated purchasing.",
    ReasonCode.OFFICIAL_ROUTE_FOUND: "An official route is available.",
}


def agent_instruction_for(
    decision: Decision,
    reason_codes: list[ReasonCode],
) -> str:
    """One imperative sentence for the calling agent (deterministic template)."""
    base = _INSTRUCTION_BY_DECISION[decision]
    for code in reason_codes:
        clause = _CODE_CLAUSE.get(code)
        if clause:
            return f"{clause} {base}"
    return base
