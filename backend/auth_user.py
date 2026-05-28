"""Resolve the calling Supabase user from a Bearer JWT.

The frontend sends `Authorization: Bearer <supabase_access_token>` on
billing/probe calls when the user is signed in. Anonymous calls have no
header, in which case we return None.
"""
import os
from typing import Optional

import httpx
from fastapi import Header

# Importing brightdata_config triggers its module-level load_dotenv() calls,
# so SUPABASE_* env vars are populated before we read them below.
from brightdata_config import PROJECT_ROOT  # noqa: F401


def _supabase_url() -> str:
    return (
        os.getenv("SUPABASE_URL")
        or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    ).rstrip("/")


def _supabase_anon_key() -> str:
    return (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or ""
    )


async def get_optional_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict]:
    """Resolve the user from a Bearer token. Returns None for anonymous callers."""
    supabase_url = _supabase_url()
    supabase_anon_key = _supabase_anon_key()
    if not authorization or not supabase_url or not supabase_anon_key:
        return None
    if not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": supabase_anon_key,
                },
            )
            if r.status_code != 200:
                return None
            data = r.json()
            return {
                "id": data.get("id"),
                "email": data.get("email"),
                "user_metadata": data.get("user_metadata", {}),
                "access_token": token,
            }
    except Exception:
        return None
