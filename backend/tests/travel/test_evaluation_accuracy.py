"""Cost-accuracy and ranking-agreement offline eval (ledger TR-904)."""

from __future__ import annotations

import json

from jacobi import main
from travel.evaluation import accuracy
from travel.evaluation.accuracy import (
    accuracy_dataset_path,
    evaluate_accuracy_dataset,
    load_accuracy_dataset,
)


def _file_line_count() -> int:
    path = accuracy_dataset_path("cost_ranking_v1")
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def test_dataset_loads_with_unique_case_ids() -> None:
    records = load_accuracy_dataset("cost_ranking_v1")
    assert len(records) >= 80
    case_ids = [record.case_id for record in records]
    assert len(case_ids) == len(set(case_ids))
    assert len(records) == _file_line_count()


def test_labels_match_engine_exactly() -> None:
    report = evaluate_accuracy_dataset("cost_ranking_v1")
    assert report.passed is True
    assert report.cost_accuracy == 1.0
    assert report.ranking_agreement == 1.0
    assert report.record_count == _file_line_count()


def test_mislabelled_ranking_makes_report_fail(monkeypatch) -> None:
    records = load_accuracy_dataset("cost_ranking_v1")
    target = next(r for r in records if len(r.expected_ranking) >= 2)
    corrupted = target.model_copy(
        update={"expected_ranking": tuple(reversed(target.expected_ranking))}
    )
    patched = [corrupted if r.case_id == target.case_id else r for r in records]
    monkeypatch.setattr(
        accuracy, "load_accuracy_dataset", lambda dataset="cost_ranking_v1": patched
    )

    report = evaluate_accuracy_dataset("cost_ranking_v1")
    assert report.passed is False
    assert target.case_id in report.ranking_failures


def test_cli_surfaces_cost_ranking_accuracy(capsys) -> None:
    assert main(["travel", "eval", "--dataset", "cost_ranking_v1", "--json"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["dataset"] == "cost_ranking_v1"
    assert payload["passed"] is True
    assert payload["cost_accuracy"] == 1.0
    assert payload["ranking_agreement"] == 1.0
    assert payload["evidence_label"] == "fixture"
    assert payload["real_user_validation"] is False
