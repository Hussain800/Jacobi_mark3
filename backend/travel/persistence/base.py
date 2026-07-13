"""Repository contract for the relational travel Market Graph."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Mapping, Optional
from uuid import UUID

from pydantic import BaseModel

from .access import (
    AccessContext,
    AccessDeniedError,
    TravelPersistenceError,
    capability_matches,
    hash_capability_token,
    normalize_identifier,
)


DEFAULT_MAX_RECORDS = 500
DEFAULT_MAX_PAYLOAD_BYTES = 256 * 1024
MAX_SEARCH_PAYLOAD_BYTES = 32 * 1024

# Delete user-linked records from leaves to roots so the contract is valid for
# both the memory repository and relational stores with restrictive foreign
# keys. Service-owned canonical catalogues are deliberately outside this list.
USER_OWNED_COLLECTIONS: tuple[str, ...] = (
    "redirects",
    "revalidations",
    "feedback",
    "evidence",
    "cost_components",
    "offers",
    "provider_attempts",
    "searches",
    "preferences",
)
DEIDENTIFIED_MARKET_COLLECTIONS: tuple[str, ...] = (
    "flight_itineraries",
    "hotel_properties",
    "hotel_crosswalks",
)


@dataclass(frozen=True)
class TravelStoredRecord:
    """Repository-neutral normalized record."""

    record_id: str
    payload: dict[str, Any]
    owner_id: Optional[str] = None
    links: dict[str, Any] | None = None


@dataclass(frozen=True)
class UserDataDeletionResult:
    """Auditable result for one owner-scoped deletion request."""

    deleted_by_collection: Mapping[str, int]
    preserved_deidentified_collections: tuple[str, ...]

    @property
    def total_deleted(self) -> int:
        return sum(self.deleted_by_collection.values())


@dataclass(frozen=True)
class CollectionSpec:
    table: str
    id_column: str
    owner_column: Optional[str] = None
    link_columns: tuple[str, ...] = ()
    private_columns: tuple[str, ...] = ()
    projected_columns: tuple[str, ...] = ()

    @property
    def stored_columns(self) -> tuple[str, ...]:
        return self.link_columns + self.private_columns


COLLECTION_SPECS: dict[str, CollectionSpec] = {
    "searches": CollectionSpec(
        "travel_searches",
        "search_id",
        owner_column="user_id",
        private_columns=("capability_hash",),
        projected_columns=(
            "fingerprint",
            "vertical",
            "status",
            "market",
            "intent",
            "expires_at",
        ),
    ),
    "provider_attempts": CollectionSpec(
        "travel_provider_attempts",
        "attempt_id",
        owner_column="user_id",
        link_columns=("search_id",),
        projected_columns=(
            "provider",
            "provider_environment",
            "status",
            "started_at",
            "finished_at",
            "duration_ms",
            "http_status",
            "error_code",
            "error_message",
            "rate_limited",
            "request_count",
        ),
    ),
    "flight_itineraries": CollectionSpec(
        "travel_flight_itineraries",
        "itinerary_id",
        projected_columns=(
            "canonical_hash",
            "origin",
            "destination",
            "departure_date",
            "segments",
        ),
    ),
    "hotel_properties": CollectionSpec(
        "travel_hotel_properties",
        "property_id",
        projected_columns=(
            "canonical_hash",
            "name",
            "city_code",
            "country_code",
            "latitude",
            "longitude",
        ),
    ),
    "hotel_crosswalks": CollectionSpec(
        "travel_hotel_property_crosswalks",
        "crosswalk_id",
        link_columns=("property_id",),
        projected_columns=(
            "provider",
            "provider_property_id",
            "confidence",
            "evidence_id",
            "verified_at",
        ),
    ),
    "offers": CollectionSpec(
        "travel_offers",
        "offer_id",
        owner_column="user_id",
        link_columns=(
            "search_id",
            "provider_attempt_id",
            "itinerary_id",
            "hotel_property_id",
        ),
        projected_columns=(
            "provider",
            "supplier_id",
            "vertical",
            "currency",
            "item_amount",
            "total_amount",
            "total_complete",
            "observed_at",
            "expires_at",
            "deep_link_ref",
        ),
    ),
    "cost_components": CollectionSpec(
        "travel_offer_cost_components",
        "component_id",
        owner_column="user_id",
        link_columns=("search_id", "offer_id"),
        projected_columns=(
            "kind",
            "label",
            "amount",
            "currency",
            "mandatory",
            "included",
        ),
    ),
    "evidence": CollectionSpec(
        "travel_evidence",
        "evidence_id",
        owner_column="user_id",
        link_columns=("search_id", "offer_id", "provider_attempt_id"),
        projected_columns=(
            "evidence_kind",
            "manifest_id",
            "artifact_hash",
            "observed_at",
        ),
    ),
    "revalidations": CollectionSpec(
        "travel_revalidations",
        "revalidation_id",
        owner_column="user_id",
        link_columns=("search_id", "offer_id"),
        projected_columns=(
            "status",
            "requested_at",
            "completed_at",
            "currency",
            "total_amount",
            "available",
            "expires_at",
        ),
    ),
    "redirects": CollectionSpec(
        "travel_redirect_events",
        "redirect_id",
        owner_column="user_id",
        link_columns=("search_id", "offer_id", "revalidation_id"),
        private_columns=("authorization_hash",),
        projected_columns=(
            "status",
            "authorized_at",
            "expires_at",
            "consumed_at",
            "supplier_id",
            "target_origin",
        ),
    ),
    "feedback": CollectionSpec(
        "travel_feedback",
        "feedback_id",
        owner_column="user_id",
        link_columns=("search_id", "offer_id"),
        projected_columns=("feedback_type",),
    ),
    "preferences": CollectionSpec(
        "travel_preferences", "user_id", owner_column="user_id"
    ),
}


_SENSITIVE_PAYLOAD_KEYS = {
    "access_token",
    "api_key",
    "authorization",
    "capability_token",
    "cookie",
    "cookies",
    "html",
    "raw_body",
    "raw_payload",
    "raw_request",
    "raw_response",
    "request_headers",
    "response_body",
    "response_headers",
    "secret",
    "token",
}

_MARKET_LINKAGE_KEYS = {
    "account_id",
    "capability_hash",
    "email",
    "full_url",
    "guest_identity",
    "owner_id",
    "page_reference",
    "passenger_identity",
    "search_id",
    "session_id",
    "source_url",
    "user_id",
    "url",
}


def json_safe(value: Any) -> Any:
    """Return a JSON-compatible value while preserving Decimal precision."""

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


def normalize_payload(
    value: BaseModel | Mapping[str, Any],
    *,
    max_bytes: int = DEFAULT_MAX_PAYLOAD_BYTES,
) -> dict[str, Any]:
    serialized = json_safe(value)
    if not isinstance(serialized, dict):
        raise TypeError("repository payload must be a mapping or Pydantic model")
    try:
        encoded = json.dumps(serialized, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    except (TypeError, ValueError) as exc:
        raise TypeError("repository payload must be JSON-compatible") from exc
    if len(encoded) > max_bytes:
        raise ValueError(f"repository payload exceeds {max_bytes} bytes")
    return serialized


def validate_sanitized_payload(payload: Mapping[str, Any]) -> None:
    """Reject raw provider material and credentials at the persistence edge."""

    def walk(value: Any) -> None:
        if isinstance(value, Mapping):
            for key, item in value.items():
                normalized_key = str(key).strip().lower()
                if normalized_key in _SENSITIVE_PAYLOAD_KEYS:
                    raise ValueError(
                        f"sensitive or raw field {normalized_key!r} cannot be persisted"
                    )
                if normalized_key in {"error", "error_message"} and len(str(item)) > 2000:
                    raise ValueError("persisted provider errors must be 2000 characters or fewer")
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    walk(payload)


def validate_deidentified_market_payload(payload: Mapping[str, Any]) -> None:
    """Reject user/session linkage from catalogues retained after deletion."""

    validate_sanitized_payload(payload)

    def walk(value: Any) -> None:
        if isinstance(value, Mapping):
            for key, item in value.items():
                normalized_key = str(key).strip().lower()
                if normalized_key in _MARKET_LINKAGE_KEYS:
                    raise ValueError(
                        f"user-linked field {normalized_key!r} cannot be retained "
                        "as a de-identified market observation"
                    )
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    walk(payload)


def normalize_links(collection: str, values: Mapping[str, Any]) -> dict[str, Any]:
    spec = COLLECTION_SPECS[collection]
    allowed = set(spec.stored_columns)
    unexpected = set(values) - allowed
    if unexpected:
        raise ValueError(
            f"unsupported {collection} link fields: {', '.join(sorted(unexpected))}"
        )
    return {
        key: json_safe(value)
        for key, value in values.items()
        if value is not None
    }


def projected_values(collection: str, payload: Mapping[str, Any]) -> dict[str, Any]:
    """Extract indexed scalar columns while retaining the canonical payload."""

    return {
        column: json_safe(payload[column])
        for column in COLLECTION_SPECS[collection].projected_columns
        if payload.get(column) is not None
    }


def public_record(record: TravelStoredRecord) -> TravelStoredRecord:
    private = {
        column
        for spec in COLLECTION_SPECS.values()
        for column in spec.private_columns
    }
    return TravelStoredRecord(
        record_id=record.record_id,
        payload=normalize_payload(record.payload),
        owner_id=record.owner_id,
        links={
            key: json_safe(value)
            for key, value in (record.links or {}).items()
            if key not in private
        },
    )


class TravelRepository(ABC):
    """Shared contract for memory development and Supabase production storage."""

    @abstractmethod
    def _put_raw(
        self,
        collection: str,
        record_id: str,
        payload: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        links: Mapping[str, Any] | None = None,
    ) -> TravelStoredRecord: ...

    @abstractmethod
    def _get_raw(self, collection: str, record_id: str) -> Optional[TravelStoredRecord]: ...

    @abstractmethod
    def _list_raw(
        self,
        collection: str,
        *,
        owner_id: Optional[str] = None,
        scope_owner: bool = True,
        links: Mapping[str, Any] | None = None,
        limit: Optional[int] = None,
    ) -> list[TravelStoredRecord]: ...

    @abstractmethod
    def _delete_raw(self, collection: str, record_id: str) -> bool: ...

    @staticmethod
    def _access(
        access: Optional[AccessContext],
        *,
        owner_id: Optional[str] = None,
        capability_token: Optional[str] = None,
    ) -> AccessContext:
        if access is not None:
            if owner_id is not None or capability_token is not None:
                raise ValueError("pass either access or owner/capability arguments, not both")
            return access
        return AccessContext(owner_id=owner_id, capability_token=capability_token)

    def _authorized_search(
        self, search_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        search = self._get_raw("searches", normalize_identifier(search_id, "search id"))
        if search is None:
            return None
        if access.service:
            return search
        if access.owner_id is not None and search.owner_id == access.owner_id:
            return search
        if capability_matches(
            access.capability_token, (search.links or {}).get("capability_hash")
        ):
            raw_expiry = search.payload.get("expires_at")
            if not isinstance(raw_expiry, str):
                return None
            try:
                expires_at = datetime.fromisoformat(raw_expiry.replace("Z", "+00:00"))
            except ValueError:
                return None
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at <= datetime.now(timezone.utc):
                return None
            return search
        return None

    def _require_search(self, search_id: str, access: AccessContext) -> TravelStoredRecord:
        search = self._authorized_search(search_id, access)
        if search is None:
            raise AccessDeniedError("search not found")
        return search

    def create_search(
        self,
        search_id: str,
        search: BaseModel | Mapping[str, Any],
        *,
        owner_id: Optional[str] = None,
        capability_token: Optional[str] = None,
    ) -> TravelStoredRecord:
        key = normalize_identifier(search_id, "search id")
        owner = normalize_identifier(owner_id, "owner id") if owner_id is not None else None
        if owner is None and not capability_token:
            raise ValueError("anonymous searches require a capability token")
        if self._get_raw("searches", key) is not None:
            raise ValueError("search already exists")
        payload = normalize_payload(search, max_bytes=MAX_SEARCH_PAYLOAD_BYTES)
        record = self._put_raw(
            "searches",
            key,
            payload,
            owner_id=owner,
            links={
                "capability_hash": (
                    hash_capability_token(capability_token)
                    if capability_token is not None
                    else None
                )
            },
        )
        return public_record(record)

    save_search = create_search

    def update_search(
        self,
        search_id: str,
        search: BaseModel | Mapping[str, Any],
        access: Optional[AccessContext] = None,
        *,
        owner_id: Optional[str] = None,
        capability_token: Optional[str] = None,
    ) -> TravelStoredRecord:
        scope = self._access(
            access, owner_id=owner_id, capability_token=capability_token
        )
        existing = self._require_search(search_id, scope)
        record = self._put_raw(
            "searches",
            existing.record_id,
            normalize_payload(search, max_bytes=MAX_SEARCH_PAYLOAD_BYTES),
            owner_id=existing.owner_id,
            links=existing.links,
        )
        return public_record(record)

    def get_search(
        self,
        search_id: str,
        access: Optional[AccessContext] = None,
        *,
        owner_id: Optional[str] = None,
        capability_token: Optional[str] = None,
    ) -> Optional[TravelStoredRecord]:
        scope = self._access(
            access, owner_id=owner_id, capability_token=capability_token
        )
        record = self._authorized_search(search_id, scope)
        return public_record(record) if record is not None else None

    def list_searches(
        self,
        access: AccessContext,
        *,
        owner_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list[TravelStoredRecord]:
        if access.service:
            records = self._list_raw(
                "searches",
                owner_id=owner_id,
                scope_owner=owner_id is not None,
                limit=limit,
            )
        else:
            if access.owner_id is None:
                raise AccessDeniedError("capabilities cannot enumerate searches")
            if owner_id is not None and owner_id != access.owner_id:
                raise AccessDeniedError("search owner mismatch")
            records = self._list_raw(
                "searches", owner_id=access.owner_id, scope_owner=True, limit=limit
            )
        return [public_record(record) for record in records]

    def _save_child(
        self,
        collection: str,
        record_id: str,
        search_id: str,
        payload: BaseModel | Mapping[str, Any],
        access: AccessContext,
        *,
        links: Mapping[str, Any] | None = None,
        sanitized: bool = False,
    ) -> TravelStoredRecord:
        search = self._require_search(search_id, access)
        normalized = normalize_payload(payload)
        if sanitized:
            validate_sanitized_payload(normalized)
        record = self._put_raw(
            collection,
            normalize_identifier(record_id),
            normalized,
            owner_id=search.owner_id,
            links={"search_id": search.record_id, **dict(links or {})},
        )
        return public_record(record)

    def _get_child(
        self, collection: str, record_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        record = self._get_raw(collection, normalize_identifier(record_id))
        if record is None:
            return None
        search_id = (record.links or {}).get("search_id")
        if not search_id:
            return None
        search = self._authorized_search(str(search_id), access)
        if search is None or search.owner_id != record.owner_id:
            return None
        return public_record(record)

    def _list_children(
        self,
        collection: str,
        search_id: str,
        access: AccessContext,
        *,
        links: Mapping[str, Any] | None = None,
        limit: Optional[int] = None,
    ) -> list[TravelStoredRecord]:
        search = self._require_search(search_id, access)
        records = self._list_raw(
            collection,
            owner_id=search.owner_id,
            scope_owner=True,
            links={"search_id": search.record_id, **dict(links or {})},
            limit=limit,
        )
        return [public_record(record) for record in records]

    def _require_linked_record(
        self, collection: str, record_id: str, search_id: str
    ) -> TravelStoredRecord:
        record = self._get_raw(collection, normalize_identifier(record_id))
        if record is None or (record.links or {}).get("search_id") != search_id:
            raise ValueError(f"{collection} record does not belong to search")
        return record

    def save_provider_attempt(
        self,
        attempt_id: str,
        search_id: str,
        attempt: BaseModel | Mapping[str, Any],
        access: AccessContext,
    ) -> TravelStoredRecord:
        return self._save_child(
            "provider_attempts", attempt_id, search_id, attempt, access, sanitized=True
        )

    def get_provider_attempt(
        self, attempt_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        return self._get_child("provider_attempts", attempt_id, access)

    def list_provider_attempts(
        self, search_id: str, access: AccessContext, *, limit: Optional[int] = None
    ) -> list[TravelStoredRecord]:
        return self._list_children(
            "provider_attempts", search_id, access, limit=limit
        )

    def save_flight_itinerary(
        self,
        itinerary_id: str,
        itinerary: BaseModel | Mapping[str, Any],
        access: AccessContext,
    ) -> TravelStoredRecord:
        self._require_service(access)
        payload = normalize_payload(itinerary)
        validate_deidentified_market_payload(payload)
        return public_record(
            self._put_raw("flight_itineraries", itinerary_id, payload)
        )

    def get_flight_itinerary(
        self, itinerary_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        self._require_service(access)
        record = self._get_raw("flight_itineraries", itinerary_id)
        return public_record(record) if record else None

    def list_flight_itineraries(
        self, access: AccessContext, *, limit: Optional[int] = None
    ) -> list[TravelStoredRecord]:
        self._require_service(access)
        return [
            public_record(record)
            for record in self._list_raw(
                "flight_itineraries", scope_owner=False, limit=limit
            )
        ]

    def save_hotel_property(
        self,
        property_id: str,
        property_data: BaseModel | Mapping[str, Any],
        access: AccessContext,
    ) -> TravelStoredRecord:
        self._require_service(access)
        payload = normalize_payload(property_data)
        validate_deidentified_market_payload(payload)
        return public_record(
            self._put_raw("hotel_properties", property_id, payload)
        )

    def get_hotel_property(
        self, property_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        self._require_service(access)
        record = self._get_raw("hotel_properties", property_id)
        return public_record(record) if record else None

    def save_hotel_crosswalk(
        self,
        crosswalk_id: str,
        property_id: str,
        crosswalk: BaseModel | Mapping[str, Any],
        access: AccessContext,
    ) -> TravelStoredRecord:
        self._require_service(access)
        if self._get_raw("hotel_properties", property_id) is None:
            raise ValueError("hotel property does not exist")
        payload = normalize_payload(crosswalk)
        validate_deidentified_market_payload(payload)
        return public_record(
            self._put_raw(
                "hotel_crosswalks",
                crosswalk_id,
                payload,
                links={"property_id": normalize_identifier(property_id)},
            )
        )

    def list_hotel_crosswalks(
        self,
        property_id: str,
        access: AccessContext,
    ) -> list[TravelStoredRecord]:
        self._require_service(access)
        return [
            public_record(record)
            for record in self._list_raw(
                "hotel_crosswalks",
                scope_owner=False,
                links={"property_id": normalize_identifier(property_id)},
            )
        ]

    def save_offer(
        self,
        offer_id: str,
        search_id: str,
        offer: BaseModel | Mapping[str, Any],
        access: AccessContext,
        *,
        provider_attempt_id: Optional[str] = None,
        itinerary_id: Optional[str] = None,
        hotel_property_id: Optional[str] = None,
    ) -> TravelStoredRecord:
        if bool(itinerary_id) == bool(hotel_property_id):
            raise ValueError("offer must link to exactly one itinerary or hotel property")
        if itinerary_id and self._get_raw("flight_itineraries", itinerary_id) is None:
            raise ValueError("flight itinerary does not exist")
        if hotel_property_id and self._get_raw("hotel_properties", hotel_property_id) is None:
            raise ValueError("hotel property does not exist")
        if provider_attempt_id:
            self._require_linked_record(
                "provider_attempts", provider_attempt_id, normalize_identifier(search_id)
            )
        return self._save_child(
            "offers",
            offer_id,
            search_id,
            offer,
            access,
            links={
                "provider_attempt_id": provider_attempt_id,
                "itinerary_id": itinerary_id,
                "hotel_property_id": hotel_property_id,
            },
        )

    def get_offer(
        self, offer_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        return self._get_child("offers", offer_id, access)

    def list_offers(
        self, search_id: str, access: AccessContext, *, limit: Optional[int] = None
    ) -> list[TravelStoredRecord]:
        return self._list_children("offers", search_id, access, limit=limit)

    def save_cost_component(
        self,
        component_id: str,
        search_id: str,
        offer_id: str,
        component: BaseModel | Mapping[str, Any],
        access: AccessContext,
    ) -> TravelStoredRecord:
        search_key = normalize_identifier(search_id, "search id")
        self._require_linked_record("offers", offer_id, search_key)
        return self._save_child(
            "cost_components",
            component_id,
            search_key,
            component,
            access,
            links={"offer_id": offer_id},
        )

    def list_cost_components(
        self, search_id: str, offer_id: str, access: AccessContext
    ) -> list[TravelStoredRecord]:
        return self._list_children(
            "cost_components", search_id, access, links={"offer_id": offer_id}
        )

    def save_evidence(
        self,
        evidence_id: str,
        search_id: str,
        evidence: BaseModel | Mapping[str, Any],
        access: AccessContext,
        *,
        offer_id: Optional[str] = None,
        provider_attempt_id: Optional[str] = None,
    ) -> TravelStoredRecord:
        search_key = normalize_identifier(search_id, "search id")
        if offer_id:
            self._require_linked_record("offers", offer_id, search_key)
        if provider_attempt_id:
            self._require_linked_record(
                "provider_attempts", provider_attempt_id, search_key
            )
        return self._save_child(
            "evidence",
            evidence_id,
            search_key,
            evidence,
            access,
            links={
                "offer_id": offer_id,
                "provider_attempt_id": provider_attempt_id,
            },
            sanitized=True,
        )

    def list_evidence(
        self, search_id: str, access: AccessContext, *, offer_id: Optional[str] = None
    ) -> list[TravelStoredRecord]:
        return self._list_children(
            "evidence",
            search_id,
            access,
            links={"offer_id": offer_id} if offer_id else None,
        )

    def save_revalidation(
        self,
        revalidation_id: str,
        search_id: str,
        offer_id: str,
        revalidation: BaseModel | Mapping[str, Any],
        access: AccessContext,
    ) -> TravelStoredRecord:
        search_key = normalize_identifier(search_id, "search id")
        self._require_linked_record("offers", offer_id, search_key)
        return self._save_child(
            "revalidations",
            revalidation_id,
            search_key,
            revalidation,
            access,
            links={"offer_id": offer_id},
            sanitized=True,
        )

    def get_revalidation(
        self, revalidation_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        return self._get_child("revalidations", revalidation_id, access)

    def list_revalidations(
        self, search_id: str, access: AccessContext, *, offer_id: Optional[str] = None
    ) -> list[TravelStoredRecord]:
        return self._list_children(
            "revalidations",
            search_id,
            access,
            links={"offer_id": offer_id} if offer_id else None,
        )

    def save_redirect_event(
        self,
        redirect_id: str,
        search_id: str,
        offer_id: str,
        revalidation_id: str,
        redirect: BaseModel | Mapping[str, Any],
        access: AccessContext,
        *,
        authorization_token: Optional[str] = None,
    ) -> TravelStoredRecord:
        search_key = normalize_identifier(search_id, "search id")
        self._require_linked_record("offers", offer_id, search_key)
        revalidation = self._require_linked_record(
            "revalidations", revalidation_id, search_key
        )
        if (revalidation.links or {}).get("offer_id") != offer_id:
            raise ValueError("revalidation does not belong to offer")
        return self._save_child(
            "redirects",
            redirect_id,
            search_key,
            redirect,
            access,
            links={
                "offer_id": offer_id,
                "revalidation_id": revalidation_id,
                "authorization_hash": (
                    hash_capability_token(authorization_token)
                    if authorization_token
                    else None
                ),
            },
            sanitized=True,
        )

    def get_redirect_event(
        self, redirect_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        return self._get_child("redirects", redirect_id, access)

    def list_redirect_events(
        self, search_id: str, access: AccessContext
    ) -> list[TravelStoredRecord]:
        return self._list_children("redirects", search_id, access)

    def save_feedback(
        self,
        feedback_id: str,
        search_id: str,
        feedback: BaseModel | Mapping[str, Any],
        access: AccessContext,
        *,
        offer_id: Optional[str] = None,
    ) -> TravelStoredRecord:
        search_key = normalize_identifier(search_id, "search id")
        if offer_id:
            self._require_linked_record("offers", offer_id, search_key)
        return self._save_child(
            "feedback",
            feedback_id,
            search_key,
            feedback,
            access,
            links={"offer_id": offer_id},
        )

    def list_feedback(
        self, search_id: str, access: AccessContext
    ) -> list[TravelStoredRecord]:
        return self._list_children("feedback", search_id, access)

    def save_preferences(
        self,
        owner_id: str,
        preferences: BaseModel | Mapping[str, Any],
        access: AccessContext,
    ) -> TravelStoredRecord:
        owner = normalize_identifier(owner_id, "owner id")
        self._require_owner(access, owner)
        return public_record(
            self._put_raw(
                "preferences", owner, preferences, owner_id=owner
            )
        )

    def get_preferences(
        self, owner_id: str, access: AccessContext
    ) -> Optional[TravelStoredRecord]:
        owner = normalize_identifier(owner_id, "owner id")
        self._require_owner(access, owner)
        record = self._get_raw("preferences", owner)
        if record is None or record.owner_id != owner:
            return None
        return public_record(record)

    def delete_owner_data(
        self,
        owner_id: str,
        access: AccessContext,
    ) -> UserDataDeletionResult:
        """Delete user history/preferences without touching market catalogues.

        Only records whose persisted ``owner_id`` matches the requested owner
        are eligible. Capability-scoped callers cannot invoke this operation.
        A storage adapter that does not acknowledge a discovered deletion raises
        instead of returning a misleading success count.
        """

        owner = normalize_identifier(owner_id, "owner id")
        self._require_owner(access, owner)
        deleted: dict[str, int] = {}
        for collection in USER_OWNED_COLLECTIONS:
            spec = COLLECTION_SPECS[collection]
            if spec.owner_column is None:  # pragma: no cover - invariant guard
                raise TravelPersistenceError(
                    f"owner deletion cannot target service collection {collection!r}"
                )
            records = self._list_raw(
                collection,
                owner_id=owner,
                scope_owner=True,
            )
            count = 0
            for record in records:
                if record.owner_id != owner:  # pragma: no cover - adapter invariant
                    raise TravelPersistenceError(
                        f"owner-scoped list returned mismatched {collection} record"
                    )
                if not self._delete_raw(collection, record.record_id):
                    raise TravelPersistenceError(
                        f"storage did not acknowledge deletion of {collection} record"
                    )
                count += 1
            deleted[collection] = count
        return UserDataDeletionResult(
            deleted_by_collection=deleted,
            preserved_deidentified_collections=DEIDENTIFIED_MARKET_COLLECTIONS,
        )

    @staticmethod
    def _require_owner(access: AccessContext, owner_id: str) -> None:
        if not access.service and access.owner_id != owner_id:
            raise AccessDeniedError("owner mismatch")

    @staticmethod
    def _require_service(access: AccessContext) -> None:
        if not access.service:
            raise AccessDeniedError("service access required")
