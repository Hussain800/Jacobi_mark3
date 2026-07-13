"""Search-scoped capability tokens for anonymous travel results."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


DEFAULT_CAPABILITY_TTL_SECONDS = 900


def capability_hash(token: str) -> str:
    if not isinstance(token, str) or not token:
        raise ValueError("capability token is required")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class IssuedCapability:
    token: str
    token_hash: str
    expires_at: datetime


def issue_capability(*, ttl_seconds: int = DEFAULT_CAPABILITY_TTL_SECONDS) -> IssuedCapability:
    if not 60 <= ttl_seconds <= 86_400:
        raise ValueError("capability TTL must be between 60 seconds and 24 hours")
    token = secrets.token_urlsafe(32)
    return IssuedCapability(
        token=token,
        token_hash=capability_hash(token),
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
    )


def verify_capability(
    token: str | None,
    expected_hash: str | None,
    expires_at: datetime,
    *,
    now: datetime | None = None,
) -> bool:
    if not token or not expected_hash:
        return False
    checked_at = now or datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= checked_at:
        return False
    try:
        actual = capability_hash(token)
    except ValueError:
        return False
    return secrets.compare_digest(actual, expected_hash)
