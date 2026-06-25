"""Scan-job durability: idempotent double-submit + stale-job reclaim."""

import asyncio

import enterprise_store


def _seed_live_watchlist(user_id):
    created = asyncio.run(enterprise_store.create_watchlist(
        user_id, {"name": "W", "cadence": "daily", "workflow_type": "map"}
    ))
    wid = created["created_watchlist"]["id"]
    csv_text = "\n".join([
        "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market",
        "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless,US",
    ])
    asyncio.run(enterprise_store.import_watchlist_items(user_id, wid, csv_text))
    return wid


def test_live_scan_is_idempotent_on_double_submit(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    enterprise_store._MEMORY_WORKSPACES.clear()
    enterprise_store._ENTERPRISE_SCAN_RATE_BUCKETS.clear()
    user_id = "idem-owner"
    wid = _seed_live_watchlist(user_id)

    first = asyncio.run(enterprise_store.launch_scan_job(
        user_id, {"watchlist_id": wid, "audit_depth": "smart24", "limit": 10, "run_mode": "live"}
    ))
    second = asyncio.run(enterprise_store.launch_scan_job(
        user_id, {"watchlist_id": wid, "audit_depth": "smart24", "limit": 10, "run_mode": "live"}
    ))

    assert first["scan_job"]["status"] == "queued"
    assert second.get("idempotent") is True
    assert second["scan_job"]["id"] == first["scan_job"]["id"]

    ws = enterprise_store._workspace_for_user(user_id)
    live_jobs = [j for j in ws["scan_jobs"] if enterprise_store._scan_metadata(j).get("run_mode") == "live"]
    assert len(live_jobs) == 1  # no duplicate queued + no second BrightData fan-out
    enterprise_store._MEMORY_WORKSPACES.clear()


def test_stale_running_live_job_is_reclaimed(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setattr(enterprise_store, "ENTERPRISE_SCAN_LEASE_SECONDS", 1)
    enterprise_store._MEMORY_WORKSPACES.clear()
    user_id = "reclaim-owner"
    ws = enterprise_store._workspace_for_user(user_id)
    ancient = "2000-01-01T00:00:00+00:00"
    job = {
        "id": enterprise_store._id(), "organization_id": ws["organization"]["id"],
        "watchlist_id": "w1", "requested_by": user_id, "audit_depth": "smart24",
        "status": "running", "target_count": 1, "completed_count": 0, "failed_count": 0,
        "queued_at": ancient, "started_at": ancient, "completed_at": None,
        "metadata": {"run_mode": "live", "item_ids": []},
    }
    ws["scan_jobs"].append(job)

    claim = asyncio.run(enterprise_store.claim_next_scan_job("reclaim-worker"))
    assert claim["claimed"] is True
    assert claim["scan_job"]["id"] == job["id"]
    assert claim["scan_job"]["metadata"].get("reclaimed") is True
    enterprise_store._MEMORY_WORKSPACES.clear()


def test_fresh_running_job_is_not_reclaimed(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setattr(enterprise_store, "ENTERPRISE_SCAN_LEASE_SECONDS", 900)
    enterprise_store._MEMORY_WORKSPACES.clear()
    user_id = "fresh-owner"
    ws = enterprise_store._workspace_for_user(user_id)
    job = {
        "id": enterprise_store._id(), "organization_id": ws["organization"]["id"],
        "watchlist_id": "w1", "requested_by": user_id, "audit_depth": "smart24",
        "status": "running", "target_count": 1, "completed_count": 0, "failed_count": 0,
        "queued_at": enterprise_store._now(), "started_at": enterprise_store._now(),
        "completed_at": None, "metadata": {"run_mode": "live", "item_ids": []},
    }
    ws["scan_jobs"].append(job)

    claim = asyncio.run(enterprise_store.claim_next_scan_job("worker"))
    assert claim["claimed"] is False  # lease not lapsed -> not reclaimed
    enterprise_store._MEMORY_WORKSPACES.clear()
