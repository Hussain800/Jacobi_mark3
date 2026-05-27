"""Profile + subscription helpers on top of supabase-py.

Uses the service role key (SUPABASE_SERVICE_KEY) to bypass RLS for server-side
operations: ensuring a profile row exists, reading the tier, incrementing
probe count, applying Stripe webhook side-effects.

All sync supabase-py calls are wrapped in asyncio.to_thread().
"""
import asyncio
import os
from datetime import datetime, timezone
from typing import Optional

# Trigger dotenv via brightdata_config so SUPABASE_* env vars are present.
from brightdata_config import PROJECT_ROOT  # noqa: F401

_client = None


def _free_monthly_limit() -> int:
    try:
        return int(os.getenv("FREE_MONTHLY_PROBES", "15"))
    except ValueError:
        return 15


# Back-compat alias for any callers/tests that import this constant.
FREE_MONTHLY_LIMIT = _free_monthly_limit()


def _service_client():
    global _client
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not (url and key):
        return None
    if _client is None:
        from supabase import create_client
        _client = create_client(url, key)
    return _client


# ─── Profile helpers ──────────────────────────────────────────────────────


async def ensure_profile(user_id: str, email: Optional[str] = None) -> Optional[dict]:
    """Return the profile row, creating it if missing. None if Supabase off."""
    client = _service_client()
    if not client:
        return None

    def _go():
        result = client.table("profiles").select("*").eq("id", user_id).execute()
        if result.data:
            return result.data[0]
        # Insert a fresh profile with defaults from the migration
        new_row = {
            "id": user_id,
            "email": email,
            "subscription_tier": "free",
            "probes_used_this_month": 0,
            "probes_limit": FREE_MONTHLY_LIMIT,
        }
        result = client.table("profiles").insert(new_row).execute()
        return result.data[0] if result.data else new_row

    try:
        return await asyncio.to_thread(_go)
    except Exception as e:
        print(f"[PROFILE] ensure_profile failed: {e}")
        return None


async def get_tier(user_id: str) -> str:
    """Return 'free' or 'pro'. Defaults to 'free' if profile missing."""
    profile = await ensure_profile(user_id)
    if not profile:
        return "free"
    return profile.get("subscription_tier") or "free"


async def can_run_probe(user_id: str) -> tuple[bool, dict]:
    """Quota check for a signed-in user.

    Returns (allowed, info_dict) where info_dict has tier, used, limit, reset_at.
    Pro tier is unlimited; Free tier is capped at FREE_MONTHLY_LIMIT/month with
    a calendar-month rollover.
    """
    profile = await ensure_profile(user_id)
    if not profile:
        # Supabase down → fail open so the demo doesn't break
        return True, {"tier": "free", "used": 0, "limit": FREE_MONTHLY_LIMIT, "reset_at": None}

    tier = profile.get("subscription_tier") or "free"
    used = profile.get("probes_used_this_month") or 0
    limit = profile.get("probes_limit") or FREE_MONTHLY_LIMIT
    reset_at = profile.get("month_started_at")

    # Calendar-month rollover: if month_started_at is in a previous month, reset.
    now = datetime.now(timezone.utc)
    if reset_at:
        try:
            started = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
            if started.year != now.year or started.month != now.month:
                used = 0
                await _reset_month(user_id, now)
        except Exception:
            pass

    if tier == "pro":
        return True, {"tier": tier, "used": used, "limit": None, "reset_at": reset_at}
    if used >= limit:
        return False, {"tier": tier, "used": used, "limit": limit, "reset_at": reset_at}
    return True, {"tier": tier, "used": used, "limit": limit, "reset_at": reset_at}


async def _reset_month(user_id: str, now: datetime):
    client = _service_client()
    if not client:
        return

    def _go():
        client.table("profiles").update({
            "probes_used_this_month": 0,
            "month_started_at": now.isoformat(),
        }).eq("id", user_id).execute()

    try:
        await asyncio.to_thread(_go)
    except Exception as e:
        print(f"[PROFILE] reset_month failed: {e}")


async def increment_probe_count(user_id: str) -> None:
    """+1 to probes_used_this_month after a successful probe."""
    client = _service_client()
    if not client:
        return

    def _go():
        # Read-modify-write (no atomic increment in supabase-py 2.x without rpc).
        # For a hackathon demo with single-digit concurrent users this is fine.
        cur = client.table("profiles").select("probes_used_this_month").eq("id", user_id).execute()
        used = (cur.data[0].get("probes_used_this_month") if cur.data else 0) or 0
        client.table("profiles").update({"probes_used_this_month": used + 1}).eq("id", user_id).execute()

    try:
        await asyncio.to_thread(_go)
    except Exception as e:
        print(f"[PROFILE] increment failed: {e}")


# ─── Subscription helpers (called from Stripe webhook) ────────────────────


async def apply_subscription_active(
    user_id: str,
    stripe_customer_id: str,
    stripe_subscription_id: str,
    current_period_end_iso: Optional[str],
) -> None:
    client = _service_client()
    if not client:
        return

    def _go():
        client.table("profiles").update({
            "subscription_tier": "pro",
            "stripe_customer_id": stripe_customer_id,
            "probes_limit": 1_000_000,  # effectively unlimited; tier is the real gate
        }).eq("id", user_id).execute()
        client.table("subscriptions").upsert({
            "user_id": user_id,
            "stripe_subscription_id": stripe_subscription_id,
            "stripe_customer_id": stripe_customer_id,
            "tier": "pro",
            "status": "active",
            "current_period_end": current_period_end_iso,
        }, on_conflict="stripe_subscription_id").execute()

    try:
        await asyncio.to_thread(_go)
    except Exception as e:
        print(f"[SUB] apply_active failed: {e}")


async def apply_subscription_canceled(stripe_subscription_id: str) -> None:
    client = _service_client()
    if not client:
        return

    def _go():
        # Find the user via the subscription record, then downgrade.
        sub = client.table("subscriptions").select("user_id").eq(
            "stripe_subscription_id", stripe_subscription_id
        ).execute()
        if sub.data:
            user_id = sub.data[0]["user_id"]
            client.table("profiles").update({
                "subscription_tier": "free",
                "probes_limit": FREE_MONTHLY_LIMIT,
            }).eq("id", user_id).execute()
        client.table("subscriptions").update({
            "status": "canceled",
        }).eq("stripe_subscription_id", stripe_subscription_id).execute()

    try:
        await asyncio.to_thread(_go)
    except Exception as e:
        print(f"[SUB] apply_canceled failed: {e}")


async def get_stripe_customer_id(user_id: str) -> Optional[str]:
    profile = await ensure_profile(user_id)
    return profile.get("stripe_customer_id") if profile else None
