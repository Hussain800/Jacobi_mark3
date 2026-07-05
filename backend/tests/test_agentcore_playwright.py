"""
Tests for LocalPlaywrightProvider — real headless-Chromium evidence.

Skips entirely when playwright/chromium is not installed (optional dependency).
Serves the demo lodging fixture over a local http.server so we exercise real
navigation + JS-capable rendering without hitting the internet. url_guard blocks
localhost by design, so the happy-path test monkeypatches validate_public_url to
a no-op; the SSRF test restores the real guard and asserts it rejects.
"""

from __future__ import annotations

import functools
import http.server
import socketserver
import threading
from pathlib import Path

import pytest

from agentcore import playwright_provider as pp
from agentcore.playwright_provider import LocalPlaywrightProvider, is_available

pytestmark = pytest.mark.skipif(not is_available(), reason="playwright not installed")

_FIXTURE_DIR = Path(__file__).resolve().parents[1] / "agentcore" / "fixtures"


@pytest.fixture
def fixture_server():
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(_FIXTURE_DIR)
    )
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_collect_captures_real_browser_evidence(fixture_server, monkeypatch):
    # url_guard blocks localhost by design; tests observe a local fixture server.
    monkeypatch.setattr(pp, "validate_public_url", lambda url: None)

    url = f"{fixture_server}/lodging_listing.html"
    attempt = LocalPlaywrightProvider().collect(url, "listing")

    assert attempt.error is None, attempt.error

    kinds = {a.kind for a in attempt.artifacts}
    assert {"html", "screenshot", "network_summary"} <= kinds

    for a in attempt.artifacts:
        assert len(a.sha256) == 64

    screenshot = next(a for a in attempt.artifacts if a.kind == "screenshot")
    assert (screenshot.bytes or 0) > 1000

    # data-attr extractor pass runs on the rendered DOM.
    totals = [
        e for e in attempt.extractions
        if e.field == "displayed_total"
        and isinstance(e.value, dict)
        and e.value.get("amount") == 2180
    ]
    assert totals, attempt.extractions

    caps = attempt.capabilities
    assert caps.js_render is True
    assert caps.real_ip_geolocation is False
    assert any("real IP geography" in lim for lim in attempt.limitations)


def test_unsafe_url_rejected(monkeypatch):
    # Restore the REAL guard (fixture monkeypatch is per-test, so nothing to undo
    # here — this test simply never patches it and hits a private address).
    attempt = LocalPlaywrightProvider().collect("http://127.0.0.1/", "listing")
    assert attempt.error is not None
    assert attempt.artifacts == []


def test_redirect_to_private_address_rejected(monkeypatch):
    # A public-looking URL that 302s to a private address must be dropped
    # AFTER navigation too (redirect TOCTOU guard), with no artifacts kept.
    import http.server
    import threading

    class Redirector(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/private":
                body = b"<html><body>internal</body></html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(302)
                self.send_header("Location", "/private")
                self.end_headers()

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), Redirector)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    start_url = f"http://127.0.0.1:{srv.server_port}/page"

    from agentcore import playwright_provider as pp
    from url_guard import UnsafeUrlError

    real_guard_error = UnsafeUrlError

    def selective_guard(url):
        # allow the start path; reject the redirect landing path — stands in
        # for a public URL 302ing to a private/metadata address
        if "/private" in url:
            raise real_guard_error(f"non-public address blocked in test: {url}")

    monkeypatch.setattr(pp, "validate_public_url", selective_guard)
    try:
        attempt = pp.LocalPlaywrightProvider().collect(start_url, "listing")
    finally:
        srv.shutdown()

    assert attempt.error is not None and "redirect" in attempt.error
    assert attempt.artifacts == []
