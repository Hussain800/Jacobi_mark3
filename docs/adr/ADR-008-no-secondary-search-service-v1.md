# ADR-008: No secondary search service in V1

- Status: Accepted
- Date: 2026-07-13

## Context

The research report discussed Meilisearch as a possible serving index, while the later authoritative PRD explicitly rejects it for phase 1. Flight queries are structured and hotel identity can begin with provider IDs, normalized fields, trigram/geospatial indexes and reviewed crosswalks.

## Decision

Use Postgres indexes for V1. Do not add Meilisearch, OpenSearch or a vector database until measured latency or relevance misses a documented target and a later ADR demonstrates the operational benefit.

## Consequences

- Fewer synchronization and deployment failure modes.
- Search-index expansion remains evidence-driven rather than speculative.
