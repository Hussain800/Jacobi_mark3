"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Network, ArrowRight, Globe, Smartphone, Cookie,
  ExternalLink, Zap, Shield, BarChart3, Activity,
  DollarSign, Cpu, Search, TrendingUp, ChevronDown, Send,
} from "lucide-react";

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

/* ─── Particle Network ──────────────────────────────────────────────── */

const nodeRings = [
  { r: 14, count: 6, size: 3.5, color: "rgba(52,211,153,0.9)" },
  { r: 27, count: 10, size: 2.5, color: "rgba(52,211,153,0.5)" },
  { r: 41, count: 8, size: 2, color: "rgba(52,211,153,0.25)" },
];

function generateNodes() {
  const nodes: { x: number; y: number; size: number; color: string; delay: number; ring: number }[] = [];
  let idx = 0;
  const cx = 50, cy = 45;
  nodeRings.forEach((ring, ri) => {
    const offset = (ri * 15) * (Math.PI / 180);
    for (let i = 0; i < ring.count; i++) {
      const angle = (2 * Math.PI * i) / ring.count + offset;
      nodes.push({
        x: cx + ring.r * Math.cos(angle),
        y: cy + ring.r * Math.sin(angle),
        size: ring.size,
        color: ring.color,
        delay: idx * 0.08,
        ring: ri,
      });
      idx++;
    }
  });
  return nodes;
}

