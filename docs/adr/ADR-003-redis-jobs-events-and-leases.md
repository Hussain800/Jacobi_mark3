# ADR-003: Redis for jobs, events, leases and ephemeral coordination

- Status: Accepted
- Date: 2026-07-13

## Context

Provider calls need idempotency, deadlines, retries, distributed leases, rate limits, cache, cancellation, event replay and worker heartbeats. The repository has in-process concurrency and Postgres scan leases but no shared travel coordinator.

## Decision

Add a Redis-backed abstraction for the travel job queue, event stream, deduplication locks, provider rate-limit counters, short-lived cache, OAuth tokens, revalidation priority and worker heartbeat. Postgres remains authoritative.

## Consequences

- New distributed travel jobs fail closed when Redis is unavailable.
- Memory implementations remain available only for deterministic local/unit tests and explicitly labelled single-process demos.
- A separate worker command consumes the same job contracts as production.
