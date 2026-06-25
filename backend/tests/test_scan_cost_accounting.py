"""Realized BrightData cost accounting + rolling monthly org budget."""

import asyncio

import pytest

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


def test_finish_records_realized_cost(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setattr(enterprise_store, "ENTERPRISE_SMART24_EST_COST_USD", 0.08)
    enterprise_store._MEMORY_WORKSPACES.clear()
    user_id = "cost-owner"
    ws = enterprise_store._workspace_for_user(user_id)
    job = {
        "id": enterprise_store._id(), "organization_id": ws["organization"]["id"],
        "watchlist_id": "w", "requested_by": user_id, "audit_depth": "smart24",
        "status": "running", "target_count": 3, "completed_count": 2, "failed_count": 1,
        "queued_at": enterprise_store._now(), "started_at": enterprise_store._now(),
        "completed_at": None, "metadata": {"run_mode": "live"},
    }
    ws["scan_jobs"].append(job)

    result = asyncio.run(enterprise_store.finish_scan_job(user_id, job["id"]))
    # realized = completed_count(2) * per-target estimate(0.08)
    assert result["scan_job"]["metadata"]["realized_cost_usd"] == 0.16
    enterprise_store._MEMORY_WORKSPACES.clear()


def test_monthly_budget_blocks_when_exceeded(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setattr(enterprise_store, "ENTERPRISE_SCAN_MONTHLY_BUDGET_USD", 0.10)
    monkeypatch.setattr(enterprise_store, "ENTERPRISE_SMART24_EST_COST_USD", 0.08)
    enterprise_store._MEMORY_WORKSPACES.clear()
    enterprise_store._ENTERPRISE_SCAN_RATE_BUCKETS.clear()
    user_id = "budget-owner"
    wid = _seed_live_watchlist(user_id)
    ws = enterprise_store._workspace_for_user(user_id)
    # A completed live job this month already spent $0.08.
    ws["scan_jobs"].append({
        "id": enterprise_store._id(), "organization_id": ws["organization"]["id"],
        "watchlist_id": "other", "requested_by": user_id, "audit_depth": "smart24",
        "status": "completed", "target_count": 1, "completed_count": 1, "failed_count": 0,
        "queued_at": enterprise_store._now(), "started_at": enterprise_store._now(),
        "completed_at": enterprise_store._now(),
        "metadata": {"run_mode": "live", "realized_cost_usd": 0.08},
    })

    # New scan would project 0.08 + 0.08 = 0.16 > 0.10 budget.
    with pytest.raises(enterprise_store.EnterpriseValidationError) as exc:
        asyncio.run(enterprise_store.launch_scan_job(
            user_id, {"watchlist_id": wid, "audit_depth": "smart24", "limit": 10, "run_mode": "live"}
        ))
    assert "monthly scan spend" in str(exc.value).lower()
    enterprise_store._MEMORY_WORKSPACES.clear()


def test_monthly_budget_disabled_by_default(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setattr(enterprise_store, "ENTERPRISE_SCAN_MONTHLY_BUDGET_USD", 0.0)
    enterprise_store._MEMORY_WORKSPACES.clear()
    enterprise_store._ENTERPRISE_SCAN_RATE_BUCKETS.clear()
    user_id = "nobudget-owner"
    wid = _seed_live_watchlist(user_id)
    result = asyncio.run(enterprise_store.launch_scan_job(
        user_id, {"watchlist_id": wid, "audit_depth": "smart24", "limit": 10, "run_mode": "live"}
    ))
    assert result["scan_job"]["status"] == "queued"  # not blocked when budget disabled
    enterprise_store._MEMORY_WORKSPACES.clear()
