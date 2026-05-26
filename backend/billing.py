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
    await ensure_profile(user["id"], user.get("email"))
    session = create_checkout_session(
        user_id=user["id"],
        user_email=user.get("email") or "",
        success_url=body.success_url,
        cancel_url=body.cancel_url,
    )
    return {"url": session["url"], "id": session["id"]}


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
    """Frontend polls this to learn the current tier + quota."""
    if not user:
        return {"tier": "anon", "used": 0, "limit": None}
    profile = await ensure_profile(user["id"], user.get("email"))
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
