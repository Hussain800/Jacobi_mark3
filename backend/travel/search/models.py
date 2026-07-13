"""Search state and event contracts shared by API and worker processes."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SearchStatus(str, Enum):
    ACCEPTED = "accepted"
    PARSED = "parsed"
    CACHE_CHECKED = "cache_checked"
    RUNNING = "running"
    PARTIAL = "partial"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    DEGRADED = "degraded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


TERMINAL_STATUSES = frozenset(
    {
        SearchStatus.COMPLETED,
        SearchStatus.DEGRADED,
        SearchStatus.FAILED,
        SearchStatus.CANCELLED,
        SearchStatus.EXPIRED,
    }
)

ALLOWED_TRANSITIONS: dict[SearchStatus, frozenset[SearchStatus]] = {
    SearchStatus.ACCEPTED: frozenset({SearchStatus.PARSED, SearchStatus.FAILED, SearchStatus.CANCELLED}),
    SearchStatus.PARSED: frozenset({SearchStatus.CACHE_CHECKED, SearchStatus.FAILED, SearchStatus.CANCELLED}),
    SearchStatus.CACHE_CHECKED: frozenset({SearchStatus.RUNNING, SearchStatus.COMPLETED, SearchStatus.FAILED, SearchStatus.CANCELLED}),
    SearchStatus.RUNNING: frozenset({SearchStatus.PARTIAL, SearchStatus.VERIFYING, SearchStatus.DEGRADED, SearchStatus.FAILED, SearchStatus.CANCELLED}),
    SearchStatus.PARTIAL: frozenset({SearchStatus.PARTIAL, SearchStatus.VERIFYING, SearchStatus.COMPLETED, SearchStatus.DEGRADED, SearchStatus.FAILED, SearchStatus.CANCELLED}),
    SearchStatus.VERIFYING: frozenset({SearchStatus.PARTIAL, SearchStatus.COMPLETED, SearchStatus.DEGRADED, SearchStatus.FAILED, SearchStatus.CANCELLED}),
    SearchStatus.COMPLETED: frozenset({SearchStatus.EXPIRED}),
    SearchStatus.DEGRADED: frozenset({SearchStatus.EXPIRED}),
    SearchStatus.FAILED: frozenset({SearchStatus.EXPIRED}),
    SearchStatus.CANCELLED: frozenset({SearchStatus.EXPIRED}),
    SearchStatus.EXPIRED: frozenset(),
}


def validate_transition(current: SearchStatus, target: SearchStatus) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"invalid travel search transition: {current.value} -> {target.value}")


class SearchEventType(str, Enum):
    SEARCH_ACCEPTED = "search.accepted"
    INTENT_VALIDATED = "intent.validated"
    CACHE_HIT = "cache.hit"
    PROVIDER_QUEUED = "provider.queued"
    PROVIDER_STARTED = "provider.started"
    PROVIDER_PARTIAL = "provider.partial"
    PROVIDER_COMPLETED = "provider.completed"
    PROVIDER_FAILED = "provider.failed"
    OFFER_ADDED = "offer.added"
    OFFER_UPDATED = "offer.updated"
    OFFER_REJECTED = "offer.rejected"
    RANKING_UPDATED = "ranking.updated"
    SEARCH_DEGRADED = "search.degraded"
    SEARCH_COMPLETED = "search.completed"
    SEARCH_FAILED = "search.failed"
    HEARTBEAT = "heartbeat"


class SearchEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=1, max_length=128)
    search_id: str = Field(min_length=1, max_length=128)
    event: SearchEventType
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)


class SearchJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    search_id: str = Field(min_length=1, max_length=128)
    intent_fingerprint: str = Field(min_length=16, max_length=128)
    requested_providers: tuple[str, ...] = ()
    attempt: int = Field(default=0, ge=0, le=10)
    enqueued_at: datetime = Field(default_factory=utcnow)
    hard_deadline_at: datetime

    @field_validator("requested_providers")
    @classmethod
    def normalize_providers(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        normalized = tuple(dict.fromkeys(item.strip().lower() for item in value if item.strip()))
        if len(normalized) > 20:
            raise ValueError("at most 20 providers may be requested")
        return normalized
