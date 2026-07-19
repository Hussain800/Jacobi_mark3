"""Safe backend selection for travel persistence."""

from __future__ import annotations

import os
from typing import Any, Optional

from .access import PersistenceConfigurationError
from .base import DEFAULT_MAX_RECORDS, TravelRepository
from .memory import InMemoryTravelRepository
from .supabase import SupabaseTravelRepository


STORAGE_ENV = "JACOBI_TRAVEL_STORAGE"
_PRODUCTION_VALUES = {"prod", "production"}


def is_production_environment() -> bool:
    values = (
        os.getenv("APP_ENV"),
        os.getenv("JACOBI_ENV"),
        os.getenv("ENVIRONMENT"),
        os.getenv("VERCEL_ENV"),
    )
    return any((value or "").strip().lower() in _PRODUCTION_VALUES for value in values)


def create_travel_repository(
    backend: Optional[str] = None,
    *,
    max_records: int = DEFAULT_MAX_RECORDS,
    supabase_client: Any = None,
) -> TravelRepository:
    """Construct the selected backend without silent production degradation."""

    configured = backend if backend is not None else os.getenv(STORAGE_ENV)
    if configured is None or not configured.strip():
        selected = "supabase" if is_production_environment() else "memory"
    else:
        selected = configured.strip().lower()

    if selected == "memory":
        if is_production_environment():
            raise PersistenceConfigurationError(
                f"{STORAGE_ENV}=memory is not allowed in production"
            )
        return InMemoryTravelRepository(max_records=max_records)
    if selected == "supabase":
        return SupabaseTravelRepository(client=supabase_client)
    raise PersistenceConfigurationError(
        f"unsupported {STORAGE_ENV} backend {selected!r}; "
        "expected 'memory' or 'supabase'"
    )


create_repository = create_travel_repository
