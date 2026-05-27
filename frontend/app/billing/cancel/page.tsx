import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-3xl border border-white/[0.08] bg-white/[0.02] p-10 text-center">
        <h1 className="text-xl mb-2">Checkout cancelled</h1>
        <p className="text-white/50 text-sm font-mono mb-7">
          No charge was made. You can keep using the free plan, or come back
          when you're ready to upgrade.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/pricing"
            className="rounded-full bg-emerald-400 hover:bg-emerald-300 text-black text-sm font-mono font-semibold py-2.5 px-6"
          >
            See plans
          </Link>
          <Link
            href="/chat"
            className="rounded-full border border-white/[0.12] text-sm font-mono py-2.5 px-6"
          >
            Back to probe
          </Link>
        </div>
      </div>
    </main>
  );
}
