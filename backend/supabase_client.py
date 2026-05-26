"""
JACOBI — Supabase client for persistent storage.

Replaces the in-memory SESSION_STORE with Supabase PostgreSQL.
Handles probe history, user profiles, and subscription tracking.
"""

import os
from typing import Optional
from datetime import datetime, timezone

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://csfijqbfywdquuuwwplu.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_supabase():
    """Get a Supabase client (service role for backend operations)."""
    if not SUPABASE_KEY:
        return None
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_KEY)


async def save_probe(session_data: dict) -> Optional[str]:
    """Save a completed probe session to Supabase. Returns the probe ID."""
    client = get_supabase()
    if not client:
        return None

    try:
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

        result = client.table("probes").insert(data).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]["id"]
        return None
    except Exception as e:
        print(f"[SUPABASE] Failed to save probe: {e}")
        return None


async def get_probe_history(limit: int = 10) -> list:
    """Get recent probes (for admin/demo purposes)."""
    client = get_supabase()
    if not client:
        return []

    try:
        result = client.table("probes") \
            .select("id,target_url,target_name,topology_class,baseline_price,created_at") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        return result.data or []
    except Exception as e:
        print(f"[SUPABASE] Failed to fetch history: {e}")
        return []
