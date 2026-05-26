"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Network, ArrowRight, Zap, Shield, BarChart3, Activity,
  DollarSign, Cpu, Search, TrendingUp, Send, Eye, Radio,
  Terminal, Database, Crosshair, Lock, Globe, Server, Cpu as ChipIcon,
  Sliders, Settings, Info, CheckCircle, AlertTriangle, Play, RefreshCw
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import Tactical3DNetwork from "../components/Tactical3DNetwork";

/* ─── Presets for Interactive Sandbox ────────────────────────────────── */

const SIM_PRESETS = [
  {
    name: "FLIGHT UA182 (JFK ➔ LHR)",
    url: "https://united.com/flights/jfk-lhr-ua182",
    baseline: 640,
    min: 498,
    spread: 142,
    severity: "severe",
    pei: 0.84,
    dpi: 0.22,
    classification: "Algorithmic Personalized Exploitation (APE)",
    chartData: [
      { name: "Rural Iowa (VPN)", price: 498, fill: "#00d992" },
      { name: "Bangalore (VPN)", price: 512, fill: "#00d992" },
      { name: "London (Direct)", price: 590, fill: "#60a5fa" },
      { name: "Manhattan (Direct)", price: 640, fill: "#fb7185" },
      { name: "Tokyo (Direct)", price: 625, fill: "#fb7185" },
    ],
    recs: [
      "Connect via a proxy in Rural Iowa to save up to $142.",
      "Clear cookie footprints to evade progressive search markups.",
      "Purchase via an indirect referrer channel (e.g., Kayak)."
    ]
  },
  {
    name: "PARIS GRAND HOTEL SUITE",
    url: "https://booking.com/hotels/paris-grand-suite",
    baseline: 385,
    min: 300,
    spread: 85,
    severity: "moderate",
    pei: 0.58,
    dpi: 0.08,
    classification: "Static Price Discrimination (SPD)",
    chartData: [
      { name: "Android Mobile", price: 300, fill: "#00d992" },
      { name: "Linux Firefox", price: 320, fill: "#00d992" },
      { name: "Windows Edge", price: 360, fill: "#60a5fa" },
      { name: "macOS Safari", price: 385, fill: "#fb7185" },
      { name: "iPhone Safari", price: 380, fill: "#fb7185" },
    ],
    recs: [
      "Spoof User-Agent header to Android Mobile to save $85.",
      "Avoid booking directly from premium macOS environments.",
      "Verify pricing using a clean-session guest cookie state."
    ]
  },
  {
    name: "SAASDB ENTERPRISE PLAN",
    url: "https://saasdb.io/pricing/enterprise",
    baseline: 120,
    min: 120,
    spread: 0,
    severity: "none",
    pei: 0.02,
    dpi: 0.01,
    classification: "Uniform Static Pricing (USP)",
    chartData: [
      { name: "Any Location", price: 120, fill: "#00d992" },
      { name: "Any Device", price: 120, fill: "#00d992" },
      { name: "Any Cookies", price: 120, fill: "#00d992" },
    ],
    recs: [
      "No profile-based markups found. Direct purchase is safe.",
      "Verify coupon referrals for additional static discounts."
    ]
  }
];

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

/* ─── Telemetry Console Log Stream ────────────────────────────────────── */

