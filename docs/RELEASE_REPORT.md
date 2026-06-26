# Jacobi Same-Day Release Report

Date: 2026-06-25
Execution of the war-room plan (`~/.claude/plans/you-are-acting-as-shiny-muffin.md`).
Baseline before this run: `d24b07f` (deployed). New work this run: committed locally to `691a68c` (**not yet pushed/deployed** — see Deploy Decision).

## What changed this execution run
1. **SEC-1 hardening (the one real open security finding) — DONE + tested.** `redact_packet()` (`backend/enterprise_reports.py:52`) now also strips internal workspace IDs (org/scan/finding/product/seller/`id`/`created_by`/`requested_by`) from a **redacted** external share or redacted export. Display + evidence fields (seller name+domain, product name, prices, `buyer_context`, domain-only URL) are kept. Non-redacted (owner) exports are untouched (early return). New test: `backend/tests/test_share_redaction.py` (2 tests).
   - **Honest correction to the plan:** the plan rated SEC-1 a P1 "redaction is presentation-only / full packet exposed." That was **wrong** — I had only read the store function. The endpoint already wraps the packet in `redact_packet` (`main.py:3250`), which on a redacted share strips org id, exact URLs→domain, `probe_session_id`, and internal metadata (`enterprise_reports.py:58-73`). So redaction was already server-side; the only residual was internal UUIDs, which this change now removes. Real severity was **P2/P3, not a Gate-B blocker.**

## Test & verification evidence (this run)
| Check | Command | Result |
|---|---|---|
| Backend safe suite (baseline) | `pytest -q --ignore=<7 live files>` (neutralized env) | **1388 passed**, 1 skipped |
| Backend safe suite (after SEC-1) | same | **1390 passed** (+2 SEC-1 tests), 0 new failures |
| SEC-1 + redaction/export/cross-user | `pytest tests/test_share_redaction.py tests/test_enterprise_workflow.py tests/test_enterprise_cross_user_access.py` | **15 passed** |
| Frontend typecheck | `npx tsc --noEmit` | exit 0 |
| Frontend build | live Vercel prod deploy at `d24b07f` is READY | build passes |
| Production smoke | `python scripts/smoke_test.py` | **16/16** |
| Live BrightData spend | none run | **$0** |

> The only non-passing backend tests are 2 failed + 10 errored from a **missing local `pytest-asyncio` plugin** (test_reliability async tests + provider tests) — a dev-env gap, not a product regression. 7 live-BrightData test files are excluded by policy (they assert the key at import and would spend credits).

## Release Gate decisions

### Gate A — Investor/demo  →  **GO (pending 1 human check)**
1-13 met: landing+all nav routes 200 (incl. 4 new pages); demo scan works w/o BrightData (24 agents/23 priced); manual scan creates a durable row + no false expiry (proven live: running→running, stale→timeout); failed scans return honest states; dashboard shows a labeled 5-observation finding; export path exists; unauthorized access blocked (cross-user test); no fake UI; no auto BrightData spend (cron removed, no scheduler); build passes; smoke 16/16. **Only open item: a signed-in human eyeball** of the demo button + dashboard render (auth-gated; I can't log in as you).

### Gate B — Controlled free-tier pilot  →  **GO after deploy + the visual check**
Everything in A, plus: auth genuine (`auth_user.py:48`); org/object access control enforced (`enterprise_store.py:863/1938/2208`); budget caps + kill switch (`enterprise_store.py:311-318`); evidence/finding persistence works; share tokens scoped + hashed + expiring + revocable (`enterprise_store.py:2342-2366`) + **now redaction-hardened (SEC-1)**; RLS enabled on all 13 tables (advisor + pg_class); Stripe test mode; BrightData manual-only + capped. **Blocking only on:** deploying `691a68c` (SEC-1) + the same visual check.

### Gate C — Public paid traffic  →  **NO-GO**
Blockers (not today): single Render free instance (cold starts, no horizontal scale, ~131s hostile-site scans); no error monitoring (Sentry DSN empty); per-request auth network hop (`auth_user.py`); no load testing; leaked-password protection is Supabase-Pro-only (paid); no abuse controls beyond per-workspace caps.

## Remaining (non-blocking) items
- **P2 messaging:** leaderboard/history use consumer-flavored "savings" labels (`Leaderboard.tsx:46`, `history/page.tsx`); rename to "spread"/"MAP undercut". No crypto/blockchain/legal overclaims found; disclaimers present and correct.
- **P3:** stale `frontend/copy-spec.md` (old "24 shoppers/bargaining" spec doc, not rendered); unreachable `components/dashboard.tsx` "Probe session expired" legacy path; ~5 leftover RLS-test orgs in prod (harmless).
- **P2 advisory:** Supabase SECURITY DEFINER lints (`handle_new_user`/`has_org_role`/`is_org_member` RPC-callable) — risky to change (RLS helpers); leave unless tested.
- **Perf:** hostile-site live scans ~131s (BrightData latency × 24 agents + cold start) — steer demos to the instant cached path; optional free-tier agent-count/concurrency tuning.

## Deploy Decision (needs you)
SEC-1 (`691a68c`) is committed locally, green, **not pushed**. Pushing to `main` auto-deploys frontend (Vercel) + backend (Render). It's low-risk (isolated to `redact_packet`, fully tested, owner exports unaffected). **Recommend: push to deploy SEC-1, then do the visual check.** Per the plan's stop-point, I paused instead of auto-deploying.

## STOP — human visual checks required (Gate A/B final sign-off)
Please, signed in, confirm:
1. `/chat` → "View demo result" renders a full multi-agent result labeled as a cached sample.
2. `/dashboard` → the `[DEMO] AirPods Pro (2nd gen)` finding shows 5 observations ($168–$199, four below the $199 MAP floor).
3. A redacted PDF/JSON export downloads for the owner; an anonymous share link opens (redacted) and revokes to 404.
