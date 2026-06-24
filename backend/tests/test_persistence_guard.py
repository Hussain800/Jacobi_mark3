"""P0-1: fail-closed Supabase guard.

In production, enterprise persistence paths must NOT silently fall back to the
in-memory store when Supabase is unconfigured — they must surface a clear 503
so a misconfigured deploy fails loudly instead of serving ephemeral, per-process
data that looks live but is never persisted.
"""

import asyncio

import pytest

import enterprise_store
from enterprise_store import EnterpriseUnavailableError
from auth_user import get_optional_user
import main as M


def _as_user(user_id: str):
    return {"id": user_id, "email": f"{user_id}@example.test"}


def test_store_fails_closed_in_production_without_supabase(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setenv("ENTERPRISE_REQUIRE_SUPABASE", "1")
    enterprise_store._MEMORY_WORKSPACES.clear()
    with pytest.raises(EnterpriseUnavailableError):
        asyncio.run(enterprise_store.get_workspace("guard-user"))


def test_store_uses_memory_when_not_required(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setenv("ENTERPRISE_REQUIRE_SUPABASE", "0")
    enterprise_store._MEMORY_WORKSPACES.clear()
    workspace = asyncio.run(enterprise_store.get_workspace("memory-user"))
    assert isinstance(workspace, dict)
    assert "portfolio" in workspace
    enterprise_store._MEMORY_WORKSPACES.clear()


def test_api_returns_503_when_persistence_required_but_missing(client, monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setenv("ENTERPRISE_REQUIRE_SUPABASE", "1")
    enterprise_store._MEMORY_WORKSPACES.clear()
    M.app.dependency_overrides[get_optional_user] = lambda: _as_user("guard-api-user")
    try:
        response = client.get("/api/enterprise/workspace")
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "supabase_unconfigured"
    finally:
        M.app.dependency_overrides.pop(get_optional_user, None)
        enterprise_store._MEMORY_WORKSPACES.clear()
