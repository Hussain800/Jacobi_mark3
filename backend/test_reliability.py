"""
JACOBI Reliability Test Suite
Tests: rate limiting, 404 handling, CORS, input validation, session cleanup, error format, restart recovery
"""
import asyncio
import httpx
import json
import sys
import os
import signal
import subprocess
import time
from pathlib import Path

BASE = "http://localhost:8000"
RESULTS = {}

async def test_rate_limiting(client: httpx.AsyncClient):
    """Call POST /api/probe 6 times rapidly. 6th should return 429."""
    print("\n[TEST] Rate limiting — 6 rapid POST /api/probe requests...")
    body = {"target_url": "https://example.com", "target_name": "test"}
    statuses = []
    retry_after = None

    for i in range(6):
        try:
            resp = await client.post(f"{BASE}/api/probe", json=body, timeout=10.0)
            statuses.append(resp.status_code)
            if resp.status_code == 429:
                retry_after = resp.headers.get("retry-after")
                print(f"  Request {i+1}: HTTP {resp.status_code}, Retry-After: {retry_after}")
                body_text = resp.text[:200]
                print(f"  Body: {body_text}")
            elif resp.status_code == 200:
                data = resp.json()
                print(f"  Request {i+1}: HTTP {resp.status_code} — session_id={data.get('session_id','?')}")
            else:
                print(f"  Request {i+1}: HTTP {resp.status_code} — {resp.text[:100]}")
        except httpx.TimeoutException:
            print(f"  Request {i+1}: TIMEOUT")
            statuses.append("TIMEOUT")
        except Exception as e:
            print(f"  Request {i+1}: ERROR {e}")
            statuses.append("ERROR")

    # Check: first 5 should be 200 (or at least not 429), 6th should be 429
    first_five_ok = all(s == 200 for s in statuses[:5])
    sixth_is_429 = statuses[5] == 429
    has_retry_after = retry_after is not None

    passed = first_five_ok and sixth_is_429 and has_retry_after
    detail = f"Statuses: {statuses[:5]}...6th={statuses[5]}, Retry-After={retry_after}"
    RESULTS["rate_limiting"] = {"passed": passed, "detail": detail}
    return passed


async def test_404_handling(client: httpx.AsyncClient):
    """GET /api/result/nonexistent123 should return 404, not crash."""
    print("\n[TEST] 404 handling — GET /api/result/nonexistent123...")
    try:
        resp = await client.get(f"{BASE}/api/result/nonexistent123", timeout=5.0)
        body = resp.json() if resp.text else {}
        print(f"  Status: {resp.status_code}, Body: {body}")
        passed = resp.status_code == 404 and "detail" in body
        detail = f"HTTP {resp.status_code}, detail={'detail' in body}"
        RESULTS["404_handling"] = {"passed": passed, "detail": detail}
        return passed
    except Exception as e:
        print(f"  ERROR: {e}")
        RESULTS["404_handling"] = {"passed": False, "detail": str(e)}
        return False


async def test_cors_headers(client: httpx.AsyncClient):
    """GET /api/demo with Origin: https://example.com — check ACAO present."""
    print("\n[TEST] CORS headers — GET /api/demo with Origin header...")
    try:
        resp = await client.get(f"{BASE}/api/demo", headers={"Origin": "https://example.com"}, timeout=5.0)
        acao = resp.headers.get("access-control-allow-origin")
        print(f"  Status: {resp.status_code}, Access-Control-Allow-Origin: {acao}")
        passed = resp.status_code == 200 and acao is not None
        detail = f"ACAO={acao}"
        RESULTS["cors_headers"] = {"passed": passed, "detail": detail}
        return passed
    except Exception as e:
        print(f"  ERROR: {e}")
        RESULTS["cors_headers"] = {"passed": False, "detail": str(e)}
        return False


async def test_input_validation(client: httpx.AsyncClient):
    """POST /api/probe with empty body — should return 422, not 500."""
    print("\n[TEST] Input validation — POST /api/probe with empty body...")
    try:
        resp = await client.post(f"{BASE}/api/probe", content="", headers={"Content-Type": "application/json"}, timeout=5.0)
        body = resp.json() if resp.text else {}
        print(f"  Status: {resp.status_code}, Body: {json.dumps(body)[:200]}")
        passed = resp.status_code == 422
        detail = f"HTTP {resp.status_code}"
        RESULTS["input_validation"] = {"passed": passed, "detail": detail}
        return passed
    except Exception as e:
        print(f"  ERROR: {e}")
        RESULTS["input_validation"] = {"passed": False, "detail": str(e)}
        return False

    # Also test invalid JSON
    print("  Additional test: POST with malformed JSON...")
    try:
        resp = await client.post(f"{BASE}/api/probe", content="not json at all", headers={"Content-Type": "application/json"}, timeout=5.0)
        print(f"  Status: {resp.status_code}, Body: {resp.text[:200]}")
        # Should also be 422 (FastAPI validation)
        passed2 = resp.status_code == 422
        if not passed:
            passed = passed2
            RESULTS["input_validation"]["passed"] = passed
    except Exception as e:
        print(f"  ERROR: {e}")


