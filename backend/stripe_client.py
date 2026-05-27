"""Stripe client wrapper for JACOBI billing.

Loads STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_WEBHOOK_SECRET from env.
The publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) lives in the frontend
only — never the secret key.
"""
import os
from typing import Optional

# Reuse the same dotenv load order as brightdata_config so backend/.env.local
# overrides bare backend/.env and repo-root .env.local feeds both stacks.
from brightdata_config import PROJECT_ROOT  # noqa: F401  (triggers load_dotenv)

import stripe

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PRO_PRICE_ID = os.getenv("STRIPE_PRO_PRICE_ID", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def stripe_configured() -> bool:
    return bool(STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID)


def create_checkout_session(
    user_id: str,
    user_email: str,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
) -> dict:
    """Create a Stripe Checkout Session for the Pro subscription.

    Returns the session dict; caller forwards `url` to the frontend for redirect.
    """
    session = stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": STRIPE_PRO_PRICE_ID, "quantity": 1}],
        customer_email=user_email or None,
        client_reference_id=user_id,
        # metadata is the durable link from the Stripe object back to our user.
        # The webhook reads this to know which Supabase profile to upgrade.
        metadata={"supabase_user_id": user_id},
        subscription_data={"metadata": {"supabase_user_id": user_id}},
        success_url=(success_url or f"{FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"),
        cancel_url=(cancel_url or f"{FRONTEND_URL}/billing/cancel"),
        allow_promotion_codes=True,
    )
    return {"id": session.id, "url": session.url}


def create_portal_session(stripe_customer_id: str, return_url: Optional[str] = None) -> dict:
    """Create a Customer Portal session so a Pro user can cancel / update card."""
    portal = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=(return_url or f"{FRONTEND_URL}/chat"),
    )
    return {"url": portal.url}


def verify_webhook(payload: bytes, sig_header: str) -> stripe.Event:
    """Verify a Stripe webhook signature and return the parsed Event."""
    if not STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET is not configured.")
    return stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)


def find_active_subscription_for_user(user_id: str, user_email: str) -> Optional[dict]:
    """Look up an active Pro subscription for this Supabase user.

    Used by the /sync endpoint so the frontend can self-heal when the webhook
    didn't land (e.g., local dev without Stripe CLI, transient network issue,
    Stripe API hiccup). Strategy:
      1. Search subscriptions by metadata.supabase_user_id (set at checkout)
      2. Fall back to a customer lookup by email if no metadata match yet
         (handles the brief window before Stripe propagates metadata)

    Returns a dict with stripe_customer_id, stripe_subscription_id,
    current_period_end_iso, or None if nothing active is found.
    """
    if not STRIPE_SECRET_KEY:
        return None

    # 1. Metadata search — exact match on the supabase_user_id we set
    #    at checkout. This is the durable identifier.
    try:
        result = stripe.Subscription.search(
            query=f"status:'active' AND metadata['supabase_user_id']:'{user_id}'",
            limit=1,
        )
        if result.data:
            sub = result.data[0]
            return {
                "stripe_customer_id": sub.customer,
                "stripe_subscription_id": sub.id,
                "current_period_end_iso": None,
            }
    except Exception as e:
        print(f"[STRIPE] subscription search failed: {e!r}", flush=True)

    # 2. Email fallback — find the customer by email, then their active subs
    if not user_email:
        return None
    try:
        customers = stripe.Customer.search(query=f"email:'{user_email}'", limit=10)
        for cust in customers.data:
            subs = stripe.Subscription.list(customer=cust.id, status="active", limit=1)
            if subs.data:
                sub = subs.data[0]
                return {
                    "stripe_customer_id": cust.id,
                    "stripe_subscription_id": sub.id,
                    "current_period_end_iso": None,
                }
    except Exception as e:
        print(f"[STRIPE] customer email lookup failed: {e!r}", flush=True)

    return None
