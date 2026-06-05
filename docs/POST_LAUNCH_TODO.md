# JACOBI — Post-Launch / Pre–Pro 50 TODO

> Internal engineering backlog captured from the production ship-readiness audit.
> **Launch posture:** Smart 24 is live (waitlist). **Pro 50 is in private beta**
> behind the `PRO50_BETA` gate (backend) / `NEXT_PUBLIC_PRO50_BETA` flag
> (frontend) and must **not** be opened publicly until item **#1** is resolved.
>
> Status legend: 🔴 blocks Pro 50 launch · 🟠 do before scaling traffic · 🟡 hygiene

---

## 1. 🔴 Upgrade Render before the Pro 50 launch  *(launch blocker)*

**Problem.** The 50-agent Pro 50 matrix completes in **~143–147 s** on the current
Render **free tier** (512 MB RAM, 1 shared vCPU). That exceeds our ~100 s soft SLA
for an interactive audit. Verified twice on warm instances (143.4 s, 146.7 s) with
identical code/keys; a local run of the same engine finishes well under budget, so
the bottleneck is **infrastructure, not code**. Smart 24 (24 agents) is comfortably
within budget (~65–75 s) on the same tier.

**Action.**
- Move the backend to a paid Render instance with dedicated CPU and ≥2 GB RAM
  (or an equivalent host) **before** flipping `PRO50_BETA=1` in production.
- Re-run the Pro 50 timing benchmark on the new tier; require P95 ≤ 100 s across
  3 warm runs against `amazon.ae` (uniform baseline) before public launch.
- Only then set `PRO50_BETA=1` (backend) and `NEXT_PUBLIC_PRO50_BETA=1` (frontend).

**Acceptance.** Pro 50 P95 ≤ 100 s on the production host; toggle unlocked.

---

## 2. 🟠 Add ownership checks on `/api/result` and `/api/export`

**Problem.** Results and PDF export are addressed by an unguessable session id.
Auth on the *probe-launch* path is enforced (anon → 401; guessed/foreign ids →
404), and IDOR probing during the audit returned 404 — but `/api/result/{sid}`
and `/api/export/{sid}` rely on id-unguessability rather than an explicit
**owner == caller** check. A leaked/shared id (logs, referrer, screenshot) would
expose a report to a non-owner.

**Action.**
- Persist `owner_user_id` on each session (already available from the auth context
  at launch time).
- In `/api/result/{sid}` and `/api/export/{sid}`, require the authenticated user
  to match `owner_user_id`; return **404** (not 403) on mismatch to avoid
  confirming existence. Preserve any intentional public-share path behind an
  explicit `shared=true` flag only.

**Acceptance.** A second authenticated account requesting another user's `sid` on
both endpoints gets 404; owner still gets 200. Add a regression test.

---

## 3. 🟠 Per-IP / per-account rate & abuse controls

**Problem.** Quota is enforced per account (monthly scan limit), but there is no
**per-IP / per-window** rate limit in front of the probe endpoint. Each scan fans
out 24–50 outbound fetches, so abusive bursts are both a cost and a
reputation/SSRF-amplification risk. SSRF itself is mitigated (`url_guard.py`
blocks private/metadata addresses — verified live), but burst rate is not.

**Action.**
- Add a lightweight rate limiter (e.g. token bucket) keyed on `(ip, user)` at the
  `/api/probe` entrypoint: cap concurrent scans per account and N scans / rolling
  window per IP; return 429 with `Retry-After`.
- Keep the existing `MAX_CONCURRENT_SCANS` global semaphore as the backstop.
- Log (without PII) repeated 429s for abuse visibility.

**Acceptance.** A scripted burst from one IP trips 429 after the configured cap;
legitimate single-user usage is unaffected.

---

## 4. 🟡 Dependency upgrades

**Problem.** `pip-audit` against the **deployed** backend requirements flagged
known advisories (none reachable as a critical path today, but overdue):

| Package         | Installed | Advisory(s)                                   | Fixed in |
|-----------------|-----------|-----------------------------------------------|----------|
| `starlette`     | 0.46.2    | PYSEC-2026-161, CVE-2025-54121, CVE-2025-62727 | ≥ 0.49.1 |
| `python-dotenv` | 1.0.1     | CVE-2026-28684                                | 1.2.2    |
| `mcp`           | 1.12.4    | CVE-2025-66416                                | 1.23.0   |

Frontend: Next.js advisories surfaced by `npm audit` are mostly **N/A** to our
config (no image-optimizer / middleware-rewrite exposure), but at least one
HIGH warrants a tracked Next minor bump.

**Action.**
- Bump `starlette` (and FastAPI to a compatible pin), `python-dotenv`, and `mcp`;
  run the backend test suite + a live smoke scan after upgrading.
- Bump Next.js to the patched minor; re-run `tsc --noEmit` + `next build`.
- Re-run `pip-audit` / `npm audit` and record residuals here.

**Acceptance.** `pip-audit` shows no HIGH/known-exploitable findings on the
deployed set; frontend HIGH cleared; suites green.

---

### Notes / non-goals
- **Do not** touch the probe engine, parser, math engine (v2), auth, Stripe
  internals, or PDF logic for items #2–#4 beyond the explicit changes above.
- Stripe remains in **test mode** until the commercial launch decision.
- Booking/travel extraction is a **known limitation** (limited coverage on some
  dated itineraries → honestly gated as `insufficient_data`); tracked separately,
  not a launch blocker.
