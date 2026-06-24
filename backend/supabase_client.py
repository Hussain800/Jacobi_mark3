"""
JACOBI — Supabase client for persistent storage.

Handles probe history persistence. The supabase-py library is synchronous,
so all DB operations are wrapped in asyncio.to_thread() to avoid blocking
the FastAPI event loop.
"""

import asyncio
import os
from typing import Optional

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

_client = None


def get_supabase():
    """Get a cached Supabase client (service role for backend operations)."""
    global _client
    if not SUPABASE_KEY:
        return None
    if _client is None:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


async def save_probe(
    session_data: dict,
    user_id: Optional[str] = None,
    is_public: bool = False,
) -> Optional[str]:
    """Save a completed probe session to Supabase. Returns the probe ID.

    Args:
      session_data: the full probe result.
      user_id:      Supabase user UUID. Stamped on the row for RLS / history
                    filtering. None means anonymous (which /api/probe forbids,
                    but kept here for back-compat with manual scripts).
      is_public:    If True, the row appears on the public board. Default
                    False — user probes are private until they opt in.

    Resilience:
      - If `user_id` column is missing → retries without it.
      - If `is_public` column is missing → retries without it.
    """
    client = get_supabase()
    if not client:
        return None

    data = {
        "target_url": session_data.get("target_url", ""),
        "target_name": session_data.get("target_name", ""),
        "topology_class": session_data.get("topology_class", ""),
        "baseline_price": session_data.get("baseline_price"),
        "max_price_spread": session_data.get("max_price_spread"),
        "max_price_spread_pct": session_data.get("max_price_spread_pct"),
        "discrimination_index": session_data.get("discrimination_index", 0),
        "control_stability": session_data.get("control_stability", 0),
        "elapsed_seconds": session_data.get("elapsed_seconds", 0),
        "total_agents": session_data.get("total_agents", 24),
        "successful_agents": session_data.get("successful_agents", 0),
        "all_prices": session_data.get("all_prices"),
        "gradients": session_data.get("gradients"),
        "agents": session_data.get("agents"),
        "status": session_data.get("status", "completed"),
        "raw_result": session_data,
        "is_public": bool(is_public),
        "is_demo": False,
    }
    if user_id:
        data["user_id"] = user_id

    def _insert(row):
        result = client.table("probes").insert(row).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]["id"]
        return None

    try:
        return await asyncio.to_thread(_insert, data)
    except Exception as e:
        msg = str(e)
        # Progressively drop OPTIONAL board-visibility columns if that migration
        # hasn't run yet. user_id is intentionally NOT droppable (P0-3): saving a
        # probe without its owner creates an ownerless row — an access-control
        # and privacy hazard — so if the owner column is missing we FAIL the save
        # (return None) rather than silently persist an unowned probe.
        fallback = dict(data)
        retried = False
        for col in ("is_public", "is_demo"):
            if col in msg and "column" in msg and col in fallback:
                fallback.pop(col, None)
                retried = True
        if retried:
            try:
                return await asyncio.to_thread(_insert, fallback)
            except Exception as e2:
                print(f"[SUPABASE] Failed to save probe (fallback): {e2}")
                return None
        if "user_id" in data and "user_id" in msg and "column" in msg:
            print("[SUPABASE] Refusing to save ownerless probe: 'user_id' column "
                  "missing — apply migration 202605262030 before production use.")
            return None
        print(f"[SUPABASE] Failed to save probe: {e}")
        return None


async def get_probe_by_session_id(session_id: str) -> Optional[dict]:
    """Retrieve a full probe result from Supabase by its session_id (stored in raw_result JSONB)."""
    client = get_supabase()
    if not client:
        return None

    def _fetch():
        result = client.table("probes") \
            .select("*") \
            .filter("raw_result->>session_id", "eq", session_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if result.data and len(result.data) > 0:
            row = result.data[0]
            # Reconstruct TopologyReport from stored columns + raw_result
            raw = row.get("raw_result") or {}
            raw["session_id"] = session_id
            # Preserve row-level ownership/visibility metadata for API access
            # checks. Older raw_result payloads may not include these fields.
            raw.setdefault("user_id", row.get("user_id"))
            raw.setdefault("is_public", row.get("is_public", False))
            raw.setdefault("is_demo", row.get("is_demo", False))
            raw["_probe_row_id"] = row.get("id")
            raw["_probe_owner_user_id"] = row.get("user_id")
            raw["_probe_is_public"] = row.get("is_public", False)
            raw["_probe_is_demo"] = row.get("is_demo", False)
            return raw
        return None

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as e:
        print(f"[SUPABASE] Failed to fetch probe by session_id: {e}")
        return None


async def get_probe_history(limit: int = 10) -> list:
    """Get recent probes with key fields (for leaderboard/admin).

    NOTE: this is NOT user-scoped. Used by /api/leaderboard which now filters
    by is_public/is_demo at the endpoint level. For per-user history, call
    get_probe_history_for_user().
    """
    client = get_supabase()
    if not client:
        return []

    def _fetch():
        result = client.table("probes") \
            .select("id,target_url,target_name,topology_class,baseline_price,max_price_spread,max_price_spread_pct,is_public,is_demo,created_at") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        return result.data or []

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as e:
        msg = str(e)
        # Migration 003 may not be applied yet → retry without is_public/is_demo
        if ("is_public" in msg or "is_demo" in msg) and "column" in msg:
            def _fetch_fallback():
                result = client.table("probes") \
                    .select("id,target_url,target_name,topology_class,baseline_price,max_price_spread,max_price_spread_pct,created_at") \
                    .order("created_at", desc=True) \
                    .limit(limit) \
                    .execute()
                return result.data or []
            try:
                return await asyncio.to_thread(_fetch_fallback)
            except Exception as e2:
                print(f"[SUPABASE] history fallback failed: {e2}")
                return []
        print(f"[SUPABASE] Failed to fetch history: {e}")
        return []


async def get_probe_history_for_user(user_id: str, limit: int = 50) -> list:
    """Get recent probes belonging to a specific signed-in user.

    Uses the service-role client so it can read across RLS — the user_id
    filter below is the security boundary.
    """
    client = get_supabase()
    if not client:
        return []

    def _fetch():
        result = client.table("probes") \
            .select("id,target_url,target_name,topology_class,baseline_price,max_price_spread,max_price_spread_pct,created_at,raw_result") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        return result.data or []

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as e:
        print(f"[SUPABASE] history-for-user failed: {e}")
        return []


async def get_public_board(limit: int = 50) -> list:
    """Return probes opted into the public board, or curated demo rows.

    Filter: is_public = true  OR  is_demo = true.
    If the migration that adds those columns hasn't run, returns empty list
    (do NOT leak private user probes when the filter is missing).
    """
    client = get_supabase()
    if not client:
        return []

    def _fetch():
        # Build the OR filter using PostgREST grammar.
        result = client.table("probes") \
            .select("id,target_url,target_name,topology_class,baseline_price,max_price_spread,max_price_spread_pct,is_public,is_demo,created_at") \
            .or_("is_public.eq.true,is_demo.eq.true") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        return result.data or []

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as e:
        msg = str(e)
        if ("is_public" in msg or "is_demo" in msg) and "column" in msg:
            # Migration not applied → return empty rather than leak everything.
            print("[SUPABASE] board columns missing — returning empty board "
                  "(apply migration 003_board_visibility.sql to populate)")
            return []
        print(f"[SUPABASE] get_public_board failed: {e}")
        return []
