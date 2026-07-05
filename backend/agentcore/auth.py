"""
Jacobi for Agents — API-key authentication + org scoping.

Model: env-backed keys, no DB round-trip. JACOBI_AGENT_API_KEYS holds
"key1:orgA,key2:orgB" (bare "key1" gets org "org-<first8>"). The org string
is the object-level authorization boundary: every stored decision/manifest is
tagged with the caller's org, and reads only resolve within it (plus the
public demo/dev orgs).

Rules:
- Demo verifications (fixture-backed, body.demo set) never need a key.
- Custom-URL verifications require a key IF keys are configured; with no keys
  configured the deployment is explicitly dev-open (org "dev").
- Invalid key → 401 always. Missing key where required → 403.
"""

from __future__ import annotations

import os
from typing import Dict, Optional

from fastapi import HTTPException, Request

DEMO_ORG = "demo"
DEV_ORG = "dev"
PUBLIC_ORGS = (DEMO_ORG, DEV_ORG)

_HEADER = "X-Api-Key"


def _load_keys() -> Dict[str, str]:
    raw = os.getenv("JACOBI_AGENT_API_KEYS", "").strip()
    if not raw:
        return {}
    out: Dict[str, str] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            key, org = part.split(":", 1)
        else:
            key, org = part, f"org-{part[:8]}"
        if key:
            out[key] = org or f"org-{key[:8]}"
    return out


def keys_configured() -> bool:
    return bool(_load_keys())


def resolve_org(request: Request) -> Optional[str]:
    """Org for the presented key; None when no key sent. 401 on a bad key."""
    key = request.headers.get(_HEADER)
    if not key:
        return None
    org = _load_keys().get(key)
    if org is None:
        raise HTTPException(status_code=401, detail="invalid API key")
    return org


def org_for_write(request: Request, is_demo: bool) -> str:
    """Org to tag a new verification with, enforcing the auth rules."""
    org = resolve_org(request)
    if org:
        return org
    if is_demo:
        return DEMO_ORG
    if keys_configured():
        raise HTTPException(
            status_code=403,
            detail="API key required for custom-URL verification (X-Api-Key header)",
        )
    return DEV_ORG


def readable_orgs(request: Request) -> list[str]:
    """Orgs the caller may read: their own (if keyed) plus the public ones."""
    org = resolve_org(request)
    return ([org] if org else []) + list(PUBLIC_ORGS)
