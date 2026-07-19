"""
Jacobi for Agents — deterministic evidence manifest builder.

Builds an EvidenceManifest from collection attempts, aggregates artifacts and
extractions, derives the capability summary, and stamps a canonical SHA-256
hash. The hash contract is fixed (see schemas.py docstring): a manifest with
the same content always hashes identically, so downstream verification is
deterministic. Manifests are immutable — corrections create a child manifest
via parent_sha256, never a mutation.

Optional HMAC signing via JACOBI_MANIFEST_SIGNING_KEY.

Dependency-light: pydantic (via schemas) + stdlib only.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os

from .schemas import (
    Artifact,
    CapabilitySummary,
    CollectionAttempt,
    EvidenceManifest,
    Extraction,
    PriceObligation,
)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_text(s: str) -> str:
    return sha256_bytes(s.encode("utf-8"))


def canonical_manifest_hash(manifest: EvidenceManifest) -> str:
    """Canonical SHA-256 over the manifest, excluding its own hash + signature.

    EXACTLY this — tests depend on determinism.
    """
    dump = manifest.model_dump(mode="json", exclude={"manifest_sha256", "signature"})
    payload = json.dumps(dump, sort_keys=True, separators=(",", ":"), default=str)
    return sha256_text(payload)


def _target_from_obligation(obligation: PriceObligation) -> dict:
    url = obligation.source_url_or_api_route or ""
    # normalize_domain lives in policy.py; keep evidence dependency-free by
    # deriving the domain inline (stdlib urllib).
    from urllib.parse import urlsplit

    host = ""
    if url:
        s = url if "//" in url else "//" + url
        host = (urlsplit(s.lower()).hostname or "")
        if host.startswith("www."):
            host = host[4:]
    merchant_name = ""
    if isinstance(obligation.merchant, dict):
        merchant_name = str(
            obligation.merchant.get("name")
            or obligation.merchant.get("merchant_name")
            or ""
        )
    return {
        "url": url,
        "final_url": url,
        "domain": host,
        "merchant_name": merchant_name,
    }


def _capability_summary(attempts: list[CollectionAttempt]) -> CapabilitySummary:
    caps = [a.capabilities for a in attempts]
    local_http = any(
        (c.http_fetch and not a.fixture)
        for a, c in zip(attempts, caps)
    )
    return CapabilitySummary(
        local_browser=any(c.browser_actions for c in caps),
        local_http=local_http,
        managed_request=any(c.anti_bot_managed for c in caps),
        managed_browser=any(c.browser_actions and c.anti_bot_managed for c in caps),
        official_api=any(c.official_api for c in caps),
        real_ip_geography=False,  # always False for local collection
        locale_emulation=any(c.locale_emulation for c in caps),
        timezone_emulation=any(c.timezone_emulation for c in caps),
        screenshot=any(c.screenshot for c in caps),
        trace_zip=any(c.trace_zip for c in caps),
        network_log=any(c.network_log for c in caps),
        fixture_mode=any(a.fixture for a in attempts),
    )


def build_manifest(
    obligation: PriceObligation,
    attempts: list[CollectionAttempt],
    limitations: list[str],
    parent_sha256: str | None = None,
) -> EvidenceManifest:
    """Assemble an EvidenceManifest and stamp its canonical hash + signature."""
    artifacts: list[Artifact] = []
    extractions: list[Extraction] = []
    for a in attempts:
        artifacts.extend(a.artifacts)
        extractions.extend(a.extractions)

    manifest = EvidenceManifest(
        target=_target_from_obligation(obligation),
        obligation_id=obligation.obligation_id,
        collection_attempts=list(attempts),
        capability_summary=_capability_summary(attempts),
        artifacts=artifacts,
        extractions=extractions,
        limitations=list(limitations),
        parent_sha256=parent_sha256,
    )

    manifest.manifest_sha256 = canonical_manifest_hash(manifest)

    key = os.getenv("JACOBI_MANIFEST_SIGNING_KEY")
    if key:
        manifest.signature = hmac.new(
            key.encode("utf-8"),
            manifest.manifest_sha256.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    return manifest


def verify_manifest(manifest: EvidenceManifest) -> bool:
    """Verify the canonical hash and any attached server HMAC.

    Unsigned legacy manifests retain hash-only compatibility. A signed manifest
    fails closed when the verifier does not have the signing key.
    """

    if manifest.manifest_sha256 != canonical_manifest_hash(manifest):
        return False
    if manifest.signature is None:
        return True
    key = os.getenv("JACOBI_MANIFEST_SIGNING_KEY")
    if not key or not manifest.manifest_sha256:
        return False
    expected = hmac.new(
        key.encode("utf-8"),
        manifest.manifest_sha256.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(manifest.signature, expected)
