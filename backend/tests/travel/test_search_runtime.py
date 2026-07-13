from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from travel.search.models import (
    SearchEventType,
    SearchJob,
    SearchStatus,
    validate_transition,
)
from travel.search.runtime import MemoryTravelRuntime


def _job(search_id: str = "search-1") -> SearchJob:
    return SearchJob(
        search_id=search_id,
        intent_fingerprint="a" * 64,
        requested_providers=("amadeus", "amadeus"),
        hard_deadline_at=datetime.now(timezone.utc) + timedelta(seconds=15),
    )


def test_search_state_machine_accepts_only_declared_transitions() -> None:
    validate_transition(SearchStatus.ACCEPTED, SearchStatus.PARSED)
    validate_transition(SearchStatus.RUNNING, SearchStatus.PARTIAL)
    validate_transition(SearchStatus.PARTIAL, SearchStatus.PARTIAL)
    validate_transition(SearchStatus.COMPLETED, SearchStatus.EXPIRED)
    with pytest.raises(ValueError, match="invalid travel search transition"):
        validate_transition(SearchStatus.ACCEPTED, SearchStatus.COMPLETED)


def test_memory_runtime_queue_idempotency_cache_lease_and_rate_contract() -> None:
    async def scenario() -> None:
        runtime = MemoryTravelRuntime()
        job = _job()
        assert job.requested_providers == ("amadeus",)
        await runtime.enqueue(job)
        assert await runtime.claim(timeout_seconds=0.1) == job
        assert await runtime.claim(timeout_seconds=0.01) is None

        assert await runtime.remember_idempotency("key", "search-1", ttl_seconds=30) == "search-1"
        assert await runtime.remember_idempotency("key", "search-2", ttl_seconds=30) == "search-1"

        await runtime.cache_set("flight:fingerprint", {"offers": [1]}, ttl_seconds=30)
        cached = await runtime.cache_get("flight:fingerprint")
        assert cached == {"offers": [1]}
        cached["offers"].append(2)
        assert await runtime.cache_get("flight:fingerprint") == {"offers": [1]}

        token = await runtime.acquire_lease("search-1", ttl_seconds=30)
        assert token
        assert await runtime.acquire_lease("search-1", ttl_seconds=30) is None
        assert not await runtime.release_lease("search-1", "wrong")
        assert await runtime.release_lease("search-1", token)

        assert await runtime.allow_rate("amadeus", limit=2, window_seconds=60)
        assert await runtime.allow_rate("amadeus", limit=2, window_seconds=60)
        assert not await runtime.allow_rate("amadeus", limit=2, window_seconds=60)

    asyncio.run(scenario())


def test_memory_runtime_replays_last_event_id_and_streams_progress() -> None:
    async def scenario() -> None:
        runtime = MemoryTravelRuntime()
        first = await runtime.publish(
            "search-1", SearchEventType.SEARCH_ACCEPTED, {"status": "accepted"}
        )
        second = await runtime.publish(
            "search-1", SearchEventType.PROVIDER_PARTIAL, {"offers": 1}
        )
        replay = await runtime.events_after("search-1", first.event_id)
        assert [event.event_id for event in replay] == [second.event_id]

        async def complete() -> None:
            await asyncio.sleep(0.01)
            await runtime.publish(
                "search-1", SearchEventType.SEARCH_COMPLETED, {"offers": 1}
            )

        task = asyncio.create_task(complete())
        streamed = [
            event
            async for event in runtime.subscribe(
                "search-1", second.event_id, heartbeat_seconds=0.1
            )
        ]
        await task
        assert [event.event for event in streamed] == [SearchEventType.SEARCH_COMPLETED]

    asyncio.run(scenario())
