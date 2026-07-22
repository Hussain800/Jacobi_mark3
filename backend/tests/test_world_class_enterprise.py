"""Focused enterprise persistence/disclosure regressions for the lane-3 boundary."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

import enterprise_store
from enterprise_access import EnterpriseContext, EnterpriseContextError
from enterprise_reports import redact_packet


def _reset_store() -> None:
    enterprise_store._MEMORY_WORKSPACES.clear()
    enterprise_store._ENTERPRISE_SCAN_RATE_BUCKETS.clear()


def _seed_finding(user_id: str) -> tuple[str, str]:
    created = asyncio.run(enterprise_store.create_watchlist(user_id, {"name": "W"}))
    watchlist_id = created["created_watchlist"]["id"]
    csv_text = "\n".join([
        "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct",
        "Pro Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/x,US,176,92",
    ])
    asyncio.run(enterprise_store.import_watchlist_items(user_id, watchlist_id, csv_text))
    scan = asyncio.run(enterprise_store.launch_scan_job(
        user_id,
        {"watchlist_id": watchlist_id, "limit": 10, "run_mode": "imported"},
    ))
    return scan["findings"][0]["id"], watchlist_id


def test_context_requires_actor_and_organization():
    with pytest.raises(EnterpriseContextError):
        EnterpriseContext("", "org-1", "owner")
    with pytest.raises(EnterpriseContextError):
        EnterpriseContext("user-1", "", "owner")


def test_memory_fallback_does_not_treat_missing_membership_as_viewer(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _reset_store()
    workspace = enterprise_store._workspace_for_user("owner")
    enterprise_store._MEMORY_WORKSPACES["attacker"] = workspace
    try:
        with pytest.raises(enterprise_store.EnterpriseAccessError):
            asyncio.run(enterprise_store.get_workspace("attacker"))
    finally:
        _reset_store()


def test_redacted_packet_is_allowlisted_and_stable_for_new_internal_fields():
    packet = {
        "organization": {"id": "org-1", "name": "Acme"},
        "finding": {"id": "finding-1", "status": "new", "observed_price": 10, "secret": "drop"},
        "product": {"id": "product-1", "name": "Widget", "internal_notes": "drop"},
        "seller": {"id": "seller-1", "name": "Seller", "domain": "seller.example", "authorization_status": "drop"},
        "watchlist_item": {"id": "item-1", "target_url": "https://seller.example/x", "private": "drop"},
        "evidence_items": [{
            "id": "evidence-1", "target_url": "https://seller.example/x?secret=drop",
            "observed_price": 10, "probe_session_id": "private", "metadata": {
                "market": "US", "coverage_pct": 92, "extraction_evidence": "drop",
            },
        }],
        "future_internal_column": "drop",
    }
    out = redact_packet(packet, redacted=True)
    assert out["organization"] == {"name": "Acme"}
    assert out["finding"] == {"status": "new", "observed_price": 10}
    assert out["seller"] == {"name": "Seller", "domain": "seller.example"}
    assert out["watchlist_item"]["target_url"] == "seller.example"
    assert out["evidence_items"][0]["target_url"] == "seller.example"
    assert out["evidence_items"][0]["probe_session_id"] is None
    assert out["evidence_items"][0]["metadata"] == {"market": "US", "coverage_pct": 92}
    assert "future_internal_column" not in out


def test_anonymous_share_tokens_are_always_redacted(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _reset_store()
    user_id = "share-redaction-owner"
    finding_id, _ = _seed_finding(user_id)
    try:
        with pytest.raises(enterprise_store.EnterpriseValidationError):
            asyncio.run(enterprise_store.create_share_token(user_id, finding_id, redacted=False))
        share = asyncio.run(enterprise_store.create_share_token(user_id, finding_id, redacted=True))
        row = enterprise_store._workspace_for_user(user_id)["share_tokens"][0]
        row["redacted"] = False
        packet = asyncio.run(enterprise_store.get_shared_finding_packet(share["token"]))
        assert packet["redacted"] is True
        assert "organization_id" not in packet["packet"].get("organization", {})
        assert "id" not in packet["packet"].get("finding", {})
    finally:
        _reset_store()


@pytest.mark.parametrize("field", ["expires_at", "revoked_at"])
def test_invalid_share_is_rejected_before_packet_retrieval(monkeypatch, field):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _reset_store()
    user_id = "share-owner"
    finding_id, _ = _seed_finding(user_id)
    share = asyncio.run(enterprise_store.create_share_token(user_id, finding_id))
    row = enterprise_store._workspace_for_user(user_id)["share_tokens"][0]
    if field == "expires_at":
        row[field] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    else:
        row[field] = datetime.now(timezone.utc).isoformat()

    def should_not_load_packet(*args, **kwargs):
        raise AssertionError("packet retrieval occurred before share validation")

    monkeypatch.setattr(enterprise_store, "_finding_packet_from_workspace", should_not_load_packet)
    try:
        with pytest.raises(enterprise_store.EnterpriseAccessError):
            asyncio.run(enterprise_store.get_shared_finding_packet(share["token"]))
    finally:
        _reset_store()


def test_live_retry_does_not_duplicate_evidence_or_findings(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _reset_store()
    user_id = "retry-owner"
    created = asyncio.run(enterprise_store.create_watchlist(user_id, {"name": "Live"}))
    watchlist_id = created["created_watchlist"]["id"]
    csv_text = "\n".join([
        "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market",
        "Pro Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/x,US",
    ])
    asyncio.run(enterprise_store.import_watchlist_items(user_id, watchlist_id, csv_text))
    workspace = enterprise_store._workspace_for_user(user_id)
    item_id = workspace["watchlist_items"][0]["id"]
    job = asyncio.run(enterprise_store.launch_scan_job(
        user_id, {"watchlist_id": watchlist_id, "limit": 10, "run_mode": "live"}
    ))["scan_job"]
    session = {
        "session_id": "session-retry",
        "status": "completed",
        "configured_agents": 1,
        "agents": [{"agent_id": "agent-1", "price": 176, "evidence": {"extraction_method": "jsonld"}}],
    }
    first = asyncio.run(enterprise_store.record_live_probe_result(user_id, job["id"], item_id, session))
    second = asyncio.run(enterprise_store.record_live_probe_result(user_id, job["id"], item_id, session))
    assert first["duplicate"] is False
    assert second["duplicate"] is True
    assert len(workspace["evidence_items"]) == len(first["evidence_items"])
    assert len(workspace["findings"]) == (1 if first["finding"] else 0)
    _reset_store()
