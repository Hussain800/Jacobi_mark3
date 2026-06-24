"""P1-2: backend Sentry wiring is fail-safe and scrubs sensitive request data."""

import main as M


def test_sentry_before_send_strips_sensitive_request_data():
    event = {
        "request": {
            "url": "https://api.example/x",
            "headers": {"authorization": "Bearer secret", "cookie": "s=1"},
            "cookies": {"s": "1"},
            "data": {"password": "y"},
            "query_string": "token=abc",
        },
        "level": "error",
    }
    out = M._sentry_before_send(event, {})
    req = out["request"]
    assert "headers" not in req
    assert "cookies" not in req
    assert "data" not in req
    assert req["query_string"] == "[stripped]"
    assert req["url"] == "https://api.example/x"  # non-sensitive fields preserved
    assert out["level"] == "error"


def test_init_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert M._init_sentry() is False
