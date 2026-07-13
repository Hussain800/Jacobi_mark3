"""Travel Market Graph persistence.

The public surface is intentionally model-agnostic: domain Pydantic models can
be passed directly, while repository results remain stable normalized records.
"""

from .access import (
    AccessContext,
    AccessDeniedError,
    PersistenceConfigurationError,
    TravelPersistenceError,
    capability_matches,
    hash_capability_token,
    issue_capability_token,
)
from .base import (
    COLLECTION_SPECS,
    DEFAULT_MAX_RECORDS,
    TravelRepository,
    TravelStoredRecord,
    json_safe,
)
from .factory import (
    STORAGE_ENV,
    create_repository,
    create_travel_repository,
    is_production_environment,
)
from .memory import InMemoryTravelRepository
from .supabase import SupabaseTravelRepository

__all__ = [
    "AccessContext",
    "AccessDeniedError",
    "COLLECTION_SPECS",
    "DEFAULT_MAX_RECORDS",
    "InMemoryTravelRepository",
    "PersistenceConfigurationError",
    "STORAGE_ENV",
    "SupabaseTravelRepository",
    "TravelPersistenceError",
    "TravelRepository",
    "TravelStoredRecord",
    "capability_matches",
    "create_repository",
    "create_travel_repository",
    "hash_capability_token",
    "is_production_environment",
    "issue_capability_token",
    "json_safe",
]
