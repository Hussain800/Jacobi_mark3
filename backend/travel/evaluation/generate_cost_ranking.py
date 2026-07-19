"""Deterministically generate the checked-in v1 cost/ranking accuracy corpus.

Every label is machine-derived from the same engine functions the evaluator
uses (``summarize_costs`` and ``rank_candidates``), so the corpus is
self-consistent by construction: ``evaluate_accuracy_dataset`` must report
exact cost accuracy and 1.0 ranking agreement. The generator supplies the
adversarial *inputs* (unknown mandatory costs that must not collapse to zero,
misleading-lower-but-incomplete subtotals, equivalence and tie-break spreads,
ineligible candidates); the engine supplies the *labels*.

No randomness: cases are a fixed cross-product of cost profiles and ranking
scenarios.
"""

from __future__ import annotations

from decimal import Decimal
import json
from pathlib import Path
from typing import Callable

from ..costing.engine import CostComponent, summarize_costs
from ..domain.enums import (
    CostKind,
    CostState,
    EquivalenceClass,
    RedirectFriction,
    SupplierRiskTier,
)
from ..domain.money import Money
from ..ranking.ranker import RankableCandidate, rank_candidates
from .models import GoldenCostLabel, GoldenCostRankingCase, GoldenRankingCandidate


_DATASET_DIRECTORY = Path(__file__).resolve().parent / "datasets"
_CURRENCIES = ("AED", "USD", "EUR", "GBP", "SAR", "INR", "JPY", "CAD", "AUD", "CHF")


# --- component builders -------------------------------------------------------


def _known(kind: CostKind, amount: str, currency: str, *, mandatory: bool = True) -> CostComponent:
    return CostComponent(
        kind=kind,
        state=CostState.KNOWN,
        money=Money(amount=Decimal(amount), currency=currency),
        mandatory=mandatory,
    )


def _estimated(kind: CostKind, amount: str, currency: str) -> CostComponent:
    return CostComponent(
        kind=kind,
        state=CostState.ESTIMATED,
        money=Money(amount=Decimal(amount), currency=currency),
    )


def _unknown(kind: CostKind) -> CostComponent:
    return CostComponent(kind=kind, state=CostState.UNKNOWN)


def _not_applicable(kind: CostKind) -> CostComponent:
    return CostComponent(kind=kind, state=CostState.NOT_APPLICABLE)


# --- cost profiles (label the top-level cost_components) ----------------------
# Each exercises a distinct branch of summarize_costs.

CostProfile = Callable[[str], list[CostComponent]]

COST_PROFILES: tuple[tuple[str, CostProfile], ...] = (
    ("complete_known", lambda c: [
        _known(CostKind.BASE_FARE, "500", c),
        _known(CostKind.TAXES, "75", c),
        _known(CostKind.PROVIDER_FEE, "20", c),
    ]),
    ("estimated_baggage", lambda c: [
        _known(CostKind.BASE_FARE, "500", c),
        _estimated(CostKind.BAGGAGE, "60", c),
    ]),
    ("unknown_resort_fee", lambda c: [
        _known(CostKind.BASE_RATE, "400", c),
        _unknown(CostKind.RESORT_FEE),
    ]),
    ("not_applicable_baggage", lambda c: [
        _known(CostKind.BASE_FARE, "500", c),
        _not_applicable(CostKind.BAGGAGE),
    ]),
    ("mixed_estimated_and_unknown", lambda c: [
        _known(CostKind.BASE_RATE, "400", c),
        _estimated(CostKind.TAXES, "55", c),
        _unknown(CostKind.RESORT_FEE),
    ]),
    ("optional_cost_ignored", lambda c: [
        _known(CostKind.BASE_FARE, "500", c),
        _known(CostKind.SERVICE_FEE, "30", c, mandatory=False),
        _known(CostKind.TAXES, "70", c),
    ]),
    ("all_known_four_kinds", lambda c: [
        _known(CostKind.BASE_FARE, "500", c),
        _known(CostKind.TAXES, "75", c),
        _known(CostKind.PROVIDER_FEE, "20", c),
        _known(CostKind.PAYMENT_FEE, "15", c),
    ]),
    ("estimated_two_kinds", lambda c: [
        _known(CostKind.BASE_RATE, "400", c),
        _estimated(CostKind.BAGGAGE, "60", c),
        _estimated(CostKind.RESORT_FEE, "45", c),
    ]),
    ("multiple_unknown_mandatory", lambda c: [
        _known(CostKind.BASE_RATE, "400", c),
        _unknown(CostKind.RESORT_FEE),
        _unknown(CostKind.DESTINATION_FEE),
    ]),
    ("not_applicable_and_unknown", lambda c: [
        _known(CostKind.BASE_RATE, "400", c),
        _not_applicable(CostKind.CLEANING_FEE),
        _unknown(CostKind.LOCAL_TAX),
    ]),
)


