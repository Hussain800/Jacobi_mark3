from __future__ import annotations

from datetime import datetime, timedelta, timezone

from travel.search.access import issue_capability, verify_capability
from travel.search.models import SearchEvent, SearchEventType
from travel.search.sse import encode_sse


def test_capability_is_opaque_hash_only_and_expires() -> None:
    issued = issue_capability(ttl_seconds=60)
    assert issued.token not in issued.token_hash
    assert verify_capability(issued.token, issued.token_hash, issued.expires_at)
    assert not verify_capability("wrong", issued.token_hash, issued.expires_at)
    assert not verify_capability(
        issued.token,
        issued.token_hash,
        issued.expires_at,
        now=issued.expires_at + timedelta(seconds=1),
    )


def test_sse_encoding_has_replay_id_named_event_and_single_json_data_line() -> None:
    event = SearchEvent(
        event_id="12-0",
        search_id="search-1",
        event=SearchEventType.OFFER_ADDED,
        data={"headline": "safe\nretry: 0", "amount": "100.00"},
        created_at=datetime(2026, 7, 13, tzinfo=timezone.utc),
    )
    encoded = encode_sse(event).decode("utf-8")
    assert encoded.startswith("id: 12-0\nevent: offer.added\ndata: ")
    assert encoded.count("\ndata: ") == 1
    assert "safe\\nretry: 0" in encoded
    assert encoded.endswith("\n\n")


def test_heartbeat_does_not_advance_replay_cursor() -> None:
    event = SearchEvent(
        event_id="9-0",
        search_id="search-1",
        event=SearchEventType.HEARTBEAT,
        data={},
    )
    encoded = encode_sse(event).decode("utf-8")
    assert "id:" not in encoded
    assert "event: heartbeat" in encoded
