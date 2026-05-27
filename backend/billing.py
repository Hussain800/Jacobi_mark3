"""Billing endpoints: /api/billing/checkout, /portal, /webhook, /plan."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel

from auth_user import get_optional_user
from profile_store import (
    apply_subscription_active,
    apply_subscription_canceled,
    ensure_profile,
    get_stripe_customer_id,
)
from stripe_client import (
    create_checkout_session,
    create_portal_session,
    find_active_subscription_for_user,
    stripe_configured,
    verify_webhook,
)


router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutInput(BaseModel):
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@router.post("/checkout")
async def start_checkout(
    body: CheckoutInput,
    user=Depends(get_optional_user),
):
    if not stripe_configured():
        raise HTTPException(500, "Stripe is not configured on the server.")
    if not user:
        raise HTTPException(401, "Sign in to upgrade.")
    try:
        await ensure_profile(user["id"], user.get("email"))
    except Exception as e:
        import traceback as _tb
        print(f"[BILLING] start_checkout ensure_profile crashed: {e!r}\n{_tb.format_exc()}", flush=True)
    try:
        session = create_checkout_session(
            user_id=user["id"],
            user_email=user.get("email") or "",
            success_url=body.success_url,
            cancel_url=body.cancel_url,
        )
    except Exception as e:
        import traceback as _tb
        print(f"[BILLING] create_checkout_session crashed: {e!r}\n{_tb.format_exc()}", flush=True)
        raise HTTPException(502, f"Stripe error: {e}")
    return {"url": session["url"], "id": session["id"]}


@router.post("/sync")
async def sync_from_stripe(user=Depends(get_optional_user)):
    """Pull the user's subscription state from Stripe and update Supabase.

    Self-healing fallback when the webhook didn't land — e.g. local dev
    without Stripe CLI forwarding, or a transient failure. Idempotent:
    safe to call any time the frontend wants to verify the user's tier.
    """
    if not user:
        raise HTTPException(401, "Sign in first.")
    if not stripe_configured():
        raise HTTPException(500, "Stripe is not configured on the server.")
    try:
        match = find_active_subscription_for_user(user["id"], user.get("email") or "")
    except Exception as e:
        import traceback as _tb
        print(f"[BILLING] /sync stripe lookup crashed: {e!r}\n{_tb.format_exc()}", flush=True)
        raise HTTPException(502, f"Stripe lookup error: {e}")
    if not match:
        return {"tier": "free", "synced": False}
    try:
        await apply_subscription_active(
            user_id=user["id"],
            stripe_customer_id=match["stripe_customer_id"],
            stripe_subscription_id=match["stripe_subscription_id"],
            current_period_end_iso=match.get("current_period_end_iso"),
        )
    except Exception as e:
        import traceback as _tb
        print(f"[BILLING] /sync apply failed: {e!r}\n{_tb.format_exc()}", flush=True)
        raise HTTPException(502, f"Could not persist subscription: {e}")
    return {"tier": "pro", "synced": True}


@router.post("/portal")
async def start_portal(user=Depends(get_optional_user)):
    if not user:
        raise HTTPException(401, "Sign in to manage billing.")
    customer_id = await get_stripe_customer_id(user["id"])
    if not customer_id:
        raise HTTPException(404, "No Stripe customer found for this user.")
    return create_portal_session(customer_id)


@router.get("/plan")
async def get_plan(user=Depends(get_optional_user)):
    """Frontend polls this to learn the current tier + quota.

    Wraps the profile lookup in a top-level try so any Supabase / schema /
    library issue degrades to a safe `free` response instead of leaking a
    500 (which would also strip CORS headers and confuse the browser).
    """
    if not user:
        return {"tier": "anon", "used": 0, "limit": None}
    try:
        profile = await ensure_profile(user["id"], user.get("email"))
    except Exception as e:
        import traceback as _tb
        print(f"[BILLING] get_plan ensure_profile crashed: {e!r}\n{_tb.format_exc()}", flush=True)
        profile = None
    if not profile:
        return {"tier": "free", "used": 0, "limit": 15}
    tier = profile.get("subscription_tier") or "free"
    return {
        "tier": tier,
        "used": profile.get("probes_used_this_month") or 0,
        "limit": None if tier == "pro" else (profile.get("probes_limit") or 15),
        "stripe_customer_id": profile.get("stripe_customer_id"),
    }


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(default="")):
    """Stripe → backend webhook. Mounted at /api/billing/webhook.

    Configure this URL in Stripe Dashboard → Developers → Webhooks. Listen for:
      - checkout.session.completed   (upgrade user)
      - customer.subscription.updated   (renewal)
      - customer.subscription.deleted   (cancellation)
    Copy the signing secret into STRIPE_WEBHOOK_SECRET.
    """
    payload = await request.body()
    try:
        event = verify_webhook(payload, stripe_signature)
    except Exception as e:
        raise HTTPException(400, f"Webhook signature verification failed: {e}")

    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        # client_reference_id was set to the Supabase user id
        user_id = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("supabase_user_id")
        customer = obj.get("customer")
        subscription_id = obj.get("subscription")
        if user_id and customer and subscription_id:
            await apply_subscription_active(
                user_id=user_id,
                stripe_customer_id=customer,
                stripe_subscription_id=subscription_id,
                current_period_end_iso=None,
            )
    elif etype == "customer.subscription.updated":
        meta = obj.get("metadata") or {}
        user_id = meta.get("supabase_user_id")
        status = obj.get("status")
        if user_id and status == "active":
            await apply_subscription_active(
                user_id=user_id,
                stripe_customer_id=obj.get("customer"),
                stripe_subscription_id=obj.get("id"),
                current_period_end_iso=None,
            )
        elif user_id and status in ("canceled", "unpaid", "incomplete_expired"):
            await apply_subscription_canceled(obj.get("id"))
    elif etype == "customer.subscription.deleted":
        await apply_subscription_canceled(obj.get("id"))

    return {"received": True, "type": etype}
