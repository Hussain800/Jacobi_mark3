"""Security regression (object-level authorization / IDOR).

A signed-in user must not be able to revoke, export, or share another
workspace's finding/share-token. The audit flagged share-token revoke as a
possible IDOR; in fact the store layer already enforces org membership before
revoking (enterprise_store.revoke_share_token). These tests lock that in and
extend the guarantee to exports and share creation.
"""

import asyncio

import enterprise_store
from auth_user import get_optional_user
import main as M


def _as_user(uid):
    return {"id": uid, "email": f"{uid}@example.test"}


def _set_user(user):
    M.app.dependency_overrides[get_optional_user] = lambda: user


def _clear():
    M.app.dependency_overrides.pop(get_optional_user, None)
    enterprise_store._MEMORY_WORKSPACES.clear()
    enterprise_store._ENTERPRISE_SCAN_RATE_BUCKETS.clear()


def _seed_finding(user_id):
    created = asyncio.run(enterprise_store.create_watchlist(
        user_id, {"name": "W", "cadence": "daily", "workflow_type": "map"}
    ))
    wid = created["created_watchlist"]["id"]
    csv_text = "\n".join([
        "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct",
        "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless,US,176,92",
    ])
    asyncio.run(enterprise_store.import_watchlist_items(user_id, wid, csv_text))
    scan = asyncio.run(enterprise_store.launch_scan_job(
        user_id, {"watchlist_id": wid, "audit_depth": "smart24", "limit": 10, "run_mode": "imported"}
    ))
    return scan["findings"][0]["id"]


def test_non_owner_cannot_revoke_share_token(monkeypatch, client):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _clear()
    try:
        finding_id = _seed_finding("org-a-owner")
        _set_user(_as_user("org-a-owner"))
        share = client.post(
            f"/api/findings/{finding_id}/share-tokens",
            json={"expires_hours": 24, "redacted": True},
        )
        assert share.status_code == 200
        token_id = share.json()["share_token"]["id"]
        raw_token = share.json()["token"]

        # Attacker in a different workspace must not be able to revoke it.
        _set_user(_as_user("org-b-attacker"))
        resp = client.post(f"/api/share-tokens/{token_id}/revoke")
        assert resp.status_code == 404

        # The token still works — the attacker did not revoke it.
        _set_user(_as_user("org-a-owner"))
        assert client.get(f"/api/enterprise/shared-findings/{raw_token}").status_code == 200
    finally:
        _clear()


def test_non_owner_cannot_export_or_share_foreign_finding(monkeypatch, client):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _clear()
    try:
        finding_id = _seed_finding("org-a-owner")

        _set_user(_as_user("org-b-attacker"))
        export = client.post(
            f"/api/findings/{finding_id}/exports",
            json={"format": "json", "redacted": True},
        )
        assert export.status_code == 404

        share = client.post(
            f"/api/findings/{finding_id}/share-tokens",
            json={"expires_hours": 24, "redacted": True},
        )
        assert share.status_code == 404
    finally:
        _clear()
