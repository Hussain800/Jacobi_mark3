"use client";

/**
 * Pricing — aligned with the cockpit token system.
 *
 * No billing behavior changes. Only typography, colors, and chrome were
 * touched. Stripe checkout, customer portal, and self-heal sync paths
 * are identical to the pre-Phase-4 version.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Zap, Shield, BarChart3, Download, Clock, ArrowRight } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import { fetchPlan, startCheckout, startPortal, syncSubscription, type Plan } from "../../lib/billing";

const STRIPE_TEST_MODE =
  (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").startsWith("pk_test_");

export default function PricingPage() {
  const reducedMotion = useReducedMotion();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

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
    } catch (e: any) {
      setError(e?.message || "Checkout failed. Try again.");
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

  const reveal = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <main className="min-h-screen bg-ink text-primary font-sans selection:bg-signal/20 py-16 sm:py-20 px-5 sm:px-8">
      <div className="max-w-4xl mx-auto">
        {STRIPE_TEST_MODE && (
          <div className="mb-8 rounded-md border border-warning/30 bg-warning/5 px-4 py-3 font-mono text-[11px] text-warning leading-relaxed">
            <span className="uppercase tracking-[0.18em]">Stripe test mode</span> · Use card{" "}
            <code className="px-1.5 py-0.5 rounded bg-warning/10">4242 4242 4242 4242</code>{" "}
            with any future expiry and any 3-digit CVC. No real charges.
          </div>
        )}

        <motion.header {...reveal} className="text-center mb-14">
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-4">
            Plans
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-primary mb-4">
            Forensic pricing access
          </h1>
          <p className="font-mono text-[12px] text-secondary max-w-xl mx-auto leading-relaxed">
            Start free. Upgrade when you need unlimited probes, priority
            execution, and exports.
          </p>
        </motion.header>

        <div className="grid md:grid-cols-2 gap-5 sm:gap-6">
          {/* FREE */}
          <motion.article
            {...reveal}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-lg border border-line bg-raised p-7 flex flex-col"
          >
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                Free
              </span>
              {plan?.tier === "free" && (
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-signal border border-signal/40 bg-signal/10 rounded-full px-2 py-0.5">
                  current
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1 mb-7">
              <span className="font-serif text-5xl text-primary tabular-nums">$0</span>
              <span className="font-mono text-[11px] text-muted">/forever</span>
            </div>
            <ul className="space-y-3 font-mono text-[12px] text-secondary mb-8 flex-1">
              <Bullet>15 probes per month</Bullet>
              <Bullet>24-agent probe · 3 staggered waves · ~60–90s</Bullet>
              <Bullet>Topline discrimination index + spread</Bullet>
              <Bullet>7-day history retention</Bullet>
              <Bullet muted>No exports · no per-agent breakdown</Bullet>
            </ul>
            <Link
              href="/chat"
              className="block text-center rounded-md border border-line hover:border-secondary/50 hover:text-primary font-mono text-[11px] uppercase tracking-[0.16em] text-secondary py-3 transition-colors"
            >
              {plan?.tier === "free" ? "Open the cockpit" : "Start free"}
            </Link>
          </motion.article>

          {/* PRO */}
          <motion.article
            {...reveal}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-lg border border-signal/40 bg-raised p-7 flex flex-col shadow-[0_0_40px_rgba(0,217,122,0.08)]"
          >
            <div className="absolute -top-3 left-7">
              <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-signal bg-ink border border-signal/40 rounded-full px-2.5 py-1">
                <span className="w-1 h-1 rounded-full bg-signal" />
                Pro
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-2 mt-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal">
                Pro
              </span>
              {isPro && (
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-signal border border-signal/40 bg-signal/10 rounded-full px-2 py-0.5">
                  active
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1 mb-7">
              <span className="font-serif text-5xl text-primary tabular-nums">$29</span>
              <span className="font-mono text-[11px] text-muted">/month</span>
            </div>
            <ul className="space-y-3 font-mono text-[12px] text-secondary mb-8 flex-1">
              <Bullet icon={<Zap className="w-3.5 h-3.5 text-signal" />}>
                <span className="text-primary">Unlimited probes</span>
              </Bullet>
              <Bullet icon={<Clock className="w-3.5 h-3.5 text-signal" />}>
                Priority probing — single-wave concurrent <span className="text-muted">(~15s)</span>
              </Bullet>
              <Bullet icon={<BarChart3 className="w-3.5 h-3.5 text-signal" />}>
                Full per-agent fingerprint breakdown
              </Bullet>
              <Bullet icon={<Download className="w-3.5 h-3.5 text-signal" />}>
                PDF, CSV, and JSON exports
              </Bullet>
              <Bullet icon={<Shield className="w-3.5 h-3.5 text-signal" />}>
                Unlimited probe history
              </Bullet>
            </ul>
            {isPro ? (
              <button
                onClick={onManage}
                disabled={busy}
                className="block text-center rounded-md bg-raised hover:bg-line border border-secondary/40 hover:border-secondary font-mono text-[11px] uppercase tracking-[0.16em] text-primary py-3 transition-colors disabled:opacity-50"
              >
                {busy ? "Opening…" : "Manage billing"}
              </button>
            ) : (
              <button
                onClick={onSubscribe}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-signal hover:brightness-110 active:scale-[0.98] font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink py-3 transition-all disabled:opacity-50"
              >
                {busy ? "Loading…" : signedIn ? "Subscribe · $29 / mo" : "Sign in to subscribe"}
                {!busy && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            )}
            {error && (
              <p className="text-overcharge font-mono text-[11px] mt-3 text-center">{error}</p>
            )}
          </motion.article>
        </div>

        <p className="text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted mt-10">
          Cancel anytime · no commitment
        </p>
      </div>
    </main>
  );
}

function Bullet({
  children,
  icon,
  muted,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li className={`flex items-start gap-2.5 ${muted ? "text-muted" : ""}`}>
      <span className="mt-0.5 shrink-0">
        {icon ?? <Check className="w-3.5 h-3.5 text-muted" />}
      </span>
      <span>{children}</span>
    </li>
  );
}
