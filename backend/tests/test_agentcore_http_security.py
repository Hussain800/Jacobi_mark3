"""Security regression tests for the zero-cost Agentcore HTTP provider."""

from contextlib import contextmanager

import pytest

from agentcore import providers
from agentcore.providers import LocalHttpProvider
from url_guard import UnsafeUrlError


class _Response:
    def __init__(self, url, status=200, headers=None, chunks=()):
        self.url = url
        self.status_code = status
        self.headers = headers or {}
        self._chunks = chunks

    def iter_bytes(self):
        yield from self._chunks


def test_redirect_target_is_revalidated_before_second_request(monkeypatch):
    requested = []
    validated = []

    def validate(url):
        validated.append(url)
        if url.startswith("http://127.0.0.1"):
            raise UnsafeUrlError("loopback blocked")
        return url

    @contextmanager
    def fake_stream(_method, url, **_kwargs):
        requested.append(url)
        yield _Response(url, status=302, headers={"location": "http://127.0.0.1/admin"})

    monkeypatch.setattr(providers, "validate_public_url", validate)
    monkeypatch.setattr(providers.httpx, "stream", fake_stream)

    result = LocalHttpProvider().collect("https://public.example/product", "listing")

    assert requested == ["https://public.example/product"]
    assert validated == ["https://public.example/product", "http://127.0.0.1/admin"]
    assert result.error.startswith("unsafe url rejected")
    assert result.artifacts == []


def test_response_body_is_bounded_before_artifact_write(monkeypatch, tmp_path):
    @contextmanager
    def fake_stream(_method, url, **_kwargs):
        yield _Response(url, chunks=[b"a" * 8, b"b" * 8])

    monkeypatch.setattr(providers, "validate_public_url", lambda url: url)
    monkeypatch.setattr(providers.httpx, "stream", fake_stream)
    monkeypatch.setattr(providers, "_artifact_dir", lambda: tmp_path)
    monkeypatch.setenv("JACOBI_HTTP_MAX_BYTES", "10")

    result = LocalHttpProvider().collect("https://public.example/product", "listing")

    assert "response too large" in result.error
    assert result.artifacts == []
    assert list(tmp_path.iterdir()) == []


def test_safe_redirect_and_small_html_remain_supported(monkeypatch, tmp_path):
    responses = iter([
        _Response("https://public.example/start", status=302, headers={"location": "/product"}),
        _Response(
            "https://public.example/product",
            headers={"content-type": "text/html"},
            chunks=[b"<html><body>AED 1,499</body></html>"],
        ),
    ])

    @contextmanager
    def fake_stream(_method, _url, **_kwargs):
        yield next(responses)

    monkeypatch.setattr(providers, "validate_public_url", lambda url: url)
    monkeypatch.setattr(providers.httpx, "stream", fake_stream)
    monkeypatch.setattr(providers, "_artifact_dir", lambda: tmp_path)

    result = LocalHttpProvider().collect("https://public.example/start", "listing")

    assert result.error is None
    assert result.final_url == "https://public.example/product"
    assert result.artifacts[0].bytes < 100
    assert result.extractions


@pytest.mark.parametrize("location", ["", "javascript:alert(1)"])
def test_invalid_redirect_location_fails_closed(monkeypatch, location):
    @contextmanager
    def fake_stream(_method, url, **_kwargs):
        yield _Response(url, status=302, headers={"location": location})

    monkeypatch.setattr(providers, "validate_public_url", lambda url: url)
    monkeypatch.setattr(providers.httpx, "stream", fake_stream)
    result = LocalHttpProvider().collect("https://public.example/start", "listing")
    assert result.error
    assert result.artifacts == []
