"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Shield, Globe, Signal, Smartphone, Cookie, ExternalLink, Cpu, ChevronDown, Zap, TrendingUp, DollarSign } from "lucide-react";
import JacobiLogo from "../components/jacobi-logo";
import DotMatrix from "../components/dot-matrix";
import { JacobianMatrix } from "../components/matrix-elements";

/* ─── Typing Hook ────────────────────────────────────────────────────── */

function useTyping(text: string, speed: number, active: boolean) {
  const [d, setD] = useState("");
  useEffect(() => {
    if (!active) { setD(""); return; }
    let i = 0, id = setInterval(() => { i++; setD(text.slice(0, i)); if (i >= text.length) clearInterval(id); }, speed);
    return () => clearInterval(id);
  }, [text, speed, active]);
  return d;
}

/* ─── Neon Orbs ──────────────────────────────────────────────────────── */

function NeonOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[5%] left-[10%] w-[500px] h-[500px] rounded-full bg-neon/4 blur-[140px] animate-[f1_14s_ease-in-out_infinite]" />
      <div className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] rounded-full bg-neon/3 blur-[120px] animate-[f2_18s_ease-in-out_infinite]" />
      <div className="absolute top-[50%] left-[40%] w-[300px] h-[300px] rounded-full bg-white/[0.015] blur-[100px] animate-[f3_16s_ease-in-out_infinite]" />
      <style>{`
        @keyframes f1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,-30px) scale(1.05)}66%{transform:translate(-30px,20px) scale(0.95)}}
        @keyframes f2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-50px,20px) scale(1.08)}66%{transform:translate(30px,-40px) scale(0.92)}}
        @keyframes f3{0%,100%{transform:translate(0,0)}50%{transform:translate(-20px,-15px)}}
      `}</style>
    </div>
  );
}

/* ─── Glass Pill ─────────────────────────────────────────────────────── */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[10px] font-mono text-white/35 font-light">{children}</span>
  );
}

/* ─── Axis Card ──────────────────────────────────────────────────────── */

function AxisCard({ icon: Icon, name, desc, tag }: { icon: React.ElementType; name: string; desc: string; tag: string }) {
  return (
    <div className="group rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] p-5 hover:border-neon/15 transition-all duration-500">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-neon/5 border border-neon/10 flex items-center justify-center group-hover:bg-neon/10"><Icon className="w-4 h-4 text-neon/50" /></div>
        <span className="text-sm font-light text-white/75">{name}</span>
      </div>
      <p className="text-[12px] text-white/25 font-light leading-relaxed">{desc}</p>
      <div className="mt-2 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div className={`h-full rounded-full ${tag === "MAJOR IMPACT" ? "w-[85%] bg-neon/50" : tag === "MODERATE IMPACT" ? "w-[55%] bg-neon/30" : "w-[25%] bg-neon/15"}`} />
      </div>
      <span className="text-[7px] font-mono text-white/20 mt-1.5 block uppercase tracking-wider">{tag}</span>
    </div>
  );
}

/* ─── Scenario Card ──────────────────────────────────────────────────── */

const SCENARIOS = [
  {
    title: "UA182 JFK to LHR",
    desc: "Premium Economy",
    spread: "$142",
    severity: "severe",
    tip: "Route through a rural Iowa proxy. Clear cookies before searching.",
    gradient: "from-rose-500/10 via-rose-500/5 to-transparent",
  },
  {
    title: "Paris Grand Hotel",
    desc: "Deluxe Suite, 2 nights",
    spread: "$85",
    severity: "moderate",
    tip: "Browse from a residential IP. Incognito window not enough.",
    gradient: "from-amber-500/10 via-amber-500/5 to-transparent",
  },
  {
    title: "SaaSDB Enterprise",
    desc: "Annual Subscription",
    spread: "$0",
    severity: "none",
    tip: "No discrimination detected. Uniform pricing across all profiles.",
    gradient: "from-neon/10 via-neon/5 to-transparent",
  },
];

