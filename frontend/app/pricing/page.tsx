"use client";

/**
 * Pricing — Claude Design port + new Enterprise tier.
 *
 * Three plans:
 *   - Free       — 24 probes/month, 24 identities per probe, basic report,
 *                  shareable link, limited history
 *   - Pro $29/mo — 50 probes/month, 24 identities per probe, full forensic
 *                  PDF, probe history, private share links, priority
 *                  processing, board opt-in control
 *   - Enterprise — custom volume, contact wearejacobi@outlook.com
 *
 * Pro keeps the existing Supabase + Stripe checkout flow (`startCheckout` /
 * `startPortal` / `fetchPlan` from lib/billing.ts) so nothing about the
 * paid path changes. Enterprise is a plain mailto.
 *
 * Wrapped in <div className="jacobi-design"> so jacobi-design.css's .plan
 * card styles apply.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { createClient } from "../../lib/supabase/client";
import { fetchPlan, startCheckout, startPortal, syncSubscription, type Plan } from "../../lib/billing";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import { useReveals } from "../../components/design/landing-interactions";
import "../jacobi-design.css";

const ENTERPRISE_EMAIL = "wearejacobi@outlook.com";

const STRIPE_TEST_MODE =
  (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").startsWith("pk_test_");

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

  // Without this, every [data-reveal] element stays at opacity:0 and the
  // page renders blank. (The landing page calls this; pricing did not.)
  useReveals();

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
    <div className="jacobi-design">
      <Script src="/jacobi-design/scene.js"   strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />

      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap">
            <div className="sec-head pricing-head" data-reveal>
              <span className="eyebrow">
                <span className="dot">●</span> Pricing
              </span>
              <h1 className="display sec-title">
                Run the truth,{" "}
                <span className="serif-i" style={{ color: "var(--cobalt-bright)" }}>
                  free
                </span>
                .
              </h1>
              <p className="sec-lede sec">
                Smart 24 is live today — a 24-agent evidence audit, free to start.
                The 50-agent Pro matrix is in private beta. Enterprise teams can
                contact us for a custom audit.
              </p>
              {/* The Stripe test-mode banner that used to live here was
                  removed per product direction: customer-facing UI should
                  read as a real SaaS, not a sandbox. Test-mode is still
                  enforced at the key level via STRIPE_TEST_MODE in code. */}
            </div>

            <div className="plans">
              {/* ── Free ─────────────────────────────────────────── */}
              <div className="plan card" data-reveal>
                <div className="plan-head">
                  <span className="plan-name mono">
                    Free
                    {plan?.tier === "free" && (
                      <span style={{
                        marginLeft: 10, fontSize: 9, color: "var(--good)",
                        border: "1px solid rgba(58,215,159,0.4)",
                        borderRadius: 999, padding: "2px 7px",
                        letterSpacing: "0.12em",
                      }}>
                        CURRENT
                      </span>
                    )}
                  </span>
                  <div className="plan-price">
                    <span className="serif plan-amt">$0</span>
                    <span className="plan-per mono">/ forever</span>
                  </div>
                  <p className="plan-tag sec">
                    Best for trying JACOBI — proof before you buy.
                  </p>
                </div>
                <Link className="btn btn-ghost plan-cta" href="/chat">
                  Start probing
                </Link>
                <ul className="plan-feats">
                  <li><span className="pf-check">✓</span> <strong>Smart 24 audit</strong> — 24-agent matrix</li>
                  <li><span className="pf-check">✓</span> Evidence table with raw on-page text</li>
                  <li><span className="pf-check">✓</span> Native-currency price display</li>
                  <li><span className="pf-check">✓</span> Basic report export</li>
                  <li><span className="pf-check">✓</span> Limited monthly scans</li>
                  <li className="muted-feat"><span className="pf-dash">—</span> Pro 50 advanced matrix</li>
                  <li className="muted-feat"><span className="pf-dash">—</span> Controlled language pairs</li>
                  <li className="muted-feat"><span className="pf-dash">—</span> Advanced PDF report</li>
                </ul>
              </div>

              {/* ── Pro ──────────────────────────────────────────── */}
              <div className="plan card plan-pro" data-reveal>
                <div className="plan-flag mono">Most popular</div>
                <div className="plan-head">
                  <span className="plan-name mono" style={{ color: "var(--cobalt-bright)" }}>
                    Pro
                    {!pro50BetaEnabled && (
                      <span style={{
                        marginLeft: 10, fontSize: 9, color: "var(--gold)",
                        border: "1px solid rgba(214,178,94,0.45)",
                        borderRadius: 999, padding: "2px 7px",
                        letterSpacing: "0.12em",
                      }}>
                        PRIVATE BETA
                      </span>
                    )}
                    {isPro && (
                      <span style={{
                        marginLeft: 8, fontSize: 9, color: "var(--good)",
                        border: "1px solid rgba(58,215,159,0.4)",
                        borderRadius: 999, padding: "2px 7px",
                        letterSpacing: "0.12em",
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </span>
                  <div className="plan-price">
                    <span className="serif plan-amt">$29</span>
                    <span className="plan-per mono">/ month</span>
                  </div>
                  <p className="plan-tag sec">
                    The 50-agent advanced matrix — in private beta while Smart 24
                    is in early access. Not yet on public sale.
                  </p>
                </div>
                {isPro ? (
                  <button
                    className="btn btn-primary plan-cta"
                    onClick={onManage}
                    onMouseEnter={warmBackend}
                    disabled={busy}
                  >
                    {busy
                      ? busyLabel === "waking" ? "Waking server…" : "Opening…"
                      : "Manage billing"}
                  </button>
                ) : pro50BetaEnabled ? (
                  <button
                    className="btn btn-primary plan-cta"
                    onClick={onSubscribe}
                    onMouseEnter={warmBackend}
                    disabled={busy}
                  >
                    {busy
                      ? busyLabel === "waking" ? "Waking server…" : "Loading…"
                      : signedIn ? "Go Pro" : "Sign in to subscribe"}
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost plan-cta"
                    disabled
                    title="Pro 50 is in private beta. Smart 24 is live today."
                  >
                    Private beta — coming soon
                  </button>
                )}
                {error && (
                  <p style={{
                    color: "var(--over)", fontSize: 11, marginTop: 8,
                    textAlign: "center", fontFamily: "var(--mono)",
                  }}>
                    {error}
                  </p>
                )}
                <ul className="plan-feats">
                  <li><span className="pf-check pro">✓</span> <strong>Pro 50 advanced matrix</strong> — 50-agent audit</li>
                  <li><span className="pf-check pro">✓</span> More controlled language pairs (EN/AR/HI/FR)</li>
                  <li><span className="pf-check pro">✓</span> Deeper cookie, referrer, device &amp; geo coverage</li>
                  <li><span className="pf-check pro">✓</span> Advanced PDF report export</li>
                  <li><span className="pf-check pro">✓</span> Higher monthly scan limits</li>
                  <li><span className="pf-check pro">✓</span> Probe history &amp; private share links</li>
                  <li><span className="pf-check pro">✓</span> Everything in Free</li>
                </ul>
              </div>

              {/* ── Enterprise ───────────────────────────────────── */}
              <div className="plan card" data-reveal>
                <div className="plan-head">
                  <span className="plan-name mono" style={{ color: "var(--gold)" }}>
                    Enterprise
                  </span>
                  <div className="plan-price">
                    <span className="serif plan-amt" style={{ fontSize: 40 }}>Contact</span>
                    <span className="plan-per mono">/ custom</span>
                  </div>
                  <p className="plan-tag sec">
                    For research teams, regulators, and journalism rooms
                    that need bulk volume and a paper trail.
                  </p>
                </div>
                <a
                  className="btn btn-ghost plan-cta"
                  href={`mailto:${ENTERPRISE_EMAIL}?subject=JACOBI%20Enterprise%20inquiry`}
                  style={{ borderColor: "rgba(216,176,106,0.4)", color: "var(--gold)" }}
                >
                  Contact us →
                </a>
                <ul className="plan-feats">
                  <li><span className="pf-check pro">✓</span> Everything in Pro</li>
                  <li><span className="pf-check pro">✓</span> <strong>100-agent custom audit</strong> (bespoke, contact us)</li>
                  <li><span className="pf-check pro">✓</span> Custom geos &amp; proxy profiles</li>
                  <li><span className="pf-check pro">✓</span> API access &amp; custom reporting</li>
                  <li><span className="pf-check pro">✓</span> Team workspaces</li>
                  <li><span className="pf-check pro">✓</span> Dedicated support</li>
                  <li><span className="pf-check pro">✓</span> SLA + custom terms</li>
                </ul>
              </div>
            </div>

            <p className="pricing-foot label-mono" data-reveal>
              Cancel anytime · prices in USD · billed via Stripe
            </p>
          </div>
        </section>
      </main>

      <DesignFooter />
    </div>
  );
}
