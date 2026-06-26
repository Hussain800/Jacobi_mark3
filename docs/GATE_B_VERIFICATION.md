# Gate B Verification Report

- **Timestamp:** 2026-06-26 ~08:55 UTC (DB server clock)
- **Deployed commit at verification:** `81482dd` (Gate-A deploy); **SEC-1b fix pushed as `c9c5f1a`** (deploying).
- **Session/method:** Authenticated production session in **Chrome** (Claude-in-Chrome extension, "Browser 1", local), signed in as **Hussain**. Browser-only flows driven via the extension; the anonymous share + revocation verified against the deployed backend API with a temporary DB-injected share token (created → exercised → deleted). Zero BrightData scans triggered.

## Results — every Gate B flow

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | `/chat` cached demo renders, labeled | **PASS** | Header "Demo · cached sample / COMPLETE", "24/24 agents"; verdict states "CURATED SAMPLE — the live probe didn't complete, showing a saved example"; full analysis (baseline $245, range $221–$278, discrimination index 87/100, sensitivity matrix, all 24 agents) + export buttons. No crash/blank. |
| 2 | `/dashboard` renders, signed in | **PASS** | Signed in as Hussain; "Price integrity posture" overview; KPIs 1 open finding / 0 critical / 1 monitored URL / 100% high-confidence / 2 audits. Fully loaded (not stuck on "Loading workspace"). No console errors. |
| 3 | Dashboard item meaningful (not one-price) | **PASS** | `[DEMO] AirPods Pro (2nd gen)`, MAP UNDERCUT, **$168 vs $199 (15.58% below)**. Evidence locker: **5 EVIDENCE ROWS / 1 LINKED FINDING** ($168/$171.5/$176/$182/$199). Finding detail: 100% coverage, all 5 buyer-context observations, honest summary, "not court-admissible" disclaimer. |
| 4 | Owner export works (full data) | **PASS** | On the finding detail, clicked **Download PDF** → `POST /api/findings/bcb08fcc…/exports` **200** + new `evidence_exports` row `c26832da` (pdf, redacted=false → full owner view). |
| 5 | Anonymous redacted share — packet | **PASS** | Deployed endpoint returned a redacted packet: no internal id-keys, finding/evidence ids stripped, `probe_session_id` null, URLs→`www.apple.com`, evidence intact (5 obs, seller "Apple Store"). |
| 6 | Anonymous redacted share — share_token metadata | **FIXED (SEC-1b)** | Pre-fix the `share_token` object leaked `organization_id`/`finding_id`/`created_by`. Fixed via `external_share_token_view` whitelist (commit `c9c5f1a`); unit-tested (17 passed). Post-deploy live re-verify appended below. |
| 7 | Revoked share inaccessible | **PASS** | After revoke, anonymous re-fetch → **404 "Not found"**. |
| 8 | Auth/access gating | **PASS** | Enterprise APIs → 401 unauth (direct + proxy); dashboard requires sign-in. |
| 9 | Manual scan safety (no auto scan) | **PASS** | `scan_jobs`: 2 completed, **0 queued/running**; no scheduler; I triggered only the cached demo + an export — **no live scan**. |
| 10 | Console / network errors | **PASS** | No console errors on dashboard, evidence, or `/chat`. Export call observed `200`. |
| 11 | Dead nav (bonus) | **PASS** | Footer Company column (Method/Extension/Privacy/Terms) renders as real links; all nav routes 200. |

## SEC-1b — found live, fixed, deployed
- **Found:** the anonymous `/api/enterprise/shared-findings/{token}` returned the full `share_tokens` row (minus `token_hash`) beside the redacted packet → leaked `organization_id`, `finding_id`, `created_by`.
- **Fix (`c9c5f1a`):** `external_share_token_view()` whitelists only `scope/redacted/expires_at/created_at/revoked_at/last_accessed_at`; applied at that endpoint. Packet redaction + owner-facing share lists unchanged. Tests added (`test_external_share_token_view_*`); suite 17 passed; frontend share page only consumes `expires_at` (no break).
- **Post-deploy live re-verify (CONFIRMED — `c9c5f1a` live on Render):** the anonymous `share_token` now exposes only `[scope, redacted, expires_at, created_at, revoked_at, last_accessed_at]` — no `organization_id`/`finding_id`/`created_by`, and no org/finding UUID anywhere in the payload; packet evidence intact (5 obs $168–$199, seller "Apple Store" kept). Test token deleted.

## Gate B verdict — **GO**
`c9c5f1a` is live; the post-deploy re-verify confirms the `share_token` no longer carries internal ids. All Gate-B flows verified live as PASS; no BrightData scans triggered. (Cosmetic polish, non-blocking: evidence-locker rows label as "Unlinked observation / Unknown seller" because evidence rows carry no direct product/seller id — they link via the finding's "Open finding".)
