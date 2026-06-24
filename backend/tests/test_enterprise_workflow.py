import main as M
import enterprise_store
from auth_user import get_optional_user
from map_policy import evaluate_map_observation


def _as_user(user_id: str):
    return {"id": user_id, "email": f"{user_id}@example.test"}


def _set_user(user):
    M.app.dependency_overrides[get_optional_user] = lambda: user


def _clear_user():
    M.app.dependency_overrides.pop(get_optional_user, None)
    enterprise_store._MEMORY_WORKSPACES.clear()


def test_map_policy_creates_high_severity_undercut():
    result = evaluate_map_observation(
        product_name="Pro Wireless Headphones",
        sku="JCB-HP-001",
        seller_name="MegaDeals",
        target_url="https://megadeals.example/p/pro-wireless",
        observed_price=176,
        map_floor=199,
        currency="USD",
        coverage_pct=92,
    )

    assert result["is_violation"] is True
    assert result["type"] == "MAP_UNDERCUT"
    assert result["severity"] == "high"
    assert result["confidence"] == "high"
    assert result["spread_pct"] == 11.56


def test_map_policy_respects_coverage_gate():
    result = evaluate_map_observation(
        product_name="VitaBlend Pro Blender",
        sku="JCB-BL-700",
        seller_name="HomeGoods",
        target_url="https://homegoods.example/p/vitablend",
        observed_price=299,
        map_floor=329,
        currency="USD",
        coverage_pct=38,
    )

    assert result["is_violation"] is False
    assert result["reason"] == "coverage_below_gate"
    assert result["confidence"] == "insufficient"


def test_enterprise_watchlist_import_scan_flow(client):
    _clear_user()
    _set_user(_as_user("enterprise-owner"))
    try:
        workspace_response = client.get("/api/enterprise/workspace")
        assert workspace_response.status_code == 200
        assert workspace_response.json()["portfolio"] == []

        create_response = client.post(
            "/api/watchlists",
            json={"name": "Pilot MAP Watchlist", "cadence": "daily", "workflow_type": "map"},
        )
        assert create_response.status_code == 200
        watchlist_id = create_response.json()["watchlists"][0]["id"]

        csv_text = "\n".join([
            "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct",
            "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless,US,176,92",
        ])
        import_response = client.post(
            f"/api/watchlists/{watchlist_id}/items/import",
            json={"csv_text": csv_text},
        )
        assert import_response.status_code == 200
        assert import_response.json()["imported"] == 1
        assert import_response.json()["errors"] == []

        scan_response = client.post(
            "/api/scan-jobs",
            json={"watchlist_id": watchlist_id, "audit_depth": "smart24", "limit": 10},
        )
        assert scan_response.status_code == 200
        scan_body = scan_response.json()
        assert scan_body["scan_job"]["status"] == "completed"
        assert len(scan_body["findings"]) == 1
        assert scan_body["findings"][0]["severity"] == "high"

        findings_response = client.get("/api/findings")
        assert findings_response.status_code == 200
        findings = findings_response.json()["findings"]
        assert len(findings) == 1
        assert findings[0]["product"] == "Pro Wireless Headphones"
        assert findings[0]["mapFloor"] == 199
        assert findings[0]["observedLow"] == 176
    finally:
        _clear_user()


def test_enterprise_workspace_requires_auth(client):
    _clear_user()
    response = client.get("/api/enterprise/workspace")
    assert response.status_code == 401
