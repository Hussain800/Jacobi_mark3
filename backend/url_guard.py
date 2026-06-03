"""SSRF guard for user-submitted target URLs.

JACOBI accepts arbitrary URLs from callers and then fetches them server-side
(BrightData submission and the direct-HTTP fallback in ``BrightDataMCPClient``).
Without a guard, a caller could point the backend at ``http://127.0.0.1``,
``http://169.254.169.254`` (cloud metadata), or an RFC-1918 host and read the
response — a classic SSRF.

``validate_public_url`` enforces, before any fetch:

  * scheme is ``http`` or ``https`` (blocks ``file://``, ``ftp://``,
    ``javascript:``, ``data:``, …),
  * a host is present and is not ``localhost`` / a known metadata name,
  * every IP the host resolves to is globally routable (rejects loopback,
    private, link-local, multicast, reserved and unspecified ranges, for both
    IPv4 and IPv4-mapped IPv6).

The resolver is injectable so the unit tests stay hermetic (no real DNS).

Residual risk (documented, not a launch blocker): DNS rebinding between this
check and the actual fetch. The direct-HTTP fallback additionally disables
redirect-following so a public URL cannot 302 into an internal address.
"""
from __future__ import annotations

import ipaddress
import socket
from typing import Callable, List
from urllib.parse import urlsplit

MAX_URL_LEN = 2048
ALLOWED_SCHEMES = ("http", "https")

# Hostnames that never resolve to something we want the server to reach.
_BLOCKED_HOSTNAMES = {
    "localhost",
    "ip6-localhost",
    "ip6-loopback",
    "metadata",
    "metadata.google.internal",
}

# Resolver returns the list of IP strings a hostname maps to.
Resolver = Callable[[str], List[str]]


class UnsafeUrlError(ValueError):
    """Raised when a URL is not a safe, public http(s) target."""


def _default_resolver(host: str) -> List[str]:
    infos = socket.getaddrinfo(host, None)
    return [info[4][0] for info in infos]


def _ip_is_public(ip: ipaddress._BaseAddress) -> bool:
    # Collapse IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) to the embedded IPv4
    # so the loopback/private checks below catch it.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _assert_ip_public(ip_str: str) -> None:
    ip_str = ip_str.split("%", 1)[0]  # strip IPv6 zone id if present
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError as exc:
        raise UnsafeUrlError(f"unparseable address: {ip_str!r}") from exc
    if not _ip_is_public(ip):
        raise UnsafeUrlError(f"non-public address blocked: {ip_str}")


def validate_public_url(url: str, *, resolver: Resolver = _default_resolver) -> str:
    """Return ``url`` unchanged if it is a safe public http(s) target.

    Raises ``UnsafeUrlError`` otherwise. ``resolver`` is injectable for tests.
    """
    if not url or not isinstance(url, str):
        raise UnsafeUrlError("missing URL")
    url = url.strip()
    if not url:
        raise UnsafeUrlError("empty URL")
    if len(url) > MAX_URL_LEN:
        raise UnsafeUrlError(f"URL too long ({len(url)} > {MAX_URL_LEN})")

    parts = urlsplit(url)
    scheme = (parts.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        raise UnsafeUrlError(f"scheme not allowed: {parts.scheme or '(none)'!r}")

    host = parts.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")
    host_l = host.lower().rstrip(".")
    if host_l in _BLOCKED_HOSTNAMES or host_l.endswith(".localhost"):
        raise UnsafeUrlError(f"blocked host: {host}")

    # Literal IP address? Validate it directly without resolving.
    try:
        ipaddress.ip_address(host_l)
    except ValueError:
        pass
    else:
        _assert_ip_public(host_l)
        return url

    # Hostname: resolve and validate every address it maps to. This also
    # catches decimal/octal/hex IP encodings (e.g. http://2130706433/) because
    # the resolver collapses them back to the real loopback/private address.
    try:
        ips = resolver(host)
    except UnsafeUrlError:
        raise
    except Exception as exc:
        raise UnsafeUrlError(f"could not resolve host: {host}") from exc
    if not ips:
        raise UnsafeUrlError(f"host did not resolve: {host}")
    for ip_str in ips:
        _assert_ip_public(ip_str)
    return url


def is_public_url(url: str, *, resolver: Resolver = _default_resolver) -> bool:
    """Boolean convenience wrapper around ``validate_public_url``."""
    try:
        validate_public_url(url, resolver=resolver)
        return True
    except UnsafeUrlError:
        return False
