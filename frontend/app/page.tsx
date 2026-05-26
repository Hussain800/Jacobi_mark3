"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Network, ArrowRight, Zap, Shield, BarChart3, Activity,
  DollarSign, Cpu, Search, TrendingUp, Send, Eye, Radio,
  Terminal, Database, Crosshair, Lock, Globe, Server, Cpu as ChipIcon,
} from "lucide-react";
import Tactical3DNetwork from "../components/Tactical3DNetwork";
import TacticalCard from "../components/TacticalCard";

/* ─── Hooks ──────────────────────────────────────────────────────────── */

function useCountUp(end: number, duration: number, start: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number;
    let raf: number;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const raw = Math.min(elapsed / duration, 1);
      setCount(Math.floor(easeOut(raw) * end));
      if (raw < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [end, duration, start]);
  return count;
}

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.unobserve(el); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

function useTypingText(text: string, speed: number, active: boolean) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!active) { setDisplayed(""); return; }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, active]);
  return displayed;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

/* ─── Telemetry Output Console ───────────────────────────────────────── */

function TelemetryConsole({ isActive }: { isActive: boolean }) {
  const [logs, setLogs] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const baseLogs = [
      "SYS_INIT: Spawn diagnostic sweep sequence...",
      "SWARM_SPAWN: Waves 1-3 scheduled successfully.",
      "NETWORK_READY: 24 edge nodes connected via BrightData proxy.",
      "AXIS_SETUP: GEO / DEV / COOKIE / ORIGIN axes active.",
      "DB_SYNC: Supabase history database sync complete.",
      "INTEGRATION_OK: Gemini analysis node is online.",
      "AUDIT_LOCKED: Price extraction heuristic checks initialized.",
    ];
    setLogs(baseLogs);

    const eventLogs = [
      "SWARM_PING: Route US-EAST proxy latency is 24ms.",
      "SWARM_PING: Route EU-WEST proxy latency is 48ms.",
      "SWARM_PING: Route ASIA-PACIFIC proxy latency is 112ms.",
      "PRICE_SWEEP: Extracting target HTML structures...",
      "GRADIENT_CHECK: Calculating t-statistic differentials...",
      "AI_RUN: Ingesting node arrays into DeepSeek V4 Flash...",
      "SYS_LOCK: Diagnostic checks pass (0 warnings).",
      "MEM_SYNC: Cached results validated.",
      "SWARM_ACTIVE: Rotating 24 agents on tilted orbits...",
    ];

    const interval = setInterval(() => {
      const randomEvent = eventLogs[Math.floor(Math.random() * eventLogs.length)];
      const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
      setLogs((prev) => {
        const next = [...prev, `[${timestamp}] ${randomEvent}`];
        if (next.length > 20) next.shift();
        return next;
      });
    }, isActive ? 1000 : 2500);

    return () => clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="border border-white/[0.06] bg-[#0c0d12]/80 backdrop-blur-md p-4 rounded-sm font-mono text-[9px] text-[#00d992]/80 h-36 overflow-hidden select-none relative w-full">
      <span className="tech-bracket tech-bracket-tl text-[#00d992]/40" />
      <span className="tech-bracket tech-bracket-tr text-[#00d992]/40" />
      <span className="tech-bracket tech-bracket-bl text-[#00d992]/40" />
      <span className="tech-bracket tech-bracket-br text-[#00d992]/40" />
      
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2 text-[8px]">
        <div className="flex items-center gap-1.5 text-white/40 uppercase tracking-widest">
          <Terminal className="w-3 h-3 text-[#00d992]/60" />
          <span>LOG_STREAM_OUTPUT</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00d992] animate-pulse" />
          <span className="text-[#00d992]/50">LIVE</span>
        </div>
      </div>
      
      <div ref={panelRef} className="space-y-1 overflow-y-auto h-24 terminal-scroll-panel">
        {logs.map((log, index) => (
          <div key={index} className="leading-relaxed">
            <span className="text-white/20">&gt;</span> {log}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Agent Grid ─────────────────────────────────────────────────────── */

const AGENT_LEGEND = [
  { label: "Active",    state: "active",    color: "bg-[#00d992]" },
  { label: "Analysing", state: "analysing", color: "bg-amber-400" },
  { label: "Cache Hit", state: "cached",    color: "bg-blue-400" },
  { label: "Idle",      state: "idle",      color: "bg-white/20" },
  { label: "Error",     state: "error",     color: "bg-rose-400" },
  { label: "Ready",     state: "ready",     color: "bg-[#00d992]/40" },
];

const AGENT_DISTRIBUTION = [
  { state: "active",    count: 8 },
  { state: "analysing", count: 6 },
  { state: "cached",    count: 4 },
  { state: "idle",      count: 3 },
  { state: "error",     count: 1 },
  { state: "ready",     count: 2 },
];

function AgentGrid() {
  const agents: { state: string; color: string; label: string; idx: number }[] = [];
  let idx = 0;
  for (const dist of AGENT_DISTRIBUTION) {
    const legend = AGENT_LEGEND.find((l) => l.state === dist.state)!;
    for (let i = 0; i < dist.count; i++) {
      agents.push({ ...legend, idx: idx++ });
    }
  }

  const shuffled = [...agents].sort((a, b) => ((a.idx * 0x9e3779b9) >>> 0) % 2 - ((b.idx * 0x9e3779b9) >>> 0) % 2);

  return (
    <div>
      <div className="grid grid-cols-6 gap-3 sm:gap-4">
        {shuffled.map((agent, i) => {
          const pulseClass =
            agent.state === "active"
              ? "animate-[pulse-agent_1.5s_ease-in-out_infinite] shadow-[0_0_8px_rgba(0,217,146,0.6)]"
              : agent.state === "analysing"
                ? "animate-[pulse-agent_2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                : agent.state === "cached"
                  ? "shadow-[0_0_6px_rgba(96,165,250,0.4)]"
                  : agent.state === "error"
                    ? "shadow-[0_0_6px_rgba(251,113,133,0.4)]"
                    : agent.state === "ready"
                      ? "shadow-[0_0_4px_rgba(0,217,146,0.2)]"
                      : "";

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 border border-white/[0.02] bg-white/[0.01] py-2 rounded-sm"
              style={{ animation: "fadeInUp 0.5s ease-out both", animationDelay: `${i * 20}ms` }}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${agent.color} ${pulseClass}`} />
              <span className="text-[7px] font-mono text-white/20 truncate max-w-[40px] text-center leading-tight uppercase">
                {agent.state}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-5 border-t border-white/[0.04] pt-4">
        {AGENT_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${item.color} ${
                item.state === "active" || item.state === "analysing"
                  ? "animate-[pulse-agent_2s_ease-in-out_infinite]"
                  : ""
              }`}
            />
            <span className="text-[9px] font-mono text-white/30 uppercase">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Stat Block ─────────────────────────────────────────────────────── */

function StatBlock({
  value, suffix, label, icon: Icon, inView,
}: {
  value: number; suffix: string; label: string;
  icon: React.ElementType; inView: boolean;
}) {
  const count = useCountUp(value, 2000, inView);
  return (
    <div className="relative flex flex-col items-center text-center px-4 py-8 bg-[#0c0d12]/30 backdrop-blur-sm group">
      <span className="tech-bracket tech-bracket-tl opacity-0 group-hover:opacity-100 transition-opacity text-[#00d992]/40" />
      <span className="tech-bracket tech-bracket-tr opacity-0 group-hover:opacity-100 transition-opacity text-[#00d992]/40" />
      <span className="tech-bracket tech-bracket-bl opacity-0 group-hover:opacity-100 transition-opacity text-[#00d992]/40" />
      <span className="tech-bracket tech-bracket-br opacity-0 group-hover:opacity-100 transition-opacity text-[#00d992]/40" />
      
      <Icon className="w-5 h-5 text-[#00d992]/50 mb-3 group-hover:text-[#00d992] transition-colors" />
      <div className="text-3xl md:text-4xl font-bold tracking-tight text-white tabular-nums">
        {formatNum(count)}
        <span className="text-[#00d992] ml-0.5">{suffix}</span>
      </div>
      <p className="text-[9px] font-mono text-white/30 mt-2.5 uppercase tracking-widest">{label}</p>
    </div>
  );
}

/* ─── Vertical Step (How It Works) ──────────────────────────────────── */

function VerticalStep({
  step, title, desc, icon: Icon, isLast,
}: {
  step: number; title: string; desc: string;
  icon: React.ElementType; isLast: boolean;
}) {
  return (
    <div
      className="relative flex gap-6 pb-2"
      style={{ animation: "fadeInUp 0.7s ease-out both", animationDelay: `${step * 120}ms` }}
    >
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded border border-[#00d992]/20 bg-[#00d992]/5 flex items-center justify-center shrink-0 relative z-10 group-hover:border-[#00d992]/50 transition-colors">
          <Icon className="w-4 h-4 text-[#00d992]" />
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-gradient-to-b from-[#00d992]/20 via-white/5 to-transparent mt-1" />
        )}
      </div>

      <div className="pb-10">
        <div className="text-[9px] font-mono text-[#00d992]/60 tracking-[0.22em] mb-1.5">
          STEP_0{step}
        </div>
        <h3 className="text-base font-semibold text-white/90 mb-1.5 font-display tracking-wide uppercase">
          {title}
        </h3>
        <p className="text-xs text-white/40 leading-relaxed max-w-md font-body">
          {desc}
        </p>
      </div>
    </div>
  );
}

/* ─── Main Landing Page Overhaul ─── */

export default function LandingPage() {
  const [statsRef, statsInView] = useInView(0.15);
  const [heroVisible, setHeroVisible] = useState(false);
  const typedSub = useTypingText(
    "Deploy 24 adversarial probes across 4 discrimination axes. Expose pricing anomalies in seconds.",
    25,
    heroVisible,
  );
  const [probeUrl, setProbeUrl] = useState("");

  useEffect(() => {
    setHeroVisible(true);
  }, []);

  return (
    <div className="hud-crt-screen min-h-screen bg-[#08090c] text-white overflow-x-hidden font-mono">
      {/* ═══════════════ HERO WORKSTATION ═══════════════ */}
      <section className="relative min-h-[90vh] md:min-h-screen flex items-center px-4 sm:px-6 lg:px-8 pt-16 pb-12 overflow-hidden border-b border-white/[0.04]">
        
        {/* Background Coordinate Lines */}
        <div className="absolute top-6 left-6 w-16 h-16 border-t border-l border-white/5 pointer-events-none" />
        <div className="absolute top-6 right-6 w-16 h-16 border-t border-r border-white/5 pointer-events-none" />
        <div className="absolute bottom-6 left-6 w-16 h-16 border-b border-l border-white/5 pointer-events-none" />
        <div className="absolute bottom-6 right-6 w-16 h-16 border-b border-r border-white/5 pointer-events-none" />

        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">
          
          {/* Left Panel: Controls and Hero copy */}
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6" style={{ animation: "fadeInUp 0.8s ease-out both" }}>
            
            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded border border-[#00d992]/20 bg-[#00d992]/[0.03]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00d992] animate-pulse" />
              <span className="text-[9px] font-mono text-[#00d992] tracking-[0.2em] uppercase">
                SYSTEM LCK: ONLINE | ADVERSARIAL SWARM PROBE v2
              </span>
            </div>

            {/* Main Cyber Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.0] font-display text-white/90">
              24 ADVERSARIAL AGENTS.
              <br />
              <span className="bg-gradient-to-r from-[#00d992] via-[#00d992] to-cyan-400 bg-clip-text text-transparent animate-gradient-text bg-[length:200%_200%] tech-glow-text-emerald">
                ONE TRUTH.
              </span>
            </h1>

            {/* Typewriter Prompt Subtitle */}
            <p className="text-xs sm:text-sm text-white/50 max-w-xl min-h-[40px] leading-relaxed">
              <span className="text-[#00d992]">&gt; </span>
              {typedSub}
              <span className="animate-[terminal-blink_1s_step-end_infinite] ml-0.5 text-[#00d992]">▊</span>
            </p>

            {/* Interactive Probe Console Form */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-white/20" />
                </div>
                <input
                  type="text"
                  value={probeUrl}
                  onChange={(e) => setProbeUrl(e.target.value)}
                  placeholder="https://target-airline-or-hotel.com/product"
                  className="w-full bg-[#0c0d12]/80 border border-white/[0.08] pl-10 pr-4 py-3.5 text-xs text-white/80 font-mono placeholder:text-white/20 outline-none focus:border-[#00d992]/40 focus:bg-white/[0.02] transition-all duration-300 rounded-sm"
                />
              </div>
              <Link
                href="/chat"
                className="group shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-sm bg-[#00d992] text-[#08090c] font-bold text-xs hover:bg-[#00fca6] transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,217,146,0.4)] active:scale-[0.98]"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>INIT_PROBE</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Swarm telemetry stats overlay */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/[0.04] pt-6 text-[9px] text-white/30 font-mono uppercase">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[#00d992]/60" />
                <span>24 Edge Proxies</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-[#00d992]/60" />
                <span>4 Analysis Axes</span>
              </div>
              <div className="flex items-center gap-2">
                <ChipIcon className="w-3.5 h-3.5 text-[#00d992]/60" />
                <span>Gemini Core</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-[#00d992]/60" />
                <span>MIT Licensed</span>
              </div>
            </div>

          </div>

          {/* Right Panel: Interactive 3D Perspective Workspace */}
          <div className="lg:col-span-6 flex flex-col space-y-4">
            
            {/* Viewport Frame */}
            <div className="relative border border-white/[0.06] bg-[#0c0d12]/40 rounded-sm aspect-[4/3] w-full overflow-hidden flex items-center justify-center">
              {/* Corner Indicators */}
              <span className="tech-bracket tech-bracket-tl text-[#00d992]/40" />
              <span className="tech-bracket tech-bracket-tr text-[#00d992]/40" />
              <span className="tech-bracket tech-bracket-bl text-[#00d992]/40" />
              <span className="tech-bracket tech-bracket-br text-[#00d992]/40" />
              
              {/* Top Viewport Telemetry Bar */}
              <div className="absolute top-2 inset-x-2 flex items-center justify-between z-20 text-[7.5px] font-mono text-white/20 tracking-wider pointer-events-none select-none">
                <div className="flex items-center gap-1.5">
                  <Crosshair className="w-3 h-3 text-[#00d992]/50" />
                  <span>3D_PERSPECTIVE_PROJECTION_RENDER</span>
                </div>
                <span>FPS: 60 | ROT_X: AUTO</span>
              </div>

              {/* Real-time 3D projected Canvas */}
              <Tactical3DNetwork isActive={probeUrl.length > 0} />
            </div>

            {/* Live Streaming Logs console */}
            <TelemetryConsole isActive={probeUrl.length > 0} />

          </div>

        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-30 hover:opacity-60 transition-opacity">
          <span className="text-[8px] font-mono tracking-[0.2em] uppercase">SCROLL_DOWN</span>
          <div className="w-3 h-5 rounded-full border border-white/25 flex items-start justify-center p-0.5">
            <div className="w-0.8 h-1 bg-white/40 rounded-full animate-bounce" />
          </div>
        </div>

      </section>

      {/* ═══════════════ VALUE PROPS SECTION ═══════════════ */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/[0.06] bg-white/[0.01] mb-3 text-[8px] tracking-widest text-white/40 uppercase">
              <span>ALGORITHMIC DISCRIMINATION DETECTOR</span>
            </div>
            <h2 className="text-2xl md:text-3.5xl font-bold text-white tracking-wide font-display uppercase">
              WHAT IS <span className="text-[#00d992] tech-glow-text-emerald">JACOBI</span>?
            </h2>
            <p className="text-[11px] text-white/35 max-w-xl mx-auto mt-3 leading-relaxed">
              The first open-source adversarial pricing topology probe. Built to expose how digital fingerprints are processed to manipulate consumer rates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TacticalCard
              number="01"
              title="24-AGENT SWARM"
              desc="Deploying three waves of eight agents. Each node adopts a unique digital identity (browser headers, IP footprints) targeting the endpoint synchronously."
              icon={Network}
              color="emerald"
              statusCode="AGENT_SWARM_INIT"
            />
            <TacticalCard
              number="02"
              title="AXIS DISCRIMINATION"
              desc="Calculates anomalies across 4 operational axes: geo-location, device fingerprinting, cookie state, and incoming traffic origin."
              icon={Eye}
              color="blue"
              statusCode="AXIS_CHECK_READY"
            />
            <TacticalCard
              number="03"
              title="AI VERDICT ENGINE"
              desc="Ingests differential outputs into deep statistical solvers and multi-tier LLMs to calculate saving margins and discrimination severity indexes."
              icon={BarChart3}
              color="amber"
              statusCode="AI_COMPILER_OK"
            />
          </div>

        </div>
      </section>

      {/* ═══════════════ AGENT TOPOLOGY SECTION ═══════════════ */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-b border-white/[0.04]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.015] bg-[#00d992] pointer-events-none" />

        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/[0.06] bg-white/[0.01] mb-3 text-[8px] tracking-widest text-white/40 uppercase">
              <span>SWARM STATE METRICS</span>
            </div>
            <h2 className="text-2xl md:text-3.5xl font-bold text-white tracking-wide font-display uppercase">
              SWARM <span className="text-[#00d992] tech-glow-text-emerald">TOPOLOGY</span>
            </h2>
            <p className="text-[11px] text-white/35 max-w-xl mx-auto mt-3 leading-relaxed">
              Diagnostic representation of all 24 parallel edge agents. Tap to initialize and observe real-time health and status updates.
            </p>
          </div>

          <div className="border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur-md rounded-sm p-6 sm:p-8 relative">
            <span className="tech-bracket tech-bracket-tl text-white/20" />
            <span className="tech-bracket tech-bracket-tr text-white/20" />
            <span className="tech-bracket tech-bracket-bl text-white/20" />
            <span className="tech-bracket tech-bracket-br text-white/20" />
            
            <AgentGrid />
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS SECTION ═══════════════ */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-b border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/[0.06] bg-white/[0.01] mb-3 text-[8px] tracking-widest text-white/40 uppercase">
              <span>SYSTEM OPERATION MANUAL</span>
            </div>
            <h2 className="text-2xl md:text-3.5xl font-bold text-white tracking-wide font-display uppercase">
              HOW IT <span className="text-[#00d992] tech-glow-text-emerald">WORKS</span>
            </h2>
            <p className="text-[11px] text-white/35 max-w-xl mx-auto mt-3 leading-relaxed">
              From endpoint input to analytical report in under 10 seconds. Observe the core operational stages of Jacobi.
            </p>
          </div>

          <div className="max-w-2xl mx-auto group">
            <VerticalStep step={1} title="SUBMIT ENDPOINT" desc="Enter any pricing URL (flights, hotels, subscription portals). The Jacobi engine parses target parameters to verify probe compatibility." icon={Search} isLast={false} />
            <VerticalStep step={2} title="DEPLOY 24 ADVERSARIAL AGENTS" desc="Probes spawn in waves. Each agent adopts distinct client identifiers and interacts with the vendor endpoint through discrete geographical proxies." icon={Network} isLast={false} />
            <VerticalStep step={3} title="RESOLVE STATISTICAL DIFFERENTIALS" desc="The compiler calculates variance and t-statistic deviations. Gemini parses anomalies to identify demographic and geographic discrimination patterns." icon={Cpu} isLast={false} />
            <VerticalStep step={4} title="DIAGNOSTIC REPORT EXTRACTED" desc="Produces an immutable savings ledger detailing estimated overcharge percentiles, optimal booking routing, and localized pricing matrices." icon={Shield} isLast />
          </div>

        </div>
      </section>

      {/* ═══════════════ STATS COUNTERS ═══════════════ */}
      <section ref={statsRef} className="relative border-b border-white/[0.04] bg-[#0c0d12]/20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.04]">
          <StatBlock value={1247892} suffix="" label="SYSTEM_PROBES_DEPLOYED" icon={Activity} inView={statsInView} />
          <StatBlock value={4823450} suffix="$" label="TOTAL_SAVINGS_CAPTURED" icon={DollarSign} inView={statsInView} />
          <StatBlock value={98} suffix="%" label="DECISION_ACCURACY_RATING" icon={TrendingUp} inView={statsInView} />
        </div>
      </section>

      {/* ═══════════════ CTA GLOW PORTAL ═══════════════ */}
      <section className="relative py-28 px-4 sm:px-6 lg:px-8 overflow-hidden text-center">
        {/* Glow rings in back */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-96 w-96 mx-auto rounded-full blur-[140px] opacity-[0.035] bg-[#00d992] pointer-events-none animate-pulse" />
        
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[#00d992]/20 bg-[#00d992]/[0.02] mb-6 text-[9px] tracking-widest text-[#00d992] uppercase">
            <span>READY_TO_LAUNCH</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 font-display tracking-tight uppercase">
            ESTABLISH <span className="text-[#00d992] tech-glow-text-emerald">SURVEILLANCE</span>
          </h2>
          <p className="text-xs sm:text-sm text-white/40 max-w-md mx-auto mb-10 leading-relaxed">
            Scan pricing distributions, resolve differential anomalies, and protect yourself against hidden vendor rates.
          </p>
          <Link
            href="/chat"
            className="group inline-flex items-center gap-3 px-10 py-4.5 rounded-sm bg-white text-[#08090c] font-bold text-xs hover:bg-[#00d992] hover:text-[#08090c] transition-all duration-300 hover:shadow-[0_0_50px_rgba(0,217,146,0.45)] active:scale-[0.98]"
          >
            <Send className="w-4 h-4" />
            <span>DEPLOY_ADVERSARIAL_SWARM</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* ═══════════════ FOOTER PANEL ═══════════════ */}
      <footer className="border-t border-white/[0.04] bg-black/20 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 text-[10px]">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded border border-[#00d992]/30 flex items-center justify-center">
                  <Radio className="w-3.5 h-3.5 text-[#00d992]" />
                </div>
                <span className="text-xs font-bold tracking-widest text-white/90">JACOBI</span>
              </div>
              <p className="text-[10px] text-white/30 leading-relaxed max-w-xs font-mono uppercase">
                24-agent adversarial pricing topology probe. Built for the BrightData &times; MIT Hackathon.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white/40 uppercase tracking-[0.2em] mb-4 text-[9px]">ENGINE_ROOT</h4>
              <ul className="space-y-2.5">
                <li><Link href="/chat" className="text-white/30 hover:text-[#00d992] transition-colors">Probe Swarm</Link></li>
                <li><Link href="/history" className="text-white/30 hover:text-[#00d992] transition-colors">Audit Ledger</Link></li>
                <li><Link href="/pricing" className="text-white/30 hover:text-[#00d992] transition-colors">Pricing</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white/40 uppercase tracking-[0.2em] mb-4 text-[9px]">DOCUMENTATION</h4>
              <ul className="space-y-2.5">
                <li><a href="#" className="text-white/30 hover:text-[#00d992] transition-colors">API_SPEC</a></li>
                <li><a href="#" className="text-white/30 hover:text-[#00d992] transition-colors">NETWORK_SCHEMATIC</a></li>
                <li><a href="#" className="text-white/30 hover:text-[#00d992] transition-colors">GITHUB_REPO</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white/40 uppercase tracking-[0.2em] mb-4 text-[9px]">CORE_LEGAL</h4>
              <ul className="space-y-2.5">
                <li><a href="#" className="text-white/30 hover:text-[#00d992] transition-colors">PRIVACY_POLICY</a></li>
                <li><a href="#" className="text-white/30 hover:text-[#00d992] transition-colors">TERMS_OF_SERVICE</a></li>
                <li><a href="#" className="text-white/30 hover:text-[#00d992] transition-colors">CONTACT_CORE</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4 text-[9px] text-white/20">
            <p>
              &copy; {new Date().getFullYear()} JACOBI_PROJECT. ALL RIGHTS RESERVED.
            </p>
            <p className="tracking-wider uppercase">
              BUILT FOR BRIGHTDATA &times; MIT HACKATHON &middot; POWERING DECENTRALIZED PRICE TRANSPARENCY
            </p>
          </div>

        </div>
      </footer>
    </div>
  );
}
