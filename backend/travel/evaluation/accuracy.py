"""Hermetic labelled cost-accuracy and ranking-agreement evaluation."""

from __future__ import annotations

from decimal import Decimal
import json
from pathlib import Path

from ..costing.engine import CostSummary, summarize_costs
from ..ranking.ranker import RankableCandidate, rank_candidates
from .models import CostRankingEvaluationReport, GoldenCostRankingCase, GoldenCostLabel


COST_RANKING_DATASET_FILES = {
    "cost_ranking_v1": "cost_ranking_v1.jsonl",
}
_DATASET_DIRECTORY = Path(__file__).resolve().parent / "datasets"


def accuracy_dataset_path(dataset: str) -> Path:
    normalized = dataset.removesuffix(".jsonl")
    try:
        filename = COST_RANKING_DATASET_FILES[normalized]
    except KeyError as exc:
        choices = ", ".join(sorted(COST_RANKING_DATASET_FILES))
        raise ValueError(f"unknown cost/ranking dataset {dataset!r}; choose one of: {choices}") from exc
    return _DATASET_DIRECTORY / filename


def load_accuracy_dataset(dataset: str) -> list[GoldenCostRankingCase]:
    path = accuracy_dataset_path(dataset)
    records: list[GoldenCostRankingCase] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                records.append(GoldenCostRankingCase.model_validate(json.loads(line)))
            except (json.JSONDecodeError, ValueError) as exc:
                raise ValueError(
                    f"invalid {path.name} record at line {line_number}: {exc}"
                ) from exc
    if not records:
        raise ValueError(f"dataset is empty: {path.name}")
    case_ids = [record.case_id for record in records]
    if len(case_ids) != len(set(case_ids)):
        raise ValueError(f"dataset contains duplicate case IDs: {path.name}")
    return records


def _cost_matches(actual: CostSummary, expected: GoldenCostLabel) -> bool:
    return (
        actual.known_total == expected.known_total
        and actual.estimated_total == expected.estimated_total
        and actual.completeness == expected.completeness
        and actual.unknown_mandatory_costs == expected.unknown_mandatory_costs
        and actual.estimated_mandatory_costs == expected.estimated_mandatory_costs
        and actual.applicable_mandatory_cost_count
        == expected.applicable_mandatory_cost_count
    )


def _rank(record: GoldenCostRankingCase) -> list[str]:
    candidates = [
        RankableCandidate(
            offer_id=candidate.offer_id,
            equivalence=candidate.equivalence,
            costs=summarize_costs(candidate.cost_components, record.currency),
            hard_preference_violations=candidate.hard_preference_violations,
            supplier_risk_tier=candidate.supplier_risk_tier,
            revalidation_age_seconds=candidate.revalidation_age_seconds,
            redirect_friction=candidate.redirect_friction,
            provider_priority=candidate.provider_priority,
            eligible=candidate.eligible,
        )
        for candidate in record.ranking_candidates
    ]
    return [candidate.offer_id for candidate in rank_candidates(candidates)]


def _pairwise_agreement(expected: tuple[str, ...], actual: list[str]) -> tuple[int, int]:
    expected_position = {offer_id: index for index, offer_id in enumerate(expected)}
    actual_position = {offer_id: index for index, offer_id in enumerate(actual)}
    agreed = 0
    pairs = 0
    for left_index, left in enumerate(expected):
        for right in expected[left_index + 1 :]:
            pairs += 1
            if actual_position[left] < actual_position[right]:
                agreed += 1
    return agreed, pairs


def evaluate_accuracy_dataset(dataset: str = "cost_ranking_v1") -> CostRankingEvaluationReport:
    records = load_accuracy_dataset(dataset)
    cost_matches = 0
    ranking_matches = 0
    cost_failures: list[str] = []
    ranking_failures: list[str] = []
    known_total_errors: list[Decimal] = []
    agreed_pairs = 0
    pair_count = 0

    for record in records:
        actual_cost = summarize_costs(record.cost_components, record.currency)
        known_error = abs(actual_cost.known_total - record.expected_cost.known_total)
        known_total_errors.append(known_error)
        if _cost_matches(actual_cost, record.expected_cost):
            cost_matches += 1
        else:
            cost_failures.append(record.case_id)

        actual_ranking = _rank(record)
        if actual_ranking == list(record.expected_ranking):
            ranking_matches += 1
        else:
            ranking_failures.append(record.case_id)
        case_agreement, case_pairs = _pairwise_agreement(
            record.expected_ranking,
            actual_ranking,
        )
        agreed_pairs += case_agreement
        pair_count += case_pairs

    record_count = len(records)
    return CostRankingEvaluationReport(
        dataset=dataset.removesuffix(".jsonl"),
        record_count=record_count,
        cost_exact_match_count=cost_matches,
        cost_accuracy=cost_matches / record_count,
        known_total_mean_absolute_error=sum(known_total_errors, Decimal("0"))
        / record_count,
        known_total_max_absolute_error=max(known_total_errors),
        ranking_exact_match_count=ranking_matches,
        ranking_exact_match_rate=ranking_matches / record_count,
        ranking_pair_count=pair_count,
        ranking_agreement=(agreed_pairs / pair_count if pair_count else 0.0),
        cost_failures=tuple(cost_failures),
        ranking_failures=tuple(ranking_failures),
    )