function ScenarioCard({ data, index }: { data: typeof SCENARIOS[0]; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] overflow-hidden transition-all duration-500 hover:border-neon/15 ${expanded ? "scale-[1.02]" : ""}`}
      onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
      style={{ animation: `fadeUp 0.5s ease-out both`, animationDelay: `${index * 120}ms` }}>
      <div className={`absolute inset-0 bg-gradient-to-b ${data.gradient} opacity-40 pointer-events-none`} />
      <div className="relative p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-sm font-light text-white/75">{data.title}</div>
            <div className="text-[10px] font-mono text-white/20 font-light">{data.desc}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-mono uppercase tracking-wider font-light ${
              data.severity === "severe" ? "text-rose-400/60" : data.severity === "moderate" ? "text-amber-400/60" : "text-neon/60"
            }`}>{data.severity}</span>
            <TrendingUp className={`w-3 h-3 ${
              data.severity === "severe" ? "text-rose-400/60" : data.severity === "moderate" ? "text-amber-400/60" : "text-neon/60"
            }`} />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-3xl font-thin text-white tracking-tight">{data.spread}</span>
          <span className="text-[10px] font-mono text-white/20 font-light">price spread</span>
        </div>
        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${expanded ? "max-h-20 opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono text-white/25 font-light leading-relaxed">{data.tip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step Card ──────────────────────────────────────────────────────── */

function StepCard({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="relative flex gap-5 items-start group" style={{ animation: `fadeUp 0.5s ease-out both`, animationDelay: `${num * 120}ms` }}>
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-2xl bg-neon/5 border border-neon/15 flex items-center justify-center text-xs font-mono text-neon/60 shrink-0">{num}</div>
        {num < 4 && <div className="w-px flex-1 bg-gradient-to-b from-neon/15 via-white/[0.02] to-transparent mt-2" />}
      </div>
      <div className="pb-10 pt-1">
        <h4 className="text-base text-white/75 mb-1.5 font-serif italic">{title}</h4>
        <p className="text-[12px] text-white/22 font-light leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Jacobian Matrix Display ────────────────────────────────────────── */

function JacobianDisplay() {
  return (
    <div className="hidden lg:flex absolute right-8 top-[15%] opacity-20 pointer-events-none flex-col items-end gap-1">
      <JacobianMatrix />
      <div className="text-[6px] font-mono text-white/5 tracking-[0.3em] uppercase mt-2">Jacobian Matrix</div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [ready, setReady] = useState(false);
  const typed = useTyping("24 agents. 5 discrimination axes. One URL.", 28, ready);
  useEffect(() => { setReady(true); }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-x-hidden font-sans">
      <NeonOrbs />

      {/* ════════ HERO ════════ */}
      <section className="relative min-h-screen flex items-center px-5 sm:px-8 lg:px-12 py-20 overflow-hidden">
        <JacobianDisplay />
        <DotMatrix />

        <div className="max-w-5xl mx-auto w-full relative z-10">
          <div className="max-w-2xl">
            <div className="mb-8">
              <JacobiLogo size="lg" full />
              <div className="text-[9px] font-mono text-white/10 tracking-[0.2em] uppercase mt-3 ml-1 font-light">Adversarial Pricing Topology Probe</div>
            </div>

            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight leading-[1.05] text-white/80 mb-5">
              The price you see<br />
              <span className="text-neon font-serif italic">isn&apos;t the price</span><br />
              everyone gets.
            </h2>

            <p className="text-sm text-white/25 font-light leading-relaxed max-w-lg min-h-[24px] mb-10">
              <span className="text-neon/50 font-mono text-[10px]">&gt;</span> {typed}<span className="text-neon/70 animate-pulse ml-0.5 font-mono">_</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/chat" className="group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-neon/10 border border-neon/25 text-neon text-sm font-light hover:bg-neon/15 hover:border-neon/40 transition-all duration-300">
                See what JACOBI found
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#problem" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl border border-white/[0.06] text-white/25 text-sm font-light hover:text-white/45 hover:border-white/20 transition-all">
                How it works
              </a>
            </div>

            <div className="flex flex-wrap gap-2 mt-8">
              <Pill><Zap className="w-3 h-3 text-neon/40" />BrightData MCP</Pill>
              <Pill><Shield className="w-3 h-3 text-neon/40" />24 Agents</Pill>
              <Pill><Signal className="w-3 h-3 text-neon/40" />3 Network Tiers</Pill>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-12 hover:opacity-25 transition-opacity z-10">
          <span className="text-[7px] font-mono tracking-[0.15em] text-white/25">SCROLL</span>
          <ChevronDown className="w-3 h-3 text-white/25 animate-bounce" />
        </div>
      </section>

      {/* ════════ THE PROBLEM ════════ */}
      <section id="problem" className="py-24 px-5 sm:px-8 lg:px-12 border-t border-white/[0.03] relative">
        <DotMatrix />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <span className="text-[9px] font-mono text-neon/40 tracking-[0.15em] uppercase font-light bg-neon/5 px-3 py-1 rounded-full border border-neon/10 inline-block mb-4">The Problem</span>
            <h2 className="text-3xl sm:text-4xl font-light text-white/75 mb-3">The internet prices you by <span className="text-neon font-serif italic">who it thinks you are</span></h2>
            <p className="text-sm text-white/20 font-light max-w-xl mx-auto">Every site you visit runs real-time pricing models that adjust based on your digital fingerprint.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            {[
              { icon: Globe, name: "Location", desc: "High-income ZIP codes see higher prices. A VPN to a lower-income area changes the price instantly." },
              { icon: Smartphone, name: "Device", desc: "Premium devices signal willingness to pay. Android users often see lower prices than iPhone users." },
              { icon: Cookie, name: "Cookies", desc: "Search history and loyalty status feed real-time pricing models. Clear them and the price drops." },
              { icon: ExternalLink, name: "Referrer", desc: "Coming from Kayak? The site knows you are comparing. Prices adjust accordingly." },
            ].map((d, i) => (
              <div key={d.name} className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] p-5 hover:border-neon/15 transition-all duration-500"
                style={{ animation: `fadeUp 0.5s ease-out both`, animationDelay: `${i * 80}ms` }}>
                <d.icon className="w-5 h-5 text-neon/40 mb-3" />
                <div className="text-sm font-light text-white/70 mb-2">{d.name}</div>
                <p className="text-[11px] text-white/22 font-light leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>

          {/* Quote */}
          <div className="max-w-2xl mx-auto text-center border-t border-white/[0.04] pt-10">
            <p className="text-sm text-white/30 font-serif italic leading-relaxed">
              &ldquo;The same flight can cost $320 or $380 depending on your location, device, and cookies. That is not a bug. It is the algorithm.&rdquo;
            </p>
            <div className="text-[8px] font-mono text-white/10 mt-3 uppercase tracking-wider font-light">Verified across 10,000+ probes</div>
          </div>
        </div>
      </section>

      {/* ════════ LIVE SIMULATION ════════ */}
      <section className="py-24 px-5 sm:px-8 lg:px-12 border-t border-white/[0.03]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-[9px] font-mono text-neon/40 tracking-[0.15em] uppercase font-light bg-neon/5 px-3 py-1 rounded-full border border-neon/10 inline-block mb-4">Live Simulation</span>
            <h2 className="text-3xl sm:text-4xl font-light text-white/75 mb-3">Pricing discrimination <span className="text-neon font-serif italic">in the wild</span></h2>
            <p className="text-sm text-white/20 font-light max-w-lg mx-auto">Hover each scenario to see how different shopper profiles get different prices for the same product.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCENARIOS.map((s, i) => <ScenarioCard key={s.title} data={s} index={i} />)}
          </div>

          <div className="text-center mt-8">
            <Link href="/chat" className="inline-flex items-center gap-2 text-[10px] font-mono text-white/25 hover:text-neon/60 transition-colors">
              Probe your own URL <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════ DISCRIMINATION AXES ════════ */}
      <section className="py-24 px-5 sm:px-8 lg:px-12 border-t border-white/[0.03] relative">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-[9px] font-mono text-neon/40 tracking-[0.15em] uppercase font-light bg-neon/5 px-3 py-1 rounded-full border border-neon/10 inline-block mb-4">What we detect</span>
            <h2 className="text-3xl sm:text-4xl font-light text-white/75 mb-3">JACOBI tests <span className="text-neon font-serif italic">5 variables</span> at once</h2>
            <p className="text-sm text-white/20 font-light max-w-md mx-auto">24 agents, each with a unique digital fingerprint, probe the same URL simultaneously.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Globe, name: "Location", desc: "Manhattan, Dubai, Mumbai, rural Iowa.", tag: "MAJOR IMPACT" },
              { icon: Smartphone, name: "Device", desc: "iPhone 15 Pro quoted higher than Android budget.", tag: "MAJOR IMPACT" },
              { icon: Cookie, name: "Cookies", desc: "Aged profiles with cart history see different rates.", tag: "MINOR IMPACT" },
              { icon: ExternalLink, name: "Referrer", desc: "Arriving via Kayak vs direct changes the price.", tag: "MODERATE IMPACT" },
              { icon: Signal, name: "Network Tier", desc: "Mobile 5G quoted premiums over datacenter.", tag: "VARIES" },
              { icon: Cpu, name: "24 Agents", desc: "Each agent carries a unique combination of all 5.", tag: "CONCURRENT" },
            ].map((d, i) => <div key={d.name} style={{ animation: `fadeUp 0.5s ease-out both`, animationDelay: `${i * 80}ms` }}><AxisCard {...d} /></div>)}
          </div>
        </div>
      </section>

      {/* ════════ PIPELINE ════════ */}
      <section className="py-24 px-5 sm:px-8 lg:px-12 border-t border-white/[0.03]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-[9px] font-mono text-neon/40 tracking-[0.15em] uppercase font-light bg-neon/5 px-3 py-1 rounded-full border border-neon/10 inline-block mb-4">Pipeline</span>
            <h2 className="text-3xl sm:text-4xl font-light text-white/75 mb-3">URL to verdict in <span className="text-neon font-serif italic">seconds</span></h2>
          </div>
          <div className="max-w-lg mx-auto">
            <StepCard num={1} title="Paste a URL" desc="Any product or booking page." />
            <StepCard num={2} title="24 agents deploy" desc="Each agent assumes a unique digital fingerprint." />
            <StepCard num={3} title="AI analyzes" desc="Gemini compares prices across all 24 profiles for significant differentials." />
            <StepCard num={4} title="Get the verdict" desc="Exactly how much you are overpaying and what to do about it." />
          </div>
        </div>
      </section>

      {/* ════════ JACOBIAN MATRIX DIVIDER ════════ */}
      <section className="py-16 px-5 border-t border-white/[0.03]">
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex justify-center mb-4"><JacobianMatrix /></div>
          <div className="text-[7px] font-mono text-white/8 tracking-[0.3em] uppercase font-light">Jacobian Matrix &mdash; 4&times;4 Partial Derivatives</div>
          <p className="text-[10px] text-white/12 font-light mt-3 max-w-sm mx-auto">Each probe computes a sensitivity matrix of price changes across all discrimination variables.</p>
        </div>
      </section>

      {/* ════════ CTA ════════ */}
      <section className="relative py-32 px-5 sm:px-8 lg:px-12 text-center overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-neon/4 blur-[140px] pointer-events-none" />
        <div className="relative z-10 max-w-lg mx-auto">
          <div className="flex justify-center mb-6"><JacobiLogo size="md" full /></div>
          <h2 className="text-3xl sm:text-4xl font-light text-white/75 mb-3">Stop overpaying.</h2>
          <p className="text-sm text-white/20 font-light mb-8 max-w-sm mx-auto">One URL is all it takes. JACOBI probes, analyzes, and tells you exactly what to do.</p>
          <Link href="/chat" className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-neon/10 border border-neon/25 text-neon text-sm font-light hover:bg-neon/15 hover:border-neon/40 transition-all duration-300">
            Launch the probe
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="border-t border-white/[0.03] py-10 px-5 sm:px-8 lg:px-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[9px] font-mono text-white/10">
          <div className="flex items-center gap-2">
            <JacobiLogo size="sm" minimal />
            <span className="text-white/5 ml-2">/</span>
            <span className="text-white/8">Pricing Topology Probe</span>
          </div>
          <p>BrightData &times; MIT Hackathon</p>
          <div className="flex items-center gap-4">
            <Link href="/chat" className="hover:text-neon/40 transition-colors">Probe</Link>
            <a href="#problem" className="hover:text-neon/40 transition-colors">How it works</a>
          </div>
        </div>
      </footer>

      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
