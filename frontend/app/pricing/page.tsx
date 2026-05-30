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

export default function PricingPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  // Without this, every [data-reveal] element stays at opacity:0 and the
  // page renders blank. (The landing page calls this; pricing did not.)
  useReveals();

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
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
  }, []);

  async function onSubscribe() {
    setError(null);
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function onManage() {
    setBusy(true);
    try {
      const url = await startPortal();
      if (url) window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  const isPro = plan?.tier === "pro";

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
                Start with 24 probes. Go Pro for 50. Enterprise teams
                can contact us for custom volume.
              </p>
              {/* The Stripe test-mode banner that used to live here was
                  removed per product direction: customer-facing UI should
                  read as a real SaaS, not a sandbox. Test-mode is still
                  enforced at the key level via STRIPE_TEST_MODE in code. */}
            </div>

            <div
              className="plans"
              style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
            >
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
                  <li><span className="pf-check">✓</span> <strong>24 probes</strong> / month</li>
                  <li><span className="pf-check">✓</span> 24 synthetic identities per probe</li>
                  <li><span className="pf-check">✓</span> Basic discrimination report</li>
                  <li><span className="pf-check">✓</span> Shareable result link</li>
                  <li><span className="pf-check">✓</span> Limited history</li>
                  <li className="muted-feat"><span className="pf-dash">—</span> Forensic PDF report</li>
                  <li className="muted-feat"><span className="pf-dash">—</span> Private share links</li>
                  <li className="muted-feat"><span className="pf-dash">—</span> Priority processing</li>
                </ul>
              </div>

              {/* ── Pro ──────────────────────────────────────────── */}
              <div className="plan card plan-pro" data-reveal>
                <div className="plan-flag mono">Most popular</div>
                <div className="plan-head">
                  <span className="plan-name mono" style={{ color: "var(--cobalt-bright)" }}>
                    Pro
                    {isPro && (
                      <span style={{
                        marginLeft: 10, fontSize: 9, color: "var(--good)",
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
                    Best for founders, analysts, journalists, and teams
                    checking pricing regularly.
                  </p>
                </div>
                {isPro ? (
                  <button
                    className="btn btn-primary plan-cta"
                    onClick={onManage}
                    disabled={busy}
                  >
                    {busy ? "Opening…" : "Manage billing"}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary plan-cta"
                    onClick={onSubscribe}
                    disabled={busy}
                  >
                    {busy ? "Loading…" : signedIn ? "Go Pro" : "Sign in to subscribe"}
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
                  <li><span className="pf-check pro">✓</span> <strong>50 probes / month</strong></li>
                  <li><span className="pf-check pro">✓</span> 24 synthetic identities per probe</li>
                  <li><span className="pf-check pro">✓</span> Full forensic PDF report</li>
                  <li><span className="pf-check pro">✓</span> Probe history</li>
                  <li><span className="pf-check pro">✓</span> Private share links</li>
                  <li><span className="pf-check pro">✓</span> Priority processing</li>
                  <li><span className="pf-check pro">✓</span> Board opt-in control</li>
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
                  <li><span className="pf-check pro">✓</span> <strong>Custom probe volume</strong></li>
                  <li><span className="pf-check pro">✓</span> Custom identity / topology sets</li>
                  <li><span className="pf-check pro">✓</span> Team accounts + API access</li>
                  <li><span className="pf-check pro">✓</span> Custom reporting</li>
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