async def test_session_cleanup():
    """Verify cleanup_expired_sessions background task exists in code."""
    print("\n[TEST] Session cleanup — checking code for cleanup_expired_sessions...")
    main_py = Path(r"C:\Users\wasif\OneDrive\Desktop\aegisagent\Jacobi\backend\main.py")
    if not main_py.exists():
        RESULTS["session_cleanup"] = {"passed": False, "detail": "main.py not found"}
        return False

    code = main_py.read_text()
    checks = [
        "cleanup_expired_sessions" in code,
        "MAX_SESSION_AGE_SECONDS" in code,
        "MAX_SESSION_ENTRIES" in code,
        "asyncio.create_task(cleanup_expired_sessions())" in code,
        "SESSION_STORE:" in code or "SESSION_STORE =" in code,
    ]
    print(f"  cleanup_expired_sessions def: {'cleanup_expired_sessions' in code}")
    print(f"  MAX_SESSION_AGE_SECONDS defined: {'MAX_SESSION_AGE_SECONDS' in code}")
    print(f"  MAX_SESSION_ENTRIES defined: {'MAX_SESSION_ENTRIES' in code}")
    print(f"  Background task created: {'asyncio.create_task(cleanup_expired_sessions())' in code}")
    print(f"  SESSION_STORE declared: {'SESSION_STORE:' in code or 'SESSION_STORE =' in code}")

    passed = all(checks)
    detail = f"All {sum(1 for c in checks if c)}/5 checks passed"
    RESULTS["session_cleanup"] = {"passed": passed, "detail": detail}
    return passed


async def test_error_response_format(client: httpx.AsyncClient):
    """Check error responses include 'detail' field."""
    print("\n[TEST] Error response format — checking detail field in errors...")
    endpoints = [
        ("GET", f"{BASE}/api/result/nonexistent123", None),
        ("POST", f"{BASE}/api/probe", ""),
        ("GET", f"{BASE}/api/badge/nonexistent", None),
    ]
    all_have_detail = True
    details = []

    for method, url, body in endpoints:
        try:
            if method == "GET":
                resp = await client.get(url, timeout=5.0)
            else:
                resp = await client.post(url, content=body or "", headers={"Content-Type": "application/json"}, timeout=5.0)

            resp_body = resp.json() if resp.text else {}
            has_detail = "detail" in resp_body
            print(f"  {method} {url} → HTTP {resp.status_code}, has detail: {has_detail}")
            if not has_detail:
                all_have_detail = False
                details.append(f"{method} {url}: no detail field")
        except Exception as e:
            print(f"  {method} {url}: ERROR {e}")
            all_have_detail = False
            details.append(f"{method} {url}: {e}")

    passed = all_have_detail
    RESULTS["error_response_format"] = {"passed": passed, "detail": "; ".join(details) if details else "All have detail field"}
    return passed


async def test_restart_recovery():
    """Stop and restart backend, verify it works after restart."""
    print("\n[TEST] Restart recovery — stopping and restarting backend...")

    # Kill existing processes
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/F", "/IM", "python.exe"], capture_output=True, timeout=10)
    else:
        subprocess.run(["pkill", "-f", "uvicorn"], capture_output=True, timeout=10)
    
    await asyncio.sleep(3)

    # Verify it's down
    try:
        async with httpx.AsyncClient() as c:
            await c.get(f"{BASE}/health", timeout=3.0)
        print("  Backend still running — skipping kill")
    except:
        print("  Backend successfully stopped")

    # Restart
    print("  Starting backend...")
    log_file = open("uvicorn_reliability.log", "w")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "warning"],
        cwd=r"C:\Users\wasif\OneDrive\Desktop\aegisagent\Jacobi\backend",
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    await asyncio.sleep(5)

    # Test that it works
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.get(f"{BASE}/health", timeout=5.0)
            data = resp.json()
            print(f"  Health check: HTTP {resp.status_code}, status={data.get('status','?')}")

        # Also test demo endpoint works
        resp = await c.get(f"{BASE}/api/demo", timeout=5.0)
        print(f"  Demo endpoint: HTTP {resp.status_code}")

        # Test 404 still works
        resp = await c.get(f"{BASE}/api/result/nonexistent_after_restart", timeout=5.0)
        print(f"  404 check: HTTP {resp.status_code}")

        passed = resp.status_code == 404
        detail = f"Health={resp.status_code if resp else 'failed'}"
        RESULTS["restart_recovery"] = {"passed": passed, "detail": detail}
        return passed
    except Exception as e:
        print(f"  Restart failed: {e}")
        RESULTS["restart_recovery"] = {"passed": False, "detail": str(e)}
        return False
    finally:
        log_file.close()


async def main():
    print("=" * 60)
    print("JACOBI — Reliability Test Suite")
    print("=" * 60)

    # Session cleanup test (doesn't need server)
    await test_session_cleanup()

    # Tests that need server
    try:
        async with httpx.AsyncClient() as client:
            # Quick health check
            health = await client.get(f"{BASE}/health", timeout=5.0)
            print(f"\nHealth: {health.json()}")

            await test_rate_limiting(client)
            await test_404_handling(client)
            await test_cors_headers(client)
            await test_input_validation(client)
            await test_error_response_format(client)

    except Exception as e:
        print(f"\nERROR connecting to backend: {e}")
        print("Make sure the backend is running on http://localhost:8000")
        for k in ["rate_limiting", "404_handling", "cors_headers", "input_validation", "error_response_format"]:
            if k not in RESULTS:
                RESULTS[k] = {"passed": False, "detail": f"Backend unreachable: {e}"}

    # Restart recovery test
    await test_restart_recovery()

    # Print summary
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    all_pass = True
    for test_name in [
        "rate_limiting", "404_handling", "cors_headers", "input_validation",
        "session_cleanup", "error_response_format", "restart_recovery"
    ]:
        r = RESULTS.get(test_name, {"passed": False, "detail": "Not tested"})
        status = "PASS" if r["passed"] else "FAIL"
        if not r["passed"]:
            all_pass = False
        print(f"  {test_name:25s}: {status}  ({r['detail']})")

    print(f"\n  Overall: {'ALL PASSED' if all_pass else 'SOME FAILED'}")
    return all_pass


if __name__ == "__main__":
    passed = asyncio.run(main())
    sys.exit(0 if passed else 1)
