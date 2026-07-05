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
  *and unknown* routes. Only `official_route=true` (an authorized
  merchant/ACP/partner rail) or an explicit policy override unblocks them.
- **No identity spoofing, no CAPTCHA bypass, no platform evasion, no account
  automation, no raw payment handling.** None of that code exists here.
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
(REST flavor; add `--mcp` to drive the MCP server over stdio instead).

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
| `JACOBI_AGENT_API_KEYS` | unset | `key:org` comma list; when set, raw-URL verifies require `X-Api-Key` (demos stay keyless). Unset = keyless dev-open |
| `JACOBI_AGENT_STORAGE` | `memory` | `memory` (bounded, process-local) or `supabase` (repo-layer persistence; needs `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`) |
| `JACOBI_ENABLE_PLAYWRIGHT` | `0` | `1` enables the local Playwright provider (real rendered DOM + screenshot; still not real-IP geography) |
| `JACOBI_PLAYWRIGHT_TRACE` | unset | Keep Playwright traces for captured pages |
| `JACOBI_TRUSTED_PROXY` | unset | Trust proxy headers for client-IP (when the backend sits behind a proxy) |

Every envelope also carries `ttl_seconds` (900): evidence is a snapshot —
agents should re-verify after the window rather than acting on stale prices.

## Tests

```bash
cd backend
python -m pytest tests/test_agentcore.py -q
```

Covers: schema round-trip, policy gating (restricted/unknown/official),
deterministic manifest hashing (change an artifact → hash changes), HMAC
signing, extractor fixtures, fee-drift flow, blocked-route flow, budget
guardrails, and the REST surface including JSON export and 404s.