function TelemetryConsole({ isActive }: { isActive: boolean }) {
  const [logs, setLogs] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const baseLogs = [
      "SYS_INIT: Establish adversarial proxy vectors...",
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
        if (next.length > 15) next.shift();
        return next;
      });
    }, isActive ? 1200 : 3000);

    return () => clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="border border-white/[0.06] bg-[#0c0d12]/80 backdrop-blur-md p-4 rounded-sm font-mono text-[9px] text-[#00d992]/80 h-32 overflow-hidden select-none relative w-full">
      <span className="tech-bracket tech-bracket-tl text-[#00d992]/30" />
      <span className="tech-bracket tech-bracket-tr text-[#00d992]/30" />
      <span className="tech-bracket tech-bracket-bl text-[#00d992]/30" />
      <span className="tech-bracket tech-bracket-br text-[#00d992]/30" />
      
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
      
      <div ref={panelRef} className="space-y-1 overflow-y-auto h-20 terminal-scroll-panel">
        {logs.map((log, index) => (
          <div key={index} className="leading-relaxed">
            <span className="text-white/20">&gt;</span> {log}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Static Agent Grid ─── */

function AgentGrid() {
  const shuffled = [
    { state: "active", color: "bg-[#00d992]" },
    { state: "cached", color: "bg-blue-400" },
    { state: "active", color: "bg-[#00d992]" },
    { state: "analysing", color: "bg-amber-400" },
    { state: "idle", color: "bg-white/20" },
    { state: "active", color: "bg-[#00d992]" },
    { state: "cached", color: "bg-blue-400" },
    { state: "error", color: "bg-rose-400" },
    { state: "active", color: "bg-[#00d992]" },
    { state: "analysing", color: "bg-amber-400" },
    { state: "ready", color: "bg-[#00d992]/40" },
    { state: "active", color: "bg-[#00d992]" },
  ];

  return (
    <div className="grid grid-cols-6 gap-2">
      {shuffled.map((agent, i) => (
        <div key={i} className="flex flex-col items-center gap-1 border border-white/[0.02] bg-white/[0.01] py-1 rounded-sm">
          <div className={`w-1.5 h-1.5 rounded-full ${agent.color}`} />
          <span className="text-[6.5px] font-mono text-white/20 uppercase">{agent.state}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Helper Components ──────────────────────────────────────────────── */

function VerticalStep({ step, title, desc, icon: Icon, isLast = false }: { step: number; title: string; desc: string; icon: React.ElementType; isLast?: boolean }) {
  return (
    <div className="relative flex gap-6 pb-2" style={{ animation: "fadeInUp 0.7s ease-out both", animationDelay: `${step * 120}ms` }}>
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded border border-[#00d992]/20 bg-[#00d992]/5 flex items-center justify-center shrink-0 relative z-10">
          <Icon className="w-4 h-4 text-[#00d992]" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gradient-to-b from-[#00d992]/20 via-white/5 to-transparent mt-1" />}
      </div>
      <div className="pb-10">
        <div className="text-[9px] font-mono text-[#00d992]/60 tracking-[0.22em] mb-1.5">STEP_0{step}</div>
        <h3 className="text-base font-semibold text-white/90 mb-1.5 font-display tracking-wide uppercase">{title}</h3>
        <p className="text-xs text-white/40 leading-relaxed max-w-md font-body">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Main Landing Page Overhaul ─── */

export default function LandingPage() {
  const [statsRef, statsInView] = useInView(0.15);
  const [heroVisible, setHeroVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [probeUrl, setProbeUrl] = useState("");
  
  // Simulation States
  const [activePresetIdx, setActivePresetIdx] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simStep, setSimStep] = useState("");
  const [showResult, setShowResult] = useState(true);
  const [resultTab, setResultTab] = useState<"verdict" | "dispersion">("verdict");

  // Dynamic Calculator States
  const [calcGeo, setCalcGeo] = useState(50); // 0 (Low) to 100 (High)
  const [calcDevice, setCalcDevice] = useState(60); // 0 (Chromebook) to 100 (MacBook Pro)
  const [calcUrgency, setCalcUrgency] = useState(30); // 0 (First Search) to 100 (High Frequency)

  const typedSub = useTypingText(
    "Deploy 24 adversarial probes across 4 discrimination axes. Expose pricing anomalies in seconds.",
    25,
    heroVisible,
  );

  useEffect(() => {
    setHeroVisible(true);
    setMounted(true);
  }, []);

  // Run Preset Simulation
  const triggerSimulation = (idx: number) => {
    setActivePresetIdx(idx);
    setIsSimulating(true);
    setSimProgress(0);
    setShowResult(false);

    const steps = [
      { p: 15, msg: "SYS_INIT: Allocating 24 residential exit nodes..." },
      { p: 40, msg: "SWARM_SPAWN: Staggering queries on exit routes [US, EU, ASIA]..." },
      { p: 70, msg: "EVASION_INIT: Masking WebGL shaders and audio signatures..." },
      { p: 90, msg: "PRICE_SWEEP: Resolving HTML nodes and compiling pricing vectors..." },
      { p: 100, msg: "COMPILER_OK: Ingesting result matrix into Recharts..." }
    ];

    let currentStepIdx = 0;
    const interval = setInterval(() => {
      setSimProgress((prev) => {
        const next = prev + 5;
        // Check steps mapping
        const step = steps.find(s => next >= s.p && next < s.p + 10);
        if (step) setSimStep(step.msg);

        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsSimulating(false);
            setShowResult(true);
            setResultTab("verdict");
          }, 300);
          return 100;
        }
        return next;
      });
    }, 150);
  };

  const activePreset = SIM_PRESETS[activePresetIdx];

  // Dynamic Calculator calculations
  const calcBasePrice = 300;
  const computedGeoMarkup = (calcGeo / 100) * 80;
  const computedDeviceMarkup = (calcDevice / 100) * 50;
  const computedUrgencyMarkup = (calcUrgency / 100) * 40;
  const totalComputedPrice = Math.round(calcBasePrice + computedGeoMarkup + computedDeviceMarkup + computedUrgencyMarkup);
  const estimatedExploitationIndex = ((computedGeoMarkup + computedDeviceMarkup + computedUrgencyMarkup) / (80 + 50 + 40)).toFixed(2);

  return (
    <div className="hud-crt-screen min-h-screen bg-[#08090c] text-white overflow-x-hidden font-mono selection:bg-[#00d992]/20 selection:text-white">
      <style>{`
        :root { --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1); --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1); --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }
        .reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.7s var(--ease-out-quart), transform 0.7s var(--ease-out-quart); }
        .reveal.in { opacity: 1; transform: translateY(0); }
        .reveal-delay-1 { transition-delay: 0.1s; }
        .reveal-delay-2 { transition-delay: 0.2s; }
        .reveal-delay-3 { transition-delay: 0.3s; }
        .reveal-delay-4 { transition-delay: 0.4s; }
        .hover-lift { transition: transform 0.3s var(--ease-out-quart), box-shadow 0.3s var(--ease-out-quart); }
        .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,217,146,0.08); }
        .btn-pulse { transition: transform 0.15s var(--ease-out-quart); }
        .btn-pulse:active { transform: scale(0.96); }
      `}</style>
      {/* ═══════════════ HERO WORKSTATION ═══════════════ */}
      <section className="relative min-h-[95vh] md:min-h-screen flex items-center px-4 sm:px-6 lg:px-8 pt-16 pb-12 overflow-hidden border-b border-white/[0.04]">
        
        {/* Background Grid Accent */}
        <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
          backgroundSize: "64px 64px"
        }} />

        <div className="absolute top-6 left-6 w-16 h-16 border-t border-l border-white/5 pointer-events-none" />
        <div className="absolute top-6 right-6 w-16 h-16 border-t border-r border-white/5 pointer-events-none" />
        <div className="absolute bottom-6 left-6 w-16 h-16 border-b border-l border-white/5 pointer-events-none" />
        <div className="absolute bottom-6 right-6 w-16 h-16 border-b border-r border-white/5 pointer-events-none" />

        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">
          
          {/* Left Column: Diagnostics Copy & Input */}
          <div className="lg:col-span-5 flex flex-col justify-center space-y-6" style={{ animation: "fadeInUp 0.8s ease-out both" }}>
            
            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded border border-[#00d992]/20 bg-[#00d992]/[0.03]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00d992] animate-pulse" />
              <span className="text-[9px] tracking-[0.2em] uppercase text-[#00d992] font-semibold">
                SYSTEM LCK: ONLINE | ADVERSARIAL SWARM PROBE v2
              </span>
            </div>

            {/* Dynamic Cyber Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.0] font-display text-white/95 uppercase">
              24 ADVERSARIAL AGENTS.
              <br />
              <span className="text-[#00d992] font-bold">
                ONE TRUTH.
              </span>
            </h1>

            {/* Terminal Prompt Subtitle */}
            <p className="text-xs sm:text-sm text-white/50 max-w-xl min-h-[40px] leading-relaxed">
              <span className="text-[#00d992]">&gt; </span>
              {typedSub}
              <span className="animate-[terminal-blink_1s_step-end_infinite] ml-0.5 text-[#00d992]">▊</span>
            </p>

            {/* Main Interactive Probe Form */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-white/20" />
                </div>
                <input
                  type="text"
                  value={probeUrl}
                  onChange={(e) => setProbeUrl(e.target.value)}
                  placeholder="Paste Target Booking URL..."
                  className="w-full bg-[#0c0d12]/80 border border-white/[0.08] pl-10 pr-4 py-3.5 text-xs text-white/80 font-mono placeholder:text-white/20 outline-none focus:border-[#00d992]/40 focus:bg-white/[0.02] transition-all duration-300 rounded-sm"
                />
              </div>
              <Link
                href="/chat"
                className="group shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-sm bg-[#00d992] text-[#08090c] font-bold text-xs hover:bg-[#00fca6] transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,217,146,0.4)] active:scale-[0.98]"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>LAUNCH_SWARM</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Preset Sandbox Selectors */}
            <div className="space-y-2 pt-2">
              <span className="text-[8.5px] text-white/30 uppercase tracking-widest block">SELECT_INTERACTIVE_SIMULATION_PRESET</span>
              <div className="grid grid-cols-3 gap-2">
                {SIM_PRESETS.map((p, idx) => (
                  <button
                    key={p.name}
                    onClick={() => triggerSimulation(idx)}
                    className={`px-3 py-2 text-left border rounded-sm text-[8px] font-mono transition-all ${
                      activePresetIdx === idx 
                        ? "border-[#00d992] bg-[#00d992]/[0.05] text-[#00d992]" 
                        : "border-white/[0.06] bg-white/[0.01] text-white/40 hover:text-white/70 hover:border-white/20"
                    }`}
                  >
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-[7px] text-white/25 mt-0.5">Spread: ${p.spread}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Swarm telemetry parameters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/[0.04] pt-5 text-[9px] text-white/30 font-mono uppercase">
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

          {/* Right Column: Workstation Simulation & Results */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            
            {/* Main Interactive Screen */}
            <div className="relative border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur-md rounded-sm w-full overflow-hidden flex flex-col min-h-[440px]">
              
              {/* Corner Indicators */}
              <span className="tech-bracket tech-bracket-tl text-white/20" />
              <span className="tech-bracket tech-bracket-tr text-white/20" />
              <span className="tech-bracket tech-bracket-bl text-white/20" />
              <span className="tech-bracket tech-bracket-br text-white/20" />

              {/* Viewport Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2 text-[8px] font-mono text-white/40 select-none bg-black/25">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-3.5 h-3.5 text-[#00d992]/60 animate-pulse" />
                  <span className="uppercase tracking-widest font-semibold text-white/60">AUDIT_WORKSTATION_OUTPUT</span>
                </div>
                <span>FPS: 60 | ROT_X: AUTO</span>
              </div>

              {/* Body Area */}
              <div className="flex-1 relative min-h-[220px] flex items-center justify-center">
                {isSimulating ? (
                  /* Loading Progress Screen */
                  <div className="z-20 text-center space-y-4 px-6 max-w-sm">
                    <RefreshCw className="w-8 h-8 text-[#00d992] animate-spin mx-auto" />
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono font-semibold tracking-widest text-[#00d992] uppercase">
                        PROBING SWARM ACTIVE ({simProgress}%)
                      </div>
                      <div className="text-[8px] font-mono text-white/40 truncate">
                        {simStep}
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-white/[0.06] h-1 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#00d992] h-full transition-all duration-150" 
                        style={{ width: `${simProgress}%` }}
                      />
                    </div>
                  </div>
                ) : showResult ? (
                  /* Live tabbed panels */
                  <div className="w-full h-full flex flex-col p-4 z-20">
                    
                    {/* Tab Navigation */}
                    <div className="flex border-b border-white/[0.06] mb-4 text-[9px] tracking-wider uppercase font-semibold">
                      <button
                        onClick={() => setResultTab("verdict")}
                        className={`pb-2 px-3 border-b-2 transition-colors ${
                          resultTab === "verdict" 
                            ? "border-[#00d992] text-[#00d992]" 
                            : "border-transparent text-white/40 hover:text-white/60"
                        }`}
                      >
                        AUDIT_VERDICT
                      </button>
                      <button
                        onClick={() => setResultTab("dispersion")}
                        className={`pb-2 px-3 border-b-2 transition-colors ${
                          resultTab === "dispersion" 
                            ? "border-[#00d992] text-[#00d992]" 
                            : "border-transparent text-white/40 hover:text-white/60"
                        }`}
                      >
                        PRICE_DISPERSION_GRAPH
                      </button>
                    </div>

                    {/* Tab Contents */}
                    <div className="flex-1 flex flex-col justify-between">
                      {resultTab === "verdict" ? (
                        /* Dynamic Verdict Card */
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-[9px] text-white/30 uppercase tracking-widest">Target Endpoint</div>
                              <div className="text-xs font-semibold text-white/90 truncate max-w-[280px] mt-0.5">{activePreset.url}</div>
                            </div>
                            
                            <div className="text-right">
                              <div className="text-[9px] text-white/30 uppercase tracking-widest">Severity</div>
                              <span className={`inline-block px-2 py-0.5 rounded-sm text-[8px] font-bold mt-1 uppercase tracking-widest ${
                                activePreset.severity === "severe" 
                                  ? "bg-rose-500/10 border border-rose-500/20 text-rose-400" 
                                  : activePreset.severity === "moderate"
                                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                                    : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                              }`}>
                                {activePreset.severity}
                              </span>
                            </div>
                          </div>

                          {/* Index Matrix Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0c0d12] p-3 border border-white/[0.04] rounded-sm">
                            <div>
                              <span className="text-[8px] text-white/30 block uppercase tracking-wider">Baseline Price</span>
                              <span className="text-sm font-semibold text-white">${activePreset.baseline}.00</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-white/30 block uppercase tracking-wider">Minimum Price</span>
                              <span className="text-sm font-semibold text-[#00d992]">${activePreset.min}.00</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-white/30 block uppercase tracking-wider">Max Spread</span>
                              <span className="text-sm font-semibold text-rose-400">${activePreset.spread}.00</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-white/30 block uppercase tracking-wider">Exploitation Index (PEI)</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-sm font-semibold text-white">{activePreset.pei}</span>
                                <div className="w-12 bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${activePreset.pei > 0.7 ? "bg-rose-400" : activePreset.pei > 0.4 ? "bg-amber-400" : "bg-emerald-400"}`} 
                                    style={{ width: `${activePreset.pei * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Classification */}
                          <div className="text-[10px] bg-white/[0.01] border border-white/[0.04] p-2.5 rounded-sm flex items-center gap-2">
                            {activePreset.severity === "severe" || activePreset.severity === "moderate" ? (
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-[#00d992] shrink-0" />
                            )}
                            <div>
                              <span className="text-white/35 block uppercase text-[7px] tracking-wider">Audit Classification</span>
                              <span className="font-semibold text-white/80">{activePreset.classification}</span>
                            </div>
                          </div>

                          {/* Recommendations List */}
                          <div className="space-y-1.5">
                            <span className="text-[8.5px] text-white/30 uppercase tracking-widest block">ACTIONABLE_MITIGATION_SETTINGS</span>
                            <div className="space-y-1">
                              {activePreset.recs.map((rec, i) => (
                                <div key={i} className="flex items-start gap-2 text-[9.5px] text-white/60 leading-relaxed font-body">
                                  <span className="text-[#00d992] select-none font-mono">&gt;</span>
                                  <span>{rec}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                        </div>
                      ) : (
                        /* Recharts Chart View */
                        <div className="w-full h-full flex flex-col justify-between min-h-[220px]">
                          <div className="text-[8px] text-white/20 uppercase tracking-widest mb-2">Simulated Pricing Spread By Profile Vector</div>
                          <div className="flex-1 w-full min-h-[180px]">
                            {mounted && (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activePreset.chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                  <XAxis 
                                    dataKey="name" 
                                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 7, fontFamily: "monospace" }} 
                                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                                  />
                                  <YAxis 
                                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 8, fontFamily: "monospace" }}
                                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                                  />
                                  <CartesianGrid stroke="rgba(255,255,255,0.02)" vertical={false} />
                                  <Tooltip
                                    contentStyle={{ background: "#0c0d12", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "2px", fontFamily: "monospace", fontSize: "9px" }}
                                    itemStyle={{ color: "#fff" }}
                                  />
                                  <Bar dataKey="price" radius={[1, 1, 0, 0]}>
                                    {activePreset.chartData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Trigger Action */}
                    <div className="border-t border-white/[0.06] pt-3 mt-4 flex items-center justify-between text-[8px] font-mono text-white/25">
                      <span>AUDIT_SESSION: {activePreset.name.replace(/ /g, "_")}</span>
                      <button
                        onClick={() => triggerSimulation(activePresetIdx)}
                        className="flex items-center gap-1.5 text-[#00d992] hover:text-[#00fca6] uppercase font-semibold transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Re-Probe Swarm</span>
                      </button>
                    </div>

                  </div>
                ) : (
                  /* Standard 3D rotating preview canvas */
                  <Tactical3DNetwork isActive={probeUrl.length > 0} />
                )}
              </div>

            </div>

            {/* Live Streaming Logs console */}
            <TelemetryConsole isActive={probeUrl.length > 0 || isSimulating} />

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

          <div className="space-y-6">
            <div className="flex items-start gap-5 p-5 rounded-lg border border-white/[0.06] bg-white/[0.01] hover-lift" style={{ animation: "slideUp 0.6s cubic-bezier(0.22,1,0.36,1) both" }}>
              <div className="shrink-0 w-12 h-12 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
                <Network className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-emerald-400/60 tracking-widest mb-1 uppercase">Phase 01</div>
                <div className="text-sm font-semibold text-white/90 mb-1">24-agent swarm deploys</div>
                <div className="text-xs text-white/40 leading-relaxed">Each agent adopts a unique digital identity across browser headers and IP footprints, targeting the endpoint synchronously.</div>
              </div>
            </div>

            <div className="flex items-start gap-5 p-5 rounded-lg border border-white/[0.06] bg-white/[0.01] hover-lift" style={{ animation: "slideUp 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "0.15s" }}>
              <div className="shrink-0 w-12 h-12 rounded-lg bg-blue-400/10 border border-blue-400/20 flex items-center justify-center">
                <Eye className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-blue-400/60 tracking-widest mb-1 uppercase">Phase 02</div>
                <div className="text-sm font-semibold text-white/90 mb-1">Axis discrimination analysis</div>
                <div className="text-xs text-white/40 leading-relaxed">Anomalies calculated across 4 operational axes: geo-location, device fingerprinting, cookie state, and incoming traffic origin.</div>
              </div>
            </div>

            <div className="flex items-start gap-5 p-5 rounded-lg border border-white/[0.06] bg-white/[0.01] hover-lift" style={{ animation: "slideUp 0.6s cubic-bezier(0.22,1,0.36,1) both", animationDelay: "0.3s" }}>
              <div className="shrink-0 w-12 h-12 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-amber-400/60 tracking-widest mb-1 uppercase">Phase 03</div>
                <div className="text-sm font-semibold text-white/90 mb-1">AI verdict engine</div>
                <div className="text-xs text-white/40 leading-relaxed">Differential outputs fed into statistical solvers and multi-tier LLMs to compute savings margins and discrimination severity.</div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ═══════════════ DYNAMIC PARAMETER CALCULATOR ═══════════════ */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-b border-white/[0.04] bg-[#0c0d12]/20">
        <div className="max-w-5xl mx-auto">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Column: Sliders */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/[0.06] bg-white/[0.01] mb-3 text-[8px] tracking-widest text-white/40 uppercase">
                  <span>DYNAMIC SIMULATOR WIDGET</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white tracking-wide font-display uppercase">
                  PRICING <span className="text-[#00d992] tech-glow-text-emerald">SIMULATION</span> LABORATORY
                </h3>
                <p className="text-[11px] text-white/35 leading-relaxed mt-2">
                  Tweak the profiling sliders to simulate how a dynamic vendor algorithm evaluates tracking tags and injects localized and technological markups onto your base rates.
                </p>
              </div>

              {/* Sliders Container */}
              <div className="space-y-5 bg-[#0c0d12]/60 p-5 border border-white/[0.06] rounded-sm relative">
                <span className="tech-bracket tech-bracket-tl text-[#00d992]/20" />
                <span className="tech-bracket tech-bracket-tr text-[#00d992]/20" />
                <span className="tech-bracket tech-bracket-bl text-[#00d992]/20" />
                <span className="tech-bracket tech-bracket-br text-[#00d992]/20" />

                {/* Slider 1 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-white/40 uppercase">🌎 User Location Affluence (Geo-GDP)</span>
                    <span className="text-[#00d992] font-semibold">{calcGeo === 0 ? "LOW_INCOME" : calcGeo === 100 ? "METROPOLIS_HIGH" : `INDEX: ${calcGeo}/100`}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={calcGeo}
                    onChange={(e) => setCalcGeo(Number(e.target.value))}
                    className="w-full h-1 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-[#00d992]"
                  />
                  <div className="flex justify-between text-[7.5px] text-white/20 uppercase">
                    <span>Rural / Low GDP</span>
                    <span>Urban / High GDP</span>
                  </div>
                </div>

                {/* Slider 2 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-white/40 uppercase">📱 Device Class / OS Premium (Tech-Tier)</span>
                    <span className="text-[#00d992] font-semibold">{calcDevice === 0 ? "BUDGET_MOBILE" : calcDevice === 100 ? "PREMIUM_MAC_PRO" : `TIER: ${calcDevice}/100`}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={calcDevice}
                    onChange={(e) => setCalcDevice(Number(e.target.value))}
                    className="w-full h-1 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-[#00d992]"
                  />
                  <div className="flex justify-between text-[7.5px] text-white/20 uppercase">
                    <span>Low-End Android</span>
                    <span>High-End Mac / iOS</span>
                  </div>
                </div>

                {/* Slider 3 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-white/40 uppercase">⚡ Search Frequency / Urgency (Cookie-State)</span>
                    <span className="text-[#00d992] font-semibold">{calcUrgency === 0 ? "FIRST_QUERY" : calcUrgency === 100 ? "CRITICAL_URGENCY" : `HITS: ${Math.floor(1 + calcUrgency / 10)}`}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={calcUrgency}
                    onChange={(e) => setCalcUrgency(Number(e.target.value))}
                    className="w-full h-1 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-[#00d992]"
                  />
                  <div className="flex justify-between text-[7.5px] text-white/20 uppercase">
                    <span>Guest Session</span>
                    <span>10+ Route Searches</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Right Column: Output calculation */}
            <div className="lg:col-span-5">
              <div className="border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur-md rounded-sm p-6 relative flex flex-col justify-between min-h-[300px]">
                <span className="tech-bracket tech-bracket-tl text-white/20" />
                <span className="tech-bracket tech-bracket-tr text-white/20" />
                <span className="tech-bracket tech-bracket-bl text-white/20" />
                <span className="tech-bracket tech-bracket-br text-white/20" />

                <div className="border-b border-white/[0.04] pb-3 mb-4">
                  <span className="text-[7.5px] text-white/20 uppercase tracking-widest block">CALCULATOR_OUTPUT_LEDGER</span>
                  <span className="text-xs font-semibold text-white/70 font-mono mt-1 block">ESTIMATED_ALGORITHMIC_MARKUP</span>
                </div>

                <div className="space-y-4 my-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-white/35">BASE_BOOKING_RATE:</span>
                    <span className="text-xs font-semibold text-white">${calcBasePrice}.00</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-white/35">GEO_GDP_MARKUP:</span>
                    <span className="text-xs font-semibold text-rose-400">+${Math.round(computedGeoMarkup)}.00</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-white/35">TECH_DEVICE_MARKUP:</span>
                    <span className="text-xs font-semibold text-rose-400">+${Math.round(computedDeviceMarkup)}.00</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-white/35">URGENCY_COOKIE_MARKUP:</span>
                    <span className="text-xs font-semibold text-rose-400">+${Math.round(computedUrgencyMarkup)}.00</span>
                  </div>
                  <div className="border-t border-white/[0.06] pt-3 flex justify-between items-baseline">
                    <span className="text-[11px] text-[#00d992] font-bold">TOTAL_ESTIMATED_RATE:</span>
                    <span className="text-2xl font-bold text-white tabular-nums">${totalComputedPrice}.00</span>
                  </div>
                </div>

                <div className="border-t border-white/[0.04] pt-3 mt-4 flex items-center justify-between text-[8px] font-mono text-white/20">
                  <span>EXPLOIT_INDEX: {estimatedExploitationIndex}</span>
                  <span>STATUS: CALCULATOR_CALIBRATED</span>
                </div>
              </div>
            </div>

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

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur-md rounded-sm p-6 sm:p-8 relative">
            <span className="tech-bracket tech-bracket-tl text-white/20" />
            <span className="tech-bracket tech-bracket-tr text-white/20" />
            <span className="tech-bracket tech-bracket-bl text-white/20" />
            <span className="tech-bracket tech-bracket-br text-white/20" />
            
            <div className="md:col-span-8">
              <AgentGrid />
            </div>

            <div className="md:col-span-4 bg-[#0c0d12]/80 border border-white/[0.06] p-4 rounded-sm space-y-3 font-mono text-[9px]">
              <div className="border-b border-white/[0.06] pb-2 text-white/40 font-semibold tracking-wider">SWARM_SYSTEM_SUMMARY</div>
              <div className="flex justify-between"><span>TOTAL_NODES:</span><span className="text-[#00d992] font-semibold">24</span></div>
              <div className="flex justify-between"><span>ACTIVE_PROXIES:</span><span className="text-[#00d992]">18 / 24</span></div>
              <div className="flex justify-between"><span>EGRESS_CHANNELS:</span><span className="text-[#00d992]">US, EU, ASIA</span></div>
              <div className="flex justify-between"><span>BOT_BYPASS_INDEX:</span><span className="text-[#00d992]">100%</span></div>
            </div>
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

      {/* ═══════════════ TRUST SIGNALS ═══════════════ */}
      <section ref={statsRef} className="border-t border-white/[0.04] px-6 lg:px-16 py-14 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap justify-center gap-x-16 gap-y-6 text-center">
            <div>
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-2">Infrastructure</div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-white/50">24 parallel agents</span>
                <span className="w-px h-4 bg-white/[0.06]" />
                <span className="text-xs font-mono text-white/50">4 discrimination axes</span>
                <span className="w-px h-4 bg-white/[0.06]" />
                <span className="text-xs font-mono text-white/50">Real-time topology</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-2">Powered by</div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-white/50">BrightData</span>
                <span className="w-px h-4 bg-white/[0.06]" />
                <span className="text-xs font-mono text-white/50">DeepSeek AI</span>
                <span className="w-px h-4 bg-white/[0.06]" />
                <span className="text-xs font-mono text-white/50">OpenCode</span>
              </div>
            </div>
          </div>
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