# --- ranking scenarios (label expected_ranking) -------------------------------
# Every candidate holds the fields NOT under test equal, so the intended
# tie-break level decides the order; the ranker itself supplies the label.


def _candidate(
    offer_id: str,
    currency: str,
    *,
    equivalence: EquivalenceClass = EquivalenceClass.EXACT,
    known: str = "100",
    unknown_cost: bool = False,
    violations: int = 0,
    supplier: SupplierRiskTier = SupplierRiskTier.STANDARD,
    redirect: RedirectFriction = RedirectFriction.DIRECT,
    reval: int | None = None,
    priority: int = 100,
    eligible: bool = True,
) -> GoldenRankingCandidate:
    components: list[CostComponent] = [_known(CostKind.BASE_FARE, known, currency)]
    if unknown_cost:
        components.append(_unknown(CostKind.RESORT_FEE))
    return GoldenRankingCandidate(
        offer_id=offer_id,
        equivalence=equivalence,
        cost_components=tuple(components),
        hard_preference_violations=violations,
        supplier_risk_tier=supplier,
        revalidation_age_seconds=reval,
        redirect_friction=redirect,
        provider_priority=priority,
        eligible=eligible,
    )


RankingScenario = Callable[[str], list[GoldenRankingCandidate]]

RANKING_SCENARIOS: tuple[tuple[str, RankingScenario], ...] = (
    ("equivalence_ordering", lambda c: [
        _candidate("eq-exact", c, equivalence=EquivalenceClass.EXACT),
        _candidate("eq-tradeoff", c, equivalence=EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF),
        _candidate("eq-similar", c, equivalence=EquivalenceClass.SIMILAR_NOT_EQUIVALENT),
    ]),
    # Adversarial: the cheaper subtotal is incomplete (an unknown mandatory cost
    # that must not silently become zero); the complete-but-higher offer wins.
    ("complete_beats_lower_incomplete", lambda c: [
        _candidate("cbl-cheap-incomplete", c, known="100", unknown_cost=True),
        _candidate("cbl-dearer-complete", c, known="150"),
    ]),
    ("hard_preference_violation", lambda c: [
        _candidate("hp-violator-cheap", c, known="100", violations=1),
        _candidate("hp-clean-dearer", c, known="200", violations=0),
    ]),
    ("known_total_ordering", lambda c: [
        _candidate("kt-120", c, known="120"),
        _candidate("kt-130", c, known="130"),
        _candidate("kt-140", c, known="140"),
    ]),
    ("supplier_trust_tiebreak", lambda c: [
        _candidate("sr-trusted", c, supplier=SupplierRiskTier.TRUSTED),
        _candidate("sr-standard", c, supplier=SupplierRiskTier.STANDARD),
        _candidate("sr-elevated", c, supplier=SupplierRiskTier.ELEVATED),
    ]),
    ("redirect_friction_tiebreak", lambda c: [
        _candidate("rf-direct", c, redirect=RedirectFriction.DIRECT),
        _candidate("rf-intermediate", c, redirect=RedirectFriction.INTERMEDIATE),
        _candidate("rf-manual", c, redirect=RedirectFriction.MANUAL),
    ]),
    ("revalidation_age_tiebreak", lambda c: [
        _candidate("rv-fresh", c, reval=10),
        _candidate("rv-older", c, reval=100),
        _candidate("rv-unknown-age", c, reval=None),
    ]),
    ("provider_priority_tiebreak", lambda c: [
        _candidate("pp-10", c, priority=10),
        _candidate("pp-50", c, priority=50),
        _candidate("pp-100", c, priority=100),
    ]),
    # Everything equal down to provider_priority; only offer_id breaks the tie.
    ("offer_id_final_tiebreak", lambda c: [
        _candidate("zzz-last", c),
        _candidate("aaa-first", c),
        _candidate("mmm-middle", c),
    ]),
    # Ineligible candidate is dropped from the ranked list even though cheapest.
    ("ineligible_excluded", lambda c: [
        _candidate("inel-eligible-a", c, known="100"),
        _candidate("inel-eligible-b", c, known="200"),
        _candidate("inel-skipped-cheapest", c, known="50", eligible=False),
    ]),
)


