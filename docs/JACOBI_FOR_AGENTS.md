# Jacobi for Agents — price provenance layer

Jacobi for Agents is the verification layer an AI agent calls **before**
recommending, booking, or purchasing. It answers one question: *is this price
current, total, fee-complete, evidence-backed, and safe to act on?* It returns
a machine-readable **DecisionEnvelope** plus a human explanation and a
deterministic, SHA-256-hashed **EvidenceManifest**.

It lives alongside the existing enterprise audit product in
`backend/agentcore/` and is exposed three ways with identical logic:

| Surface | Entry |
|---|---|
| REST API | `/api/v1/agent/*` (mounted in `backend/main.py`) |
| MCP server (stdio) | `python -m agentcore.mcp_server` from `backend/` |
| Dashboard | `/dashboard/provenance` |

## Safe-use policy (hard boundary)

Jacobi for Agents is a **trust layer, not a stealth buyer**:

- **No purchase execution.** No tool or endpoint clicks pay/book. Ever.
- `purchase_authorized` requests are **blocked by default** on restricted
  *and unknown* routes. A caller may claim `official_route=true`, but only a
  domain in the server-owned official-route registry (or an explicit policy
  override) can authorize that claim; the client cannot self-attest a route.
- **No identity spoofing, no CAPTCHA bypass, no platform evasion, no account
  automation, no raw payment handling.** Jacobi for Agents does not implement
  those capabilities. The separate legacy audit surface contains optional
  probe tooling; it is not imported by `backend/agentcore/` and is not an
  Agents capability.
- Known restricted platforms (booking.com, airbnb.com, expedia.com,
  amazon.com, agoda.com, hotels.com) are registered `evidence_only`.
- Evidence honesty: local collection **never** claims real IP geography;
  fixture runs are labeled `fixture_mode=true` in the envelope, the manifest,
  and the UI.
- Blocked purchases skip collection entirely — Jacobi will not gather
  evidence in service of a prohibited action (manifest tier `claim_only`).

## Quickstart

```bash
# backend (from repo root)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev
# open http://localhost:3000/dashboard/provenance
```

