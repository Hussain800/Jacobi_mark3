"""Access primitives for the travel Market Graph persistence boundary."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from typing import Optional


class TravelPersistenceError(RuntimeError):
    """Base class for travel persistence failures."""


class PersistenceConfigurationError(TravelPersistenceError):
    """Raised when the selected persistence backend is unsafe or unavailable."""


class AccessDeniedError(TravelPersistenceError):
    """Raised when a write is attempted outside the caller's search scope."""


@dataclass(frozen=True)
class AccessContext:
    """Repository access supplied by a user, capability holder, or worker.

    ``service`` is reserved for trusted backend workers. API handlers must build
    owner or capability contexts from validated authentication material rather
    than accepting this flag from request data.
    """

    owner_id: Optional[str] = None
    capability_token: Optional[str] = None
    service: bool = False

    def __post_init__(self) -> None:
        owner = _optional_identifier(self.owner_id, "owner id")
        token = _optional_token(self.capability_token)
        if self.service and (owner is not None or token is not None):
            raise ValueError("service access cannot be combined with user credentials")
        if not self.service and owner is None and token is None:
            raise ValueError("access requires an owner id or capability token")
        object.__setattr__(self, "owner_id", owner)
        object.__setattr__(self, "capability_token", token)

    @classmethod
    def for_owner(cls, owner_id: str) -> "AccessContext":
        return cls(owner_id=owner_id)

    @classmethod
    def for_capability(cls, capability_token: str) -> "AccessContext":
        return cls(capability_token=capability_token)

    @classmethod
    def for_service(cls) -> "AccessContext":
        return cls(service=True)


def issue_capability_token() -> str:
    """Return a high-entropy opaque token suitable for one search capability."""

    return secrets.token_urlsafe(32)


def hash_capability_token(token: str) -> str:
    """Hash an opaque capability; raw tokens are never persisted."""

    normalized = _optional_token(token)
    if normalized is None:
        raise ValueError("capability token must not be blank")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def capability_matches(token: Optional[str], expected_hash: Optional[str]) -> bool:
    """Constant-time comparison of a supplied capability against its digest."""

    if not token or not expected_hash:
        return False
    try:
        actual_hash = hash_capability_token(token)
    except ValueError:
        return False
    return hmac.compare_digest(actual_hash, str(expected_hash))


def normalize_identifier(value: str, label: str = "record id") -> str:
    normalized = str(value).strip()
    if not normalized:
        raise ValueError(f"{label} must not be blank")
    if len(normalized) > 200:
        raise ValueError(f"{label} must be 200 characters or fewer")
    return normalized


def _optional_identifier(value: Optional[str], label: str) -> Optional[str]:
    return normalize_identifier(value, label) if value is not None else None


def _optional_token(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    if len(normalized) > 4096:
        raise ValueError("capability token is too long")
    return normalized
