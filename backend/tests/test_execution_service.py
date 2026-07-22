"""Execution lifecycle facade and durable-worker authority tests."""

import asyncio

import pytest

import enterprise_store
import main as M
from auth_user import get_optional_user
from execution_service import (
    DispatchTarget,
    ExecutionService,
    LifecycleError,
    LifecycleEvent,
    TargetExecutionResult,
    validate_transition,
)


@pytest.mark.parametrize(
    ("previous", "current", "event"),
    [
        (None, "queued", LifecycleEvent.SUBMIT),
        (None, "running", LifecycleEvent.SUBMIT),
        (None, "completed", LifecycleEvent.SUBMIT),
        ("queued", "queued", LifecycleEvent.SUBMIT),
        ("running", "running", LifecycleEvent.SUBMIT),
        ("queued", "running", LifecycleEvent.CLAIM),
        ("running", "running", LifecycleEvent.RECLAIM),
        ("running", "running", LifecycleEvent.PROGRESS),
        ("running", "queued", LifecycleEvent.RELEASE),
        ("running", "completed", LifecycleEvent.FINISH),
        ("running", "failed", LifecycleEvent.FINISH),
        ("running", "timeout", LifecycleEvent.TIMEOUT),
        ("running", "failed", LifecycleEvent.CANCEL),
    ],
)
def test_legal_transitions(previous, current, event):
    validate_transition(previous, current, event)


@pytest.mark.parametrize(
    ("previous", "current", "event"),
    [
        ("queued", "completed", LifecycleEvent.FINISH),
        ("completed", "running", LifecycleEvent.CLAIM),
        ("failed", "queued", LifecycleEvent.RELEASE),
        ("running", "completed", LifecycleEvent.PROGRESS),
        ("queued", "timeout", LifecycleEvent.TIMEOUT),
        (None, "failed", LifecycleEvent.SUBMIT),
    ],
)
def test_illegal_transitions(previous, current, event):
    with pytest.raises(LifecycleError):
        validate_transition(previous, current, event)


def _service(**overrides):
    async def unused(*args, **kwargs):
        raise AssertionError("unexpected persistence call")

    dependencies = {
        "launch_scan_job": unused,
        "claim_scan_job": unused,
        "claim_next_scan_job": unused,
        "get_scan_job_work": unused,
        "record_live_probe_result": unused,
        "release_scan_job": unused,
        "finish_scan_job": unused,
        "fail_claimed_scan_job": unused,
    }
    dependencies.update(overrides)
    return ExecutionService(**dependencies)


def test_duplicate_submit_preserves_store_idempotency_and_durable_dispatch():
    job = {
        "id": "job-1",
        "status": "queued",
        "metadata": {"run_mode": "live"},
    }
    calls = 0

    async def launch(user_id, payload):
        nonlocal calls
        calls += 1
        response = {"scan_job": job, "findings": []}
        if calls > 1:
            response["idempotent"] = True
        return response

    service = _service(launch_scan_job=launch)
    first = asyncio.run(service.submit_scan("owner", {"run_mode": "live"}))
    second = asyncio.run(service.submit_scan("owner", {"run_mode": "live"}))

    assert calls == 2
    assert first.response["scan_job"]["id"] == second.response["scan_job"]["id"]
    assert second.response["idempotent"] is True
    assert first.dispatch is DispatchTarget.DURABLE_WORKER
    assert second.dispatch is DispatchTarget.DURABLE_WORKER


@pytest.mark.parametrize(
    ("reclaimed", "expected_event"),
    [(False, LifecycleEvent.CLAIM), (True, LifecycleEvent.RECLAIM)],
)
def test_claim_and_reclaim_are_validated(reclaimed, expected_event):
    async def claim_next(worker_id):
        return {
            "claimed": True,
            "user_id": "owner",
            "scan_job": {
                "id": "job-1",
                "status": "running",
                "metadata": {"run_mode": "live", "reclaimed": reclaimed},
            },
        }

    service = _service(claim_next_scan_job=claim_next)
    claim = asyncio.run(service.claim_next("worker"))

    assert claim["claimed"] is True
    previous = "running" if reclaimed else "queued"
    validate_transition(previous, "running", expected_event)


def test_claimed_partial_slice_is_released_for_next_worker():
    async def get_work(user_id, job_id):
        return {
            "scan_job": {"id": job_id, "status": "running", "metadata": {}},
            "items": [{"item": {"id": "item-1"}}],
        }

    async def release(user_id, job_id, reason):
        return {
            "scan_job": {
                "id": job_id,
                "status": "queued",
                "metadata": {"release_reason": reason},
            }
        }

    service = _service(get_scan_job_work=get_work, release_scan_job=release)

    async def should_not_run(*args):
        raise AssertionError("zero-sized worker slice must not execute a target")

    result = asyncio.run(
        service.run_scan_job(
            "owner",
            "job-1",
            process_target=should_not_run,
            already_claimed=True,
            max_targets=0,
        )
    )

    assert result["released"] is True
    assert result["finished"] is False
    assert result["scan_job"]["status"] == "queued"
    assert result["scan_job"]["metadata"]["release_reason"] == "partial_worker_slice"


def test_malformed_claim_is_failed_without_running_a_target():
    async def claim_next(worker_id):
        return {
            "claimed": True,
            "user_id": None,
            "scan_job": {"id": "job-malformed", "status": "running", "metadata": {}},
        }

    async def fail(worker_id, job_id, reason):
        assert worker_id == "worker"
        assert job_id == "job-malformed"
        return {"scan_job": {"id": job_id, "status": "failed", "metadata": {"terminal_error": reason}}}

    service = _service(claim_next_scan_job=claim_next, fail_claimed_scan_job=fail)
    result = asyncio.run(service.drain_worker(1, 1, "worker", process_target=lambda *args: None))
    assert result["processed_jobs"][0]["scan_job"]["status"] == "failed"


