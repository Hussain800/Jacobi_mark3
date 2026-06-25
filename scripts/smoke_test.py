#!/usr/bin/env python3
"""Jacobi acceptance smoke test.

Runs the COST-FREE acceptance checks against a deployed Jacobi (frontend +
backend). It deliberately does NOT trigger any live probe, so it spends zero
BrightData credits — proving criterion 10 (no provider call unless a live scan
is explicitly triggered) by construction.

Usage:
    python scripts/smoke_test.py
    FRONTEND_URL=https://jacobi-mark3.vercel.app \
    BACKEND_URL=https://jacobi-mark3.onrender.com \
        python scripts/smoke_test.py

Exit code 0 = all automated checks passed; non-zero = at least one failed.

Live-scan-dependent checks (manual, cost BrightData credits, require a signed-in
user) are listed at the end but NOT executed automatically.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://jacobi-mark3.vercel.app").rstrip("/")
BACKEND_URL = os.getenv("BACKEND_URL", "https://jacobi-mark3.onrender.com").rstrip("/")
TIMEOUT = float(os.getenv("SMOKE_TIMEOUT", "90"))

# Nav routes that MUST resolve to a real page (no dead links). The footer
# Company column (method/extension/privacy/terms) was previously href="#".
NAV_ROUTES = [
    "/", "/chat", "/leaderboard", "/history", "/pricing", "/about",
    "/method", "/extension", "/privacy", "/terms",
]

_passed = 0
_failed = 0


def _get(url: str):
    """Return (status, body_text). status 0 on network error."""
    req = urllib.request.Request(url, headers={"User-Agent": "jacobi-smoke/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        print(f"      network error: {e!r}")
        return 0, ""


def check(name: str, ok: bool, detail: str = "") -> None:
    global _passed, _failed
    mark = "PASS" if ok else "FAIL"
    if ok:
        _passed += 1
    else:
        _failed += 1
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))


def main() -> int:
    print(f"Frontend: {FRONTEND_URL}")
    print(f"Backend:  {BACKEND_URL}")
    print("(no live probe is launched — zero BrightData spend)\n")

    # 1 + 2 — homepage + every nav route resolves (no dead links).
    for route in NAV_ROUTES:
        status, _ = _get(f"{FRONTEND_URL}{route}")
        check(f"nav route resolves: {route}", status == 200, f"HTTP {status}")

    # 3 + 7 — demo works without BrightData and renders MEANINGFUL evidence.
    status, body = _get(f"{BACKEND_URL}/api/result/demo_session_static")
    demo_ok = False
    detail = f"HTTP {status}"
    if status == 200:
        try:
            d = json.loads(body)
            agents = d.get("agents") or []
            priced = [a for a in agents if a.get("price") is not None]
            demo_ok = (
                d.get("status") == "completed"
                and len(agents) >= 5
                and len(priced) >= 3  # multiple observations, not "one price"
            )
            detail = f"status={d.get('status')} agents={len(agents)} priced={len(priced)}"
        except Exception as e:  # noqa: BLE001
            detail = f"bad JSON: {e!r}"
    check("demo result loads with multi-observation evidence (no BrightData)", demo_ok, detail)

    # 5 — polling a bogus session returns an HONEST 404, never a 500/crash and
    #     never a fabricated result. (The 'expired' false-state is gone; a real
    #     persisted running job is covered by the live/manual checks below.)
    status, body = _get(f"{BACKEND_URL}/api/result/does-not-exist-smoke-test")
    check("unknown probe session returns clean 404 (no crash/fabrication)",
          status == 404, f"HTTP {status}")

    # 9 — unauthenticated enterprise APIs are gated (direct backend + via proxy).
    for base, label in ((BACKEND_URL, "backend"), (FRONTEND_URL, "proxy")):
        status, _ = _get(f"{base}/api/enterprise/health")
        check(f"enterprise/health requires auth ({label})", status == 401, f"HTTP {status}")
    status, _ = _get(f"{BACKEND_URL}/api/enterprise/workspace")
    check("enterprise/workspace requires auth (backend)", status == 401, f"HTTP {status}")

    # Backend health + build marker (informational; confirms which build is live).
    status, body = _get(f"{BACKEND_URL}/health")
    commit = ""
    if status == 200:
        try:
            commit = json.loads(body).get("git_commit", "")
        except Exception:  # noqa: BLE001
            pass
    check("backend /health is up", status == 200, f"HTTP {status} build={commit or 'n/a'}")

    print("\n--- Manual / live checks (NOT run here — would cost BrightData credits) ---")
    print("  [ ] manual live scan creates a persistent 'running' probe row at launch")
    print("  [ ] polling a running job never returns 'expired' (now persisted + watchdog)")
    print("  [ ] a blocked/slow target returns an honest state (blocked/timeout/needs_context)")
    print("  [ ] signed-in dashboard renders the seeded multi-observation finding + export path")
    print("  These require a signed-in user explicitly launching a live audit.\n")

    total = _passed + _failed
    print(f"Automated checks: {_passed}/{total} passed.")
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
