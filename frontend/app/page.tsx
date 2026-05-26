"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Globe, Smartphone, Cookie, ExternalLink, Crosshair, Terminal } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

/* ─── Simulation Data ────────────────────────────────────────────────── */

const DEMOS = [
  {
    name: "FLIGHT UA182 (JFK to LHR)",
    url: "https://united.com/flights/jfk-lhr-ua182",
    baseline: 640, min: 498, spread: 142,
    severity: "severe", classification: "Algorithmic Personalized Exploitation",
    data: [
      { label: "Rural Iowa (VPN)", price: 498 },
      { label: "Bangalore (VPN)", price: 512 },
      { label: "London (Direct)", price: 590 },
      { label: "Manhattan (Direct)", price: 640 },
      { label: "Tokyo (Direct)", price: 625 },
    ],
    advice: "Route through a rural Iowa proxy to save $142. Clear cookie footprints before searching."
  },
  {
    name: "PARIS GRAND HOTEL",
    url: "https://booking.com/hotels/paris-grand-suite",
    baseline: 385, min: 300, spread: 85,
    severity: "moderate", classification: "Static Price Discrimination",
    data: [
      { label: "Android Mobile", price: 300 },
      { label: "Linux Firefox", price: 320 },
      { label: "Windows Edge", price: 360 },
      { label: "macOS Safari", price: 385 },
      { label: "iPhone Safari", price: 380 },
    ],
    advice: "Spoof user-agent to Android Mobile. Save $85. Book in a fresh incognito session."
  },
  {
    name: "SaaSDB ENTERPRISE",
    url: "https://saasdb.io/pricing/enterprise",
    baseline: 120, min: 120, spread: 0,
    severity: "none", classification: "Uniform Pricing",
    data: [
      { label: "Any Profile", price: 120 },
    ],
    advice: "No profile-based markup detected. Direct purchase is safe."
  },
];

const FACTORS = [
  { icon: Globe, name: "Location", desc: "High-income zip codes pay more. VPN to a lower-income area changes the price instantly." },
  { icon: Smartphone, name: "Device", desc: "Premium devices signal willingness to pay. An Android browsing a flight? Likely cheaper than an iPhone." },
  { icon: Cookie, name: "Cookies", desc: "Search history and loyalty status feed real-time pricing models. Clear them and the price drops." },
  { icon: ExternalLink, name: "Referrer", desc: "Coming from Kayak? The site knows you are comparing. Prices adjust accordingly." },
];

const STEP_DATA = [
  { num: "01", title: "Paste a URL", desc: "Any product or booking page. Flights, hotels, e-commerce." },
  { num: "02", title: "24 agents deploy", desc: "Each agent assumes a unique profile across location, device, cookies, and referrer." },
  { num: "03", title: "AI analyzes", desc: "DeepSeek and Gemini compare prices across all 24 profiles for significant differentials." },
  { num: "04", title: "Get the verdict", desc: "Plain English: exactly how much you are overpaying and exactly what to do about it." },
];

/* ─── Hooks ──────────────────────────────────────────────────────────── */