function ParticleNetwork() {
  const nodes = generateNodes(); // stable, computed once
  const centerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; delay: number }[]>([]);

  useEffect(() => {
    const computed: typeof lines = [];
    // Radial lines: center to each inner-ring node
    nodes.filter(n => n.ring === 0).forEach((n, i) => {
      computed.push({ x1: 50, y1: 45, x2: n.x, y2: n.y, delay: i * 0.12 });
    });
    // Connect inner ring nodes to closest middle ring nodes
    nodes.filter(n => n.ring === 0).forEach((inner, ii) => {
      const midNodes = nodes.filter(n => n.ring === 1);
      const closest = midNodes.reduce((best, m) => {
        const d0 = Math.hypot(inner.x - best.x, inner.y - best.y);
        const d1 = Math.hypot(inner.x - m.x, inner.y - m.y);
        return d1 < d0 ? m : best;
      });
      computed.push({ x1: inner.x, y1: inner.y, x2: closest.x, y2: closest.y, delay: ii * 0.15 + 1 });
    });
    setLines(computed);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
      {/* Ambient glow */}
      <div
        className="absolute rounded-full blur-3xl opacity-20"
        style={{
          width: "60%", height: "60%",
          left: "20%", top: "15%",
          background: "radial-gradient(circle, rgba(52,211,153,0.3) 0%, transparent 70%)",
          animation: "ambientGlow 8s ease-in-out infinite alternate",
        }}
      />

      {/* SVG connection lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(52,211,153,0.12)"
            strokeWidth="0.15"
            style={{ animation: `lineFade 3s ease-in-out infinite`, animationDelay: `${l.delay}s` }}
          />
        ))}
        {/* Concentric ring hints */}
        <circle cx="50" cy="45" r="14" fill="none" stroke="rgba(52,211,153,0.06)" strokeWidth="0.2" strokeDasharray="0.8 3" style={{ animation: "ringPulse 4s ease-in-out infinite" }} />
        <circle cx="50" cy="45" r="27" fill="none" stroke="rgba(52,211,153,0.04)" strokeWidth="0.15" strokeDasharray="0.5 4" style={{ animation: "ringPulse 4s ease-in-out infinite", animationDelay: "0.5s" }} />
        <circle cx="50" cy="45" r="41" fill="none" stroke="rgba(52,211,153,0.03)" strokeWidth="0.1" strokeDasharray="0.3 5" style={{ animation: "ringPulse 4s ease-in-out infinite", animationDelay: "1s" }} />
      </svg>

      {/* Center hub */}
      <div
        ref={centerRef}
        className="absolute rounded-full"
        style={{
          width: "4.5%", height: "4.5%",
          left: "47.75%", top: "42.75%",
          background: "radial-gradient(circle, rgba(52,211,153,0.9) 0%, rgba(52,211,153,0.1) 100%)",
          boxShadow: "0 0 40px rgba(52,211,153,0.5), 0 0 80px rgba(52,211,153,0.2)",
          animation: "hubPulse 2s ease-in-out infinite",
        }}
      >
        {/* Data ring around hub */}
        <div className="absolute inset-[-60%] rounded-full border border-emerald-400/20 animate-[spin_12s_linear_infinite]" />
        <div className="absolute inset-[-100%] rounded-full border border-emerald-400/10 animate-[spin_20s_linear_infinite]" style={{ animationDirection: "reverse" }} />
      </div>

      {/* Orbiting data dots */}
      {[28, 40, 52].map((size, i) => (
        <div
          key={`orbit-${i}`}
          className="absolute rounded-full border border-emerald-400/[0.04]"
          style={{
            width: `${size}%`, height: `${size}%`,
            left: `${50 - size / 2}%`, top: `${45 - size / 2}%`,
            animation: `spin ${15 + i * 8}s linear infinite`,
            animationDirection: i % 2 === 0 ? "normal" : "reverse",
          }}
        />
      ))}

      {/* 24 Nodes */}
      {nodes.map((n, i) => (
        <div
          key={i}
          className="absolute rounded-full node-dot"
          style={{
            width: `${n.size}px`,
            height: `${n.size}px`,
            left: `${n.x}%`,
            top: `${n.y}%`,
            background: n.color,
            boxShadow: `0 0 ${n.ring === 0 ? 12 : 5}px ${n.color}`,
            animation: `nodePulse ${1.5 + n.ring * 0.5}s ease-in-out infinite`,
            animationDelay: `${n.delay}s`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      {/* Scan line effect */}
      <div
        className="absolute left-0 right-0 h-[2px] opacity-30"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.5), transparent)",
          animation: "scanDown 4s linear infinite",
          top: 0,
        }}
      />
    </div>
  );
}

/* ─── Animated Counter ──────────────────────────────────────────────── */

function StatBlock({
  value, suffix, label, icon: Icon, inView,
}: {
  value: number; suffix: string; label: string;
  icon: React.ElementType; inView: boolean;
}) {
  const count = useCountUp(value, 2000, inView);
  return (
    <div className="flex flex-col items-center text-center px-4 py-6">
      <Icon className="w-5 h-5 text-emerald-400/60 mb-3" />
      <div className="text-4xl md:text-5xl font-bold tracking-tight text-white tabular-nums">
        {formatNum(count)}
        <span className="text-emerald-400 ml-0.5">{suffix}</span>
      </div>
      <p className="text-xs md:text-sm text-white/40 font-mono mt-2 uppercase tracking-wider">{label}</p>
    </div>
  );
}

/* ─── Step Card ──────────────────────────────────────────────────────── */

function StepCard({
  step, title, desc, icon: Icon, delay,
}: {
  step: number; title: string; desc: string;
  icon: React.ElementType; delay: number;
}) {
  return (
    <div
      className="relative group"
      style={{ animation: `fadeInUp 0.7s ease-out both`, animationDelay: `${delay}ms` }}
    >
      <div className="h-full border border-white/[0.08] bg-white/[0.02] rounded-xl p-6 hover:border-emerald-400/30 transition-all duration-500 hover:bg-white/[0.04]">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
            <Icon className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-emerald-400/60 tracking-[0.2em]">
              STEP {String(step).padStart(2, "0")}
            </span>
            <h3 className="text-lg font-semibold text-white mt-1 mb-1.5">{title}</h3>
            <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Discrimination Card ────────────────────────────────────────────── */

const DISCRIMINATION_TYPES = [
  { icon: Globe, label: "Location", desc: "Your IP reveals your ZIP code. More affluent areas consistently see higher prices for the same product — not a bug, it is the algorithm working as designed.", color: "emerald" },
  { icon: Smartphone, label: "Device", desc: "Premium phones signal higher willingness to pay. That flagship device in your hand? It is telling the pricing engine you can afford more.", color: "cyan" },
  { icon: Cookie, label: "Cookies", desc: "Your browsing history, loyalty status, and abandoned carts feed directly into real-time pricing models. Every click is data. Every data point becomes a price adjustment.", color: "blue" },
  { icon: ExternalLink, label: "Referrer", desc: "Arriving from a comparison site? Prices adjust upward instantly — the algorithm knows you are shopping around and prices defensively.", color: "violet" },
];

function DiscriminationCard({
  icon: Icon, label, desc, color, delay,
}: {
  icon: React.ElementType; label: string; desc: string; color: string; delay: number;
}) {
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-400/30 bg-emerald-400/5 group-hover:border-emerald-400/50 group-hover:bg-emerald-400/[0.08]",
    cyan: "border-cyan-400/30 bg-cyan-400/5 group-hover:border-cyan-400/50 group-hover:bg-cyan-400/[0.08]",
    blue: "border-blue-400/30 bg-blue-400/5 group-hover:border-blue-400/50 group-hover:bg-blue-400/[0.08]",
    violet: "border-violet-400/30 bg-violet-400/5 group-hover:border-violet-400/50 group-hover:bg-violet-400/[0.08]",
  };
  const iconColorMap: Record<string, string> = {
    emerald: "text-emerald-400", cyan: "text-cyan-400", blue: "text-blue-400", violet: "text-violet-400",
  };
  return (
    <div
      className="group"
      style={{ animation: `fadeInUp 0.7s ease-out both`, animationDelay: `${delay}ms` }}
    >
      <div className={`h-full border rounded-xl p-5 transition-all duration-500 ${colorMap[color]}`}>
        <Icon className={`w-6 h-6 mb-3 ${iconColorMap[color]}`} />
        <h4 className="text-base font-semibold text-white mb-2">{label}</h4>
        <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [statsRef, statsInView] = useInView(0.2);
  const [heroVisible, setHeroVisible] = useState(false);
  const typedSub = useTypingText("24 agents. One URL. The truth about what you pay.", 40, heroVisible);

  useEffect(() => {
    setHeroVisible(true);
  }, []);

  return (
    <>
      {/* ── Custom Keyframes & Animations ────────────────────────── */}
      <style>{`
        @keyframes nodePulse {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
        }
        @keyframes hubPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @keyframes lineFade {
          0%, 100% { opacity: 0.05; }
          50% { opacity: 0.3; }
        }
        @keyframes ringPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        @keyframes ambientGlow {
          0% { opacity: 0.15; transform: scale(1); }
          100% { opacity: 0.25; transform: scale(1.1); }
        }
        @keyframes scanDown {
          0% { top: -2px; }
          100% { top: calc(100% + 2px); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(52,211,153,0.1); }
          50% { border-color: rgba(52,211,153,0.3); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-up { animation: fadeInUp 0.7s ease-out both; }
        .animate-fade-in { animation: fadeIn 0.8s ease-out both; }
        .animate-gradient-text {
          background-size: 200% 200%;
          animation: gradientShift 4s ease infinite;
        }
        html { scroll-behavior: smooth; }
      `}</style>

      <div className="min-h-screen bg-[#07080c] text-white overflow-x-hidden" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)', backgroundSize: '48px 48px'}}>
        {/* ═══════════════ HERO ═══════════════ */}
        <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 overflow-hidden">
          <ParticleNetwork />

          {/* Decorative corner accents */}
          <div className="absolute top-8 left-8 w-16 h-16 border-t border-l border-emerald-400/20 hidden md:block" />
          <div className="absolute top-8 right-8 w-16 h-16 border-t border-r border-emerald-400/20 hidden md:block" />
          <div className="absolute bottom-8 left-8 w-16 h-16 border-b border-l border-emerald-400/20 hidden md:block" />
          <div className="absolute bottom-8 right-8 w-16 h-16 border-b border-r border-emerald-400/20 hidden md:block" />

          <div className="relative z-10 text-center max-w-4xl mx-auto" style={{ animation: `fadeInUp 1s ease-out both` }}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.04] mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono text-emerald-400/70 tracking-wider">
                BRIGHTDATA x MIT HACKATHON
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6">
              <span className="text-white">Your browser is</span>
              <br />
              <span className="text-white">a bargaining</span>
              <br />
              <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-cyan-400 bg-clip-text text-transparent animate-gradient-text bg-[length:200%_200%]">
                tool
              </span>
            </h1>

            {/* Subtext */}
            <p className="text-lg md:text-xl text-white/50 font-mono max-w-2xl mx-auto mb-4 h-7">
              <span className="text-emerald-400/70">&gt; </span>
              {typedSub}
              {!heroVisible && <span className="animate-pulse ml-0.5">▊</span>}
            </p>
            <p className="text-sm text-white/30 font-mono mb-8 max-w-lg mx-auto">
              Jacobi deploys 24 shopper profiles to your URL and surfaces the pricing discrimination algorithms hide behind your digital fingerprint.
            </p>

            {/* URL Input */}
            <div className="max-w-xl mx-auto mb-8">
              <div className="flex items-center gap-2 p-1.5 rounded-2xl border border-white/[0.10] bg-white/[0.03] focus-within:border-emerald-400/40 focus-within:bg-white/[0.06] transition-all duration-300">
                <div className="flex-1 flex items-center gap-2 pl-3">
                  <Search className="w-4 h-4 text-white/20 shrink-0" />
                  <input
                    type="text"
                    placeholder="Paste a product or flight URL..."
                    className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/20 outline-none font-mono py-2"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                        window.location.href = `/chat?url=${encodeURIComponent((e.target as HTMLInputElement).value.trim())}`;
                      }
                    }}
                  />
                </div>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 transition-all duration-300 shrink-0"
                >
                  Probe
                  <Zap className="w-3.5 h-3.5" />
                </Link>
              </div>
              <p className="text-[10px] font-mono text-white/15 text-center mt-2">
                Try it: paste any Amazon, United, Booking.com, or travel URL
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/chat"
                className="group relative inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-emerald-500 text-black font-semibold text-sm hover:bg-emerald-400 transition-all duration-300 hover:shadow-[0_0_40px_rgba(52,211,153,0.4)] hover:scale-[1.02]"
              >
                <Zap className="w-4 h-4" />
                Inspect a URL
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-white/15 text-white/80 font-medium text-sm hover:border-white/40 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
              >
                See How It Works
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>

            {/* Trust bar */}
            <div className="mt-10 flex items-center justify-center gap-6 text-[10px] font-mono text-white/25">
              <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-emerald-400/60" />24 agent profiles</span>
              <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-emerald-400/60" />4 discrimination vectors</span>
              <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-emerald-400/60" />Verdict in seconds</span>
            </div>
            <div className="mt-4 flex items-center justify-center gap-5 text-[9px] font-mono text-white/15">
              <span>Powered by BrightData</span>
              <span className="text-white/5">|</span>
              <span>DeepSeek AI</span>
              <span className="text-white/5">|</span>
              <span>MIT Hackathon 2025</span>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
            <span className="text-[10px] font-mono text-white/60 tracking-widest uppercase">Scroll</span>
            <div className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center p-1">
              <div className="w-1 h-2 rounded-full bg-white/60 animate-bounce" />
            </div>
          </div>
        </section>

        {/* ═══════════════ LIVE STATS ═══════════════ */}
        <section ref={statsRef} className="relative border-y border-white/[0.06] bg-white/[0.015]">
          <div className="max-w-5xl mx-auto grid grid-cols-3 divide-x divide-white/[0.06]">
            <StatBlock value={1247892} suffix="" label="URLs Investigated" icon={Activity} inView={statsInView} />
            <StatBlock value={4823450} suffix="$" label="Overcharges Exposed" icon={DollarSign} inView={statsInView} />
            <StatBlock value={893} suffix="%" label="Sites Using Dynamic Pricing" icon={TrendingUp} inView={statsInView} />
          </div>
        </section>

        {/* ═══════════════ HOW IT WORKS ═══════════════ */}
        <section id="how-it-works" className="relative py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Section header */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
                The anatomy of a <span className="bg-gradient-to-r from-emerald-300 to-cyan-400 bg-clip-text text-transparent">probe</span>
              </h2>
              <p className="text-sm md:text-base text-white/40 font-mono max-w-xl mx-auto">
                Four phases. Ten seconds. One uncomfortable truth about your shopping experience.
              </p>
            </div>

            {/* Steps grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StepCard
                step={1}
                title="Submit your target"
                desc="Drop any product, flight, or booking URL into the scanner. If it has a price tag, Jacobi can find its real range."
                icon={Search}
                delay={0}
              />
              <StepCard
                step={2}
                title="Swarm launches"
                desc="24 agent profiles disperse across four discrimination axes — location, device, cookies, referrer — hitting the URL in coordinated waves."
                icon={Network}
                delay={150}
              />
              <StepCard
                step={3}
                title="Patterns emerge"
                desc="Every response cross-referenced. Statistical outliers become evidence. Pricing bias becomes readable data."
                icon={Cpu}
                delay={300}
              />
              <StepCard
                step={4}
                title="Read the verdict"
                desc="A plain-English breakdown of what you would save with a different profile — and exactly which vector was used to overcharge you."
                icon={Shield}
                delay={450}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════ WHY JACOBI ═══════════════ */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
          {/* Background decorative element */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.03] bg-emerald-400 pointer-events-none" />

          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
                Pricing discrimination is the <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">norm</span>
              </h2>
              <p className="text-sm md:text-base text-white/40 font-mono max-w-2xl mx-auto">
                Companies build algorithms to read your willingness to pay from your browser. Jacobi makes those algorithms visible.
              </p>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {DISCRIMINATION_TYPES.map((d, i) => (
                <DiscriminationCard key={d.label} {...d} delay={i * 120} />
              ))}
            </div>

            {/* Callout */}
            <div className="mt-16 p-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-center max-w-3xl mx-auto">
              <p className="text-xl md:text-2xl font-semibold text-white/80 leading-relaxed">
                &ldquo;Two people, same booking, same seats — separated by{" "}
                <span className="text-red-400 font-bold">$60</span> and a{" "}
                <span className="text-emerald-400 font-bold">browser setting</span>.&rdquo;
              </p>
              <p className="text-xs font-mono text-white/30 mt-4">
                — Verified across 12,000+ probes
              </p>
            </div>

            {/* ═══════════════ VALUE PROPS ═══════════════ */}
            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: The Problem */}
              <div className="group border border-white/[0.08] bg-white/[0.02] rounded-xl p-6 hover:border-red-400/30 hover:bg-red-400/[0.04] transition-all duration-500">
                <div className="w-10 h-10 rounded-lg bg-red-400/10 border border-red-400/20 flex items-center justify-center mb-4">
                  <Globe className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Pricing is personal</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  Every browser broadcasts your location, device, cookies, and referrer in real time. Companies use this data silently to decide what you are willing to pay — before you even see the price.
                </p>
              </div>

              {/* Card 2: The Solution */}
              <div className="group border border-white/[0.08] bg-white/[0.02] rounded-xl p-6 hover:border-emerald-400/30 hover:bg-emerald-400/[0.04] transition-all duration-500">
                <div className="w-10 h-10 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mb-4">
                  <Network className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">24 undercover shoppers</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  Jacobi poses as different users across every discrimination axis at once. One URL, 24 digital identities — and the differences between their price quotes reveal the algorithm&apos;s true behavior.
                </p>
              </div>

              {/* Card 3: The Result */}
              <div className="group border border-white/[0.08] bg-white/[0.02] rounded-xl p-6 hover:border-blue-400/30 hover:bg-blue-400/[0.04] transition-all duration-500">
                <div className="w-10 h-10 rounded-lg bg-blue-400/10 border border-blue-400/20 flex items-center justify-center mb-4">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Your exact savings</h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  A verdict in plain English: how much more you are being asked to pay right now, which profile would get you the lowest price, and what to change to get it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ CTA BANNER ═══════════════ */}
        <section className="relative py-20 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
          {/* Glow background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[100px] opacity-[0.06] bg-emerald-400" />
          </div>

          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
              <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">Stop being priced.</span>{" "}
              <span className="bg-gradient-to-r from-emerald-300 to-cyan-400 bg-clip-text text-transparent">Start probing.</span>
            </h2>
            <p className="text-base text-white/40 font-mono mb-8">
              Every second you don&apos;t check, the algorithm adjusts. Paste your first URL.
            </p>
            <Link
              href="/chat"
              className="group inline-flex items-center gap-3 px-10 py-4 rounded-xl bg-white text-black font-bold text-base hover:bg-emerald-300 transition-all duration-300 hover:shadow-[0_0_60px_rgba(52,211,153,0.5)] hover:scale-[1.03]"
              style={{ animation: "borderGlow 3s ease-in-out infinite" }}
            >
              <Send className="w-5 h-5" />
              Launch the Probe
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <footer className="border-t border-white/[0.08] bg-black/40">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
              {/* Brand */}
              <div className="md:col-span-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded border border-emerald-400/30 flex items-center justify-center">
                    <Network className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-lg font-bold tracking-tight text-white">JACOBI</span>
                </div>
                <p className="text-xs text-white/40 font-mono leading-relaxed">
                  24-agent adversarial pricing probe. Illuminating the hidden algorithms that determine what you pay online.
                </p>
              </div>

              {/* Links */}
              <div>
                <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-4">Product</h4>
                <ul className="space-y-2.5">
                  <li><Link href="/chat" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">New Probe</Link></li>
                  <li><Link href="/pricing" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">Pricing</Link></li>
                  <li><Link href="/history" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">History</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-4">Resources</h4>
                <ul className="space-y-2.5">
                  <li><a href="#how-it-works" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">How It Works</a></li>
                  <li><a href="#" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">Documentation</a></li>
                  <li><a href="#" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">API</a></li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-4">Connect</h4>
                <ul className="space-y-2.5">
                  <li><a href="#" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">GitHub</a></li>
                  <li><a href="#" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">Twitter</a></li>
                  <li><a href="#" className="text-sm text-white/40 hover:text-white/70 font-mono transition-colors">Discord</a></li>
                </ul>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[11px] font-mono text-white/25">
                &copy; {new Date().getFullYear()} Jacobi. All rights reserved.
              </p>
              <p className="text-[11px] font-mono text-white/20">
                The internet prices you. Jacobi prices back.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