No extra env vars are required for the demos — see
[Environment variables](#environment-variables) for the optional ones.

**Local dashboard demo:** `frontend/.env.local` must point at the local
backend, i.e. `NEXT_PUBLIC_API_URL=http://localhost:8000` and
`BACKEND_API_URL=http://localhost:8000` (with those values the browser uses
the same-origin Next proxy, which forwards `/api/*` to the local backend).
If it points at the deployed Render URL instead, demo clicks go straight to
prod — which 404s until this branch is deployed there.

## Production-beta setup

The demos need nothing. For a shared/production-beta deployment, wire these:

### API-key auth (`X-Api-Key`)

Set `JACOBI_AGENT_API_KEYS` to a comma-separated `key:org` list:

```
JACOBI_AGENT_API_KEYS=key1:org1,key2:org2
```

Callers pass the key in the `X-Api-Key` header. Rules:

- **Demos stay keyless** — any request with `demo` set skips the key check.
- **Raw-URL verifies require a key** when `JACOBI_AGENT_API_KEYS` is set.
  `401` = invalid key, `403` = key required but missing.
- **Unset** = keyless dev-open: raw-URL verifies work without a header.

The dashboard has an optional API-key field (stored in memory only, never
persisted); when filled it sends `X-Api-Key` on verify + manifest/PDF fetches.

### Storage (`JACOBI_AGENT_STORAGE`)

- `memory` (default) — in-process, bounded, forgotten on restart. Fine for dev.
- `supabase` — persists decisions/manifests via the repo layer. Needs
  `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` and the `agent_provenance_records`
  table (see `supabase/migrations`).

Storage selection is fail-closed. If `supabase` is requested but unavailable,
or if `JACOBI_AGENT_STORAGE` contains an unsupported value, verification stops
before provider selection or collection. There is no silent memory fallback.

### Optional Playwright provider

For real browser evidence (rendered DOM + screenshot) instead of plain HTTP:

```bash
pip install playwright
python -m playwright install chromium
```

Enabled by `JACOBI_ENABLE_PLAYWRIGHT` (set `0` to disable). Honest caveat:
this is a **local browser emulation** — it renders JS and captures a
screenshot, but it is **not real IP geography** and the envelope still says so
via its capability tier + limitations. Set `JACOBI_PLAYWRIGHT_TRACE` to keep
traces; `JACOBI_TRUSTED_PROXY` if the backend sits behind a proxy.

### PDF evidence export

`GET /api/v1/agent/decisions/{request_id}/export.pdf` returns a
`application/pdf` evidence receipt for a stored decision (honors `X-Api-Key`).

## Demo flows

### 1. Lodging fee-drift (fixture-backed)

Listing shows **AED 2,180**; checkout-prep evidence totals **AED 2,530**
after three mandatory fees (Tourism Dirham 60 + Destination 190 + Service
100 = AED 350, **+16.1%**).

```bash
curl -s -X POST localhost:8000/api/v1/agent/verify \
  -H "Content-Type: application/json" \
  -d '{"demo": "fee_drift", "consent_scope": "recommend"}'
```

Expected: `decision: "ask_user"`, reason codes include
`PRICE_DRIFT_MAJOR`, `MANDATORY_FEE_LATE`, `FEE_DISCLOSURE_DRIFT`,
`EVIDENCE_LIMITED_LOCAL_ONLY`; price trace + 3 fees; manifest with 2 hashed
HTML artifacts.

### 2. Restricted-route purchase attempt

An agent asks for `purchase_authorized` on a platform whose terms prohibit
automated booking.

```bash
curl -s -X POST localhost:8000/api/v1/agent/verify \
  -H "Content-Type: application/json" \
  -d '{"demo": "blocked_route"}'
```

Expected: `decision: "block"`, `PLATFORM_AUTOMATION_RESTRICTED`, evidence
tier `claim_only`, zero collection attempts, next action = hand the official
page to the user.

### 3. Any URL (real local collection)

```bash
curl -s -X POST localhost:8000/api/v1/agent/verify \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/product", "consent_scope": "recommend"}'
```

Real fetches go through the existing SSRF `url_guard`, use plain HTTP (no JS
rendering), and honestly downgrade confidence when the generic extractor is
guessing (`LOW_EXTRACTOR_CONFIDENCE`).

## REST endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/agent/health` | Engine health, providers, demos, budget |
| POST | `/api/v1/agent/verify` | Full verification → DecisionEnvelope |
| POST | `/api/v1/agent/compare-total-price` | Price trace + deltas subset |
| POST | `/api/v1/agent/policy/check` | Policy decision for URL + scope |
| POST | `/api/v1/agent/explain` | `{request_id}` → user-facing explanation |
| GET | `/api/v1/agent/decisions/{id}` | Fetch stored envelope |
| GET | `/api/v1/agent/decisions/{id}/export.pdf` | PDF evidence receipt (`application/pdf`) |
| GET | `/api/v1/agent/manifests/{id}` | Fetch evidence manifest |
| GET | `/api/v1/agent/manifests/{id}/export` | JSON evidence download |

Storage is configurable (`JACOBI_AGENT_STORAGE`): `memory` (default, bounded,
process-local) or `supabase` (repo-layer persistence). Raw-URL verifies can be
gated behind `X-Api-Key` — see [Production-beta setup](#production-beta-setup).

## Agent integration contract

REST and MCP normalize verification and policy inputs through the same
transport-neutral command boundary. The transport supplies only authenticated
context such as the organization; it cannot self-authorize an official route,
select a stronger evidence tier, or bypass storage policy. Equivalent commands
produce equivalent decision semantics. Generated request/obligation/manifest
IDs, timestamps, and manifest hashes naturally differ between independent
runs.

Send `schema_version: "1.0.0"` on REST and MCP commands. Omitting it currently
means `1.0.0` for backward compatibility. A client must reject a response whose
`schema_version` is unsupported; it must not guess at field meanings. The
stdlib example in `examples/agent_client_demo.py` validates the version,
decision enum, reason-code shape, evidence reference/tier, fixture label,
SHA-256 shape, and freshness fields before using a result.

### Safe decision handling

| Envelope state | Required client behavior |
|---|---|
| `decision=block` | Stop. Do not purchase and do not collect more evidence in service of the blocked action. Hand the official page to the user. Evidence is `claim_only`. |
| `handoff_to_user` / `use_official_route` | Present the stated handoff/official route; never translate this into autonomous checkout. |
| `ask_user` | Show the changed total and limitations, then obtain user confirmation before continuing. |
| `proceed_with_caution` | Show reason codes and limitations before a recommendation; the score alone is not authorization. |
| `proceed` | Continue only within the caller's existing consent scope and before the freshness deadline. No Jacobi response authorizes payment execution. |

### Evidence capability labels

| Tier / flag | Meaning |
|---|---|
| `claim_only` | Caller-provided context only; no collection attempt. Required for blocked purchase commands. |
| `local` | Fixture, local HTTP, or local-browser evidence. Read `limitations`; it does not establish real-IP geography. |
| `fixture_mode=true` | Deterministic sample data, not a live merchant observation. Keep this label visible in downstream UI/logs. |
| `managed_request`, `managed_browser`, `official_api` | Contract-reserved stronger tiers. Managed providers are not wired in this local v0, so clients must not infer availability from the enum alone. |

The manifest's `capability_summary` is authoritative for concrete collection
features. In particular, local HTTP/browser collection leaves
`real_ip_geography=false`. Do not infer geography, freshness, or authorization
from the provenance score.

### Freshness and re-verification

Every envelope includes `created_at`, positive `ttl_seconds`, and derived
`expires_at`. The freshness interval is half-open:

```text
fresh when now < created_at + ttl_seconds
stale when now >= expires_at
```

At or after `expires_at`, stop using the envelope for action and submit a new
verification command. Clock or parse failures should also fail closed. Stored
manifests remain provenance records after expiry; expiry means the observed
price is no longer fresh enough to act on, not that the record should vanish.

### Deterministic command errors

Command-boundary errors use a stable body in REST and MCP:

```json
{
  "error": {
    "schema_version": "1.0.0",
    "code": "unsupported_schema_version",
    "message": "This server accepts command schema version 1.0.0.",
    "retryable": false,
    "field": "schema_version"
  }
}
```

REST also supplies the HTTP status; MCP returns the same `error` object.

| Code | REST status | Retry? | Meaning / action |
|---|---:|---:|---|
| `missing_target`, `ambiguous_target`, `unknown_demo`, `invalid_request`, `invalid_consent_scope` | 422 | no | Correct the command. Error text does not echo caller input. |
| `unsupported_schema_version` | 422 | no | Upgrade/downgrade against a supported contract; do not continue. |
| `invalid_api_key` | 401 | no | Replace the credential; credentials are never returned in the error. |
| `api_key_required` | 403 | no | Authenticate the raw-URL request. Fixture demos remain keyless. |
| `decision_not_found`, `manifest_not_found` | 404 | no | The record is absent or outside the caller's readable organization scope. |
| `rate_limited` | 429 | yes | Back off before retrying. |
| `storage_unavailable` | 503 | yes | Retry only after the configured provenance store is healthy. Collection is not started. |
| `manifest_unavailable` (MCP) | 503 | yes | Verification completed but the manifest could not be read back; do not act on the partial result. |

Gross transport parse failures (for example, invalid JSON before a command can
be built) remain transport-level validation errors. For normalized commands,
the codes and messages above are transport independent.

## MCP server

Tools: `health_check`, `verify_purchase_context`, `compare_total_price`,
`check_platform_policy`, `create_evidence_manifest`, `explain_decision`.

Claude Desktop config:

```json
{
  "mcpServers": {
    "jacobi": {
      "command": "python",
      "args": ["-m", "agentcore.mcp_server"],
      "cwd": "C:/path/to/Jacobi_mark3/backend"
    }
  }
}
```

Example agent conversation: *"Verify this hotel price before you recommend
it"* → the agent calls `verify_purchase_context(demo="fee_drift")` → Jacobi
returns `ask_user` with the fee-drift evidence → the agent warns the user
about the AED 350 in late mandatory fees.

Scripted end-to-end example: `python examples/agent_client_demo.py`
(REST flavor; add `--mcp` to drive the MCP server over stdio instead). The
example exits non-zero on an unsupported/incomplete/stale envelope and treats
`block` as stop plus user handoff, never as a prompt to collect more.

## Decision model

- **Decisions:** `proceed`, `proceed_with_caution`, `ask_user`,
  `handoff_to_user`, `use_official_route`, `block`.
- **Price Provenance Score** = weighted sum of 7 components
  (source legitimacy 20%, total-price integrity 20%, price stability 15%,
  inventory freshness 10%, policy safety 15%, evidence quality 15%,
  user control 5%). The score never overrides a hard policy block.
- **Reason codes:** `PRICE_STABLE`, `PRICE_STALE`, `PRICE_DRIFT_MINOR`,
  `PRICE_DRIFT_MAJOR`, `MANDATORY_FEE_LATE`, `FEE_DISCLOSURE_DRIFT`,
  `CURRENCY_SPREAD_UNCLEAR`, `INVENTORY_STALE`, `OFFICIAL_ROUTE_FOUND`,
  `PLATFORM_AUTOMATION_RESTRICTED`, `POLICY_FORBIDS_AUTOMATION`,
  `EVIDENCE_LIMITED_LOCAL_ONLY`, `PROVIDER_LIMITATION`,
  `LOW_EXTRACTOR_CONFIDENCE`, `MANIFEST_INCOMPLETE`, `BUDGET_BLOCKED`.

## Evidence manifests

Deterministic hashing contract (`backend/agentcore/evidence.py`):

```
manifest_sha256 = sha256(json.dumps(manifest_minus_hash_and_signature,
                                    sort_keys=True, separators=(",", ":"),
                                    default=str))
```

Manifests carry: timestamp, target, collection attempts, per-artifact SHA-256
hashes, provider capability flags, extractor version/method per extraction,
limitations, optional `parent_sha256` (corrections create children, never
mutations), and optional HMAC signature (`JACOBI_MANIFEST_SIGNING_KEY`).
`verify_manifest()` recomputes and compares.

## Limitations (honest)

- Collection is **local** — fixtures, plain HTTP, and (optionally) a local
  Playwright browser (`JACOBI_ENABLE_PLAYWRIGHT`). Even with Playwright it is
  **not real-IP geography** and no managed anti-bot providers are wired; every
  envelope carries `EVIDENCE_LIMITED_LOCAL_ONLY` and the manifest says exactly
  what was and wasn't captured.
- The generic extractor is a fallback heuristic; only pages with
  `data-jacobi-field` annotations (fixtures/partners) extract at high
  confidence.
- Persistence is now a repo layer: `memory` (process-local, forgotten on
  restart) or opt-in `supabase` via `JACOBI_AGENT_STORAGE`.
- Auth exists (API keys via `X-Api-Key`) and evidence exports both JSON and
  **PDF**. Still deferred: managed collection providers
  (Browserbase/Zyte/Bright Data — future `CollectionProvider`s behind the same
  budget + policy gates) and per-org dashboards / usage accounting.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `JACOBI_AGENT_BUDGET_USD` | `5.0` | Per-process managed-collection spend ceiling; exceeding returns `BUDGET_BLOCKED` |
| `JACOBI_ARTIFACT_DIR` | `backend/agentcore/_artifacts` | Raw HTML evidence storage (gitignored) |
| `JACOBI_ARTIFACT_MAX_FILES` | `500` | Cap on stored HTML artifacts (oldest pruned) — bounds disk use from unauthenticated verifies |
| `JACOBI_AGENT_RATE_LIMIT_PER_MIN` | `30` | Per-IP rate limit on `/verify` and `/compare-total-price` (429 beyond) |
| `JACOBI_MANIFEST_SIGNING_KEY` | unset | Optional HMAC-SHA256 manifest signing |
| `JACOBI_POLICY_OVERRIDES` | unset | JSON `{domain: action_mode}` policy overrides |
| `JACOBI_OFFICIAL_ROUTE_DOMAINS` | `demo.jacobi.local,hotel-official.example` | Server-owned comma-separated allowlist for official-route claims; configure partner/merchant domains explicitly |
| `JACOBI_AGENT_API_KEYS` | unset | `key:org` comma list; when set, raw-URL verifies require `X-Api-Key` (demos stay keyless). Unset = keyless dev-open |
| `JACOBI_AGENT_STORAGE` | `memory` | `memory` (bounded, process-local) or `supabase` (repo-layer persistence; needs `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`) |
| `JACOBI_ENABLE_PLAYWRIGHT` | `1` when the optional package is installed, otherwise unavailable | Enables the local Playwright provider (real rendered DOM + screenshot; still not real-IP geography). Set `0` to disable it explicitly. |
| `JACOBI_PLAYWRIGHT_TRACE` | unset | Keep Playwright traces for captured pages |
| `JACOBI_TRUSTED_PROXY` | unset | Trust proxy headers for client-IP (when the backend sits behind a proxy) |

Every envelope also carries `ttl_seconds` (900): evidence is a snapshot —
agents should re-verify after the window rather than acting on stale prices.

## Tests

```bash
cd backend
python -m pytest tests/test_agentcore.py tests/test_agentcore_commands.py -q
```

Covers: schema round-trip, policy gating (restricted/unknown/official),
deterministic manifest hashing (change an artifact → hash changes), HMAC
signing, extractor fixtures, fee-drift flow, blocked-route flow, budget
guardrails, freshness, fail-closed storage, normalized command errors, and
REST/MCP semantic parity after generated IDs/timestamps are normalized.
