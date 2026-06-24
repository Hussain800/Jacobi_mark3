import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About JACOBI — Price Integrity Intelligence",
  description:
    "A 24-agent synthetic-buyer audit engine that detects personalized-pricing exposure and MAP/gray-market drift, and produces evidence-grade reports.",
};

const VARIABLES = [
  {
    label: "Location",
    symbol: "geo",
    desc: "Pricing engines can vary offers by geography. JACOBI runs controlled residential identities across cities and regions to measure location-linked price variation without making legal conclusions.",
  },
  {
    label: "Device",
    symbol: "dev",
    desc: "Device and browser fingerprints can affect what a pricing surface returns. Agents rotate operating systems, browsers, and hardware profiles to isolate device-linked price variation.",
  },
  {
    label: "Cookies",
    symbol: "ck",
    desc: "Session state can change displayed prices, discounts, and availability. Agents use controlled cookie profiles, clean sessions, and repeat-visit states to map session-linked variation.",
  },
  {
    label: "Referrer",
    symbol: "ref",
    desc: "Referral source can influence displayed prices and promotions. Agents simulate organic search, price aggregators, and direct navigation to measure referrer-linked variation.",
  },
  {
    label: "Network Tier",
    symbol: "net",
    desc: "Not all IP addresses are equal. Residential IPs, datacenter IPs, mobile carrier IPs, and VPN exits each trigger different pricing logic. Business-class IP ranges often see enterprise pricing. JACOBI runs agents across all network tiers through BrightData infrastructure.",
  },
];

