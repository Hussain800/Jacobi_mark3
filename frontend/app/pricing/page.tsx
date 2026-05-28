"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Zap, Shield, BarChart3, Download, Clock, Crown } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import { fetchPlan, startCheckout, startPortal, syncSubscription, type Plan } from "../../lib/billing";

const STRIPE_TEST_MODE =
  (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").startsWith("pk_test_");

export default function PricingPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    // Self-heal: pull from Stripe in case a previous checkout never had
    // its webhook delivered. Cheap idempotent call.
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

  return (
    <main className="min-h-screen bg-[#050505] text-white py-16 px-4">
      <div className="max-w-5xl mx-auto">
        {STRIPE_TEST_MODE && (
          <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-[11px] font-mono text-amber-300/90">
            <span className="font-semibold">Stripe Test Mode</span> · Use card{" "}
            <code className="px-1.5 py-0.5 rounded bg-amber-400/10">4242 4242 4242 4242</code>{" "}
            with any future expiry and any 3-digit CVC. No real charges.
          </div>
        )}

        <header className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-light tracking-tight mb-3">Pricing</h1>
          <p className="text-white/50 text-sm font-mono max-w-xl mx-auto">
            Run probes to reveal hidden pricing discrimination. Start free, upgrade when you need more.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-5">
          {/* FREE */}
          <article className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7 flex flex-col">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-mono uppercase tracking-widest text-white/40">Free</span>
              {plan?.tier === "free" && (
                <span className="text-[10px] font-mono text-emerald-300/80 border border-emerald-400/30 rounded-full px-2 py-0.5">
                  current
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-5xl font-light">$0</span>
              <span className="text-white/40 text-sm">/forever</span>
            </div>
            <ul className="space-y-3 text-sm text-white/70 mb-8 flex-1">
              <Bullet>15 probes per month</Bullet>
              <Bullet>24-agent probe (3 staggered waves, ~60–90s)</Bullet>
              <Bullet>Topline discrimination index + spread</Bullet>
              <Bullet>7-day history retention</Bullet>
              <Bullet muted>No exports · No per-agent breakdown</Bullet>
            </ul>
            <Link
              href="/chat"
              className="block text-center rounded-full border border-white/[0.12] hover:border-white/30 text-sm font-mono py-2.5 transition-colors"
            >
              {plan?.tier === "free" ? "Open the probe" : "Start free"}
            </Link>
          </article>

          {/* PRO */}
          <article className="relative rounded-3xl border border-emerald-400/30 bg-gradient-to-b from-emerald-400/5 to-transparent p-7 flex flex-col">
            <div className="absolute -top-3 left-7">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-emerald-300 bg-[#050505] border border-emerald-400/40 rounded-full px-2.5 py-1">
                <Crown className="w-3 h-3" /> Pro
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-1 mt-2">
              <span className="text-xs font-mono uppercase tracking-widest text-emerald-300/80">Pro</span>
              {isPro && (
                <span className="text-[10px] font-mono text-emerald-300 border border-emerald-400/40 rounded-full px-2 py-0.5">
                  active
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-5xl font-light">$29</span>
              <span className="text-white/40 text-sm">/month</span>
            </div>
            <ul className="space-y-3 text-sm text-white/80 mb-8 flex-1">
              <Bullet icon={<Zap className="w-3.5 h-3.5 text-emerald-300" />}>
                <span className="text-white">Unlimited probes</span>
              </Bullet>
              <Bullet icon={<Clock className="w-3.5 h-3.5 text-emerald-300" />}>
                Priority probing — single-wave concurrent <span className="text-white/50">(~15s)</span>
              </Bullet>
              <Bullet icon={<BarChart3 className="w-3.5 h-3.5 text-emerald-300" />}>
                Full per-agent fingerprint breakdown
              </Bullet>
              <Bullet icon={<Download className="w-3.5 h-3.5 text-emerald-300" />}>
                PDF, CSV, and JSON exports
              </Bullet>
              <Bullet icon={<Shield className="w-3.5 h-3.5 text-emerald-300" />}>
                Unlimited probe history
              </Bullet>
            </ul>
            {isPro ? (
              <button
                onClick={onManage}
                disabled={busy}
                className="block text-center rounded-full bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.12] text-sm font-mono py-2.5 transition-colors disabled:opacity-50"
              >
                {busy ? "Opening…" : "Manage billing"}
              </button>
            ) : (
              <button
                onClick={onSubscribe}
                disabled={busy}
                className="block text-center rounded-full bg-emerald-400 hover:bg-emerald-300 text-black text-sm font-mono font-semibold py-2.5 transition-colors disabled:opacity-50"
              >
                {busy ? "Loading…" : signedIn ? "Subscribe — $29 / mo" : "Sign in to subscribe"}
              </button>
            )}
            {error && (
              <p className="text-rose-400 text-[11px] font-mono mt-3 text-center">{error}</p>
            )}
          </article>
        </div>

        <p className="text-center text-white/30 text-[11px] font-mono mt-10">
          Cancel anytime from the customer portal. No commitment.
        </p>

        <footer className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded border border-emerald-400/30 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#34d399" strokeWidth="1.2">
                <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" />
                <circle cx="6" cy="6" r="1.5" fill="#34d399" opacity="0.6" />
              </svg>
            </div>
            <span className="text-sm font-medium tracking-tight text-white/80">JACOBI</span>
          </div>
          <div className="flex items-center gap-5 text-[11px] font-mono">
            <Link href="/chat" className="text-white/40 hover:text-white/80 transition-colors">Probe</Link>
            <Link href="/about" className="text-white/40 hover:text-white/80 transition-colors">About</Link>
            <Link href="/leaderboard" className="text-white/40 hover:text-white/80 transition-colors">Leaderboard</Link>
          </div>
        </footer>
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
    <li className={`flex items-start gap-2.5 ${muted ? "text-white/35" : ""}`}>
      <span className="mt-1 shrink-0">
        {icon ?? <Check className="w-3.5 h-3.5 text-white/40" />}
      </span>
      <span>{children}</span>
    </li>
  );
}
