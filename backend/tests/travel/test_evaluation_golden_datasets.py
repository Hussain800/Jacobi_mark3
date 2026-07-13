from collections import Counter

import pytest

from travel.domain import EquivalenceClass, TravelVertical
from travel.evaluation import dataset_path, evaluate_dataset, load_dataset
from travel.evaluation.generate import CASES_PER_CLASS, write_datasets


DATASETS = (
    ("flight_equivalence_v1", TravelVertical.FLIGHT),
    ("hotel_equivalence_v1", TravelVertical.HOTEL),
)


@pytest.mark.parametrize(("dataset", "vertical"), DATASETS)
def test_checked_in_golden_dataset_has_320_balanced_labelled_pairs(
    dataset: str,
    vertical: TravelVertical,
) -> None:
    records = load_dataset(dataset)
    distribution = Counter(record.expected_classification for record in records)

    assert len(records) == 320
    assert {record.vertical for record in records} == {vertical}
    assert distribution == {classification: CASES_PER_CLASS for classification in EquivalenceClass}
    assert len({record.case_id for record in records}) == len(records)


@pytest.mark.parametrize(("dataset", "vertical"), DATASETS)
def test_evaluation_reports_confusion_matrix_precision_and_recall(
    dataset: str,
    vertical: TravelVertical,
) -> None:
    report = evaluate_dataset(dataset)

    assert report.vertical == vertical
    assert report.record_count == 320
    assert report.correct_count == 320
    assert report.accuracy == 1.0
    assert report.reason_code_failures == ()
    assert report.passed
    for classification in EquivalenceClass:
        value = classification.value
        metrics = report.per_class[value]
        assert report.confusion_matrix[value][value] == CASES_PER_CLASS
        assert metrics.support == CASES_PER_CLASS
        assert metrics.precision == 1.0
        assert metrics.recall == 1.0


@pytest.mark.parametrize("dataset", [item[0] for item in DATASETS])
def test_material_mismatches_are_never_classified_exact(dataset: str) -> None:
    records = load_dataset(dataset)
    material_mismatches = [record for record in records if "material_mismatch" in record.tags]
    report = evaluate_dataset(dataset)

    assert len(material_mismatches) == CASES_PER_CLASS
    assert all(
        record.expected_classification == EquivalenceClass.REJECTED
        for record in material_mismatches
    )
    assert report.material_mismatch_exact_violations == ()


def test_generator_reproduces_the_checked_in_corpora_byte_for_byte(tmp_path) -> None:
    written = write_datasets(tmp_path)

    assert written == {
        "flight_equivalence_v1": 320,
        "hotel_equivalence_v1": 320,
    }
    for dataset, _vertical in DATASETS:
        assert (tmp_path / f"{dataset}.jsonl").read_bytes() == dataset_path(dataset).read_bytes()


def test_dataset_names_are_allowlisted() -> None:
    with pytest.raises(ValueError, match="unknown dataset"):
        load_dataset("../flight_equivalence_v1")

