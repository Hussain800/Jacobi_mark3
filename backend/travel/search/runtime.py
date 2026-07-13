"""Redis-backed travel runtime with a deterministic in-memory dev contract.

Postgres remains the source of truth. This module owns only short-lived search
coordination: jobs, event replay, idempotency, caches, leases, provider rate
limits and worker heartbeats.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Protocol

from .models import SearchEvent, SearchEventType, SearchJob


DEFAULT_EVENT_TTL_SECONDS = 900
DEFAULT_CACHE_TTL_SECONDS = 300
DEFAULT_JOB_QUEUE = "jacobi:travel:jobs"
TERMINAL_EVENT_TYPES = frozenset(
    {
        SearchEventType.SEARCH_COMPLETED,
        SearchEventType.SEARCH_DEGRADED,
        SearchEventType.SEARCH_FAILED,
        SearchEventType.SEARCH_CANCELLED,
    }
)


class TravelRuntimeConfigurationError(RuntimeError):
    """Raised when the selected runtime cannot be safely constructed."""


class TravelRuntime(Protocol):
    async def enqueue(self, job: SearchJob) -> None: ...
    async def claim(self, *, timeout_seconds: float = 1.0) -> SearchJob | None: ...
    async def publish(
        self, search_id: str, event: SearchEventType, data: dict[str, Any]
    ) -> SearchEvent: ...
    async def events_after(self, search_id: str, last_event_id: str | None) -> list[SearchEvent]: ...
    def subscribe(
        self, search_id: str, last_event_id: str | None, *, heartbeat_seconds: float
    ) -> AsyncIterator[SearchEvent]: ...
    async def remember_idempotency(self, key: str, search_id: str, *, ttl_seconds: int) -> str: ...
    async def cache_get(self, key: str) -> dict[str, Any] | None: ...
    async def cache_set(self, key: str, value: dict[str, Any], *, ttl_seconds: int) -> None: ...
    async def acquire_lease(self, key: str, *, ttl_seconds: int) -> str | None: ...
    async def release_lease(self, key: str, token: str) -> bool: ...
    async def allow_rate(self, key: str, *, limit: int, window_seconds: int) -> bool: ...
    async def heartbeat(self, worker_id: str, *, ttl_seconds: int = 30) -> None: ...
    async def healthy(self) -> bool: ...
    async def close(self) -> None: ...


@dataclass
class _ExpiringValue:
    value: Any
    expires_at: float


class MemoryTravelRuntime:
    """Bounded process-local runtime for tests and single-process development."""

    def __init__(self, *, max_events_per_search: int = 500) -> None:
        self._queue: asyncio.Queue[SearchJob] = asyncio.Queue(maxsize=1_000)
        self._events: dict[str, deque[SearchEvent]] = defaultdict(
            lambda: deque(maxlen=max_events_per_search)
        )
        self._conditions: dict[str, asyncio.Condition] = defaultdict(asyncio.Condition)
        self._event_counters: dict[str, int] = defaultdict(int)
        self._idempotency: dict[str, _ExpiringValue] = {}
        self._cache: dict[str, _ExpiringValue] = {}
        self._leases: dict[str, _ExpiringValue] = {}
        self._rates: dict[str, deque[float]] = defaultdict(deque)
        self._heartbeats: dict[str, _ExpiringValue] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _now() -> float:
        return time.monotonic()

    @staticmethod
    def _active(item: _ExpiringValue | None, now: float) -> bool:
        return item is not None and item.expires_at > now

    async def enqueue(self, job: SearchJob) -> None:
        await self._queue.put(job.model_copy(deep=True))

    async def claim(self, *, timeout_seconds: float = 1.0) -> SearchJob | None:
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=max(timeout_seconds, 0.001))
        except TimeoutError:
            return None

    async def publish(
        self, search_id: str, event: SearchEventType, data: dict[str, Any]
    ) -> SearchEvent:
        async with self._lock:
            self._event_counters[search_id] += 1
            item = SearchEvent(
                event_id=str(self._event_counters[search_id]),
                search_id=search_id,
                event=event,
                data=json.loads(json.dumps(data, default=str)),
            )
            self._events[search_id].append(item)
        condition = self._conditions[search_id]
        async with condition:
            condition.notify_all()
        return item.model_copy(deep=True)

    async def events_after(
        self, search_id: str, last_event_id: str | None
    ) -> list[SearchEvent]:
        try:
            cursor = int(last_event_id or "0")
        except ValueError:
            cursor = 0
        return [
            item.model_copy(deep=True)
            for item in self._events.get(search_id, ())
            if int(item.event_id) > cursor
        ]

    async def subscribe(
        self,
        search_id: str,
        last_event_id: str | None,
        *,
        heartbeat_seconds: float = 15.0,
    ) -> AsyncIterator[SearchEvent]:
        cursor = last_event_id
        while True:
            backlog = await self.events_after(search_id, cursor)
            if backlog:
                for item in backlog:
                    cursor = item.event_id
                    yield item
                if backlog[-1].event in TERMINAL_EVENT_TYPES:
                    return
                continue

            condition = self._conditions[search_id]
            try:
                async with condition:
                    await asyncio.wait_for(
                        condition.wait(), timeout=max(heartbeat_seconds, 0.05)
                    )
            except TimeoutError:
                yield SearchEvent(
                    event_id=cursor or "0",
                    search_id=search_id,
                    event=SearchEventType.HEARTBEAT,
                    data={},
                )

    async def remember_idempotency(
        self, key: str, search_id: str, *, ttl_seconds: int
    ) -> str:
        now = self._now()
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        async with self._lock:
            current = self._idempotency.get(digest)
            if self._active(current, now):
                return str(current.value)
            self._idempotency[digest] = _ExpiringValue(search_id, now + ttl_seconds)
            return search_id

    async def cache_get(self, key: str) -> dict[str, Any] | None:
        now = self._now()
        item = self._cache.get(key)
        if not self._active(item, now):
            self._cache.pop(key, None)
            return None
        return json.loads(json.dumps(item.value))

    async def cache_set(
        self, key: str, value: dict[str, Any], *, ttl_seconds: int
    ) -> None:
        self._cache[key] = _ExpiringValue(
            json.loads(json.dumps(value, default=str)), self._now() + ttl_seconds
        )

    async def acquire_lease(self, key: str, *, ttl_seconds: int) -> str | None:
        now = self._now()
        async with self._lock:
            current = self._leases.get(key)
            if self._active(current, now):
                return None
            token = secrets.token_urlsafe(24)
            self._leases[key] = _ExpiringValue(token, now + ttl_seconds)
            return token

    async def release_lease(self, key: str, token: str) -> bool:
        async with self._lock:
            current = self._leases.get(key)
            if current is None or not secrets.compare_digest(str(current.value), token):
                return False
            self._leases.pop(key, None)
            return True

    async def allow_rate(
        self, key: str, *, limit: int, window_seconds: int
    ) -> bool:
        now = self._now()
        bucket = self._rates[key]
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True

    async def heartbeat(self, worker_id: str, *, ttl_seconds: int = 30) -> None:
        self._heartbeats[worker_id] = _ExpiringValue(True, self._now() + ttl_seconds)

    async def healthy(self) -> bool:
        return True

    async def close(self) -> None:
        return None


class RedisTravelRuntime:
    """Redis implementation used by separate API and worker processes."""

    _RELEASE_LEASE = """
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    end
    return 0
    """

    def __init__(self, client: Any, *, namespace: str = "jacobi:travel") -> None:
        self._client = client
        self._namespace = namespace.rstrip(":")
        self._queue_key = f"{self._namespace}:jobs"

    @classmethod
    def from_url(cls, url: str, *, namespace: str = "jacobi:travel") -> "RedisTravelRuntime":
        try:
            import redis.asyncio as redis
        except ImportError as exc:  # pragma: no cover - configuration failure
            raise TravelRuntimeConfigurationError(
                "Redis travel runtime selected but the redis package is unavailable"
            ) from exc
        client = redis.from_url(url, decode_responses=True, protocol=2)
        return cls(client, namespace=namespace)

    def _key(self, kind: str, value: str) -> str:
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
        return f"{self._namespace}:{kind}:{digest}"

    def _events_key(self, search_id: str) -> str:
        return f"{self._namespace}:events:{search_id}"

    async def enqueue(self, job: SearchJob) -> None:
        await self._client.lpush(self._queue_key, job.model_dump_json())

    async def claim(self, *, timeout_seconds: float = 1.0) -> SearchJob | None:
        timeout = max(1, int(round(timeout_seconds)))
        item = await self._client.brpop(self._queue_key, timeout=timeout)
        if item is None:
            return None
        return SearchJob.model_validate_json(item[1])

    async def publish(
        self, search_id: str, event: SearchEventType, data: dict[str, Any]
    ) -> SearchEvent:
        key = self._events_key(search_id)
        created_at = datetime.now(timezone.utc)
        event_id = await self._client.xadd(
            key,
            {
                "event": event.value,
                "data": json.dumps(data, separators=(",", ":"), default=str),
                "created_at": created_at.isoformat(),
            },
            maxlen=500,
            approximate=True,
        )
        await self._client.expire(key, DEFAULT_EVENT_TTL_SECONDS)
        return SearchEvent(
            event_id=str(event_id),
            search_id=search_id,
            event=event,
            data=data,
            created_at=created_at,
        )

    @staticmethod
    def _event(search_id: str, item: tuple[str, dict[str, str]]) -> SearchEvent:
        event_id, values = item
        return SearchEvent(
            event_id=str(event_id),
            search_id=search_id,
            event=SearchEventType(values["event"]),
            data=json.loads(values.get("data") or "{}"),
            created_at=datetime.fromisoformat(values["created_at"]),
        )

    async def events_after(
        self, search_id: str, last_event_id: str | None
    ) -> list[SearchEvent]:
        minimum = f"({last_event_id}" if last_event_id else "-"
        rows = await self._client.xrange(self._events_key(search_id), min=minimum, max="+")
        return [self._event(search_id, row) for row in rows]

    async def subscribe(
        self,
        search_id: str,
        last_event_id: str | None,
        *,
        heartbeat_seconds: float = 15.0,
    ) -> AsyncIterator[SearchEvent]:
        cursor = last_event_id or "0-0"
        while True:
            rows = await self._client.xread(
                {self._events_key(search_id): cursor},
                count=100,
                block=max(1, int(heartbeat_seconds * 1000)),
            )
            if not rows:
                yield SearchEvent(
                    event_id=cursor,
                    search_id=search_id,
                    event=SearchEventType.HEARTBEAT,
                    data={},
                )
                continue
            for _, entries in rows:
                for row in entries:
                    item = self._event(search_id, row)
                    cursor = item.event_id
                    yield item
                    if item.event in TERMINAL_EVENT_TYPES:
                        return

    async def remember_idempotency(
        self, key: str, search_id: str, *, ttl_seconds: int
    ) -> str:
        redis_key = self._key("idempotency", key)
        inserted = await self._client.set(redis_key, search_id, ex=ttl_seconds, nx=True)
        if inserted:
            return search_id
        existing = await self._client.get(redis_key)
        return str(existing or search_id)

    async def cache_get(self, key: str) -> dict[str, Any] | None:
        value = await self._client.get(self._key("cache", key))
        return json.loads(value) if value else None

    async def cache_set(
        self, key: str, value: dict[str, Any], *, ttl_seconds: int
    ) -> None:
        await self._client.set(
            self._key("cache", key),
            json.dumps(value, separators=(",", ":"), default=str),
            ex=ttl_seconds,
        )

    async def acquire_lease(self, key: str, *, ttl_seconds: int) -> str | None:
        token = secrets.token_urlsafe(24)
        acquired = await self._client.set(
            self._key("lease", key), token, ex=ttl_seconds, nx=True
        )
        return token if acquired else None

    async def release_lease(self, key: str, token: str) -> bool:
        result = await self._client.eval(
            self._RELEASE_LEASE, 1, self._key("lease", key), token
        )
        return bool(result)

    async def allow_rate(
        self, key: str, *, limit: int, window_seconds: int
    ) -> bool:
        redis_key = self._key("rate", key)
        count = await self._client.incr(redis_key)
        if count == 1:
            await self._client.expire(redis_key, window_seconds)
        return int(count) <= limit

    async def heartbeat(self, worker_id: str, *, ttl_seconds: int = 30) -> None:
        await self._client.set(
            self._key("worker", worker_id),
            datetime.now(timezone.utc).isoformat(),
            ex=ttl_seconds,
        )

    async def healthy(self) -> bool:
        try:
            return bool(await self._client.ping())
        except Exception:
            return False

    async def close(self) -> None:
        await self._client.aclose()


_RUNTIME: TravelRuntime | None = None


def _production_like() -> bool:
    return any(
        os.getenv(name, "").strip().lower() in {"production", "prod", "1", "true"}
        for name in ("APP_ENV", "VERCEL_ENV", "ENV", "NODE_ENV", "JACOBI_PRODUCTION")
    )


def reset_travel_runtime_for_tests() -> None:
    global _RUNTIME
    _RUNTIME = None


def get_travel_runtime() -> TravelRuntime:
    global _RUNTIME
    if _RUNTIME is not None:
        return _RUNTIME
    backend = os.getenv("JACOBI_TRAVEL_RUNTIME", "").strip().lower()
    if not backend:
        backend = "redis" if _production_like() else "memory"
    if backend == "memory":
        if _production_like() and os.getenv("JACOBI_ALLOW_MEMORY_TRAVEL_RUNTIME") != "1":
            raise TravelRuntimeConfigurationError(
                "production travel runtime requires Redis; memory is development-only"
            )
        _RUNTIME = MemoryTravelRuntime()
        return _RUNTIME
    if backend == "redis":
        url = os.getenv("REDIS_URL", "").strip()
        if not url:
            raise TravelRuntimeConfigurationError(
                "JACOBI_TRAVEL_RUNTIME=redis requires REDIS_URL"
            )
        _RUNTIME = RedisTravelRuntime.from_url(url)
        return _RUNTIME
    raise TravelRuntimeConfigurationError(
        f"unsupported JACOBI_TRAVEL_RUNTIME value: {backend!r}"
    )
