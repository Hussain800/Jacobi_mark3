"use client";

/**
 * Pricing — rebuilt on the .jx forensic instrument system.
 *
 * Three plans:
 *   - Pilot       — design-partner pilot, Smart 24 audit, evidence locker
 *   - Pro $29/mo  — org workspace, scheduled scans, Pro 50 (private beta)
 *   - Enterprise  — custom volume, contact wearejacobi@outlook.com
 *
 * The billing logic is UNCHANGED: the Supabase + Stripe checkout flow
 * (`startCheckout` / `startPortal` / `fetchPlan` / `syncSubscription` from
 * lib/billing.ts) and the cold-start pre-warm are preserved verbatim. Only the
 * presentation moves from the old jacobi-design template to the .jx panels.
 * Per the design direction there is NO gold tier accent — the recommended plan
 * carries the single cobalt rail.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import { fetchPlan, startCheckout, startPortal, syncSubscription, type Plan } from "../../lib/billing";
import MarketingShell from "../../components/marketing/MarketingShell";
import { PageHeader, SectionMarker } from "../../components/marketing/parts";

const ENTERPRISE_EMAIL = "wearejacobi@outlook.com";

// Backend pre-warm helper. Render's free tier spins down after 15 min
// idle, costing 30–60 s of cold-start latency on the next request. We
// fire this on page mount AND on Pro-button hover so the click itself
// rarely pays the boot tax. Fire-and-forget; failures are fine — the
// goal of the request is the wake-up side effect.
function warmBackend() {
  try {
    const apiBase =
      (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : "") ||
      "http://localhost:8000";
    fetch(`${apiBase}/health`, { method: "GET", cache: "no-store" }).catch(() => {});
  } catch { /* SSR or pre-hydration — skip silently */ }
}

