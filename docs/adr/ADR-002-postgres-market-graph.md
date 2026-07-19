# ADR-002: Postgres as the Market Graph

- Status: Accepted
- Date: 2026-07-13

## Context

Travel search relates intents, itineraries/properties, providers, suppliers, offers, costs, evidence, revalidations, redirects and feedback. The data is graph-shaped but transactional, relational and access-controlled.

## Decision

Use Postgres/Supabase as the source of truth with additive tables, foreign keys, JSON only for bounded normalized structures, query indexes and RLS. Reuse repository and fail-closed configuration patterns from PR #45.

## Consequences

- No Neo4j or other graph database is introduced.
- Shared market observations remain server-only while user-owned records use RLS.
- Application rollback preserves additive travel data; destructive schema rollback needs separate review and backup.
