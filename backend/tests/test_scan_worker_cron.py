"""The Vercel cron reaches the scan worker via GET.

Vercel cron jobs issue an HTTP GET (with "Authorization: Bearer $CRON_SECRET"),
but the worker endpoint used to be POST-only — so scheduled scans 405'd and were
never processed in production. These tests cover the GET handler and confirm the
POST path still works.
"""

import enterprise_store


def test_cron_get_requires_worker_secret_config(client, monkeypatch):
    monkeypatch.delenv("SCAN_WORKER_SECRET", raising=False)
    monkeypatch.delenv("CRON_SECRET", raising=False)
    resp = client.get("/api/enterprise/scan-worker/run")
    assert resp.status_code == 503


def test_cron_get_rejects_invalid_secret(client, monkeypatch):
    monkeypatch.setenv("SCAN_WORKER_SECRET", "s3cret")
    resp = client.get(
        "/api/enterprise/scan-worker/run",
        headers={"Authorization": "Bearer wrong"},
    )
    assert resp.status_code == 401


def test_cron_get_runs_with_bearer_secret(client, monkeypatch):
    monkeypatch.setenv("SCAN_WORKER_SECRET", "s3cret")
    monkeypatch.setenv("ENTERPRISE_REQUIRE_SUPABASE", "0")
    enterprise_store._MEMORY_WORKSPACES.clear()
    resp = client.get(
        "/api/enterprise/scan-worker/run",
        headers={"Authorization": "Bearer s3cret"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 0  # no queued jobs in the in-memory test store
    assert body["processed_jobs"] == []


def test_post_worker_still_works(client, monkeypatch):
    monkeypatch.setenv("SCAN_WORKER_SECRET", "s3cret")
    monkeypatch.setenv("ENTERPRISE_REQUIRE_SUPABASE", "0")
    enterprise_store._MEMORY_WORKSPACES.clear()
    resp = client.post(
        "/api/enterprise/scan-worker/run",
        headers={"Authorization": "Bearer s3cret"},
        json={"max_jobs": 1, "max_targets_per_job": 1, "worker_id": "manual"},
    )
    assert resp.status_code == 200
    assert resp.json()["count"] == 0
