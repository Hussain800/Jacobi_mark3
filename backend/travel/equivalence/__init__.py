"""Public deterministic travel-equivalence API."""

from .base import (
    EquivalenceResult,
    FieldComparison,
    FieldDisposition,
    classify_comparisons,
)
from .flights import classify_flight_equivalence, evaluate_flight_equivalence
from .hotels import (
    classify_hotel_equivalence,
    compare_property_identity,
    evaluate_hotel_equivalence,
)
from .reasons import EquivalenceReasonCode, ReasonCode

__all__ = [
    "EquivalenceReasonCode",
    "EquivalenceResult",
    "FieldComparison",
    "FieldDisposition",
    "ReasonCode",
    "classify_comparisons",
    "classify_flight_equivalence",
    "classify_hotel_equivalence",
    "compare_property_identity",
    "evaluate_flight_equivalence",
    "evaluate_hotel_equivalence",
]

