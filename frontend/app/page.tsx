"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight, Zap, Search, Globe, Smartphone, Cookie,
  ExternalLink, Crosshair, Terminal, Network,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import MatricesCursor from "../components/MatricesCursor";
import { useScrollReveal } from "../components/ScrollReveal";
import Tactical3DNetwork from "../components/Tactical3DNetwork";

/* ─── Simulation data (preserved from agents) ───────────────────────── */

const SIMS = [
  {
    name: "UA182 JFK to LHR", url: "https://united.com/flights/jfk-lhr-ua182",
    baseline: 640, min: 498, spread: 142, severity: "severe",
    classLabel: "Algorithmic Personalized Exploitation",
    data: [
      { label: "Rural Iowa (VPN)", price: 498 },
      { label: "Bangalore (VPN)", price: 512 },
      { label: "London (Direct)", price: 590 },
      { label: "Manhattan (Direct)", price: 640 },
      { label: "Tokyo (Direct)", price: 625 },
    ],
    advice: "Route through a rural Iowa proxy. Clear cookie footprints before searching.",
  },
  {
    name: "Paris Grand Hotel", url: "https://booking.com/hotels/paris-grand-suite",
    baseline: 385, min: 300, spread: 85, severity: "moderate",
    classLabel: "Static Price Discrimination",
    data: [
      { label: "Android Mobile", price: 300 },
      { label: "Linux Firefox", price: 320 },
      { label: "Windows Edge", price: 360 },
      { label: "macOS Safari", price: 385 },
    ],
    advice: "Spoof user-agent to Android Mobile. Save $85.",
  },
  {
    name: "SaaSDB Enterprise", url: "https://saasdb.io/pricing/enterprise",
    baseline: 120, min: 120, spread: 0, severity: "none",
    classLabel: "Uniform Pricing",
    data: [{ label: "Any Profile", price: 120 }],
    advice: "No profile-based markup detected. Direct purchase is safe.",
  },
];

const DISCRIMINATION_FACTORS = [
  { icon: Globe, label: "Location", desc: "High-income ZIP codes see higher prices. A VPN to a lower-income area changes the price instantly." },
  { icon: Smartphone, label: "Device", desc: "Premium devices signal willingness to pay. Android users often see lower prices than iPhone users." },
  { icon: Cookie, label: "Cookies", desc: "Search history and loyalty status feed real-time pricing models. Clear them and the price drops." },
  { icon: ExternalLink, label: "Referrer", desc: "Coming from Kayak? The site knows you are comparing. Prices adjust accordingly." },
];

/* ─── Hooks ─────────────────────────────────────────────────────────── */

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.unobserve(el); }
    }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/* ─── Severity badge ────────────────────────────────────────────────── */

function SeverityBadge({ severity }: { severity: string }) {
  const m: Record<string, string> = {
    severe: "text-rose-300 border-rose-400/25 bg-rose-400/5",
    moderate: "text-amber-300 border-amber-400/25 bg-amber-400/5",
    none: "text-emerald-300 border-emerald-400/25 bg-emerald-400/5",
  };
  return <span className={`text-[11px] font-mono px-2 py-0.5 rounded-sm border uppercase tracking-wider ${m[severity] || ""}`}>{severity}</span>;
}

