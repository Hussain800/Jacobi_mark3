import asyncio

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
            json={"watchlist_id": watchlist_id, "audit_depth": "smart24", "limit": 10, "run_mode": "imported"},
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


def test_live_scan_job_records_probe_backed_evidence(monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _clear_user()
    user_id = "live-worker-owner"
    try:
        created = asyncio.run(enterprise_store.create_watchlist(
            user_id,
            {"name": "Live MAP Watchlist", "cadence": "daily", "workflow_type": "map"},
        ))
        watchlist_id = created["created_watchlist"]["id"]

        csv_text = "\n".join([
            "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market",
            "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless,US",
        ])
        imported = asyncio.run(enterprise_store.import_watchlist_items(user_id, watchlist_id, csv_text))
        assert imported["imported"] == 1

        queued = asyncio.run(enterprise_store.launch_scan_job(
            user_id,
            {"watchlist_id": watchlist_id, "audit_depth": "smart24", "limit": 10, "run_mode": "live"},
        ))
        job = queued["scan_job"]
        assert job["status"] == "queued"
        assert job["metadata"]["source"] == "live_probe"
        assert queued["findings"] == []

        claim = asyncio.run(enterprise_store.claim_scan_job(user_id, job["id"]))
        assert claim["claimed"] is True
        work = asyncio.run(enterprise_store.get_scan_job_work(user_id, job["id"]))
        item_id = work["items"][0]["item"]["id"]

        session = {
            "session_id": "sess_live_map",
            "status": "completed",
            "configured_agents": 4,
            "total_agents": 4,
            "successful_agents": 3,
            "agents": [
                {
                    "agent_id": "AGENT_00",
                    "label": "Baseline desktop",
                    "status": "success",
                    "price": 176,
                    "response_time_ms": 840,
                    "variables": {"location": "us", "device": "desktop", "cookie": "fresh", "referrer": "direct"},
                    "evidence": {"extraction_method": "generic_price_parser", "price_raw_text": "$176.00", "native_price": 176, "native_currency": "USD"},
                },
                {
                    "agent_id": "AGENT_01",
                    "label": "Mobile buyer",
                    "status": "success",
                    "price": 182,
                    "response_time_ms": 910,
                    "variables": {"location": "us", "device": "mobile", "cookie": "fresh", "referrer": "direct"},
                    "evidence": {"extraction_method": "generic_price_parser", "price_raw_text": "$182.00", "native_price": 182, "native_currency": "USD"},
                },
                {
                    "agent_id": "AGENT_02",
                    "label": "Returning buyer",
                    "status": "success",
                    "price": 190,
                    "response_time_ms": 970,
                    "variables": {"location": "us", "device": "desktop", "cookie": "aged", "referrer": "search"},
                    "evidence": {"extraction_method": "generic_price_parser", "price_raw_text": "$190.00", "native_price": 190, "native_currency": "USD"},
                },
                {"agent_id": "AGENT_03", "label": "Blocked", "status": "failed", "price": None, "error_message": "No valid price found"},
            ],
        }

        recorded = asyncio.run(enterprise_store.record_live_probe_result(
            user_id,
            job["id"],
            item_id,
            session,
            probe_row_id="probe-row-1",
        ))
        assert recorded["duplicate"] is False
        assert recorded["finding"]["severity"] == "high"
        assert recorded["finding"]["confidence"] == "medium"
        assert len(recorded["evidence_items"]) == 3
        assert recorded["evidence_items"][0]["source"] == "live_probe"
        assert recorded["scan_job"]["completed_count"] == 1

        duplicate = asyncio.run(enterprise_store.record_live_probe_result(user_id, job["id"], item_id, session))
        assert duplicate["duplicate"] is True
        assert duplicate["scan_job"]["completed_count"] == 1

        finished = asyncio.run(enterprise_store.finish_scan_job(user_id, job["id"]))
        assert finished["scan_job"]["status"] == "completed"

        workspace = asyncio.run(enterprise_store.get_workspace(user_id))
        assert workspace["kpis"]["openFindings"] == 1
        assert workspace["portfolio"][0]["lastStatus"] == "finding"
        assert workspace["portfolio"][0]["latestSpreadPct"] == 11.56
        assert workspace["findings"][0]["agents"][0]["context"].startswith("us / desktop")
        assert len(workspace["evidence_items"]) == 3
    finally:
        _clear_user()


def test_durable_worker_endpoint_processes_partial_jobs_and_lists_evidence(monkeypatch, client):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    monkeypatch.setenv("SCAN_WORKER_SECRET", "test-worker-secret")
    monkeypatch.setattr(M, "validate_public_url", lambda url: url)

    async def fake_run_probe_engine(session, url, agent_configs=None):
        session.update({
            "status": "completed",
            "configured_agents": 2,
            "total_agents": 2,
            "successful_agents": 2,
            "agents": [
                {
                    "agent_id": "AGENT_00",
                    "label": "Baseline desktop",
                    "status": "success",
                    "price": 176,
                    "response_time_ms": 500,
                    "variables": {"location": "us", "device": "desktop", "cookie": "fresh", "referrer": "direct"},
                    "evidence": {
                        "extraction_method": "generic_price_parser",
                        "price_raw_text": "$176.00",
                        "native_price": 176,
                        "native_currency": "USD",
                    },
                },
                {
                    "agent_id": "AGENT_01",
                    "label": "Mobile buyer",
                    "status": "success",
                    "price": 181,
                    "response_time_ms": 540,
                    "variables": {"location": "us", "device": "mobile", "cookie": "fresh", "referrer": "direct"},
                    "evidence": {
                        "extraction_method": "generic_price_parser",
                        "price_raw_text": "$181.00",
                        "native_price": 181,
                        "native_currency": "USD",
                    },
                },
            ],
        })

    async def fake_save_probe(session, user_id=None, is_public=False):
        return f"probe-{session['enterprise_watchlist_item_id']}"

    monkeypatch.setattr(M, "_run_probe_engine", fake_run_probe_engine)
    monkeypatch.setattr(M, "save_probe", fake_save_probe)

    _clear_user()
    user_id = "durable-worker-owner"
    _set_user(_as_user(user_id))
    try:
        created = asyncio.run(enterprise_store.create_watchlist(
            user_id,
            {"name": "Durable MAP Watchlist", "cadence": "daily", "workflow_type": "map"},
        ))
        watchlist_id = created["created_watchlist"]["id"]
        csv_text = "\n".join([
            "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market",
            "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless,US",
            "VitaBlend Pro Blender,JCB-BL-700,329,USD,HomeGoods,homegoods.example,https://homegoods.example/p/vitablend,US",
        ])
        imported = asyncio.run(enterprise_store.import_watchlist_items(user_id, watchlist_id, csv_text))
        assert imported["imported"] == 2
        queued = asyncio.run(enterprise_store.launch_scan_job(
            user_id,
            {"watchlist_id": watchlist_id, "audit_depth": "smart24", "limit": 10, "run_mode": "live"},
        ))
        job_id = queued["scan_job"]["id"]

        first_run = client.post(
            "/api/enterprise/scan-worker/run",
            headers={"x-jacobi-worker-secret": "test-worker-secret"},
            json={"max_jobs": 1, "max_targets_per_job": 1, "worker_id": "pytest-worker"},
        )
        assert first_run.status_code == 200
        first_result = first_run.json()["processed_jobs"][0]
        assert first_result["processed_targets"] == 1
        assert first_result["released"] is True
        assert first_result["scan_job"]["status"] == "queued"
        assert first_result["scan_job"]["completed_count"] == 1

        second_run = client.post(
            "/api/enterprise/scan-worker/run",
            headers={"x-jacobi-worker-secret": "test-worker-secret"},
            json={"max_jobs": 1, "max_targets_per_job": 10, "worker_id": "pytest-worker"},
        )
        assert second_run.status_code == 200
        second_result = second_run.json()["processed_jobs"][0]
        assert second_result["processed_targets"] == 1
        assert second_result["finished"] is True
        assert second_result["scan_job"]["status"] == "completed"
        assert second_result["scan_job"]["completed_count"] == 2

        evidence_response = client.get("/api/evidence")
        assert evidence_response.status_code == 200
        evidence_items = evidence_response.json()["evidence_items"]
        assert len(evidence_items) == 4
        assert evidence_items[0]["source"] == "live_probe"
        assert evidence_items[0]["product"]["name"] in {"Pro Wireless Headphones", "VitaBlend Pro Blender"}

        detail_response = client.get(f"/api/evidence/{evidence_items[0]['id']}")
        assert detail_response.status_code == 200
        assert detail_response.json()["evidence_item"]["scan_job_id"] == job_id
    finally:
        _clear_user()


def test_enterprise_finding_exports_and_share_revoke(monkeypatch, client):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    _clear_user()
    user_id = "reporting-owner"
    _set_user(_as_user(user_id))
    try:
        created = asyncio.run(enterprise_store.create_watchlist(
            user_id,
            {"name": "Reporting MAP Watchlist", "cadence": "daily", "workflow_type": "map"},
        ))
        watchlist_id = created["created_watchlist"]["id"]
        csv_text = "\n".join([
            "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct",
            "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless?offer=123,US,176,92",
        ])
        imported = asyncio.run(enterprise_store.import_watchlist_items(user_id, watchlist_id, csv_text))
        assert imported["imported"] == 1
        scan = asyncio.run(enterprise_store.launch_scan_job(
            user_id,
            {"watchlist_id": watchlist_id, "audit_depth": "smart24", "limit": 10, "run_mode": "imported"},
        ))
        finding_id = scan["findings"][0]["id"]

        pdf_response = client.post(
            f"/api/findings/{finding_id}/exports",
            json={"format": "pdf", "redacted": False},
        )
        assert pdf_response.status_code == 200
        assert pdf_response.headers["content-type"].startswith("application/pdf")
        assert pdf_response.content.startswith(b"%PDF")
        assert pdf_response.headers["x-jacobi-checksum-sha256"]
        assert pdf_response.headers["x-jacobi-export-id"]

        json_response = client.post(
            f"/api/findings/{finding_id}/exports",
            json={"format": "json", "redacted": True},
        )
        assert json_response.status_code == 200
        exported = json_response.json()
        assert exported["evidence_checksum_sha256"]
        assert exported["evidence_items"][0]["target_url"] == "megadeals.example"
        assert exported["evidence_items"][0]["probe_session_id"] is None

        share_response = client.post(
            f"/api/findings/{finding_id}/share-tokens",
            json={"expires_hours": 24, "redacted": True},
        )
        assert share_response.status_code == 200
        share = share_response.json()
        assert "/share/enterprise/" in share["token_url"]
        token_id = share["share_token"]["id"]

        shared_response = client.get(f"/api/enterprise/shared-findings/{share['token']}")
        assert shared_response.status_code == 200
        shared_packet = shared_response.json()["packet"]
        assert shared_packet["evidence_items"][0]["target_url"] == "megadeals.example"

        revoke_response = client.post(f"/api/share-tokens/{token_id}/revoke")
        assert revoke_response.status_code == 200
        assert revoke_response.json()["share_token"]["revoked_at"]
        assert client.get(f"/api/enterprise/shared-findings/{share['token']}").status_code == 404
    finally:
        _clear_user()
