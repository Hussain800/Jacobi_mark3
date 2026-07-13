from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from travel.search.models import SearchEventType, SearchJob
from travel.search.runtime import RedisTravelRuntime

def _stream_id(value: str) -> tuple[int, int]:
    major, _, minor = str(value).partition("-")
    return int(major), int(minor or 0)


def _job(search_id: str) -> SearchJob:
    return SearchJob(
        search_id=search_id,
        intent_fingerprint="a" * 64,
        requested_providers=("amadeus",),
        hard_deadline_at=datetime.now(timezone.utc) + timedelta(seconds=15),
    )


@dataclass
class _FakeRedis:
    """Small Redis protocol fake shared across simulated runtime restarts."""

    now: float = 0.0
    strings: dict[str, str] = field(default_factory=dict)
    lists: dict[str, deque[str]] = field(default_factory=lambda: defaultdict(deque))
    streams: dict[str, list[tuple[str, dict[str, str]]]] = field(
        default_factory=lambda: defaultdict(list)
    )
    expires_at: dict[str, float] = field(default_factory=dict)
    stream_counters: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    close_calls: int = 0

    def advance(self, seconds: float) -> None:
        self.now += seconds

    def _purge(self, key: str) -> None:
        deadline = self.expires_at.get(key)
        if deadline is None or deadline > self.now:
            return
        self.expires_at.pop(key, None)
        self.strings.pop(key, None)
        self.lists.pop(key, None)
        self.streams.pop(key, None)

    def _exists(self, key: str) -> bool:
        self._purge(key)
        return key in self.strings or key in self.lists or key in self.streams

    async def lpush(self, key: str, value: str) -> int:
        self._purge(key)
        self.lists[key].appendleft(value)
        return len(self.lists[key])

    async def brpop(self, key: str, *, timeout: int) -> tuple[str, str] | None:
        del timeout
        self._purge(key)
        if not self.lists.get(key):
            return None
        return key, self.lists[key].pop()

    async def xadd(
        self,
        key: str,
        values: dict[str, str],
        *,
        maxlen: int,
        approximate: bool,
    ) -> str:
        del approximate
        self._purge(key)
        self.stream_counters[key] += 1
        event_id = f"{self.stream_counters[key]}-0"
        self.streams[key].append((event_id, dict(values)))
        if len(self.streams[key]) > maxlen:
            self.streams[key] = self.streams[key][-maxlen:]
        return event_id

    async def xrange(
        self, key: str, *, min: str, max: str
    ) -> list[tuple[str, dict[str, str]]]:
        del max
        self._purge(key)
        exclusive = min.startswith("(")
        cursor = None if min == "-" else _stream_id(min.removeprefix("("))
        return [
            (event_id, dict(values))
            for event_id, values in self.streams.get(key, ())
            if cursor is None
            or _stream_id(event_id) > cursor
            or (not exclusive and _stream_id(event_id) == cursor)
        ]

    async def xread(
        self,
        streams: dict[str, str],
        *,
        count: int,
        block: int,
    ) -> list[tuple[str, list[tuple[str, dict[str, str]]]]]:
        del block
        result = []
        for key, cursor in streams.items():
            self._purge(key)
            rows = [
                (event_id, dict(values))
                for event_id, values in self.streams.get(key, ())
                if _stream_id(event_id) > _stream_id(cursor)
            ][:count]
            if rows:
                result.append((key, rows))
        return result

    async def set(
        self,
        key: str,
        value: str,
        *,
        ex: int,
        nx: bool = False,
    ) -> bool | None:
        self._purge(key)
        if nx and self._exists(key):
            return None
        self.strings[key] = str(value)
        self.expires_at[key] = self.now + ex
        return True

    async def get(self, key: str) -> str | None:
        self._purge(key)
        return self.strings.get(key)

    async def incr(self, key: str) -> int:
        self._purge(key)
        value = int(self.strings.get(key, "0")) + 1
        self.strings[key] = str(value)
        return value

    async def expire(self, key: str, seconds: int) -> bool:
        if not self._exists(key):
            return False
        self.expires_at[key] = self.now + seconds
        return True

    async def eval(
        self, script: str, key_count: int, key: str, token: str
    ) -> int:
        del script, key_count
        self._purge(key)
        if self.strings.get(key) != token:
            return 0
        self.strings.pop(key, None)
        self.expires_at.pop(key, None)
        return 1

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        self.close_calls += 1


