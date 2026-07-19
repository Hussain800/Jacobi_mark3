# ADR-006: Flights first on a shared travel spine

- Status: Accepted
- Date: 2026-07-13

## Context

Flight identity is more structured and Amadeus offers an accessible initial API path. Hotels add harder property and rate-policy identity but need the same orchestration, evidence and delivery layers.

## Decision

Implement the common travel domain and orchestration first, then complete the independently queried flight path before the hotel path. Hotel models remain first-class typed contracts from the shared-domain milestone; they are not implemented as flight variants.

## Consequences

- Flights can validate the worker/SSE/revalidation spine early.
- Product completion is not declared until the one-page flow also works for a supported hotel page.
