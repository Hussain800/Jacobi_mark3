"""Unit tests for the SSRF guard (url_guard.validate_public_url).

Hermetic: DNS is stubbed via an injectable resolver so no real network calls
happen. Literal-IP cases short-circuit before the resolver is consulted.
"""
import pytest

from url_guard import UnsafeUrlError, is_public_url, validate_public_url

# Simulated DNS. Anything not in the map raises (NXDOMAIN-like).
_DNS = {
    "example.com": ["93.184.216.34"],
    "www.amazon.ae": ["18.155.68.10"],
    "www.booking.com": ["104.16.103.20"],
    "evil-internal.test": ["10.1.2.3"],          # public name → private IP (DNS rebinding-style)
    "loopback-name.test": ["127.0.0.1"],
    "2130706433": ["127.0.0.1"],                  # decimal-encoded loopback
    "dual.test": ["93.184.216.34", "10.0.0.9"],  # one public + one private → must block
}


def _resolver(host):
    try:
        return _DNS[host]
    except KeyError:
        raise OSError(f"NXDOMAIN: {host}")


# --- URLs that MUST be rejected -------------------------------------------
BLOCKED = [
    "",
    "   ",
    "not-a-url",
    "http://",
    "http:///no-host",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://localhost/",
    "http://localhost:8000/admin",
    "https://LocalHost/",
    "http://something.localhost/",
    "http://metadata.google.internal/",
    "http://127.0.0.1/",
    "http://127.0.0.1:9/",
    "https://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://2130706433/",          # decimal loopback (via resolver)
    "http://evil-internal.test/",  # resolves to RFC-1918
    "http://loopback-name.test/",  # resolves to loopback
    "http://dual.test/",           # one of the A records is private
    "http://example.com/" + "a" * 3000,  # too long
]


@pytest.mark.parametrize("url", BLOCKED)
def test_blocked_urls_raise(url):
    with pytest.raises(UnsafeUrlError):
        validate_public_url(url, resolver=_resolver)
    assert is_public_url(url, resolver=_resolver) is False


# --- URLs that MUST be allowed --------------------------------------------
ALLOWED = [
    "http://example.com/",
    "https://www.amazon.ae/dp/B0FL4HLJ56/",
    "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html",
    "http://1.1.1.1/",              # literal public IP, no DNS needed
    "https://8.8.8.8/resolve",      # literal public IP
]


@pytest.mark.parametrize("url", ALLOWED)
def test_allowed_urls_pass(url):
    assert validate_public_url(url, resolver=_resolver) == url
    assert is_public_url(url, resolver=_resolver) is True


def test_unresolvable_host_blocked():
    with pytest.raises(UnsafeUrlError):
        validate_public_url("http://nonexistent.invalid/", resolver=_resolver)


def test_returns_original_url_unchanged():
    url = "https://www.amazon.ae/dp/B0FL4HLJ56/?ref=foo&x=1"
    assert validate_public_url(url, resolver=_resolver) == url
