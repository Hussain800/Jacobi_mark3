"""
Jacobi for Agents — production-beta persistence + PDF export tests.

Covers MemoryRepo roundtrip + org isolation + FIFO bound, get_repo() selection
and the no-silent-fallback RuntimeError, PDF byte structure for both a
fixture-drift envelope and a blocked-route (no-artifact) envelope, and a
skipped-by-default Supabase integration test.
"""

from __future__ import annotations

import os

import pytest

from agentcore import engine
from agentcore import storage
from agentcore.pdf_export import build_evidence_pdf
from agentcore.storage import (
    MemoryRepo,
    get_repo,
    reset_repo_for_tests,
)


# ── MemoryRepo ────────────────────────────────────────────────────────────────

def test_memory_repo_roundtrip_both_kinds():
    repo = MemoryRepo()
    env = engine.run_verify(demo="fee_drift")
    man = engine.get_manifest(env.evidence.manifest_id)

    repo.save_decision(env, org="org_a")
    repo.save_manifest(man, org="org_a")

    got_env = repo.get_decision(env.request_id, org="org_a")
    got_man = repo.get_manifest(man.manifest_id, org="org_a")

    assert got_env is not None and got_env.request_id == env.request_id
    assert got_man is not None and got_man.manifest_id == man.manifest_id
    assert got_man.manifest_sha256 == man.manifest_sha256


def test_memory_repo_cross_org_returns_none():
    repo = MemoryRepo()
    env = engine.run_verify(demo="fee_drift")
    man = engine.get_manifest(env.evidence.manifest_id)
    repo.save_decision(env, org="org_a")
    repo.save_manifest(man, org="org_a")

    # Same ids, wrong org → not visible (org scoping is the ACL).
    assert repo.get_decision(env.request_id, org="org_b") is None
    assert repo.get_manifest(man.manifest_id, org="org_b") is None


def test_memory_repo_fifo_bound():
    repo = MemoryRepo()
    first = engine.run_verify(demo="fee_drift")
    repo.save_decision(first, org="org_a")

    # Fill past the 500 cap; the first-inserted key must be evicted.
    for _ in range(501):
        env = engine.run_verify(demo="fee_drift")
        repo.save_decision(env, org="org_a")

    assert repo.get_decision(first.request_id, org="org_a") is None


# ── get_repo() selection ──────────────────────────────────────────────────────

def test_get_repo_default_memory(monkeypatch):
    monkeypatch.delenv("JACOBI_AGENT_STORAGE", raising=False)
    reset_repo_for_tests()
    try:
        assert isinstance(get_repo(), MemoryRepo)
    finally:
        reset_repo_for_tests()


def test_get_repo_supabase_without_creds_raises(monkeypatch):
    monkeypatch.setenv("JACOBI_AGENT_STORAGE", "supabase")
    monkeypatch.setattr(storage, "get_supabase", lambda: None)
    reset_repo_for_tests()
    try:
        with pytest.raises(RuntimeError, match="Supabase is not configured"):
            get_repo()
    finally:
        reset_repo_for_tests()


# ── PDF export ────────────────────────────────────────────────────────────────

def test_pdf_fixture_drift_renders():
    env = engine.run_verify(demo="fee_drift")
    man = engine.get_manifest(env.evidence.manifest_id)
    pdf = build_evidence_pdf(env, man)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 2000


def test_pdf_blocked_route_no_artifacts_renders():
    # Blocked route → no collection attempts → manifest with no artifacts.
    env = engine.run_verify(demo="blocked_route")
    man = engine.get_manifest(env.evidence.manifest_id)
    assert man.artifacts == []
    pdf = build_evidence_pdf(env, man)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 2000


def test_pdf_without_manifest_renders():
    env = engine.run_verify(demo="fee_drift")
    pdf = build_evidence_pdf(env, None)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 2000


# ── SupabaseRepo integration (skipped unless creds + table present) ───────────

@pytest.mark.skipif(
    not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY")),
    reason="no supabase creds",
)
def test_supabase_repo_integration():
    from agentcore.storage import SupabaseRepo

    try:
        repo = SupabaseRepo()
    except RuntimeError as exc:
        pytest.skip(f"supabase not configured: {exc}")

    env = engine.run_verify(demo="fee_drift")
    env.request_id = "test_ci_" + env.request_id  # namespaced so cleanup is safe

    try:
        repo.save_decision(env, org="org_ci_a")
    except Exception as exc:  # table may not be migrated yet (orchestrator runs it in parallel)
        msg = str(exc).lower()
        if "agent_provenance_records" in msg or "does not exist" in msg or "relation" in msg:
            pytest.skip("table not migrated yet")
        raise

    try:
        got = repo.get_decision(env.request_id, org="org_ci_a")
        assert got is not None and got.request_id == env.request_id
        # Wrong org → not visible.
        assert repo.get_decision(env.request_id, org="org_ci_b") is None
    finally:
        repo._client.table("agent_provenance_records").delete().eq(
            "record_id", env.request_id
        ).execute()
