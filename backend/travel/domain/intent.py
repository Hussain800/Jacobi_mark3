"""Shared, privacy-bounded travel intent primitives."""

from __future__ import annotations

from datetime import datetime
import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .enums import AvailabilityStatus, ObservationMethod
from .money import Money


_SENSITIVE_KEYS = {
    "passenger_name",
    "passenger_names",
    "guest_name",
    "guest_names",
    "passport",
    "passport_number",
    "document_number",
    "payment_card",
    "card_number",
    "email",
}
_RAW_DOCUMENT_KEYS = {"html", "raw_html", "document_html", "page_html"}


def validate_bounded_page_data(
    value: dict[str, Any],
    *,
    max_bytes: int = 65_536,
    max_nodes: int = 1_000,
    max_depth: int = 10,
) -> dict[str, Any]:
    """Accept useful extraction facts while rejecting raw pages and identity data."""

    try:
        encoded = json.dumps(value, ensure_ascii=False, default=str).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError("page context must be JSON-compatible") from exc
    if len(encoded) > max_bytes:
        raise ValueError(f"page context exceeds {max_bytes} bytes")

    stack: list[tuple[Any, int]] = [(value, 0)]
    visited = 0
    while stack:
        current, depth = stack.pop()
        visited += 1
        if visited > max_nodes:
            raise ValueError("page context contains too many values")
        if depth > max_depth:
            raise ValueError("page context is nested too deeply")
        if isinstance(current, dict):
            for raw_key, item in current.items():
                key = str(raw_key).strip().lower()
                if key in _RAW_DOCUMENT_KEYS:
                    raise ValueError("raw page HTML is not accepted")
                if key in _SENSITIVE_KEYS:
                    raise ValueError(f"sensitive page-context field is not accepted: {key}")
                stack.append((item, depth + 1))
        elif isinstance(current, (list, tuple)):
            stack.extend((item, depth + 1) for item in current)
        elif isinstance(current, str) and len(current) > 8_192:
            raise ValueError("page-context strings are too large")
    return value


class PageContext(BaseModel):
    """Sanitized source-page facts; intentionally excludes a complete URL."""

    model_config = ConfigDict(frozen=True)

    site: str = Field(min_length=1, max_length=128)
    page_kind: str = Field(min_length=1, max_length=64)
    page_reference: str | None = Field(default=None, max_length=256)
    title: str | None = Field(default=None, max_length=500)
    structured_data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("structured_data")
    @classmethod
    def bound_structured_data(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_bounded_page_data(value)


class BaselineOffer(BaseModel):
    """The bounded offer visible on the current page, not an independent search."""

    model_config = ConfigDict(frozen=True)

    offer_id: str = Field(min_length=1, max_length=128)
    provider_id: str = Field(min_length=1, max_length=128)
    supplier_id: str | None = Field(default=None, max_length=128)
    visible_price: Money | None = None
    observed_at: datetime
    observation_method: ObservationMethod = ObservationMethod.BROWSER_OBSERVED
    availability: AvailabilityStatus = AvailabilityStatus.UNKNOWN
    evidence_refs: tuple[str, ...] = Field(default_factory=tuple, max_length=64)

