"""Load and evaluate versioned travel equivalence golden corpora."""

from __future__ import annotations

import json
from pathlib import Path

from ..domain.enums import EquivalenceClass, TravelVertical
from ..domain.flight import FlightIntent, FlightOffer
from ..domain.hotel import HotelIntent, HotelOffer
from ..equivalence.flights import classify_flight_equivalence
from ..equivalence.hotels import classify_hotel_equivalence
from .models import ClassMetrics, EvaluationReport, GoldenEquivalencePair


DATASET_FILES = {
    "flight_equivalence_v1": "flight_equivalence_v1.jsonl",
    "hotel_equivalence_v1": "hotel_equivalence_v1.jsonl",
}
DATASET_DIRECTORY = Path(__file__).resolve().parent / "datasets"
_CLASSES = tuple(EquivalenceClass)


def dataset_path(dataset: str) -> Path:
    normalized = dataset.removesuffix(".jsonl")
    try:
        filename = DATASET_FILES[normalized]
    except KeyError as exc:
        choices = ", ".join(sorted(DATASET_FILES))
        raise ValueError(f"unknown dataset {dataset!r}; choose one of: {choices}") from exc
    return DATASET_DIRECTORY / filename


def load_dataset(dataset: str) -> list[GoldenEquivalencePair]:
    path = dataset_path(dataset)
    records: list[GoldenEquivalencePair] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
                records.append(GoldenEquivalencePair.model_validate(payload))
            except (json.JSONDecodeError, ValueError) as exc:
                raise ValueError(f"invalid {path.name} record at line {line_number}: {exc}") from exc
    if not records:
        raise ValueError(f"dataset is empty: {path.name}")
    expected_vertical = (
        TravelVertical.FLIGHT
        if path.name.startswith("flight_")
        else TravelVertical.HOTEL
    )
    if any(record.vertical != expected_vertical for record in records):
        raise ValueError(f"dataset contains a record for the wrong vertical: {path.name}")
    case_ids = [record.case_id for record in records]
    if len(case_ids) != len(set(case_ids)):
        raise ValueError(f"dataset contains duplicate case IDs: {path.name}")
    return records


def _classify(record: GoldenEquivalencePair):
    if record.vertical == TravelVertical.FLIGHT:
        baseline = FlightIntent.model_validate(record.intent)
        candidate = FlightOffer.model_validate(record.candidate)
        return classify_flight_equivalence(baseline, candidate)
    baseline = HotelIntent.model_validate(record.intent)
    candidate = HotelOffer.model_validate(record.candidate)
    return classify_hotel_equivalence(baseline, candidate)


def evaluate_dataset(dataset: str) -> EvaluationReport:
    records = load_dataset(dataset)
    confusion = {
        expected.value: {predicted.value: 0 for predicted in _CLASSES}
        for expected in _CLASSES
    }
    correct = 0
    reason_failures: list[str] = []
    exact_violations: list[str] = []

    for record in records:
        result = _classify(record)
        confusion[record.expected_classification.value][result.classification.value] += 1
        if result.classification == record.expected_classification:
            correct += 1
        actual_reasons = set(result.reason_codes)
        missing_reasons = [
            reason.value
            for reason in record.expected_reason_codes
            if reason not in actual_reasons
        ]
        if missing_reasons:
            reason_failures.append(f"{record.case_id}: missing {','.join(missing_reasons)}")
        if "material_mismatch" in record.tags and result.classification == EquivalenceClass.EXACT:
            exact_violations.append(record.case_id)

    metrics: dict[str, ClassMetrics] = {}
    for label in _CLASSES:
        value = label.value
        true_positive = confusion[value][value]
        false_positive = sum(
            confusion[expected.value][value]
            for expected in _CLASSES
            if expected != label
        )
        false_negative = sum(
            confusion[value][predicted.value]
            for predicted in _CLASSES
            if predicted != label
        )
        support = sum(confusion[value].values())
        precision_denominator = true_positive + false_positive
        recall_denominator = true_positive + false_negative
        metrics[value] = ClassMetrics(
            support=support,
            true_positive=true_positive,
            false_positive=false_positive,
            false_negative=false_negative,
            precision=(true_positive / precision_denominator if precision_denominator else 0.0),
            recall=(true_positive / recall_denominator if recall_denominator else 0.0),
        )

    dataset_name = dataset.removesuffix(".jsonl")
    return EvaluationReport(
        dataset=dataset_name,
        vertical=records[0].vertical,
        record_count=len(records),
        correct_count=correct,
        accuracy=correct / len(records),
        confusion_matrix=confusion,
        per_class=metrics,
        reason_code_failures=tuple(reason_failures),
        material_mismatch_exact_violations=tuple(exact_violations),
    )


load_golden_dataset = load_dataset
evaluate_golden_dataset = evaluate_dataset