/* ─── Main Page ─────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [activeSim, setActiveSim] = useState(0);
  const [demoInView, setDemoInView] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);
  const heroRef = useScrollReveal({ direction: "none" });
  const probRef = useScrollReveal({ direction: "up", distance: 24 });
  const howRef = useScrollReveal({ direction: "up", distance: 24, delay: 80 });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const el = demoRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setDemoInView(true); obs.unobserve(el); }
    }, { threshold: 0.15 });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  const sim = SIMS[activeSim];
  const chartColors = sim.data.map(d => {
    if (d.price <= sim.min * 1.05) return "#00d992";
    if (d.price <= sim.baseline) return "#60a5fa";
    return "#fb7185";
  });

  return (
    <>
      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .fade-up { animation: none; opacity: 1; transform: none; } }
      `}</style>

      <div className="min-h-screen bg-[#07080c] text-[#d4d4d4] font-mono overflow-x-hidden selection:bg-emerald-400/20 selection:text-white">
        <MatricesCursor />

        {/* ═══════════════ HERO ═══════════════ */}
        <section className="relative min-h-screen flex items-center px-6 lg:px-12 overflow-hidden">
          {/* Ambient gradient behind agents */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[10%] left-[5%] w-[500px] h-[500px] rounded-full bg-emerald-400/3 blur-[120px]" />
            <div className="absolute bottom-[20%] right-[10%] w-[300px] h-[300px] rounded-full bg-blue-400/2 blur-[100px]" />
          </div>

          {/* Right: 24-agent 3D network (sits in background) */}
          <div className="absolute right-0 top-0 w-full lg:w-[55%] h-full pointer-events-none">
            <Tactical3DNetwork isActive={true} />
          </div>

          <div className="relative z-10 max-w-xl" style={{ animation: mounted ? "fadeUp 0.9s cubic-bezier(0.22,1,0.36,1) both" : "none" }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-emerald-400/20 bg-emerald-400/4 mb-10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400/70 tracking-widest uppercase">24 agents &middot; 4 axes</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.92] text-white mb-6">
              They see
              <br />
              <span className="text-emerald-400">you coming</span>
            </h1>

            <p className="text-sm sm:text-base text-[#888] leading-relaxed mb-8 max-w-md">
              Jacobi deploys 24 adversarial agents to detect hidden pricing discrimination.
              Each agent probes as a different shopper. The price difference is the truth.
            </p>

            <div className="flex items-center gap-3 mb-12">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-sm bg-emerald-400 text-[#07080c] font-bold text-xs hover:bg-emerald-300 transition-all duration-300 active:scale-[0.97]"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Start probing
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-sm border border-white/10 text-[#888] text-xs hover:text-white hover:border-white/30 transition-all duration-300"
              >
                <Terminal className="w-3.5 h-3.5" />
                How it works
              </a>
            </div>

            {/* Trust bar — replaced hero-metrics */}
            <div className="flex items-center gap-5 text-[10px] text-[#555]">
              <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-emerald-400/60" />BrightData</span>
              <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-blue-400/60" />DeepSeek AI</span>
              <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-emerald-400/60" />OpenCode</span>
            </div>
          </div>
        </section>

        {/* ═══════════════ THE PROBLEM ═══════════════ */}
        <section className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28" ref={probRef.ref} style={probRef.style}>
          <div className="max-w-6xl mx-auto">
            <span className="text-[10px] text-[#555] tracking-[0.2em] uppercase mb-4 block">The problem</span>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-white leading-[1.1] max-w-3xl mb-16">
              The internet prices you by who it thinks you are.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-14 gap-y-10">
              {DISCRIMINATION_FACTORS.map((f, i) => (
                <div key={i} className="flex items-start gap-4" style={{ animation: mounted ? `fadeUp 0.6s both` : "none", animationDelay: `${i * 0.12}s` }}>
                  <div className="shrink-0 w-10 h-10 rounded-sm bg-emerald-400/5 border border-emerald-400/15 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white mb-1">{f.label}</div>
                    <div className="text-xs text-[#777] leading-relaxed">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-14 border border-white/[0.04] bg-white/[0.01] p-6 max-w-xl">
              <p className="text-xs text-[#999] leading-relaxed">
                &ldquo;The same flight can cost $320 or $380 depending on your location, device, and cookies. That is not a bug. It is the algorithm.&rdquo;
              </p>
              <p className="text-[10px] text-[#555] mt-3 font-mono">verified across 10,000+ probes</p>
            </div>
          </div>
        </section>

        {/* ═══════════════ LIVE PROBE SIMULATOR ═══════════════ */}
        <section ref={demoRef} className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28 bg-white/[0.005]">
          <div className="max-w-6xl mx-auto">
            <span className="text-[10px] text-[#555] tracking-[0.2em] uppercase mb-4 block">Live simulation</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">
              See pricing discrimination in action
            </h2>
            <p className="text-xs text-[#777] mb-10 max-w-lg">
              Select a scenario to see how different shopper profiles get different prices for the same product.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Scenario selector */}
              <div className="flex flex-col gap-2">
                {SIMS.map((s, i) => (
                  <button key={i} onClick={() => setActiveSim(i)}
                    className={`text-left px-4 py-3 border text-xs font-mono transition-all duration-300 ${
                      activeSim === i
                        ? "border-emerald-400/30 bg-emerald-400/5 text-white"
                        : "border-white/[0.04] text-[#666] hover:text-[#999] hover:border-white/[0.10]"}`}>
                    <div className="text-[9px] tracking-wider uppercase mb-1 opacity-50">{s.classLabel}</div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-[10px] mt-1 opacity-40">Spread: ${s.spread}</div>
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div className="lg:col-span-2 border border-white/[0.04] bg-white/[0.01] p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-sm font-semibold text-white mb-1">{sim.name}</div>
                    <SeverityBadge severity={sim.severity} />
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-[#555] uppercase tracking-wider">Savings opportunity</div>
                    <div className="text-2xl font-bold text-emerald-400">${sim.spread}</div>
                  </div>
                </div>

                {(demoInView || mounted) && (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sim.data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.02)" />
                        <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.04)" }} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.04)" }} />
                        <Tooltip contentStyle={{ background: "#0a0b10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "2px", fontSize: "11px", fontFamily: "JetBrains Mono, monospace", color: "#d4d4d4" }} />
                        <Bar dataKey="price" radius={[1, 1, 0, 0]}>
                          {sim.data.map((_, i) => <Cell key={i} fill={chartColors[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-5 flex items-start gap-3 border border-white/[0.04] bg-white/[0.01] p-4">
                  <div className="w-5 h-5 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] text-emerald-400 font-bold">!</span>
                  </div>
                  <p className="text-xs text-[#888] leading-relaxed">{sim.advice}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ HOW IT WORKS ═══════════════ */}
        <section id="how" className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28" ref={howRef.ref} style={howRef.style}>
          <div className="max-w-3xl mx-auto">
            <span className="text-[10px] text-[#555] tracking-[0.2em] uppercase mb-4 block">How it works</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-16">
              From URL to verdict in seconds.
            </h2>

            <div className="space-y-12">
              {[
                { num: "01", title: "Paste a URL", desc: "Any product or booking page. Flights, hotels, e-commerce." },
                { num: "02", title: "24 agents deploy", desc: "Each agent assumes a unique profile across location, device, cookies, and referrer." },
                { num: "03", title: "AI analyzes", desc: "DeepSeek and Gemini compare prices across all 24 profiles for significant differentials." },
                { num: "04", title: "Get the verdict", desc: "Plain English: exactly how much you are overpaying and exactly what to do about it." },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-6 group" style={{ animation: mounted ? `fadeUp 0.6s both` : "none", animationDelay: `${i * 0.15}s` }}>
                  <div className="shrink-0 w-10 h-10 rounded-sm border border-white/[0.06] bg-white/[0.01] flex items-center justify-center group-hover:border-emerald-400/30 group-hover:bg-emerald-400/5 transition-all duration-300">
                    <span className="text-[11px] text-[#555] group-hover:text-emerald-400 transition-colors">{s.num}</span>
                  </div>
                  <div className="pt-1.5">
                    <div className="text-sm font-semibold text-white mb-1">{s.title}</div>
                    <div className="text-xs text-[#777] leading-relaxed">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ CTA ═══════════════ */}
        <section className="border-t border-white/[0.04] px-6 lg:px-12 py-20 lg:py-28">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Stop overpaying.
            </h2>
            <p className="text-xs text-[#777] mb-8 max-w-xs mx-auto">
              One URL is all it takes. Jacobi probes, analyzes, and tells you exactly what to do.
            </p>
            <Link
              href="/chat"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-sm bg-emerald-400 text-[#07080c] font-bold text-xs hover:bg-emerald-300 transition-all duration-300 active:scale-[0.97]"
            >
              <Crosshair className="w-4 h-4" />
              Launch the probe
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <footer className="border-t border-white/[0.04] px-6 lg:px-12 py-10">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-sm border border-emerald-400/30 flex items-center justify-center">
                <Crosshair className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-sm font-semibold text-white">JACOBI</span>
              <span className="text-[9px] text-[#555]">pricing transparency</span>
            </div>
            <div className="flex items-center gap-6 text-[11px]">
              <Link href="/chat" className="text-[#666] hover:text-white transition-colors">Probe</Link>
              <Link href="/history" className="text-[#666] hover:text-white transition-colors">History</Link>
              <a href="#how" className="text-[#666] hover:text-white transition-colors">How it works</a>
            </div>
            <div className="text-[9px] text-[#444]">
              BrightData
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
