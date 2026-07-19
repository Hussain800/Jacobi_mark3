# ADR-004: Server-Sent Events for progressive travel results

- Status: Accepted
- Date: 2026-07-13

## Context

Travel search is mostly server-to-client progress. Clients must reconnect after extension suspension or transient network loss and resume from a known event.

## Decision

Expose `/api/v2/travel/searches/{id}/events` as SSE with monotonically ordered event IDs, named events, heartbeats and `Last-Event-ID` replay from the Redis stream/persisted event boundary.

## Consequences

- The API does not hold provider execution inside the SSE request.
- Disconnects do not cancel durable provider jobs by default.
- WebSockets are not introduced unless bidirectional requirements emerge.
