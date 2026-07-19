"""Bounded in-memory travel Market Graph for development and tests."""

from __future__ import annotations

from collections import OrderedDict
from threading import RLock
from typing import Any, Mapping, Optional

from pydantic import BaseModel

from .access import normalize_identifier
from .base import (
    COLLECTION_SPECS,
    DEFAULT_MAX_RECORDS,
    TravelRepository,
    TravelStoredRecord,
    json_safe,
    normalize_links,
    normalize_payload,
)


def _copy_record(record: TravelStoredRecord) -> TravelStoredRecord:
    return TravelStoredRecord(
        record_id=record.record_id,
        payload=normalize_payload(record.payload),
        owner_id=record.owner_id,
        links={key: json_safe(value) for key, value in (record.links or {}).items()},
    )


class InMemoryTravelRepository(TravelRepository):
    """Process-local FIFO storage with the production access contract."""

    def __init__(self, max_records: int = DEFAULT_MAX_RECORDS) -> None:
        if max_records < 1:
            raise ValueError("max_records must be positive")
        self.max_records = max_records
        self._stores: dict[str, OrderedDict[str, TravelStoredRecord]] = {
            collection: OrderedDict() for collection in COLLECTION_SPECS
        }
        self._lock = RLock()

    def _put_raw(
        self,
        collection: str,
        record_id: str,
        payload: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
    ) -> TravelStoredRecord:
        key = normalize_identifier(record_id)
        owner = (
            normalize_identifier(owner_id, "owner id")
            if owner_id is not None
            else None
        )
        record = TravelStoredRecord(
            record_id=key,
            payload=normalize_payload(payload),
            owner_id=owner,
            links=normalize_links(collection, links or {}),
        )
        with self._lock:
            store = self._stores[collection]
            store[key] = record
            while len(store) > self.max_records:
                store.popitem(last=False)
        return _copy_record(record)

    def _get_raw(
        self, collection: str, record_id: str
    ) -> Optional[TravelStoredRecord]:
        key = normalize_identifier(record_id)
        with self._lock:
            record = self._stores[collection].get(key)
            return _copy_record(record) if record is not None else None

    def _list_raw(
        self,
        collection: str,
        *,
        owner_id: Optional[str] = None,
        scope_owner: bool = True,
        links: Mapping[str, Any] | None = None,
        limit: Optional[int] = None,
    ) -> list[TravelStoredRecord]:
        if limit is not None and limit < 0:
            raise ValueError("limit must not be negative")
        owner = (
            normalize_identifier(owner_id, "owner id")
            if owner_id is not None
            else None
        )
        expected_links = normalize_links(collection, links or {})
        with self._lock:
            records = [
                _copy_record(record)
                for record in self._stores[collection].values()
                if (not scope_owner or record.owner_id == owner)
                and all(
                    (record.links or {}).get(key) == value
                    for key, value in expected_links.items()
                )
            ]
        return records if limit is None else records[:limit]

    def _delete_raw(self, collection: str, record_id: str) -> bool:
        key = normalize_identifier(record_id)
        with self._lock:
            if key not in self._stores[collection]:
                return False
            del self._stores[collection][key]
            return True
