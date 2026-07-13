"""
Jacobi for Agents — provenance persistence (production-beta).

Repository layer for DecisionEnvelopes and EvidenceManifests. Org scoping is
the object-level authorization boundary: a get MUST return None unless the
stored org matches the requested org — this is the ACL, not a filter.

Two backends behind one ABC:
  MemoryRepo    — bounded in-memory (local/dev default; mirrors engine._store)
  SupabaseRepo  — table `agent_provenance_records`; explicit opt-in, no silent
                  fallback to memory when misconfigured.

Selection via JACOBI_AGENT_STORAGE (default "memory"). Lazy singleton because
tests flip the env var; reset_repo_for_tests() clears the cache.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from collections import OrderedDict
from pathlib import Path
from typing import Optional

from .schemas import DecisionEnvelope, EvidenceManifest

# get_supabase lives in backend/supabase_client.py. backend/ is on sys.path when
# run via uvicorn/pytest; add it as a fallback like providers.py does for url_guard.
try:
    from supabase_client import get_supabase
except ImportError:  # invoked from repo root
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from supabase_client import get_supabase

_MAX_STORE = 500
_TABLE = "agent_provenance_records"


class ProvenanceRepo(ABC):
    @abstractmethod
    def save_decision(self, envelope: DecisionEnvelope, org: str) -> None: ...

    @abstractmethod
    def save_manifest(self, manifest: EvidenceManifest, org: str) -> None: ...

    @abstractmethod
    def get_decision(self, request_id: str, org: str) -> Optional[DecisionEnvelope]: ...

    @abstractmethod
    def get_manifest(self, manifest_id: str, org: str) -> Optional[EvidenceManifest]: ...

    @abstractmethod
    def delete_org(self, org: str) -> None:
        """Delete every provenance record inside one exact org namespace."""
        ...


class MemoryRepo(ProvenanceRepo):
    """Bounded in-memory store, FIFO evict at 500 per kind (mirrors engine._store).

    Stored value is (org, model) so cross-org reads return None.
    """

    def __init__(self) -> None:
        self._decisions: "OrderedDict[str, tuple[str, DecisionEnvelope]]" = OrderedDict()
        self._manifests: "OrderedDict[str, tuple[str, EvidenceManifest]]" = OrderedDict()

    @staticmethod
    def _put(store: OrderedDict, key: str, org: str, value) -> None:
        store[key] = (org, value)
        while len(store) > _MAX_STORE:
            store.popitem(last=False)

    @staticmethod
    def _get(store: OrderedDict, key: str, org: str):
        row = store.get(key)
        if row is None or row[0] != org:  # org mismatch = not visible
            return None
        return row[1]

    def save_decision(self, envelope: DecisionEnvelope, org: str) -> None:
        self._put(self._decisions, envelope.request_id, org, envelope)

    def save_manifest(self, manifest: EvidenceManifest, org: str) -> None:
        self._put(self._manifests, manifest.manifest_id, org, manifest)

    def get_decision(self, request_id: str, org: str) -> Optional[DecisionEnvelope]:
        return self._get(self._decisions, request_id, org)

    def get_manifest(self, manifest_id: str, org: str) -> Optional[EvidenceManifest]:
        return self._get(self._manifests, manifest_id, org)

    def delete_org(self, org: str) -> None:
        for store in (self._decisions, self._manifests):
            for record_id in [key for key, row in store.items() if row[0] == org]:
                del store[record_id]


class SupabaseRepo(ProvenanceRepo):
    """Durable store in `agent_provenance_records`.

    Columns: record_id text PK, kind text ('decision'|'manifest'), org text,
    payload jsonb, sha256 text null, created_at timestamptz.

    save = upsert on record_id. get = select record_id+kind+org (org in the
    WHERE clause is the ACL). No silent memory fallback: construction raises if
    Supabase is not configured.
    """

    def __init__(self) -> None:
        self._client = get_supabase()
        if self._client is None:
            raise RuntimeError(
                "JACOBI_AGENT_STORAGE=supabase but Supabase is not configured"
            )

    def _save(self, record_id: str, kind: str, org: str, payload: dict,
              sha256: Optional[str]) -> None:
        self._client.table(_TABLE).upsert({
            "record_id": record_id,
            "kind": kind,
            "org": org,
            "payload": payload,
            "sha256": sha256,
        }).execute()

    def _get(self, record_id: str, kind: str, org: str) -> Optional[dict]:
        result = (
            self._client.table(_TABLE)
            .select("payload")
            .eq("record_id", record_id)
            .eq("kind", kind)
            .eq("org", org)  # ACL boundary
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0]["payload"] if rows else None

    def save_decision(self, envelope: DecisionEnvelope, org: str) -> None:
        self._save(envelope.request_id, "decision", org,
                   envelope.model_dump(mode="json"), None)

    def save_manifest(self, manifest: EvidenceManifest, org: str) -> None:
        self._save(manifest.manifest_id, "manifest", org,
                   manifest.model_dump(mode="json"), manifest.manifest_sha256)

    def get_decision(self, request_id: str, org: str) -> Optional[DecisionEnvelope]:
        payload = self._get(request_id, "decision", org)
        return DecisionEnvelope.model_validate(payload) if payload else None

    def get_manifest(self, manifest_id: str, org: str) -> Optional[EvidenceManifest]:
        payload = self._get(manifest_id, "manifest", org)
        return EvidenceManifest.model_validate(payload) if payload else None

    def delete_org(self, org: str) -> None:
        self._client.table(_TABLE).delete().eq("org", org).execute()


_repo: Optional[ProvenanceRepo] = None


def get_repo() -> ProvenanceRepo:
    """Lazy singleton chosen by JACOBI_AGENT_STORAGE (default 'memory')."""
    global _repo
    if _repo is None:
        backend = os.getenv("JACOBI_AGENT_STORAGE", "memory").lower()
        if backend == "supabase":
            _repo = SupabaseRepo()
        else:
            _repo = MemoryRepo()  # explicit local/dev fallback
    return _repo


def reset_repo_for_tests() -> None:
    """Clear the cached singleton so tests can re-select via env."""
    global _repo
    _repo = None
