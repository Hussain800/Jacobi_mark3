"""Execution lifecycle authority for local probes and durable scan jobs.

The service deliberately owns orchestration, not persistence. Existing store
functions remain responsible for durable writes while this facade validates
their state changes and keeps HTTP routes as thin adapters.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import Any, Awaitable, Callable, Optional


class LifecycleError(RuntimeError):
    """Raised when a persistence adapter reports an illegal state change."""


class LifecycleEvent(str, Enum):
    SUBMIT = "submit"
    CLAIM = "claim"
    RECLAIM = "reclaim"
    PROGRESS = "progress"
    RELEASE = "release"
    FINISH = "finish"
    TIMEOUT = "timeout"
    CANCEL = "cancel"
    FAIL = "fail"


class DispatchTarget(str, Enum):
    NONE = "none"
    PROCESS_LOCAL = "process_local"
    DURABLE_WORKER = "durable_worker"


_LEGAL_TRANSITIONS: dict[LifecycleEvent, set[tuple[Optional[str], str]]] = {
    LifecycleEvent.SUBMIT: {
        (None, "queued"),
        (None, "running"),
        (None, "completed"),
        ("queued", "queued"),
        ("running", "running"),
    },
    LifecycleEvent.CLAIM: {("queued", "running")},
    LifecycleEvent.RECLAIM: {("running", "running")},
    LifecycleEvent.PROGRESS: {("running", "running")},
    LifecycleEvent.RELEASE: {("running", "queued")},
    LifecycleEvent.FINISH: {("running", "completed"), ("running", "failed")},
    LifecycleEvent.TIMEOUT: {("running", "timeout")},
    LifecycleEvent.CANCEL: {("running", "failed")},
    LifecycleEvent.FAIL: {("running", "failed")},
}


def validate_transition(
    previous: Optional[str],
    current: str,
    event: LifecycleEvent,
) -> None:
    """Validate one explicit lifecycle event without mutating the record."""
    if (previous, current) not in _LEGAL_TRANSITIONS[event]:
        raise LifecycleError(
            f"Illegal execution transition for {event.value}: {previous!r} -> {current!r}"
        )


def _record_interruption(
    state: dict[str, Any],
    *,
    event: LifecycleEvent,
    status: str,
    message: str,
) -> None:
    previous = state.get("status")
    validate_transition(previous, status, event)
    state["status"] = status
    state["error"] = message
    state["_execution_interruption"] = event.value


def record_timeout(state: dict[str, Any], message: str) -> None:
    _record_interruption(
        state,
        event=LifecycleEvent.TIMEOUT,
        status="timeout",
        message=message,
    )


def record_cancellation(state: dict[str, Any], message: str) -> None:
    # Preserve the established public terminal status while recording why the
    # run stopped in internal lifecycle metadata.
    _record_interruption(
        state,
        event=LifecycleEvent.CANCEL,
        status="failed",
        message=message,
    )


def record_failure(state: dict[str, Any], message: str) -> None:
    _record_interruption(
        state,
        event=LifecycleEvent.FAIL,
        status="failed",
        message=message,
    )


@dataclass(frozen=True)
class ScanSubmission:
    response: dict[str, Any]
    dispatch: DispatchTarget


@dataclass(frozen=True)
class TargetExecutionResult:
    session: dict[str, Any]
    probe_row_id: Optional[str] = None
    error: Optional[str] = None


class ExecutionService:
    """Facade for process-local probes and the existing durable scan worker."""

    def __init__(
        self,
        *,
        launch_scan_job: Callable[..., Awaitable[dict[str, Any]]],
        claim_scan_job: Callable[..., Awaitable[dict[str, Any]]],
        claim_next_scan_job: Callable[..., Awaitable[dict[str, Any]]],
        get_scan_job_work: Callable[..., Awaitable[dict[str, Any]]],
        record_live_probe_result: Callable[..., Awaitable[dict[str, Any]]],
        release_scan_job: Callable[..., Awaitable[dict[str, Any]]],
        finish_scan_job: Callable[..., Awaitable[dict[str, Any]]],
        fail_claimed_scan_job: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        self._launch_scan_job = launch_scan_job
        self._claim_scan_job = claim_scan_job
        self._claim_next_scan_job = claim_next_scan_job
        self._get_scan_job_work = get_scan_job_work
        self._record_live_probe_result = record_live_probe_result
        self._release_scan_job = release_scan_job
        self._finish_scan_job = finish_scan_job
        self._fail_claimed_scan_job = fail_claimed_scan_job

    @staticmethod
    def select_scan_dispatch(scan_job: dict[str, Any]) -> DispatchTarget:
        metadata = scan_job.get("metadata")
        run_mode = metadata.get("run_mode") if isinstance(metadata, dict) else None
        if run_mode == "live" and scan_job.get("status") in {"queued", "running"}:
            return DispatchTarget.DURABLE_WORKER
        return DispatchTarget.NONE

    @staticmethod
    def supervise(coro: Awaitable[Any], *, task_label: str) -> asyncio.Task:
        """Start a process-local task and always consume its terminal result."""
        task = asyncio.create_task(coro)

        def _on_done(done: asyncio.Task) -> None:
            try:
                done.result()
            except asyncio.CancelledError:
                print(f"[BG-TASK] {task_label} cancelled", flush=True)
            except Exception as exc:
                print(f"[BG-TASK] {task_label} failed: {exc!r}", flush=True)

        task.add_done_callback(_on_done)
        return task

    async def run_process_local(
        self,
        operation: Awaitable[Any],
        *,
        state: dict[str, Any],
        timeout_seconds: float,
        timeout_message: str,
        cancellation_message: str,
        failure_message: str,
        propagate_cancellation: bool = False,
    ) -> Optional[LifecycleEvent]:
        """Run one local operation and record every interruption explicitly."""
        if state.get("status") != "running":
            raise LifecycleError("Process-local execution requires a running state")
        try:
            await asyncio.wait_for(operation, timeout=timeout_seconds)
            return None
        except asyncio.TimeoutError:
            record_timeout(state, timeout_message)
            return LifecycleEvent.TIMEOUT
        except asyncio.CancelledError:
            record_cancellation(state, cancellation_message)
            if propagate_cancellation:
                raise
            return LifecycleEvent.CANCEL
        except Exception:
            record_failure(state, failure_message)
            return LifecycleEvent.FAIL

    async def submit_scan(self, user_id: str, payload: dict[str, Any]) -> ScanSubmission:
        result = await self._launch_scan_job(user_id, payload)
        scan_job = result.get("scan_job") or {}
        status = scan_job.get("status")
        if not status:
            raise LifecycleError("Scan submission did not return a status")
        previous = status if result.get("idempotent") else None
        validate_transition(previous, status, LifecycleEvent.SUBMIT)
        return ScanSubmission(result, self.select_scan_dispatch(scan_job))

    async def claim_next(self, worker_id: str) -> dict[str, Any]:
        claim = await self._claim_next_scan_job(worker_id)
        if not claim.get("claimed"):
            return claim
        job = claim.get("scan_job") or {}
        reclaimed = bool((job.get("metadata") or {}).get("reclaimed"))
        event = LifecycleEvent.RECLAIM if reclaimed else LifecycleEvent.CLAIM
        previous = "running" if reclaimed else "queued"
        validate_transition(previous, job.get("status"), event)
        return claim

    async def run_scan_job(
        self,
        user_id: str,
        scan_job_id: str,
        *,
        process_target: Callable[..., Awaitable[TargetExecutionResult]],
        already_claimed: bool = False,
        max_targets: Optional[int] = None,
    ) -> dict[str, Any]:
        terminal_error: Optional[str] = None
        claimed = already_claimed
        finished = False
        released = False
        processed_targets = 0
        remaining_targets = 0
        latest_job: dict[str, Any] = {}

        try:
            if not already_claimed:
                claim = await self._claim_scan_job(user_id, scan_job_id)
                if not claim.get("claimed"):
                    return {
                        "claimed": False,
                        "scan_job_id": scan_job_id,
                        "processed_targets": 0,
                        "remaining_targets": 0,
                    }
                latest_job = claim.get("scan_job") or {}
                validate_transition("queued", latest_job.get("status"), LifecycleEvent.CLAIM)
                claimed = True

            work = await self._get_scan_job_work(user_id, scan_job_id)
            job = work["scan_job"]
            latest_job = job
            if job.get("status") != "running":
                raise LifecycleError("A claimed scan job must be running")

            metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
            processed_item_ids = set(metadata.get("processed_item_ids") or [])
            pending_targets = [
                target
                for target in work.get("items", [])
                if (target.get("item") or {}).get("id") not in processed_item_ids
            ]
            targets = pending_targets[:max_targets] if max_targets is not None else pending_targets

            for target in targets:
                item = target.get("item") or {}
                result = await process_target(user_id, scan_job_id, target, job)
                recorded = await self._record_live_probe_result(
                    user_id,
                    scan_job_id,
                    item["id"],
                    result.session,
                    probe_row_id=result.probe_row_id,
                    error=result.error,
                )
                latest_job = recorded.get("scan_job") or latest_job
                validate_transition("running", latest_job.get("status"), LifecycleEvent.PROGRESS)
                processed_targets += 1

            remaining_targets = max(0, len(pending_targets) - processed_targets)
            if max_targets is not None and remaining_targets > 0:
                released_result = await self._release_scan_job(
                    user_id, scan_job_id, reason="partial_worker_slice"
                )
                latest_job = released_result.get("scan_job") or latest_job
                validate_transition("running", latest_job.get("status"), LifecycleEvent.RELEASE)
                released = True
            else:
                finished_result = await self._finish_scan_job(user_id, scan_job_id)
                latest_job = finished_result.get("scan_job") or latest_job
                validate_transition("running", latest_job.get("status"), LifecycleEvent.FINISH)
                finished = True
        except asyncio.CancelledError:
            if claimed and not finished and not released:
                released_result = await self._release_scan_job(
                    user_id, scan_job_id, reason="worker_cancelled"
                )
                latest_job = released_result.get("scan_job") or latest_job
                validate_transition("running", latest_job.get("status"), LifecycleEvent.RELEASE)
                released = True
            raise
        except Exception as exc:
            terminal_error = str(exc)
        finally:
            if claimed and not finished and not released:
                finished_result = await self._finish_scan_job(
                    user_id, scan_job_id, terminal_error
                )
                latest_job = finished_result.get("scan_job") or latest_job
                validate_transition("running", latest_job.get("status"), LifecycleEvent.FINISH)
                finished = True

        return {
            "claimed": claimed,
            "scan_job_id": scan_job_id,
            "scan_job": latest_job,
            "processed_targets": processed_targets,
            "remaining_targets": remaining_targets,
            "released": released,
            "finished": finished,
            "error": terminal_error,
        }

    async def drain_worker(
        self,
        max_jobs: int,
        max_targets_per_job: int,
        worker_id: str,
        *,
        process_target: Callable[..., Awaitable[TargetExecutionResult]],
    ) -> dict[str, Any]:
        processed = []
        for _ in range(max(1, max_jobs)):
            claim = await self.claim_next(worker_id)
            if not claim.get("claimed"):
                break
            job = claim.get("scan_job") or {}
            user_id = claim.get("user_id") or job.get("requested_by")
            if not job.get("id"):
                raise LifecycleError("Worker store returned a claimed job without an id")
            if not user_id:
                reason = "Worker claim missing requester; no target execution was attempted."
                failed = await self._fail_claimed_scan_job(worker_id, job["id"], reason)
                processed.append({"claimed": True, "error": reason, "scan_job": failed.get("scan_job")})
                continue
            processed.append(
                await self.run_scan_job(
                    user_id,
                    job["id"],
                    process_target=process_target,
                    already_claimed=True,
                    max_targets=max_targets_per_job,
                )
            )
        return {"processed_jobs": processed, "count": len(processed)}
