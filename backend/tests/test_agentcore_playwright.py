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
