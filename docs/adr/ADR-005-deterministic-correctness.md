# ADR-005: Deterministic travel correctness

- Status: Accepted
- Date: 2026-07-13

## Context

False savings erode trust. Flight and hotel identity, mandatory costs, preferences and freshness must be inspectable and reproducible.

## Decision

Identity, equivalence, total-cost completeness, saving class and lexicographic ranking use typed deterministic rules and reason codes. An LLM may only rewrite an already verified explanation behind an explicit flag and fact-preservation check; it cannot decide exactness or price.

## Consequences

- Unknown material fields yield insufficient evidence or a disclosed trade-off, never inferred exactness.
- Affiliate revenue is absent from candidate eligibility and ranking inputs.
- Golden datasets and property tests are release gates.
