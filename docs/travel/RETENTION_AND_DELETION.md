# Travel retention and deletion policy

This policy separates user-linked travel history from de-identified Market
Graph observations. It defines repository behavior and deployment obligations;
it does not claim that an unverified hosted database, backup policy or lifecycle
job is configured.

## Data classes and retention

| Data class | Repository behavior | Deployment retention target |
|---|---|---|
| Raw page HTML, full URLs, credentials, identity and payment data | rejected; never accepted as normal travel persistence | none |
| Raw provider responses | not persisted; revalidation/provider cache is process/Redis-only | maximum 5 minutes; revalidation authorization 2 minutes |
| Search events and idempotency entries | runtime-only | 15 minutes, enforced by runtime TTL |
| Anonymous search access | capability hash only; plaintext capability is not persisted | access expires after 15 minutes; relational anonymous rows require a scheduled purge within 24 hours |
| Signed-in searches, attempts, offers, costs, evidence links, revalidations, redirects and feedback | user-owned | rolling 90 days unless a shorter published deployment period applies; immediate logical deletion on authenticated request |
| Travel preferences | user-owned | until replaced, account deletion or authenticated deletion request |
| Agentcore travel evidence manifests | namespaced by `travel:{search_id}` | deleted with the owning search namespace |
| Canonical flight itineraries, hotel properties and reviewed property crosswalks | service-only and de-identified; no user ID, capability, full URL or raw payload | rolling 365 days by operator lifecycle, retained across user deletion |
| Backups | outside the application repository | operator must publish a maximum restore window of 30 days or less and prevent deleted data from re-entering the live service after restore |

The 24-hour, 90-day, 365-day and backup windows are deployment requirements,
not a claim that a scheduler exists in this repository. Production readiness
must verify the actual database lifecycle jobs and backup configuration.

## Authenticated deletion contract

`DELETE /api/v2/travel/user-data` requires an authenticated owner. The service:

1. enumerates only that owner's searches;
2. deletes each `travel:{search_id}` Agentcore provenance namespace;
3. deletes user-owned Market Graph leaves before roots: redirects,
   revalidations, feedback, evidence links, cost components, offers, provider
   attempts, searches and preferences;
4. preserves only `travel_flight_itineraries`, `travel_hotel_properties` and
   `travel_hotel_property_crosswalks` because they are service-owned,
   de-identified catalogues; and
5. raises if a storage adapter does not acknowledge a discovered deletion.

Capability-only callers cannot enumerate or delete account history. The
operation is idempotent: a repeated request returns zero deleted records. A
cross-store interruption can leave an incomplete attempt, so operators must
retry the same authenticated request; neither layer reports fabricated success.

## Fail-closed production requirements

Production must use `JACOBI_TRAVEL_STORAGE=supabase` and
`JACOBI_AGENT_STORAGE=supabase` with service credentials. The travel repository
factory rejects memory persistence in a production-like environment, and the
Agentcore Supabase repository raises when service configuration is absent.
Operators must test deletion against the real target, RLS/service-role grants,
scheduled anonymous-row purge, rolling Market Graph lifecycle and backup expiry
before launch.

## De-identification boundary

A retained market observation cannot contain a user ID, search capability,
account identifier, full source URL, page reference that can be resolved back
to a session, raw upstream payload, traveller/guest identity or payment data.
If an observation cannot meet that boundary, it remains user-linked and is
deleted with the owner rather than copied into the retained catalogues.
