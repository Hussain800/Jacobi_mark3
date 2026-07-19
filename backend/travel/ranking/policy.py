"""Explicit ordering policy for the PRD lexicographic rank key."""

from ..domain.enums import EquivalenceClass


EQUIVALENCE_PRIORITY: dict[EquivalenceClass, int] = {
    EquivalenceClass.EXACT: 0,
    EquivalenceClass.EQUIVALENT_WITH_DISCLOSED_TRADEOFF: 1,
    EquivalenceClass.SIMILAR_NOT_EQUIVALENT: 2,
    EquivalenceClass.INSUFFICIENT_EVIDENCE: 3,
    EquivalenceClass.REJECTED: 4,
}

UNKNOWN_REVALIDATION_AGE_SECONDS = 2_147_483_647

