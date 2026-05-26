import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — JACOBI",
  description: "Simple pricing for the 24-agent adversarial pricing probe.",
};

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Try the probe with no commitment. Five probes every month, on us.",
    features: [
      "5 probes per month",
      "Email reports",
      "Community support",
      "7-day history",
    ],
    cta: "Get started free",
    href: "/chat",
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
    description: "For serious shoppers and frequent travelers who probe regularly.",
    features: [
      "50 probes per month",
      "PDF export",
      "Priority support",
      "Shareable links",
      "90-day history",
    ],
    cta: "Start Pro",
    href: "/chat",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$49",
    period: "/mo",
    description: "Teams and organizations monitoring pricing at scale.",
    features: [
      "Unlimited probes",
      "API access",
      "Webhook alerts",
      "SLA",
      "Dedicated support",
      "1-year history",
    ],
    cta: "Contact us",
    href: "/chat",
  },
];

const FAQS = [
  {
    q: "What counts as a probe?",
    a: "One probe is one URL tested against all 24 agent profiles. Even if you submit the same URL twice, each submission counts as a separate probe because pricing can change between visits. Results are always fresh.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no cancellation fees. Your plan remains active until the end of the current billing period. Downgrade to Free at any time and your remaining probes stay available until the period ends.",
  },
  {
    q: "Do you store my browsing data?",
    a: "Probe results are stored according to your plan history window (7 days for Free, 90 days for Pro, 1 year for Enterprise). After the retention window, raw data is purged. We never share your probe history or pricing data with third parties.",
  },
  {
    q: "What sites does JACOBI work on?",
    a: "JACOBI works best on public product pages, booking sites, and checkout flows. Sites that require authentication or use aggressive anti-bot measures may return partial results. The system is continuously updated to handle new detection patterns through BrightData infrastructure.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#07080c] text-[#d4d4d4] font-mono overflow-x-hidden selection:bg-emerald-400/20 selection:text-white">
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative px-6 lg:px-12 pt-20 pb-12 lg:pt-28 lg:pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[15%] left-[15%] w-[350px] h-[350px] rounded-full bg-emerald-400/2 blur-[100px]" />
          <div className="absolute bottom-[5%] right-[10%] w-[250px] h-[250px] rounded-full bg-blue-400/2 blur-[80px]" />
        </div>

        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-emerald-400/20 bg-emerald-400/4 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400/70 tracking-widest uppercase">
              Transparent pricing
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.94] text-white mb-4">
            Simple{" "}
            <span className="text-emerald-400">Pricing</span>
          </h1>

          <p className="text-sm sm:text-base text-[#888] leading-relaxed max-w-md mx-auto">
            Pay for what you use
          </p>
        </div>
      </section>

      {/* ═══════════════ TIERS ═══════════════ */}
      <section className="border-t border-white/[0.04] px-6 lg:px-12 py-16 lg:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col bg-white/[0.02] backdrop-blur-xl border rounded-2xl p-6 transition-all duration-300 ${
                  tier.highlighted
                    ? "border-emerald-400/20 bg-emerald-400/[0.02]"
                    : "border-white/[0.06] hover:border-white/[0.10]"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-[9px] font-mono uppercase tracking-widest px-3 py-1 rounded-sm bg-emerald-400 text-[#07080c] font-bold">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <div className="text-sm font-semibold text-white mb-1">
                    {tier.name}
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold text-white">
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-xs text-[#555]">{tier.period}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#666] leading-relaxed">
                    {tier.description}
                  </p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className={`shrink-0 mt-0.5 ${tier.highlighted ? "text-emerald-400" : "text-[#444]"}`}
                      >
                        <path
                          d="M3 7.5L5.5 10L11 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-[11px] text-[#888] leading-relaxed">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.href}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm text-xs font-bold transition-all duration-300 ${
                    tier.highlighted
                      ? "bg-emerald-400 text-[#07080c] hover:bg-emerald-300"
                      : "border border-white/[0.08] text-[#999] hover:text-white hover:border-white/[0.20]"
                  }`}
                >
                  {tier.cta}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 6h10M7 2l4 4-4 4" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FAQ ═══════════════ */}
      <section className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28 bg-white/[0.005]">
        <div className="max-w-3xl mx-auto">
          <span className="text-[10px] text-[#555] tracking-[0.2em] uppercase mb-4 block">
            FAQ
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-14 leading-[1.15]">
            Questions you might have
          </h2>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <details
                key={i}
                className="group border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.10] transition-all duration-300"
              >
                <summary className="flex items-center justify-between cursor-pointer p-5 list-none">
                  <span className="text-sm font-semibold text-white group-open:text-emerald-400 transition-colors">
                    {faq.q}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="#555"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="shrink-0 ml-4 transition-transform duration-200 group-open:rotate-45"
                  >
                    <path d="M7 1v12M1 7h12" />
                  </svg>
                </summary>
                <div className="px-5 pb-5 -mt-1">
                  <p className="text-xs text-[#777] leading-relaxed">{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="border-t border-white/[0.04] px-6 lg:px-12 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-sm border border-emerald-400/30 flex items-center justify-center">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="#34d399"
                strokeWidth="1.2"
              >
                <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" />
                <circle cx="6" cy="6" r="1.5" fill="#34d399" opacity="0.6" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">JACOBI</span>
            <span className="text-[9px] text-[#555]">
              pricing transparency
            </span>
          </div>
          <div className="flex items-center gap-6 text-[11px]">
            <Link
              href="/chat"
              className="text-[#666] hover:text-white transition-colors"
            >
              Probe
            </Link>
            <Link
              href="/about"
              className="text-[#666] hover:text-white transition-colors"
            >
              About
            </Link>
            <Link
              href="/pricing"
              className="text-[#666] hover:text-white transition-colors"
            >
              Pricing
            </Link>
          </div>
          <div className="text-[9px] text-[#444]">
            BrightData x MIT Hackathon
          </div>
        </div>
      </footer>
    </div>
  );
}
