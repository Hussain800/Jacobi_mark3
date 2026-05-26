"""Resolve the calling Supabase user from a Bearer JWT.

The frontend sends `Authorization: Bearer <supabase_access_token>` on
billing/probe calls when the user is signed in. Anonymous calls have no
header, in which case we return None.
"""
import os
from typing import Optional

import httpx
from fastapi import Header

SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or ""
).rstrip("/")
SUPABASE_ANON_KEY = (
    os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or ""
)


async def get_optional_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict]:
    """Resolve the user from a Bearer token. Returns None for anonymous callers.

    Calls Supabase Auth's GET /auth/v1/user which validates the JWT and returns
    the user record. We don't try to verify the JWT locally because Supabase
    rotates JWKS — using the server endpoint avoids the cache headache.
    """
    if not authorization or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None
    if not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_ANON_KEY,
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
