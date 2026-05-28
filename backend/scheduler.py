import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Callable, Coroutine, Any, Dict

from pydantic import BaseModel, Field

logger = logging.getLogger("jacobi.scheduler")

POLL_INTERVAL_S = 60


class SchedulerConfig(BaseModel):
    id: str
    target_url: str
    target_name: str
    interval_minutes: int
    next_run_at: float
    created_at: float = Field(default_factory=time.time)
    paused: bool = False


class ScheduleRequest(BaseModel):
    target_url: str = Field(..., description="Full URL of the target product page")
    target_name: str = Field(default="Scheduled Probe", description="Human-readable target label")
    interval_minutes: int = Field(default=60, ge=1, description="Minutes between probes")


SCHEDULES: Dict[str, SchedulerConfig] = {}
_SCHEDULE_LOCK = asyncio.Lock()


async def create_schedule(url: str, name: str, interval_minutes: int) -> SchedulerConfig:
    sched_id = uuid.uuid4().hex[:12]
    now = time.time()
    config = SchedulerConfig(
        id=sched_id,
        target_url=url,
        target_name=name,
        interval_minutes=interval_minutes,
        next_run_at=now + interval_minutes * 60,
    )
    async with _SCHEDULE_LOCK:
        SCHEDULES[sched_id] = config
    logger.info("Schedule created: id=%s url=%s interval=%dmin", sched_id, url, interval_minutes)
    return config


async def delete_schedule(sched_id: str) -> bool:
    async with _SCHEDULE_LOCK:
        if sched_id in SCHEDULES:
            del SCHEDULES[sched_id]
            logger.info("Schedule deleted: id=%s", sched_id)
            return True
        return False


def get_active_schedules() -> list[dict]:
    return [
        {
            "id": s.id,
            "target_url": s.target_url,
            "target_name": s.target_name,
            "interval_minutes": s.interval_minutes,
            "next_run_at": datetime.fromtimestamp(s.next_run_at, tz=timezone.utc).isoformat(),
            "created_at": datetime.fromtimestamp(s.created_at, tz=timezone.utc).isoformat(),
            "paused": s.paused,
        }
        for s in SCHEDULES.values()
    ]


async def run_scheduler_loop(
    probe_fn: Callable[[str, str], Coroutine[Any, Any, dict]],
):
    logger.info("Scheduler background loop started (poll=%ds)", POLL_INTERVAL_S)
    while True:
        try:
            now = time.time()
            due: list[SchedulerConfig] = []
            async with _SCHEDULE_LOCK:
                for sched in list(SCHEDULES.values()):
                    if not sched.paused and sched.next_run_at <= now:
                        due.append(sched)
                        sched.next_run_at = now + sched.interval_minutes * 60

            for sched in due:
                logger.info(
                    "Firing scheduled probe: id=%s target=%s name=%s",
                    sched.id, sched.target_url, sched.target_name,
                )
                asyncio.create_task(_execute_probe(sched, probe_fn))

        except Exception:
            logger.exception("Scheduler loop encountered an error")
        await asyncio.sleep(POLL_INTERVAL_S)


async def _execute_probe(
    sched: SchedulerConfig,
    probe_fn: Callable[[str, str], Coroutine[Any, Any, dict]],
):
    try:
        result = await probe_fn(sched.target_url, sched.target_name)
        result["scheduled"] = True
        result["schedule_id"] = sched.id
        sid = result.get("session_id")
        if sid:
            try:
                from main import SESSION_STORE
                if sid in SESSION_STORE:
                    SESSION_STORE[sid]["scheduled"] = True
                    SESSION_STORE[sid]["schedule_id"] = sched.id
            except Exception:
                pass
        logger.info(
            "Scheduled probe completed: id=%s session=%s status=%s elapsed=%.1fs",
            sched.id, result.get("session_id", "?"), result.get("status"),
            result.get("elapsed_seconds", 0),
        )
    except Exception as e:
        logger.error("Scheduled probe failed: id=%s error=%s", sched.id, e)