def test_redis_runtime_contract_survives_runtime_restart() -> None:
    async def scenario() -> None:
        redis = _FakeRedis()
        before_restart = RedisTravelRuntime(redis, namespace="test:travel")

        job = _job("search-restart")
        await before_restart.enqueue(job)
        accepted = await before_restart.publish(
            job.search_id,
            SearchEventType.SEARCH_ACCEPTED,
            {"status": "accepted"},
        )
        partial = await before_restart.publish(
            job.search_id,
            SearchEventType.PROVIDER_PARTIAL,
            {"offer_count": 1},
        )
        assert (
            await before_restart.remember_idempotency(
                "request-key", "search-restart", ttl_seconds=30
            )
            == "search-restart"
        )
        await before_restart.cache_set(
            "flight:fingerprint", {"offers": [{"id": "offer-1"}]}, ttl_seconds=30
        )
        lease = await before_restart.acquire_lease(job.search_id, ttl_seconds=30)
        assert lease
        assert await before_restart.allow_rate("amadeus", limit=2, window_seconds=60)
        await before_restart.heartbeat("worker-a", ttl_seconds=30)

        # A new API/worker process receives only a fresh runtime wrapper. All
        # coordination state below must come from the shared Redis contract.
        after_restart = RedisTravelRuntime(redis, namespace="test:travel")
        assert await after_restart.worker_healthy()

        assert await after_restart.claim(timeout_seconds=0.01) == job
        assert await after_restart.claim(timeout_seconds=0.01) is None

        replay = await after_restart.events_after(job.search_id, accepted.event_id)
        assert [(item.event_id, item.event) for item in replay] == [
            (partial.event_id, SearchEventType.PROVIDER_PARTIAL)
        ]
        completed = await after_restart.publish(
            job.search_id,
            SearchEventType.SEARCH_COMPLETED,
            {"offer_count": 1},
        )
        streamed = [
            item
            async for item in after_restart.subscribe(
                job.search_id,
                partial.event_id,
                heartbeat_seconds=0.01,
            )
        ]
        assert [(item.event_id, item.event) for item in streamed] == [
            (completed.event_id, SearchEventType.SEARCH_COMPLETED)
        ]

        assert (
            await after_restart.remember_idempotency(
                "request-key", "duplicate-search", ttl_seconds=30
            )
            == "search-restart"
        )
        cached = await after_restart.cache_get("flight:fingerprint")
        assert cached == {"offers": [{"id": "offer-1"}]}
        cached["offers"].append({"id": "local-only"})
        assert await after_restart.cache_get("flight:fingerprint") == {
            "offers": [{"id": "offer-1"}]
        }

        assert await after_restart.acquire_lease(job.search_id, ttl_seconds=30) is None
        assert not await after_restart.release_lease(job.search_id, "wrong-token")
        assert await after_restart.release_lease(job.search_id, lease)
        assert await after_restart.acquire_lease(job.search_id, ttl_seconds=30)

        assert await after_restart.allow_rate("amadeus", limit=2, window_seconds=60)
        assert not await after_restart.allow_rate("amadeus", limit=2, window_seconds=60)

        heartbeat_key = after_restart._key("worker", "worker-a")
        assert await redis.get(heartbeat_key)
        assert await after_restart.healthy()

        redis.advance(31)
        assert await redis.get(heartbeat_key) is None
        assert not await after_restart.worker_healthy()
        assert await after_restart.cache_get("flight:fingerprint") is None
        assert (
            await after_restart.remember_idempotency(
                "request-key", "search-after-ttl", ttl_seconds=30
            )
            == "search-after-ttl"
        )
        redis.advance(29)
        assert await after_restart.allow_rate("amadeus", limit=2, window_seconds=60)

        await before_restart.close()
        await after_restart.close()
        assert redis.close_calls == 2

    asyncio.run(scenario())