export default function PricingPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<"loading" | "waking">("loading");
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sb = createClient();
    // Reactive auth state — without onAuthStateChange, signedIn was captured
    // once on mount and never updated. That stranded the page in the wrong
    // state after sign-in / refresh / sign-out in another tab, which made
    // "Go Pro" silently 401 on the backend even though the user was signed
    // in. Listener keeps the button text and onSubscribe gate consistent.
    sb.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    (async () => {
      try {
        const sync = await syncSubscription();
        if (sync.tier === "pro") {
          setPlan({ tier: "pro", used: 0, limit: null });
          return;
        }
      } catch {}
      fetchPlan().then(setPlan).catch(() => {});
    })();
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubscribe() {
    setError(null);
    setBusy(true);
    setBusyLabel("loading");
    // After 3 s, switch the button label to "Waking server…" so the user
    // knows we're not stuck — this is the Render free-tier cold-start
    // window (~30–60 s). The pre-warm on page mount usually means we
    // never hit this branch.
    const wakeTimer = setTimeout(() => setBusyLabel("waking"), 3000);
    try {
      if (!signedIn) {
        const sb = createClient();
        await sb.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback?next=/pricing` },
        });
        return;
      }
      const url = await startCheckout();
      if (url) window.location.href = url;
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Checkout failed. Try again.");
    } finally {
      clearTimeout(wakeTimer);
      setBusy(false);
      setBusyLabel("loading");
    }
  }

  async function onManage() {
    setBusy(true);
    setBusyLabel("loading");
    const wakeTimer = setTimeout(() => setBusyLabel("waking"), 3000);
    try {
      const url = await startPortal();
      if (url) window.location.href = url;
    } finally {
      clearTimeout(wakeTimer);
      setBusy(false);
      setBusyLabel("loading");
    }
  }

  const isPro = plan?.tier === "pro";
  // Pro 50 is in PRIVATE BETA for the Smart 24 waitlist launch. Unless
  // NEXT_PUBLIC_PRO50_BETA=1, the Pro plan is shown as "Private beta / coming
  // soon" and the public checkout CTA is suppressed (we do not sell Pro 50 yet).
  // Existing Pro accounts (test mode) still see "Manage billing".
  const pro50BetaEnabled = process.env.NEXT_PUBLIC_PRO50_BETA === "1";

  return (
    <MarketingShell>
      <PageHeader
        eyebrow="Pricing"
        title={<>Launch a price-integrity pilot, <span className="jx-soft">fast</span>.</>}
        lede="Choose a package for MAP monitoring, synthetic-buyer evidence capture, redacted external sharing, and compliance-ready reporting. Smart 24 is live today; Pro 50 remains gated for approved workspaces."
        meta={<><span>Cancel anytime</span><span>USD</span><span>billed via Stripe</span></>}
      />

      <SectionMarker id="01" name="Plans" meta="pilot · professional · enterprise" />
      <section className="jx-section jx-section--tight">
        <div className="jx-wrap jx-wrap--wide">
          <div className="jx-plans">
            {/* ── Pilot ─────────────────────────────────────────── */}
            <div className="jx-plan" data-reveal>
              <div className="jx-plan__name">
                Pilot
                {plan?.tier === "free" && <span className="jx-plan__badge current">Current</span>}
              </div>
              <div className="jx-plan__price">
                <span className="jx-plan__amt">Free</span>
                <span className="jx-plan__per">/ pilot partner</span>
              </div>
              <p className="jx-plan__tag">
                Best for proving value on a focused MAP watchlist before a paid rollout.
              </p>
              <Link className="jx-btn jx-btn--ghost jx-btn--block jx-plan__cta" href="/chat">
                Start pilot
              </Link>
              <ul className="jx-plan__feats">
                <li><span className="jx-feat-mark on">✓</span> Focused MAP watchlist import</li>
                <li><span className="jx-feat-mark on">✓</span> <strong>Smart 24 audit</strong> — 24-agent matrix</li>
                <li><span className="jx-feat-mark on">✓</span> Evidence locker and finding review</li>
                <li><span className="jx-feat-mark on">✓</span> Native-currency price display</li>
                <li><span className="jx-feat-mark on">✓</span> MAP PDF and JSON report export</li>
                <li><span className="jx-feat-mark on">✓</span> Redacted external share links</li>
                <li className="is-muted"><span className="jx-feat-mark">–</span> Pro 50 advanced matrix</li>
                <li className="is-muted"><span className="jx-feat-mark">–</span> Dedicated SLA</li>
              </ul>
            </div>

            {/* ── Professional ──────────────────────────────────── */}
            <div className="jx-plan jx-plan--featured" data-reveal>
              <div className="jx-plan__flag">Most popular</div>
              <div className="jx-plan__name">
                Professional
                {!pro50BetaEnabled && <span className="jx-plan__badge beta">Private beta</span>}
                {isPro && <span className="jx-plan__badge active">Active</span>}
              </div>
              <div className="jx-plan__price">
                <span className="jx-plan__amt jx-tnum">$29</span>
                <span className="jx-plan__per">/ month</span>
              </div>
              <p className="jx-plan__tag">
                Team workspace for compliance, brand-protection, and channel operations teams running recurring MAP monitoring.
              </p>
              {isPro ? (
                <button
                  className="jx-btn jx-btn--primary jx-btn--block jx-plan__cta"
                  onClick={onManage}
                  onMouseEnter={warmBackend}
                  disabled={busy}
                >
                  {busy ? (busyLabel === "waking" ? "Waking server…" : "Opening…") : "Manage billing"}
                </button>
              ) : pro50BetaEnabled ? (
                <button
                  className="jx-btn jx-btn--primary jx-btn--block jx-plan__cta"
                  onClick={onSubscribe}
                  onMouseEnter={warmBackend}
                  disabled={busy}
                >
                  {busy ? (busyLabel === "waking" ? "Waking server…" : "Loading…") : signedIn ? "Go Professional" : "Sign in to subscribe"}
                </button>
              ) : (
                <button
                  className="jx-btn jx-btn--ghost jx-btn--block jx-plan__cta"
                  disabled
                  title="Pro 50 is in private beta. Smart 24 is live today."
                >
                  Private beta — coming soon
                </button>
              )}
              {error && <p className="jx-plan__err">{error}</p>}
              <ul className="jx-plan__feats">
                <li><span className="jx-feat-mark on">✓</span> Organization workspace and roles</li>
                <li><span className="jx-feat-mark on">✓</span> Scheduled live watchlist scans</li>
                <li><span className="jx-feat-mark on">✓</span> Evidence-grade PDF and JSON exports</li>
                <li><span className="jx-feat-mark on">✓</span> Revocable redacted share links</li>
                <li><span className="jx-feat-mark on">✓</span> Rate and cost guardrails</li>
                <li><span className="jx-feat-mark on">✓</span> Pro 50 advanced matrix for approved workspaces</li>
                <li><span className="jx-feat-mark on">✓</span> Everything in Pilot</li>
              </ul>
            </div>

            {/* ── Enterprise ────────────────────────────────────── */}
            <div className="jx-plan" data-reveal>
              <div className="jx-plan__name">Enterprise</div>
              <div className="jx-plan__price">
                <span className="jx-plan__amt" style={{ fontSize: 30 }}>Contact</span>
                <span className="jx-plan__per">/ custom</span>
              </div>
              <p className="jx-plan__tag">
                For brands and compliance teams that need bulk watchlists, custom buyer contexts, procurement terms, and SLAs.
              </p>
              <a
                className="jx-btn jx-btn--ghost jx-btn--block jx-plan__cta"
                href={`mailto:${ENTERPRISE_EMAIL}?subject=JACOBI%20Enterprise%20inquiry`}
              >
                Contact us →
              </a>
              <ul className="jx-plan__feats">
                <li><span className="jx-feat-mark on">✓</span> Everything in Professional</li>
                <li><span className="jx-feat-mark on">✓</span> <strong>Custom audit volume</strong></li>
                <li><span className="jx-feat-mark on">✓</span> Custom buyer-context sets</li>
                <li><span className="jx-feat-mark on">✓</span> API access and custom integrations</li>
                <li><span className="jx-feat-mark on">✓</span> Custom reporting</li>
                <li><span className="jx-feat-mark on">✓</span> Dedicated support</li>
                <li><span className="jx-feat-mark on">✓</span> SLA and custom terms</li>
              </ul>
            </div>
          </div>

          <p className="jx-pricing-foot" data-reveal>
            Cancel anytime · prices in USD · billed via Stripe
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
