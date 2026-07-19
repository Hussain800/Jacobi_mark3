"""Server-Sent Event formatting for progressive travel searches."""

from __future__ import annotations

import json

from .models import SearchEvent, SearchEventType


def encode_sse(event: SearchEvent) -> bytes:
    """Encode one event without allowing payload text to alter SSE framing."""

    payload = json.dumps(
        {
            "search_id": event.search_id,
            "created_at": event.created_at.isoformat(),
            **event.data,
        },
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )
    lines = []
    if event.event is not SearchEventType.HEARTBEAT:
        lines.append(f"id: {event.event_id}")
    lines.extend((f"event: {event.event.value}", f"data: {payload}", "", ""))
    return "\n".join(lines).encode("utf-8")
