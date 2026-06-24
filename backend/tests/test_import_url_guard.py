"""P1-3: import-time URL validation hardening.

`_safe_import_url_shape` now rejects hostnames that resolve to a non-public
address (not just IP literals), while still ALLOWING unresolvable demo domains
(*.example) because the live-scan worker re-validates every target with the
full SSRF guard before any fetch. Resolver is injected so tests stay hermetic.
"""

import pytest

from enterprise_store import _safe_import_url_shape


def _resolver_to(ips):
    return lambda host: list(ips)


def _resolver_fail(host):
    raise OSError("name does not resolve")


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://[::1]/",
    "http://0.0.0.0/",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "http://user:pass@example.com/",
    "http://localhost/",
    "http://foo.localhost/",
    "http://metadata.google.internal/",
    "http://metadata/",
    "",
])
def test_rejects_unsafe_urls_without_dns(url):
    # All deterministic (IP literals / scheme / blocked names) — no resolver needed.
    assert _safe_import_url_shape(url) is False


def test_rejects_hostname_resolving_to_private():
    assert _safe_import_url_shape("https://internal.corp/x", resolver=_resolver_to(["10.1.2.3"])) is False


def test_rejects_hostname_resolving_to_loopback_via_decimal_ip():
    # http://2130706433/ == 127.0.0.1 once the resolver collapses it.
    assert _safe_import_url_shape("http://2130706433/", resolver=_resolver_to(["127.0.0.1"])) is False


def test_rejects_hostname_with_any_private_resolution():
    # Reject if ANY resolved address is non-public (split-horizon / rebinding).
    assert _safe_import_url_shape("https://mixed.test/x", resolver=_resolver_to(["93.184.216.34", "10.0.0.5"])) is False


def test_allows_public_hostname():
    assert _safe_import_url_shape("https://example.com/p", resolver=_resolver_to(["93.184.216.34"])) is True


def test_allows_unresolvable_demo_domain():
    # Reserved demo domains don't resolve; the worker re-validates at fetch time.
    assert _safe_import_url_shape("https://megadeals.example/p/pro-wireless", resolver=_resolver_fail) is True