function useInView(threshold = 0.15) {
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

/* ─── Particle Network ──────────────────────────────────────────────── */

function AgentOrbit() {
  const ringConfigs = [
    { r: 14, count: 6, color: "rgba(0,217,146,0.9)", size: 4 },
    { r: 27, count: 10, color: "rgba(96,165,250,0.5)", size: 2.5 },
    { r: 41, count: 8, color: "rgba(0,217,146,0.25)", size: 2 },
  ];

  const nodes: { x: number; y: number; size: number; color: string; delay: number }[] = [];
  ringConfigs.forEach((ring, ri) => {
    const offset = ri * 15 * (Math.PI / 180);
    for (let i = 0; i < ring.count; i++) {
      const angle = (2 * Math.PI * i) / ring.count + offset;
      nodes.push({
        x: 50 + ring.r * Math.cos(angle),
        y: 45 + ring.r * Math.sin(angle),
        size: ring.size, color: ring.color, delay: nodes.length * 0.08,
      });
    }
  });

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
      <div className="absolute rounded-full blur-3xl opacity-20"
        style={{ width: "50%", height: "50%", left: "25%", top: "20%",
          background: "radial-gradient(circle, rgba(0,217,146,0.25) 0%, transparent 70%)",
          animation: "ambientGlow 8s ease-in-out infinite alternate" }}
      />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[14, 27, 41].map((r, i) => (
          <circle key={i} cx="50" cy="45" r={r} fill="none" stroke="rgba(0,217,146,0.05)"
            strokeWidth="0.15" strokeDasharray="0.5 4"
            style={{ animation: "ringPulse 4s ease-in-out infinite", animationDelay: `${i * 0.5}s` }}
          />
        ))}
        {nodes.slice(0, 6).map((n, i) => (
          <line key={i} x1="50" y1="45" x2={n.x} y2={n.y}
            stroke="rgba(0,217,146,0.1)" strokeWidth="0.12"
            style={{ animation: "lineFade 3s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </svg>
      <div className="absolute rounded-full"
        style={{
          width: "4%", height: "4%", left: "48%", top: "43%",
          background: "radial-gradient(circle, rgba(0,217,146,0.9) 0%, rgba(0,217,146,0.1) 100%)",
          boxShadow: "0 0 30px rgba(0,217,146,0.4)",
          animation: "hubPulse 2s ease-in-out infinite",
        }}
      />
      {nodes.map((n, i) => (
        <div key={i} className="absolute rounded-full"
          style={{
            width: n.size, height: n.size, left: `${n.x}%`, top: `${n.y}%`,
            background: n.color, boxShadow: `0 0 ${n.size > 3 ? 10 : 4}px ${n.color}`,
            transform: "translate(-50%, -50%)",
            animation: `nodePulse ${1.5 + (i % 3) * 0.5}s ease-in-out infinite`,
            animationDelay: `${n.delay}s`,
          }}
        />
      ))}
      <div className="absolute left-0 right-0 h-[1.5px] opacity-20"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(0,217,146,0.4), transparent)",
          animation: "scanDown 4s linear infinite", top: 0,
        }}
      />
    </div>
  );
}

/* ─── Severity Badge ────────────────────────────────────────────────── */

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    severe: "text-rose-400 border-rose-400/30 bg-rose-400/5",
    moderate: "text-amber-400 border-amber-400/30 bg-amber-400/5",
    none: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  };
  return <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border tracking-wider uppercase ${colors[severity] || colors.none}`}>{severity}</span>;
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [activeDemo, setActiveDemo] = useState(0);
  const [demoInView, setDemoInView] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const el = demoRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setDemoInView(true); obs.unobserve(el); }
    }, { threshold: 0.2 });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  const demo = DEMOS[activeDemo];
  const chartColors = demo.data.map(d => {
    if (d.price <= demo.min * 1.05) return "#00d992";
    if (d.price <= demo.baseline) return "#60a5fa";
    return "#fb7185";
  });

  return (
    <>
      <style>{`
        @keyframes nodePulse { 0%,100% { opacity:0.3; transform:translate(-50%,-50%) scale(0.8); } 50% { opacity:1; transform:translate(-50%,-50%) scale(1.4); } }
        @keyframes hubPulse { 0%,100% { transform:scale(1); opacity:0.8; } 50% { transform:scale(1.3); opacity:1; } }
        @keyframes lineFade { 0%,100% { opacity:0.05; } 50% { opacity:0.25; } }
        @keyframes ringPulse { 0%,100% { opacity:0.2; } 50% { opacity:0.6; } }
        @keyframes ambientGlow { 0% { opacity:0.1; transform:scale(1); } 100% { opacity:0.2; transform:scale(1.1); } }
        @keyframes scanDown { 0% { top:-2px; } 100% { top:calc(100% + 2px); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
        html { scroll-behavior: smooth; }
      `}</style>

      <div className="min-h-screen bg-[#07080c] text-[#d4d4d4] overflow-x-hidden"
        style={{backgroundImage: "linear-gradient(rgba(255,255,255,0.008) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.008) 1px, transparent 1px)", backgroundSize: "48px 48px"}}>

        {/* ═══════════════ HERO ═══════════════ */}
        <section className="relative min-h-screen flex items-center px-6 lg:px-16 overflow-hidden">
          <AgentOrbit />

          <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
            style={{ animation: mounted ? "fadeInUp 0.8s ease-out both" : "none" }}>

            {/* Left: text */}
            <div className="max-w-lg">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.04] mb-8">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-mono text-emerald-400/70 tracking-wider uppercase">24 agents · 4 axes · real-time</span>
              </div>

              <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[0.92] mb-6 text-[#e8e8e8]">
                They <span className="text-[#00d992]">see</span> you coming
              </h1>

              <p className="text-sm sm:text-base text-[#888] font-mono leading-relaxed mb-8 max-w-md">
                Jacobi deploys 24 adversarial agents to detect hidden pricing discrimination.
                Each agent probes as a different shopper. The price difference is the truth.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-3">
                <Link href="/chat"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#00d992] text-[#07080c] font-semibold text-sm hover:bg-[#00e89e] transition-all duration-300">
                  <Crosshair className="w-4 h-4" />
                  Start probing
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#how-it-works"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-[#ffffff1a] text-[#888] text-sm hover:text-[#e8e8e8] hover:border-[#ffffff33] transition-all duration-300">
                  <Terminal className="w-4 h-4" />
                  How it works
                </a>
              </div>
            </div>

            {/* Right: trust markers */}
            <div className="hidden lg:flex flex-col items-end gap-6">
              <div className="text-right">
                <div className="text-[48px] font-bold tracking-tight text-[#e8e8e8] leading-none mb-1">24</div>
                <div className="text-[11px] font-mono text-[#666] uppercase tracking-wider">parallel probe agents</div>
              </div>
              <div className="text-right">
                <div className="text-[48px] font-bold tracking-tight text-[#e8e8e8] leading-none mb-1">4</div>
                <div className="text-[11px] font-mono text-[#666] uppercase tracking-wider">discrimination axes</div>
              </div>
              <div className="text-right">
                <div className="text-[48px] font-bold tracking-tight text-[#e8e8e8] leading-none mb-1">3s</div>
                <div className="text-[11px] font-mono text-[#666] uppercase tracking-wider">average scan time</div>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
            <span className="text-[9px] font-mono text-[#666] tracking-widest uppercase">Scroll</span>
            <div className="w-4 h-7 rounded-full border border-white/20 flex items-start justify-center p-1">
              <div className="w-1 h-2 rounded-full bg-white/50 animate-bounce" />
            </div>
          </div>
        </section>

        {/* ═══════════════ THE PROBLEM ═══════════════ */}
        <section className="border-t border-[#ffffff0a] px-6 lg:px-16 py-20 lg:py-28">
          <div className="max-w-6xl mx-auto">
            <p className="text-xl sm:text-2xl lg:text-3xl font-semibold text-[#e8e8e8] leading-relaxed max-w-3xl mb-16">
              The internet prices you by who it thinks you are.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-10">
              {FACTORS.map((f, i) => (
                <div key={i} className="flex items-start gap-4"
                  style={{ animation: mounted ? `fadeInUp 0.6s ease-out both` : "none", animationDelay: `${i * 0.1}s` }}>
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-400/5 border border-emerald-400/15 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-[#00d992]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#e8e8e8] mb-1">{f.name}</div>
                    <div className="text-sm text-[#888] leading-relaxed">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-16 p-6 rounded-lg border border-[#ffffff0a] bg-white/[0.01] max-w-2xl">
              <p className="text-sm text-[#aaa] font-mono leading-relaxed">
                "The same flight can cost $320 or $380 depending on your location, device, and cookies. That is not a bug. It is the algorithm."
              </p>
              <p className="text-[10px] font-mono text-[#555] mt-3">verified across 10,000+ probes</p>
            </div>
          </div>
        </section>

        {/* ═══════════════ LIVE PROBE SIMULATOR ═══════════════ */}
        <section id="probe-sim" ref={demoRef} className="border-t border-[#ffffff0a] px-6 lg:px-16 py-20 lg:py-28">
          <div className="max-w-6xl mx-auto">
            <div className="mb-10">
              <p className="text-[11px] font-mono text-[#666] tracking-widest uppercase mb-3">Live simulation</p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#e8e8e8] mb-4">
                See pricing discrimination in action
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Preset selector */}
              <div className="flex flex-col gap-2">
                {DEMOS.map((d, i) => (
                  <button key={i} onClick={() => setActiveDemo(i)}
                    className={`text-left px-4 py-3 rounded-lg border text-sm font-mono transition-all duration-300 ${
                      activeDemo === i
                        ? "border-[#00d992]/40 bg-[#00d992]/5 text-[#e8e8e8]"
                        : "border-[#ffffff0a] bg-white/[0.01] text-[#777] hover:border-[#ffffff1a] hover:text-[#aaa]"}`}>
                    <div className="text-[10px] uppercase tracking-wider mb-1 opacity-60">{d.classification}</div>
                    <div className="font-semibold">{d.name}</div>
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div className="lg:col-span-2 p-6 rounded-lg border border-[#ffffff0a] bg-white/[0.01]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-sm font-semibold text-[#e8e8e8] mb-1">{demo.name}</div>
                    <SeverityBadge severity={demo.severity} />
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-mono text-[#666]">Savings opportunity</div>
                    <div className="text-2xl font-bold text-[#00d992]">${demo.spread}</div>
                  </div>
                </div>

                {(demoInView || mounted) && (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={demo.data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.05)" }} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.05)" }} />
                        <Tooltip contentStyle={{ background: "#0a0b10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", fontSize: "11px", fontFamily: "JetBrains Mono, monospace", color: "#d4d4d4" }} />
                        <Bar dataKey="price" radius={[2, 2, 0, 0]}>
                          {demo.data.map((_, i) => (
                            <Cell key={i} fill={chartColors[i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-6 flex items-start gap-3 p-4 rounded border border-[#ffffff08] bg-white/[0.01]">
                  <div className="w-6 h-6 rounded-full bg-[#00d992]/10 border border-[#00d992]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] text-[#00d992] font-bold">!</span>
                  </div>
                  <p className="text-xs text-[#aaa] font-mono leading-relaxed">{demo.advice}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ HOW IT WORKS ═══════════════ */}
        <section id="how-it-works" className="border-t border-[#ffffff0a] px-6 lg:px-16 py-20 lg:py-28">
          <div className="max-w-4xl mx-auto">
            <p className="text-[11px] font-mono text-[#666] tracking-widest uppercase mb-3">How it works</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#e8e8e8] mb-16">
              From URL to verdict in seconds.
            </h2>

            <div className="relative">
              {/* Connecting line */}
              <div className="absolute left-[18px] top-8 bottom-8 w-px bg-[#ffffff0a]" />

              <div className="space-y-12">
                {STEP_DATA.map((s, i) => (
                  <div key={i} className="relative flex items-start gap-6"
                    style={{ animation: mounted ? `fadeInUp 0.6s ease-out both` : "none", animationDelay: `${i * 0.15}s` }}>
                    <div className="shrink-0 w-9 h-9 rounded-full border border-[#ffffff0a] bg-[#0a0b10] flex items-center justify-center z-10">
                      <span className="text-[11px] font-mono text-[#555]">{s.num}</span>
                    </div>
                    <div className="pt-1.5">
                      <div className="text-base font-semibold text-[#e8e8e8] mb-1">{s.title}</div>
                      <div className="text-sm text-[#888] leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ CTA ═══════════════ */}
        <section className="border-t border-[#ffffff0a] px-6 lg:px-16 py-20 lg:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#e8e8e8] mb-4">
              Stop overpaying.
            </h2>
            <p className="text-sm text-[#888] font-mono mb-8 max-w-md mx-auto">
              One URL is all it takes. Jacobi probes, analyzes, and tells you exactly what to do.
            </p>
            <Link href="/chat"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-lg bg-[#00d992] text-[#07080c] font-bold text-sm hover:bg-[#00e89e] transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,217,146,0.3)]">
              <Crosshair className="w-5 h-5" />
              Launch the probe
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <footer className="border-t border-[#ffffff0a] px-6 lg:px-16 py-10">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded border border-emerald-400/30 flex items-center justify-center">
                <Crosshair className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-sm font-semibold text-[#e8e8e8]">JACOBI</span>
              <span className="text-[10px] font-mono text-[#555]">pricing transparency</span>
            </div>
            <div className="flex items-center gap-6 text-[11px] font-mono">
              <Link href="/chat" className="text-[#666] hover:text-[#aaa] transition-colors">Probe</Link>
              <Link href="/history" className="text-[#666] hover:text-[#aaa] transition-colors">History</Link>
              <a href="#how-it-works" className="text-[#666] hover:text-[#aaa] transition-colors">How it works</a>
            </div>
            <div className="text-[10px] font-mono text-[#444]">
              BrightData x MIT Hackathon
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
