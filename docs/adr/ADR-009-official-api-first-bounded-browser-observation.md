# ADR-009: Official API first, bounded browser observation

- Status: Accepted
- Date: 2026-07-13

## Context

The current page contains the user's selected intent and baseline price but cannot independently prove the market. Broad scraping creates policy, security and reliability risk.

## Decision

Use the open page only as a locally parsed, sanitized baseline observation. Independently query configured official providers, starting with Amadeus. Server-side provider clients use fixed outbound allowlists. Each page adapter needs policy metadata, versioned fixtures and Chromium tests before support is claimed.

## Consequences

- Browser-observed, fixture, sandbox and production API labels remain distinct.
- No CAPTCHA bypass, stealth evasion, credential automation or arbitrary travel-page server fetch is allowed.
- Provider and adapter policy/legal approval remains explicit rather than inferred from public accessibility.
