# ADR-001: Modular monolith plus worker

- Status: Accepted
- Date: 2026-07-13
- Decision owners: Jacobi maintainers

## Context

Travel providers have variable latency and require durable retries, leases and progressive results. The repository is currently one FastAPI process, one Next.js application and one MV3 extension.

## Decision

Keep one shared Python travel codebase deployed as two process roles: FastAPI API and provider worker. Keep the existing Next.js frontend, MV3 extension, Postgres and Redis as the other deployable units. New travel business rules live under `backend/travel`; `backend/main.py` only assembles the travel router and lifecycle.

## Consequences

- API, worker, REST, MCP and CLI reuse one deterministic domain.
- Provider work can survive API restarts without microservice contracts.
- Existing legacy logic is preserved rather than rewritten during the pivot.
- Kafka, Kubernetes and service decomposition require measured need and a later ADR.
