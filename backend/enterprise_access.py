"""Role and permission helpers for enterprise price-integrity workspaces."""

from __future__ import annotations

from dataclasses import dataclass

ROLE_PERMISSIONS = {
    "owner": {
        "workspace.read",
        "watchlist.write",
        "scan.write",
        "evidence.export",
        "share.write",
        "member.manage",
    },
    "admin": {
        "workspace.read",
        "watchlist.write",
        "scan.write",
        "evidence.export",
        "share.write",
        "member.manage",
    },
    "analyst": {
        "workspace.read",
        "watchlist.write",
        "scan.write",
        "evidence.export",
        "share.write",
    },
    "viewer": {
        "workspace.read",
    },
}


VALID_ROLES = set(ROLE_PERMISSIONS)


class EnterprisePermissionError(PermissionError):
    """Raised when a workspace member lacks a required enterprise permission."""


class EnterpriseContextError(EnterprisePermissionError):
    """Raised when an enterprise access edge lacks actor or organization scope."""


@dataclass(frozen=True)
class EnterpriseContext:
    """The minimum authorization context required by enterprise data access.

    Public store functions retain their historical ``user_id`` signatures for
    route compatibility, but internal reads/writes must carry this context once
    their organization is resolved.  Keeping actor and organization together
    makes it harder for a later query to accidentally omit one side of the
    tenant boundary.
    """

    actor_user_id: str
    organization_id: str
    role: str

    def __post_init__(self) -> None:
        if not str(self.actor_user_id or "").strip():
            raise EnterpriseContextError("Enterprise actor context is required")
        if not str(self.organization_id or "").strip():
            raise EnterpriseContextError("Enterprise organization context is required")
        object.__setattr__(self, "actor_user_id", str(self.actor_user_id).strip())
        object.__setattr__(self, "organization_id", str(self.organization_id).strip())
        object.__setattr__(self, "role", normalize_role(self.role))

    def require(self, permission: str) -> None:
        require_permission(self.role, permission)

    def assert_organization(self, organization_id: str | None) -> None:
        if str(organization_id or "") != self.organization_id:
            raise EnterpriseContextError("Organization not found")


def normalize_role(role: str | None) -> str:
    role = (role or "viewer").strip().lower()
    return role if role in VALID_ROLES else "viewer"


def has_permission(role: str | None, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(normalize_role(role), set())


def require_permission(role: str | None, permission: str) -> None:
    if not has_permission(role, permission):
        raise EnterprisePermissionError(f"{normalize_role(role)} cannot perform {permission}")
