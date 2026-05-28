"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Loader2 } from "lucide-react";
import { fetchPlan, syncSubscription } from "../../../lib/billing";

export default function BillingSuccessPage() {
  const [status, setStatus] = useState<"pending" | "active" | "timeout">("pending");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    // Belt-and-suspenders: try to sync from Stripe directly (works even
    // when the webhook hasn't landed yet), then poll /plan to confirm.
    const tryActivate = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        if (attempts === 1) {
          const sync = await syncSubscription();
          if (sync.synced && sync.tier === "pro") {
            setStatus("active");
            return;
          }
        }
        const plan = await fetchPlan();
        if (plan.tier === "pro") {
          setStatus("active");
          return;
        }
      } catch {}
      if (attempts >= 10) {
        setStatus("timeout");
        return;
      }
      setTimeout(tryActivate, 2000);
    };

    tryActivate();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-3xl border border-white/[0.08] bg-white/[0.02] p-10 text-center">
        {status === "pending" && (
          <>
            <Loader2 className="w-8 h-8 text-emerald-300 mx-auto mb-5 animate-spin" />
            <h1 className="text-xl mb-2">Activating your Pro plan…</h1>
            <p className="text-white/50 text-sm font-mono">
              Waiting for Stripe to confirm your subscription. This usually takes
              a few seconds.
            </p>
          </>
        )}
        {status === "active" && (
          <>
            <Crown className="w-8 h-8 text-emerald-300 mx-auto mb-5" />
            <h1 className="text-2xl mb-2">Welcome to Pro</h1>
            <p className="text-white/60 text-sm mb-7">
              Unlimited probes, single-wave priority probing, full per-agent
              breakdown, and exports are now active on your account.
            </p>
            <Link
              href="/chat"
              className="inline-block rounded-full bg-emerald-400 hover:bg-emerald-300 text-black text-sm font-mono font-semibold py-2.5 px-6"
            >
              Run a Pro-speed probe →
            </Link>
          </>
        )}
        {status === "timeout" && (
          <>
            <h1 className="text-xl mb-2">Payment received</h1>
            <p className="text-white/50 text-sm font-mono mb-6">
              Stripe confirmed your subscription but the webhook hasn't reached
              the server yet. Refresh in a minute, or contact support if Pro
              doesn't activate.
            </p>
            <Link
              href="/chat"
              className="inline-block rounded-full border border-white/[0.12] text-sm font-mono py-2.5 px-6"
            >
              Continue to the probe
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
