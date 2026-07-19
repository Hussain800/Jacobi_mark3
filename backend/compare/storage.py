"""Persistence boundary for price-optimization records.

The comparison core passes JSON-compatible snapshots through this repository
rather than depending on a database SDK. Local development uses a bounded,
deterministic in-memory implementation. Supabase is an explicit production
choice and fails closed when it is selected without a configured client.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any, Mapping, Optional
from uuid import UUID

from pydantic import BaseModel

try:
    from supabase_client import get_supabase
except ImportError:  # pragma: no cover - supports imports from the repository root
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from supabase_client import get_supabase


DEFAULT_MAX_RECORDS = 500
STORAGE_ENV = "JACOBI_COMPARE_STORAGE"


class PersistenceConfigurationError(RuntimeError):
    """Raised when the requested persistence backend cannot be constructed."""


@dataclass(frozen=True)
class StoredRecord:
    """Repository-neutral record returned by every persistence implementation."""

    record_id: str
    payload: dict[str, Any]
    owner_id: Optional[str] = None
    links: dict[str, Any] | None = None


@dataclass(frozen=True)
class _CollectionSpec:
    table: str
    id_column: str
    owner_column: Optional[str] = None
    link_columns: tuple[str, ...] = ()


_SPECS: dict[str, _CollectionSpec] = {
    "products": _CollectionSpec("catalog_products", "product_id"),
    "aliases": _CollectionSpec(
        "product_aliases", "alias_id", link_columns=("product_id",)
    ),
    "offers": _CollectionSpec(
        "offer_observations",
        "observation_id",
        owner_column="user_id",
        link_columns=("product_id", "evidence_manifest_id"),
    ),
    "comparisons": _CollectionSpec(
        "comparison_runs",
        "comparison_id",
        owner_column="user_id",
        link_columns=("product_id", "evidence_manifest_id"),
    ),
    "candidates": _CollectionSpec(
        "comparison_candidates",
        "candidate_id",
        owner_column="user_id",
        link_columns=("comparison_id", "offer_observation_id"),
    ),
    "evidence": _CollectionSpec(
        "optimization_evidence_references",
        "reference_id",
        owner_column="user_id",
        link_columns=("comparison_id", "offer_observation_id"),
    ),
    "watches": _CollectionSpec(
        "price_watches",
        "watch_id",
        owner_column="user_id",
        link_columns=("product_id", "offer_observation_id"),
    ),
    "preferences": _CollectionSpec(
        "user_preferences", "user_id", owner_column="user_id"
    ),
    "events": _CollectionSpec(
        "comparison_events",
        "event_id",
        owner_column="user_id",
        link_columns=("comparison_id",),
    ),
}


def json_safe(value: Any) -> Any:
    """Return a JSON-safe value while preserving Decimal precision as text."""

    if isinstance(value, BaseModel):
        return json_safe(value.model_dump(mode="python"))
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, Enum):
        return json_safe(value.value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return [json_safe(item) for item in sorted(value, key=str)]
    return value


def _record_id(value: str) -> str:
    normalized = str(value).strip()
    if not normalized:
        raise ValueError("record id must not be blank")
    if len(normalized) > 200:
        raise ValueError("record id must be 200 characters or fewer")
    return normalized


def _payload(value: BaseModel | Mapping[str, Any]) -> dict[str, Any]:
    serialized = json_safe(value)
    if not isinstance(serialized, dict):
        raise TypeError("repository payload must be a mapping or Pydantic model")
    return serialized


def _links(collection: str, values: Mapping[str, Any]) -> dict[str, Any]:
    allowed = set(_SPECS[collection].link_columns)
    unexpected = set(values) - allowed
    if unexpected:
        raise ValueError(
            f"unsupported {collection} link fields: {', '.join(sorted(unexpected))}"
        )
    return {key: json_safe(value) for key, value in values.items() if value is not None}


def _copy_record(record: StoredRecord) -> StoredRecord:
    return StoredRecord(
        record_id=record.record_id,
        payload=_payload(record.payload),
        owner_id=record.owner_id,
        links=dict(record.links or {}),
    )


class ComparisonRepository(ABC):
    """Repository interface shared by REST, MCP, CLI, and background jobs."""

    @abstractmethod
    def _put(
        self,
        collection: str,
        record_id: str,
        payload: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
    ) -> StoredRecord: ...

    @abstractmethod
    def _get(
        self, collection: str, record_id: str, *, owner_id: Optional[str] = None
    ) -> Optional[StoredRecord]: ...

    @abstractmethod
    def _list(
        self,
        collection: str,
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
        limit: Optional[int] = None,
    ) -> list[StoredRecord]: ...

    @abstractmethod
    def _delete(
        self, collection: str, record_id: str, *, owner_id: Optional[str] = None
    ) -> bool: ...

    def save_product(
        self, product_id: str, product: BaseModel | Mapping[str, Any]
    ) -> StoredRecord:
        return self._put("products", product_id, product)

    def get_product(self, product_id: str) -> Optional[StoredRecord]:
        return self._get("products", product_id)

    def list_products(self, *, limit: Optional[int] = None) -> list[StoredRecord]:
        return self._list("products", limit=limit)

    def save_alias(
        self,
        alias_id: str,
        product_id: str,
        alias: BaseModel | Mapping[str, Any],
    ) -> StoredRecord:
        return self._put(
            "aliases", alias_id, alias, links={"product_id": _record_id(product_id)}
        )

    def list_aliases(self, product_id: str) -> list[StoredRecord]:
        return self._list("aliases", links={"product_id": _record_id(product_id)})

    def save_offer(
        self,
        observation_id: str,
        offer: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        product_id: Optional[str] = None,
        evidence_manifest_id: Optional[str] = None,
    ) -> StoredRecord:
        return self._put(
            "offers",
            observation_id,
            offer,
            owner_id=owner_id,
            links={
                "product_id": product_id,
                "evidence_manifest_id": evidence_manifest_id,
            },
        )

    def get_offer(
        self, observation_id: str, *, owner_id: Optional[str] = None
    ) -> Optional[StoredRecord]:
        return self._get("offers", observation_id, owner_id=owner_id)

    def list_offers(
        self,
        *,
        owner_id: Optional[str] = None,
        product_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list[StoredRecord]:
        links = {"product_id": product_id} if product_id is not None else None
        return self._list("offers", owner_id=owner_id, links=links, limit=limit)

    def save_comparison(
        self,
        comparison_id: str,
        comparison: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        product_id: Optional[str] = None,
        evidence_manifest_id: Optional[str] = None,
    ) -> StoredRecord:
        return self._put(
            "comparisons",
            comparison_id,
            comparison,
            owner_id=owner_id,
            links={
                "product_id": product_id,
                "evidence_manifest_id": evidence_manifest_id,
            },
        )

    def get_comparison(
        self, comparison_id: str, *, owner_id: Optional[str] = None
    ) -> Optional[StoredRecord]:
        return self._get("comparisons", comparison_id, owner_id=owner_id)

    def list_comparisons(
        self, *, owner_id: Optional[str] = None, limit: Optional[int] = None
    ) -> list[StoredRecord]:
        return self._list("comparisons", owner_id=owner_id, limit=limit)

    def save_candidate(
        self,
        candidate_id: str,
        comparison_id: str,
        candidate: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        offer_observation_id: Optional[str] = None,
    ) -> StoredRecord:
        return self._put(
            "candidates",
            candidate_id,
            candidate,
            owner_id=owner_id,
            links={
                "comparison_id": _record_id(comparison_id),
                "offer_observation_id": offer_observation_id,
            },
        )

    def list_candidates(
        self, comparison_id: str, *, owner_id: Optional[str] = None
    ) -> list[StoredRecord]:
        return self._list(
            "candidates",
            owner_id=owner_id,
            links={"comparison_id": _record_id(comparison_id)},
        )

    def save_evidence_reference(
        self,
        reference_id: str,
        evidence: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        comparison_id: Optional[str] = None,
        offer_observation_id: Optional[str] = None,
    ) -> StoredRecord:
        if comparison_id is None and offer_observation_id is None:
            raise ValueError("evidence reference must link to a comparison or offer")
        return self._put(
            "evidence",
            reference_id,
            evidence,
            owner_id=owner_id,
            links={
                "comparison_id": comparison_id,
                "offer_observation_id": offer_observation_id,
            },
        )

    def list_evidence_references(
        self,
        *,
        owner_id: Optional[str] = None,
        comparison_id: Optional[str] = None,
        offer_observation_id: Optional[str] = None,
    ) -> list[StoredRecord]:
        links = {
            key: value
            for key, value in {
                "comparison_id": comparison_id,
                "offer_observation_id": offer_observation_id,
            }.items()
            if value is not None
        }
        return self._list("evidence", owner_id=owner_id, links=links or None)

    def save_watch(
        self,
        watch_id: str,
        watch: BaseModel | Mapping[str, Any],
        *,
        owner_id: str,
        product_id: Optional[str] = None,
        offer_observation_id: Optional[str] = None,
    ) -> StoredRecord:
        if product_id is None and offer_observation_id is None:
            raise ValueError("price watch must link to a product or offer")
        return self._put(
            "watches",
            watch_id,
            watch,
            owner_id=_record_id(owner_id),
            links={
                "product_id": product_id,
                "offer_observation_id": offer_observation_id,
            },
        )

    def get_watch(self, watch_id: str, *, owner_id: str) -> Optional[StoredRecord]:
        return self._get("watches", watch_id, owner_id=_record_id(owner_id))

    def list_watches(self, *, owner_id: str) -> list[StoredRecord]:
        return self._list("watches", owner_id=_record_id(owner_id))

    def delete_watch(self, watch_id: str, *, owner_id: str) -> bool:
        return self._delete("watches", watch_id, owner_id=_record_id(owner_id))

    def save_preferences(
        self, owner_id: str, preferences: BaseModel | Mapping[str, Any]
    ) -> StoredRecord:
        owner = _record_id(owner_id)
        return self._put("preferences", owner, preferences, owner_id=owner)

    def get_preferences(self, owner_id: str) -> Optional[StoredRecord]:
        owner = _record_id(owner_id)
        return self._get("preferences", owner, owner_id=owner)

    def append_event(
        self,
        event_id: str,
        comparison_id: str,
        event: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
    ) -> StoredRecord:
        return self._put(
            "events",
            event_id,
            event,
            owner_id=owner_id,
            links={"comparison_id": _record_id(comparison_id)},
        )

    def list_events(
        self, comparison_id: str, *, owner_id: Optional[str] = None
    ) -> list[StoredRecord]:
        return self._list(
            "events",
            owner_id=owner_id,
            links={"comparison_id": _record_id(comparison_id)},
        )


class InMemoryComparisonRepository(ComparisonRepository):
    """Bounded FIFO stores with stable insertion-order reads and owner isolation."""

    def __init__(self, max_records: int = DEFAULT_MAX_RECORDS) -> None:
        if max_records < 1:
            raise ValueError("max_records must be positive")
        self.max_records = max_records
        self._stores: dict[str, OrderedDict[str, StoredRecord]] = {
            name: OrderedDict() for name in _SPECS
        }

    def _put(
        self,
        collection: str,
        record_id: str,
        payload: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
    ) -> StoredRecord:
        key = _record_id(record_id)
        owner = _record_id(owner_id) if owner_id is not None else None
        record = StoredRecord(
            record_id=key,
            payload=_payload(payload),
            owner_id=owner,
            links=_links(collection, links or {}),
        )
        store = self._stores[collection]
        store[key] = record
        while len(store) > self.max_records:
            store.popitem(last=False)
        return _copy_record(record)

    def _get(
        self, collection: str, record_id: str, *, owner_id: Optional[str] = None
    ) -> Optional[StoredRecord]:
        record = self._stores[collection].get(_record_id(record_id))
        expected_owner = _record_id(owner_id) if owner_id is not None else None
        if record is None or record.owner_id != expected_owner:
            return None
        return _copy_record(record)

    def _list(
        self,
        collection: str,
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
        limit: Optional[int] = None,
    ) -> list[StoredRecord]:
        expected_owner = _record_id(owner_id) if owner_id is not None else None
        expected_links = _links(collection, links or {})
        if limit is not None and limit < 0:
            raise ValueError("limit must not be negative")
        records = [
            _copy_record(record)
            for record in self._stores[collection].values()
            if record.owner_id == expected_owner
            and all((record.links or {}).get(key) == value for key, value in expected_links.items())
        ]
        return records if limit is None else records[:limit]

    def _delete(
        self, collection: str, record_id: str, *, owner_id: Optional[str] = None
    ) -> bool:
        key = _record_id(record_id)
        existing = self._get(collection, key, owner_id=owner_id)
        if existing is None:
            return False
        del self._stores[collection][key]
        return True


class SupabaseComparisonRepository(ComparisonRepository):
    """Service-role Supabase adapter; construction never falls back to memory."""

    def __init__(self, client: Any = None) -> None:
        self._client = client if client is not None else get_supabase()
        if self._client is None:
            raise PersistenceConfigurationError(
                f"{STORAGE_ENV}=supabase but Supabase is not configured"
            )

    @staticmethod
    def _scope(query: Any, spec: _CollectionSpec, owner_id: Optional[str]) -> Any:
        if spec.owner_column is None:
            return query
        if owner_id is None:
            return query.is_(spec.owner_column, "null")
        return query.eq(spec.owner_column, _record_id(owner_id))

    @staticmethod
    def _from_row(collection: str, row: Mapping[str, Any]) -> StoredRecord:
        spec = _SPECS[collection]
        return StoredRecord(
            record_id=str(row[spec.id_column]),
            payload=_payload(row.get("payload") or {}),
            owner_id=(
                str(row[spec.owner_column])
                if spec.owner_column and row.get(spec.owner_column) is not None
                else None
            ),
            links={
                column: json_safe(row[column])
                for column in spec.link_columns
                if row.get(column) is not None
            },
        )

    def _put(
        self,
        collection: str,
        record_id: str,
        payload: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
    ) -> StoredRecord:
        spec = _SPECS[collection]
        key = _record_id(record_id)
        owner = _record_id(owner_id) if owner_id is not None else None
        safe_links = _links(collection, links or {})
        row: dict[str, Any] = {spec.id_column: key, "payload": _payload(payload), **safe_links}
        if spec.owner_column is not None:
            row[spec.owner_column] = owner
        self._client.table(spec.table).upsert(row).execute()
        return StoredRecord(key, dict(row["payload"]), owner, safe_links)

    def _get(
        self, collection: str, record_id: str, *, owner_id: Optional[str] = None
    ) -> Optional[StoredRecord]:
        spec = _SPECS[collection]
        query = self._client.table(spec.table).select("*").eq(
            spec.id_column, _record_id(record_id)
        )
        response = self._scope(query, spec, owner_id).limit(1).execute()
        rows = response.data or []
        return self._from_row(collection, rows[0]) if rows else None

    def _list(
        self,
        collection: str,
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
        limit: Optional[int] = None,
    ) -> list[StoredRecord]:
        if limit is not None and limit < 0:
            raise ValueError("limit must not be negative")
        spec = _SPECS[collection]
        query = self._scope(self._client.table(spec.table).select("*"), spec, owner_id)
        for column, value in _links(collection, links or {}).items():
            query = query.eq(column, value)
        query = query.order("created_at").order(spec.id_column)
        if limit is not None:
            query = query.limit(limit)
        response = query.execute()
        return [self._from_row(collection, row) for row in (response.data or [])]

    def _delete(
        self, collection: str, record_id: str, *, owner_id: Optional[str] = None
    ) -> bool:
        spec = _SPECS[collection]
        query = self._client.table(spec.table).delete().eq(
            spec.id_column, _record_id(record_id)
        )
        response = self._scope(query, spec, owner_id).execute()
        return bool(response.data)


def create_repository(
    backend: Optional[str] = None,
    *,
    max_records: int = DEFAULT_MAX_RECORDS,
    supabase_client: Any = None,
) -> ComparisonRepository:
    """Create the explicitly selected repository without implicit degradation."""

    selected = (backend or os.getenv(STORAGE_ENV, "memory")).strip().lower()
    if selected == "memory":
        return InMemoryComparisonRepository(max_records=max_records)
    if selected == "supabase":
        return SupabaseComparisonRepository(client=supabase_client)
    raise PersistenceConfigurationError(
        f"unsupported {STORAGE_ENV} backend {selected!r}; expected 'memory' or 'supabase'"
    )
