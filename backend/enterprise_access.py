"""Role and permission helpers for enterprise price-integrity workspaces."""

from __future__ import annotations


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


def normalize_role(role: str | None) -> str:
    role = (role or "viewer").strip().lower()
    return role if role in VALID_ROLES else "viewer"


def has_permission(role: str | None, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(normalize_role(role), set())


def require_permission(role: str | None, permission: str) -> None:
    if not has_permission(role, permission):
        raise EnterprisePermissionError(f"{normalize_role(role)} cannot perform {permission}")
