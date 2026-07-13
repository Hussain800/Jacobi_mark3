"""Service-role Supabase adapter for the travel Market Graph."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Optional

from pydantic import BaseModel

from .access import PersistenceConfigurationError, normalize_identifier
from .base import (
    COLLECTION_SPECS,
    TravelRepository,
    TravelStoredRecord,
    json_safe,
    normalize_links,
    normalize_payload,
    projected_values,
)

try:
    from supabase_client import get_supabase
except ImportError:  # pragma: no cover - supports repository-root imports
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from supabase_client import get_supabase


class SupabaseTravelRepository(TravelRepository):
    """Synchronous service-role adapter; construction never degrades to memory."""

    def __init__(self, client: Any = None) -> None:
        self._client = client if client is not None else get_supabase()
        if self._client is None:
            raise PersistenceConfigurationError(
                "travel Supabase persistence requires SUPABASE_SERVICE_KEY"
            )

    @staticmethod
    def _from_row(collection: str, row: Mapping[str, Any]) -> TravelStoredRecord:
        spec = COLLECTION_SPECS[collection]
        return TravelStoredRecord(
            record_id=str(row[spec.id_column]),
            payload=normalize_payload(row.get("payload") or {}),
            owner_id=(
                str(row[spec.owner_column])
                if spec.owner_column and row.get(spec.owner_column) is not None
                else None
            ),
            links={
                column: json_safe(row[column])
                for column in spec.stored_columns
                if row.get(column) is not None
            },
        )

    def _put_raw(
        self,
        collection: str,
        record_id: str,
        payload: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
    ) -> TravelStoredRecord:
        spec = COLLECTION_SPECS[collection]
        key = normalize_identifier(record_id)
        owner = (
            normalize_identifier(owner_id, "owner id")
            if owner_id is not None
            else None
        )
        safe_payload = normalize_payload(payload)
        safe_links = normalize_links(collection, links or {})
        row: dict[str, Any] = {
            spec.id_column: key,
            "payload": safe_payload,
            **projected_values(collection, safe_payload),
            **safe_links,
        }
        if spec.owner_column:
            row[spec.owner_column] = owner
        self._client.table(spec.table).upsert(row).execute()
        return TravelStoredRecord(key, safe_payload, owner, safe_links)

    def _get_raw(
        self, collection: str, record_id: str
    ) -> Optional[TravelStoredRecord]:
        spec = COLLECTION_SPECS[collection]
        response = (
            self._client.table(spec.table)
            .select("*")
            .eq(spec.id_column, normalize_identifier(record_id))
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return self._from_row(collection, rows[0]) if rows else None

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
        spec = COLLECTION_SPECS[collection]
        query = self._client.table(spec.table).select("*")
        if scope_owner and spec.owner_column:
            if owner_id is None:
                query = query.is_(spec.owner_column, "null")
            else:
                query = query.eq(
                    spec.owner_column, normalize_identifier(owner_id, "owner id")
                )
        for column, value in normalize_links(collection, links or {}).items():
            query = query.eq(column, value)
        query = query.order("created_at").order(spec.id_column)
        if limit is not None:
            query = query.limit(limit)
        response = query.execute()
        return [self._from_row(collection, row) for row in (response.data or [])]

    def _delete_raw(self, collection: str, record_id: str) -> bool:
        spec = COLLECTION_SPECS[collection]
        response = (
            self._client.table(spec.table)
            .delete()
            .eq(spec.id_column, normalize_identifier(record_id))
            .execute()
        )
        return bool(response.data)