# --- label derivation ---------------------------------------------------------


def _expected_cost(components: list[CostComponent], currency: str) -> GoldenCostLabel:
    summary = summarize_costs(components, currency)
    return GoldenCostLabel(
        known_total=summary.known_total,
        estimated_total=summary.estimated_total,
        completeness=summary.completeness,
        unknown_mandatory_costs=summary.unknown_mandatory_costs,
        estimated_mandatory_costs=summary.estimated_mandatory_costs,
        applicable_mandatory_cost_count=summary.applicable_mandatory_cost_count,
    )


def _expected_ranking(
    candidates: list[GoldenRankingCandidate], currency: str
) -> tuple[str, ...]:
    ranked = rank_candidates(
        [
            RankableCandidate(
                offer_id=candidate.offer_id,
                equivalence=candidate.equivalence,
                costs=summarize_costs(candidate.cost_components, currency),
                hard_preference_violations=candidate.hard_preference_violations,
                supplier_risk_tier=candidate.supplier_risk_tier,
                revalidation_age_seconds=candidate.revalidation_age_seconds,
                redirect_friction=candidate.redirect_friction,
                provider_priority=candidate.provider_priority,
                eligible=candidate.eligible,
            )
            for candidate in candidates
        ]
    )
    return tuple(candidate.offer_id for candidate in ranked)


def build_cost_ranking_cases() -> list[GoldenCostRankingCase]:
    cases: list[GoldenCostRankingCase] = []
    index = 0
    for cost_index, (cost_name, cost_profile) in enumerate(COST_PROFILES):
        for rank_index, (rank_name, rank_scenario) in enumerate(RANKING_SCENARIOS):
            currency = _CURRENCIES[index % len(_CURRENCIES)]
            components = cost_profile(currency)
            candidates = rank_scenario(currency)
            cases.append(
                GoldenCostRankingCase(
                    dataset_version="v1",
                    case_id=f"cr-{cost_index:02d}-{rank_index:02d}",
                    currency=currency,
                    cost_components=tuple(components),
                    expected_cost=_expected_cost(components, currency),
                    ranking_candidates=tuple(candidates),
                    expected_ranking=_expected_ranking(candidates, currency),
                    tags=(cost_name, rank_name),
                )
            )
            index += 1
    return cases


def write_dataset(directory: Path = _DATASET_DIRECTORY) -> int:
    directory.mkdir(parents=True, exist_ok=True)
    cases = build_cost_ranking_cases()
    path = directory / "cost_ranking_v1.jsonl"
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for case in cases:
            handle.write(json.dumps(case.model_dump(mode="json"), sort_keys=True, separators=(",", ":")))
            handle.write("\n")
    return len(cases)


if __name__ == "__main__":
    print(json.dumps({"cost_ranking_v1": write_dataset()}, sort_keys=True))
