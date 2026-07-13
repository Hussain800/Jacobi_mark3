"""Travel golden-corpus loading and deterministic evaluation."""

from .evaluator import (
    DATASET_FILES,
    dataset_path,
    evaluate_dataset,
    evaluate_golden_dataset,
    load_dataset,
    load_golden_dataset,
)
from .models import ClassMetrics, EvaluationReport, GoldenEquivalencePair

__all__ = [
    "DATASET_FILES",
    "ClassMetrics",
    "EvaluationReport",
    "GoldenEquivalencePair",
    "dataset_path",
    "evaluate_dataset",
    "evaluate_golden_dataset",
    "load_dataset",
    "load_golden_dataset",
]
