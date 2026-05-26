"""
JACOBI — Supabase client for persistent storage.

Handles probe history persistence. The supabase-py library is synchronous,
so all DB operations are wrapped in asyncio.to_thread() to avoid blocking
the FastAPI event loop.
"""

import asyncio
import os
from typing import Optional

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://csfijqbfywdquuuwwplu.supabase.co")
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


async def save_probe(session_data: dict) -> Optional[str]:
    """Save a completed probe session to Supabase. Returns the probe ID."""
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
    }

    def _insert():
        result = client.table("probes").insert(data).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]["id"]
        return None

    try:
        return await asyncio.to_thread(_insert)
    except Exception as e:
        print(f"[SUPABASE] Failed to save probe: {e}")
        return None


async def get_probe_history(limit: int = 10) -> list:
    """Get recent probes with key fields (for leaderboard/admin)."""
    client = get_supabase()
    if not client:
        return []

    def _fetch():
        result = client.table("probes") \
            .select("id,target_url,target_name,topology_class,baseline_price,max_price_spread,max_price_spread_pct,created_at") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        return result.data or []

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as e:
        print(f"[SUPABASE] Failed to fetch history: {e}")
        return []
