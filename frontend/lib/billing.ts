/**
 * Thin helpers around the backend billing routes. The frontend always sends the
 * Supabase access token as a Bearer header so the backend can resolve which user
 * is calling.
 */
import { createClient } from "./supabase/client";

import { getClientApiBase } from "./api-base";

const API_BASE = getClientApiBase();

export type Plan = {
  tier: "anon" | "free" | "pro";
  used: number;
  limit: number | null;
  stripe_customer_id?: string | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  // getSession() is a LOCAL READ — it does NOT refresh expired tokens.
  // Supabase access tokens expire after ~1 hour; on a long-lived tab this
  // can return either null or a stale token. Handing the backend a stale
  // token gets the user a 401 ("Sign in to upgrade.") even though they
  // look signed-in in the nav (nav uses getUser(), which auto-revalidates).
  //
  // Pattern: try getSession() first; if no live access_token, force a
  // refreshSession() and try again. Only return empty headers if there's
  // truly no recoverable session.
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    } catch {
      // Refresh failed — leave session null. Caller gets 401 and can
      // prompt sign-in cleanly.
    }
  }
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchPlan(): Promise<Plan> {
  const headers = await authHeaders();
  const r = await fetch(`${API_BASE}/api/billing/plan`, { headers });
  if (!r.ok) return { tier: "anon", used: 0, limit: null };
  return r.json();
}

export async function startCheckout(): Promise<string | null> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
  };
  const successUrl = `${window.location.origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${window.location.origin}/billing/cancel`;
  const r = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify({ success_url: successUrl, cancel_url: cancelUrl }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.detail || `Checkout failed (${r.status})`);
  }
  const data = await r.json();
  return data.url || null;
}

export async function syncSubscription(): Promise<{ tier: string; synced: boolean }> {
  const headers = await authHeaders();
  const r = await fetch(`${API_BASE}/api/billing/sync`, {
    method: "POST",
    headers,
  });
  if (!r.ok) return { tier: "free", synced: false };
  return r.json();
}

export async function startPortal(): Promise<string | null> {
  const headers = await authHeaders();
  const r = await fetch(`${API_BASE}/api/billing/portal`, {
    method: "POST",
    headers,
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.url || null;
}
