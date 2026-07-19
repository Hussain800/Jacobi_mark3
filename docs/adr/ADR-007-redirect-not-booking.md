# ADR-007: Revalidated redirect, not autonomous booking

- Status: Accepted
- Date: 2026-07-13

## Context

Users value trusted suppliers and control at payment. Checkout would add payment, fraud, servicing, cancellation and regulatory scope.

## Decision

Jacobi revalidates a selected offer, issues a short-lived redirect authorization and opens a validated supplier deep link after explicit user action. It never checks out, pays, stores credentials or completes a booking.

Affiliate attribution may be attached only after ranking and click, must be disclosed, and must fall back to the canonical route without changing price, supplier or rank.

## Consequences

- Price changes require user reconfirmation.
- Redirect events can measure accepted verified savings without controlling the booking.