def test_worker_cancellation_releases_then_recovers_without_duplicate_recording():
    job = {
        "id": "job-1",
        "status": "queued",
        "metadata": {"processed_item_ids": []},
    }
    record_calls = 0

    async def claim(user_id, job_id):
        assert job["status"] == "queued"
        job["status"] = "running"
        return {"claimed": True, "scan_job": job}

    async def get_work(user_id, job_id):
        return {"scan_job": job, "items": [{"item": {"id": "item-1"}}]}

    async def record(user_id, job_id, item_id, session, **kwargs):
        nonlocal record_calls
        record_calls += 1
        if item_id not in job["metadata"]["processed_item_ids"]:
            job["metadata"]["processed_item_ids"].append(item_id)
        return {"scan_job": job, "duplicate": record_calls > 1}

    async def release(user_id, job_id, reason):
        job["status"] = "queued"
        job["metadata"]["release_reason"] = reason
        return {"scan_job": job}

    async def finish(user_id, job_id, error=None):
        job["status"] = "failed" if error else "completed"
        return {"scan_job": job}

    service = _service(
        claim_scan_job=claim,
        get_scan_job_work=get_work,
        record_live_probe_result=record,
        release_scan_job=release,
        finish_scan_job=finish,
    )

    async def interrupted(*args):
        raise asyncio.CancelledError

    async def scenario():
        with pytest.raises(asyncio.CancelledError):
            await service.run_scan_job(
                "owner", "job-1", process_target=interrupted
            )
        assert job["status"] == "queued"
        assert job["metadata"]["release_reason"] == "worker_cancelled"

        async def completed(*args):
            return TargetExecutionResult(
                session={"session_id": "session-1", "status": "completed"}
            )

        return await service.run_scan_job(
            "owner", "job-1", process_target=completed
        )

    recovered = asyncio.run(scenario())

    assert recovered["finished"] is True
    assert recovered["scan_job"]["status"] == "completed"
    assert record_calls == 1
    assert job["metadata"]["processed_item_ids"] == ["item-1"]


def test_timeout_and_cancellation_are_recorded():
    service = _service()

    async def scenario():
        timeout_state = {"status": "running"}
        timeout_outcome = await service.run_process_local(
            asyncio.sleep(0.05),
            state=timeout_state,
            timeout_seconds=0.001,
            timeout_message="timed out",
            cancellation_message="cancelled",
            failure_message="failed",
        )

        cancel_state = {"status": "running"}
        task = asyncio.create_task(
            service.run_process_local(
                asyncio.sleep(60),
                state=cancel_state,
                timeout_seconds=120,
                timeout_message="timed out",
                cancellation_message="cancelled",
                failure_message="failed",
            )
        )
        await asyncio.sleep(0)
        task.cancel()
        cancel_outcome = await task
        return timeout_state, timeout_outcome, cancel_state, cancel_outcome

    timeout_state, timeout_outcome, cancel_state, cancel_outcome = asyncio.run(scenario())

    assert timeout_outcome is LifecycleEvent.TIMEOUT
    assert timeout_state == {
        "status": "timeout",
        "error": "timed out",
        "_execution_interruption": "timeout",
    }
    assert cancel_outcome is LifecycleEvent.CANCEL
    assert cancel_state == {
        "status": "failed",
        "error": "cancelled",
        "_execution_interruption": "cancel",
    }


def test_live_create_route_returns_queued_without_process_local_dispatch(client, monkeypatch):
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    enterprise_store._MEMORY_WORKSPACES.clear()
    enterprise_store._ENTERPRISE_SCAN_RATE_BUCKETS.clear()
    user_id = "lifecycle-route-owner"
    M.app.dependency_overrides[get_optional_user] = lambda: {
        "id": user_id,
        "email": "owner@example.test",
    }

    def process_local_dispatch_is_a_bug(*args, **kwargs):
        raise AssertionError("live enterprise creation must not start a local task")

    monkeypatch.setattr(M, "_supervised_background_task", process_local_dispatch_is_a_bug)
    try:
        created = asyncio.run(
            enterprise_store.create_watchlist(
                user_id,
                {"name": "Lifecycle", "cadence": "daily", "workflow_type": "map"},
            )
        )
        watchlist_id = created["created_watchlist"]["id"]
        csv_text = "\n".join(
            [
                "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market",
                "Product,SKU-1,100,USD,Seller,seller.example,https://seller.example/p/1,US",
            ]
        )
        asyncio.run(
            enterprise_store.import_watchlist_items(user_id, watchlist_id, csv_text)
        )

        response = client.post(
            "/api/scan-jobs",
            json={
                "watchlist_id": watchlist_id,
                "audit_depth": "smart24",
                "limit": 10,
                "run_mode": "live",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["scan_job"]["status"] == "queued"
        assert body["scan_job"]["metadata"]["run_mode"] == "live"
        assert body["findings"] == []
        workspace = enterprise_store._workspace_for_user(user_id)
        assert workspace["scan_jobs"][0]["status"] == "queued"
    finally:
        M.app.dependency_overrides.pop(get_optional_user, None)
        enterprise_store._MEMORY_WORKSPACES.clear()
        enterprise_store._ENTERPRISE_SCAN_RATE_BUCKETS.clear()