const TECH_STACK = [
  {
    name: "BrightData Unlocker API",
    role: "Browser fingerprint rotation",
    desc: "Every audit routes through BrightData infrastructure, rotating device fingerprints, IP addresses, and session parameters to simulate 24 distinct synthetic buyers with location diversity.",
  },
  {
    name: "DeepSeek / Gemini AI",
    role: "Price extraction & analysis",
    desc: "Dual-model AI pipeline: DeepSeek extracts structured price data from raw HTML, while Gemini evaluates differentials and generates plain-language findings on price-variation severity.",
  },
  {
    name: "FastAPI",
    role: "Backend orchestration",
    desc: "Python async backend coordinates parallel agent sessions, price extraction, and AI analysis with sub-second routing and real-time WebSocket telemetry during probes.",
  },
  {
    name: "Next.js",
    role: "Frontend experience",
    desc: "React server components with Tailwind CSS deliver a zero-JS-first experience. Static generation for marketing pages, dynamic rendering for probe results and dashboards.",
  },
  {
    name: "Supabase",
    role: "Data persistence",
    desc: "Postgres database stores probe history, user accounts, and pricing snapshots. Row-Level Security ensures multi-tenant data isolation across all customer data.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#07080c] text-[#d4d4d4] font-mono overflow-x-hidden selection:bg-emerald-400/20 selection:text-white">
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative px-6 lg:px-12 pt-20 pb-16 lg:pt-28 lg:pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] rounded-full bg-emerald-400/3 blur-[120px]" />
          <div className="absolute bottom-[10%] right-[10%] w-[300px] h-[300px] rounded-full bg-blue-400/2 blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-emerald-400/20 bg-emerald-400/4 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400/70 tracking-widest uppercase">
              24 agents &middot; 5 variables
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white mb-6">
            Understand{" "}
            <span className="text-emerald-400">JACOBI</span>
          </h1>

          <p className="text-sm sm:text-base text-[#888] leading-relaxed max-w-lg mx-auto">
            24-agent synthetic-buyer audit engine for price integrity
          </p>
        </div>
      </section>

      {/* ═══════════════ WHAT IS JACOBI ═══════════════ */}
      <section className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28">
        <div className="max-w-3xl mx-auto">
          <span className="text-[10px] text-[#555] tracking-[0.2em] uppercase mb-4 block">
            What is JACOBI
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-8 leading-[1.15]">
            Personalized pricing is real, invisible, and now a liability.
          </h2>

          <div className="space-y-6 text-sm text-[#999] leading-relaxed">
            <p>
              Every time you visit an e-commerce site, a booking platform, or a
              SaaS pricing page, the server runs a real-time calculation.
              Location, device, browsing history, referral source, and network
              reputation all feed into a model that decides what price to show
              you. The person sitting next to you on the same Wi-Fi can see a
              different number. This is not a bug. It is algorithmic price
              discrimination, deployed at scale across the internet.
            </p>

            <p>
              24 agents with different digital fingerprints probe the same URL.
              Each agent carries a unique identity: a different geographic
              location, a different device profile, a different cookie state, a
              different referral origin, and a different network tier. They all
              hit the same URL within seconds of each other, capturing the raw
              price data that the site serves to each identity profile.
            </p>

            <p>
              AI analyzes the results and produces evidence. A dual-model
              pipeline (DeepSeek and Gemini) compares prices across all 24
              profiles, classifies the severity of any pricing spread, and
              delivers a plain-English finding: which buyer context saw which
              price, and an evidence-grade record for compliance or enforcement.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════ THE 5 VARIABLES ═══════════════ */}
      <section className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28 bg-white/[0.005]">
        <div className="max-w-6xl mx-auto">
          <span className="text-[10px] text-[#555] tracking-[0.2em] uppercase mb-4 block">
            The 5 Variables
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            What the algorithms look at
          </h2>
          <p className="text-xs text-[#777] mb-12 max-w-lg">
            Each agent varies across these five axes. Together they probe every
            dimension a pricing algorithm can exploit.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {VARIABLES.map((v) => (
              <div
                key={v.symbol}
                className="group bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 hover:border-emerald-400/20 hover:bg-white/[0.03] transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-400/5 border border-emerald-400/15 flex items-center justify-center shrink-0 group-hover:bg-emerald-400/10 transition-colors">
                    <span className="text-sm text-emerald-400 font-mono font-semibold">
                      {v.symbol}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    {v.label}
                  </h3>
                </div>
                <p className="text-xs text-[#777] leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ TECHNOLOGY ═══════════════ */}
      <section className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28">
        <div className="max-w-4xl mx-auto">
          <span className="text-[10px] text-[#555] tracking-[0.2em] uppercase mb-4 block">
            Technology
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            Built on industrial-grade infrastructure
          </h2>
          <p className="text-xs text-[#777] mb-12 max-w-lg">
            Five core systems power the 24-agent probe engine, from browser
            fingerprint rotation to AI-driven price analysis.
          </p>

          <div className="space-y-3">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                className="border border-white/[0.04] bg-white/[0.01] p-5 hover:border-white/[0.10] transition-all duration-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                  <div className="sm:w-48 shrink-0">
                    <div className="text-xs font-semibold text-white mb-0.5">
                      {tech.name}
                    </div>
                    <div className="text-[10px] text-[#555] font-mono uppercase tracking-wider">
                      {tech.role}
                    </div>
                  </div>
                  <p className="text-xs text-[#777] leading-relaxed">
                    {tech.desc}
                  </p>
                </div>
              </div>
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
              price integrity intelligence
            </span>
          </div>
          <div className="flex items-center gap-6 text-[11px]">
            <Link
              href="/chat"
              className="text-[#666] hover:text-white transition-colors"
            >
              Audit
            </Link>
            <Link
              href="/about"
              className="text-[#666] hover:text-white transition-colors"
            >
              About
            </Link>
            <Link
              href="/leaderboard"
              className="text-[#666] hover:text-white transition-colors"
            >
              Leaderboard
            </Link>
            <Link
              href="/pricing"
              className="text-[#666] hover:text-white transition-colors"
            >
              Pricing
            </Link>
          </div>
          <div className="text-[9px] text-[#444]">
            BrightData
          </div>
        </div>
      </footer>
    </div>
  );
}
