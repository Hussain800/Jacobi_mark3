# JACOBI API contracts

Status: G012 checked-in developer-test spine, local and fixture-backed only.

The canonical examples live under `contracts/api/v1/fixtures/`. Each fixture is wrapped with `contract_version`, `family`, `mode`, `source`, and, where applicable, `uncertainty`. The `response` object mirrors the current runtime payload shape; the wrapper metadata is for contract tests and docs, not a new runtime route.

## Contract families

| Family | Fixture | Current source |
|---|---|---|
| Audit result | `audit-result-insufficient-data.demo.json` | `backend/main.py` result projection and `frontend/components/cockpit/types.ts` |
| Enterprise workspace/job/evidence | `enterprise-workspace.demo.json` | `backend/enterprise_store.py` and `frontend/app/dashboard/use-enterprise-workspace.ts` |
| Enterprise redacted share | `enterprise-redacted-share.demo.json` | `backend/main.py` shared-finding route and `backend/enterprise_reports.py` redaction |
| Agent decision | `agent-decision-blocked-route.demo.json` | `backend/agentcore/schemas.py:DecisionEnvelope` |
| Agent manifest | `agent-manifest-blocked-route.demo.json` | `backend/agentcore/schemas.py:EvidenceManifest` |
| Stable errors | `errors.demo.json` | FastAPI route errors and the Next proxy fallback |

## Compatibility rules

- Clients must tolerate additive fields.
- Clients should treat missing required fields in these fixtures as contract failures.
- `mode`, `source`, and `uncertainty` in the fixture wrapper label the example and its evidence limits.
- Runtime mode appears per surface: Audit and Agent expose evidence fields in payloads; Enterprise workspace includes `mode`; the frontend proxy uses `x-jacobi-api-mode`.
- Fixtures are sanitized and demo-labeled. They must not contain credentials, raw tenant data, token hashes, or live identifiers.

## Safety invariants

- Limited Audit coverage is `insufficient_data`; it is not a discrimination claim.
- Unattributed spread remains `indeterminate`; the contract must not invent a causal driver.
- PEI stays gated unless coverage is non-limited and a controlled gradient is significant.
- A blocked purchase-authorized Agent decision is `claim_only` and has zero collection attempts.
- Redacted Enterprise shares expose a projection only: no internal organization, finding, scan, product, seller, user, token, probe-row, or raw extraction identifiers.

## Error status spine

The error catalog fixes status/code pairs for client handling. Enterprise errors use object details with stable `code` values. Agentcore currently returns string details for 422/404/429 paths, so the catalog gives client-safe synthetic codes while preserving the actual status and detail shape.

Frontend proxy fallback examples include `x-jacobi-api-mode: fallback`; successful proxied backend responses should use `x-jacobi-api-mode: backend`.

## Local validation

Run the contract tests without installing anything:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests\test_world_class_contracts.py -q
cd frontend
npm run test:unit
npx tsc --noEmit
```

These checks prove local fixture/schema compatibility only. They do not certify production Supabase/RLS, external workers, provider credentials, live geography, deployment, or purchase execution.
