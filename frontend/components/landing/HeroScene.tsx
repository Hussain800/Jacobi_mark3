"use client";

/**
 * HeroScene — the cinematic landing centerpiece.
 *
 * Auto-advances through 4 phases on mount:
 *   idle   → 24 dim circular nodes resting around the URL input
 *   focus  → input + nodes brighten, ambient breath
 *   deploy → nodes fan outward into 5 axis clusters, SVG strands draw
 *   result → 5 representative nodes flip to colored price pills
 *            and a serif "+$142 hidden premium" verdict slides in
 *
 * Position math:
 *   - stageRef + ResizeObserver gives true pixel dimensions
 *   - idlePos(i)   : points on a flattened halo
 *   - deployPos(a) : per-axis cluster anchor + arc-spread by index in cluster
 *
 * Reduced motion: jump to `result` immediately, no transitions.
 *
 * Routes to /chat?url=<encoded> on submit — preserves existing handoff.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { ArrowRight, Globe } from "lucide-react";

/* ─── Constants ────────────────────────────────────────────────────── */

const SAMPLE_URL =
  "https://www.united.com/en/us/flightdetails?flight=UA182";

type Phase = "idle" | "focus" | "deploy" | "result";
type Axis = "loc" | "dev" | "cookie" | "ref" | "ctrl";

interface Agent {
  i: number;
  axis: Axis;
  label: string;
  price: number | null;
  role?: "cheapest" | "dearest" | "neutral";
}

/**
 * 24 agents matching the real backend mix (7/7/3/4/3).
 * Five carry sample prices for the result-phase reveal.
 */
const AGENTS: Agent[] = [
  { i: 0,  axis: "ctrl",   label: "BASE",  price: null },
  { i: 1,  axis: "loc",    label: "NYC",   price: 640, role: "dearest" },
  { i: 2,  axis: "loc",    label: "IOWA",  price: 498, role: "cheapest" },
  { i: 3,  axis: "loc",    label: "SFO",   price: null },
  { i: 4,  axis: "loc",    label: "LDN",   price: 590, role: "neutral" },
  { i: 5,  axis: "loc",    label: "MUM",   price: null },
  { i: 6,  axis: "dev",    label: "iPhn",  price: 620, role: "neutral" },
  { i: 7,  axis: "dev",    label: "Andr",  price: null },
  { i: 8,  axis: "dev",    label: "Mac",   price: null },
  { i: 9,  axis: "dev",    label: "Cbk",   price: null },
  { i: 10, axis: "dev",    label: "Glx",   price: null },
  { i: 11, axis: "cookie", label: "Aged",  price: 585, role: "neutral" },
  { i: 12, axis: "cookie", label: "Frsh",  price: null },
  { i: 13, axis: "cookie", label: "Plat",  price: null },
  { i: 14, axis: "ref",    label: "Kayak", price: null },
  { i: 15, axis: "ref",    label: "Dir",   price: null },
  { i: 16, axis: "ref",    label: "Sky",   price: null },
  { i: 17, axis: "ref",    label: "Dir·M", price: null },
  { i: 18, axis: "loc",    label: "DXB",   price: null },
  { i: 19, axis: "loc",    label: "MS",    price: null },
  { i: 20, axis: "dev",    label: "iPad",  price: null },
  { i: 21, axis: "dev",    label: "SE",    price: null },
  { i: 22, axis: "ctrl",   label: "CTR·1", price: null },
  { i: 23, axis: "ctrl",   label: "CTR·2", price: null },
];

const CLUSTER_LABEL: Record<Axis, string> = {
  loc: "Location",
  dev: "Device",
  cookie: "Cookies",
  ref: "Referrer",
  ctrl: "Controls",
};

/**
 * Direction (in radians) from stage center to each cluster's anchor point.
 * We arrange 5 clusters around a clock: top, top-right, right, bottom-left, left-ish.
 */
const CLUSTER_ANGLE: Record<Axis, number> = {
  loc:    -Math.PI / 2,                  // top
  dev:     Math.PI * 0.18,               // right, slightly down
  cookie:  Math.PI * 0.55,               // bottom-right
  ref:     Math.PI * 0.95,               // bottom-left
  ctrl:   -Math.PI * 0.78,               // top-left
};

/* ─── Position math ────────────────────────────────────────────────── */

function idlePos(i: number, stage: { w: number; h: number }) {
  const r = Math.min(stage.w * 0.42, stage.h * 0.52);
  const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r * 0.72,
  };
}

function deployPos(agent: Agent, stage: { w: number; h: number }) {
  // Anchor for this cluster
  const anchorAngle = CLUSTER_ANGLE[agent.axis];
  const anchorR = Math.min(stage.w * 0.42, stage.h * 0.52);
  const ax = Math.cos(anchorAngle) * anchorR;
  const ay = Math.sin(anchorAngle) * anchorR * 0.78;

  // Spread members along a perpendicular arc
  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const n = peers.length;

  // Tangent direction (perpendicular to radial)
  const tangentAngle = anchorAngle + Math.PI / 2;
  const spread =
    n === 1
      ? 0
      : ((idxInCluster - (n - 1) / 2) /
          Math.max(1, (n - 1) / 2)) *
        Math.min(stage.w * 0.16, 110);

  const x = ax + Math.cos(tangentAngle) * spread;
  const y = ay + Math.sin(tangentAngle) * spread * 0.85;
  return { x, y };
}

/* ─── Component ────────────────────────────────────────────────────── */

export default function HeroScene() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 800, h: 560 });

  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Stage size — synchronous before paint, then live via ResizeObserver */
  useLayoutEffect(() => {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setStage({ w: r.width, h: r.height });
    }
  }, []);

  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setStage({ w: width, h: height });
    });
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  /* Phase timeline */
  useEffect(() => {
    if (reducedMotion) {
      setPhase("result");
      return;
    }
    const t1 = setTimeout(() => setPhase("focus"), 1400);
    const t2 = setTimeout(() => setPhase("deploy"), 2800);
    const t3 = setTimeout(() => setPhase("result"), 5400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [reducedMotion]);

  /* Pre-compute positions (depend on stage size) */
  const positions = useMemo(
    () =>
      AGENTS.map((a) => ({
        idle: idlePos(a.i, stage),
        deploy: deployPos(a, stage),
      })),
    [stage],
  );

  function submit() {
    let raw = url.trim();
    if (!raw) {
      inputRef.current?.focus();
      return;
    }
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    router.push(`/chat?url=${encodeURIComponent(raw)}`);
  }

  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const strandActive = phase === "deploy" || phase === "result";

  return (
    <section
      className="relative isolate overflow-hidden px-5 sm:px-8 pt-14 sm:pt-20"
      aria-label="JACOBI hero scene"
    >
      {/* Ambient top light — single soft halo, no gradient soup */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(0,217,122,0.06),transparent_70%)]"
      />

      {/* Stage — the cinematic surface */}
      <div
        ref={stageRef}
        className="relative mx-auto max-w-[1040px] h-[78vh] min-h-[540px] sm:min-h-[600px]"
      >
        {/* SVG strands — drawn from center to each agent's deploy target */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          viewBox={`-${cx} -${cy} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {AGENTS.map((a, i) => {
            const target = positions[i].deploy;
            return (
              <motion.line
                key={i}
                x1={0}
                y1={0}
                x2={target.x}
                y2={target.y}
                stroke="rgba(155, 161, 173, 0.22)"
                strokeWidth={0.6}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  strandActive
                    ? { pathLength: 1, opacity: 0.55 }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{
                  pathLength: {
                    duration: 1.0,
                    delay: phase === "deploy" ? i * 0.028 : 0,
                    ease: [0.22, 1, 0.36, 1],
                  },
                  opacity: { duration: 0.5 },
                }}
              />
            );
          })}
        </svg>

        {/* Agent layer (z-10) — circular nodes morph into price pills */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {AGENTS.map((a, i) => (
            <AgentNode
              key={a.i}
              agent={a}
              phase={phase}
              i={i}
              idle={positions[i].idle}
              deploy={positions[i].deploy}
              cx={cx}
              cy={cy}
              reducedMotion={!!reducedMotion}
            />
          ))}

          {/* Cluster labels — appear during deploy/result */}
          <AnimatePresence>
            {strandActive && stage.w > 0 &&
              (Object.keys(CLUSTER_ANGLE) as Axis[]).map((axis) => {
                const angle = CLUSTER_ANGLE[axis];
                // Place label slightly beyond cluster anchor
                const r = Math.min(stage.w * 0.42, stage.h * 0.52) + 32;
                const lx = cx + Math.cos(angle) * r;
                const ly = cy + Math.sin(angle) * r * 0.78;
                return (
                  <motion.div
                    key={axis}
                    initial={
                      reducedMotion
                        ? false
                        : { opacity: 0, scale: 0.9 }
                    }
                    animate={{ opacity: 0.6, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.5,
                      delay: 1.0,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{
                      position: "absolute",
                      left: lx,
                      top: ly,
                      transform: "translate(-50%, -50%)",
                    }}
                    className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-muted whitespace-nowrap"
                  >
                    {CLUSTER_LABEL[axis]}
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>

        {/* Center stack — eyebrow, headline, input, trust line */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4">
          {/* Eyebrow */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-secondary mb-6"
          >
            <span className="relative flex items-center justify-center w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-signal animate-ping opacity-50" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-signal" />
            </span>
            JACOBI &middot; Adversarial pricing probe
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.05,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-serif text-[36px] sm:text-5xl lg:text-[68px] leading-[0.98] tracking-tight text-primary text-center mb-7 max-w-[640px]"
          >
            Run one URL through{" "}
            <em className="not-italic relative inline-block">
              <span className="relative z-10 text-signal">24 versions</span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-1 sm:bottom-1.5 h-[0.14em] bg-signal/15 rounded-sm -z-0"
              />
            </em>{" "}
            of you.
          </motion.h1>

          {/* URL input — the product surface */}
          <motion.form
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="w-full max-w-xl pointer-events-auto"
          >
            <motion.div
              animate={
                phase === "idle"
                  ? { boxShadow: "0 0 0 0 rgba(0,217,122,0)" }
                  : {
                      boxShadow:
                        "0 0 0 1px rgba(0,217,122,0.30), 0 0 60px rgba(0,217,122,0.10)",
                    }
              }
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="group relative flex items-stretch bg-raised border border-line rounded-md focus-within:border-signal/45 transition-colors"
            >
              <span className="flex items-center pl-4 sm:pl-5 pr-2 sm:pr-3 text-muted shrink-0">
                <Globe className="w-4 h-4" />
              </span>
              <input
                ref={inputRef}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste a URL — flight, hotel, or product page"
                aria-label="Paste a URL to probe"
                className="flex-1 bg-transparent py-4 sm:py-5 pr-2 text-primary placeholder-muted/70 outline-none text-sm sm:text-base font-mono caret-signal min-w-0"
              />
              <button
                type="submit"
                className="m-1.5 sm:m-2 inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md bg-signal text-ink font-mono text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.12em] hover:brightness-110 active:scale-[0.98] transition-all shrink-0"
              >
                Probe
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>

            {/* Integrated trust line — single row, no card chrome */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted">
              <span className="text-secondary">Bright Data</span>
              <span className="text-muted/40">&middot;</span>
              <span>24 profile probes</span>
              <span className="text-muted/40">&middot;</span>
              <span>Evidence-backed verdict</span>
              <span className="text-muted/40 hidden sm:inline">&middot;</span>
              <button
                type="button"
                onClick={() => {
                  setUrl(SAMPLE_URL);
                  submit();
                }}
                className="text-secondary hover:text-signal transition-colors underline-offset-4 decoration-dotted hover:underline"
              >
                Try sample &rarr;
              </button>
            </div>
          </motion.form>
        </div>
      </div>

      {/* Verdict — slides in on result, fixed-height reservation prevents shift */}
      <div className="relative mx-auto max-w-[1040px] mt-6 sm:mt-10 h-[140px] sm:h-[120px]">
        <AnimatePresence>
          {phase === "result" && (
            <motion.div
              key="verdict"
              initial={reducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{
                duration: 0.9,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute inset-x-0 flex flex-col sm:flex-row items-center sm:items-end justify-center sm:justify-end gap-3 sm:gap-6 px-4"
            >
              <div className="flex flex-col items-center sm:items-end">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-overcharge mb-2">
                  Hidden premium
                </span>
                <motion.span
                  initial={reducedMotion ? false : { y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    duration: 0.7,
                    delay: 0.15,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="font-serif text-5xl sm:text-7xl text-primary leading-none tabular-nums"
                >
                  +$142
                </motion.span>
              </div>
              <div className="sm:max-w-[230px] sm:border-l sm:border-line sm:pl-6 text-center sm:text-left">
                <p className="font-mono text-[11px] text-muted leading-relaxed tracking-wide">
                  Same flight.<br className="hidden sm:inline" />{" "}
                  Same seat.<br className="hidden sm:inline" />{" "}
                  Different identity.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ─── Agent node — circle ↔ price pill ─────────────────────────────── */

function AgentNode({
  agent,
  phase,
  i,
  idle,
  deploy,
  cx,
  cy,
  reducedMotion,
}: {
  agent: Agent;
  phase: Phase;
  i: number;
  idle: { x: number; y: number };
  deploy: { x: number; y: number };
  cx: number;
  cy: number;
  reducedMotion: boolean;
}) {
  const isDeployed = phase === "deploy" || phase === "result";
  const pos = isDeployed ? deploy : idle;
  const showPrice = phase === "result" && agent.price !== null;
  const showLabel = isDeployed && !showPrice;

  const opacity =
    phase === "idle" ? 0.42 : phase === "focus" ? 0.72 : 1;

  // Shape & color of the bubble
  let bubble = "bg-secondary/25 border border-secondary/30";
  if (phase === "focus") bubble = "bg-secondary/40 border border-secondary/40";
  if (isDeployed) bubble = "bg-raised border border-line";
  if (showPrice) {
    if (agent.role === "cheapest")
      bubble = "bg-signal text-ink border border-signal";
    else if (agent.role === "dearest")
      bubble = "bg-overcharge text-ink border border-overcharge";
    else
      bubble = "bg-raised border border-secondary/45 text-secondary";
  }

  const baseSize = showPrice
    ? "min-w-[52px] sm:min-w-[60px] h-[26px] sm:h-[30px] px-2.5"
    : "w-2.5 h-2.5 sm:w-3 sm:h-3";

  // Stagger delay for deploy animation (i ∈ 0..23)
  const deployDelay = phase === "deploy" ? i * 0.028 : 0;

  return (
    <motion.div
      initial={
        reducedMotion
          ? false
          : { x: cx + idle.x, y: cy + idle.y, opacity: 0, scale: 0.6 }
      }
      animate={{
        x: cx + pos.x,
        y: cy + pos.y,
        opacity,
        scale: 1,
      }}
      transition={{
        x: {
          duration: 1.1,
          delay: deployDelay,
          ease: [0.22, 1, 0.36, 1],
        },
        y: {
          duration: 1.1,
          delay: deployDelay,
          ease: [0.22, 1, 0.36, 1],
        },
        opacity: { duration: 0.5 },
        scale: { duration: 0.5 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className="pointer-events-none"
    >
      {/* Bubble */}
      <motion.div
        layout={!reducedMotion}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`flex items-center justify-center rounded-full ${bubble} ${baseSize} transition-colors duration-300`}
        style={{ transform: "translate(-50%, -50%)" }}
      >
        {showPrice && (
          <motion.span
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="font-mono text-[10px] sm:text-[11px] font-semibold tabular-nums whitespace-nowrap"
          >
            ${agent.price}
          </motion.span>
        )}
      </motion.div>

      {/* Tiny label below circle (deploy state, non-priced nodes) */}
      <AnimatePresence>
        {showLabel && (
          <motion.span
            key="label"
            initial={reducedMotion ? false : { opacity: 0, y: -2 }}
            animate={{ opacity: 0.55, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.7 + i * 0.012,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              position: "absolute",
              top: 12,
              left: 0,
              transform: "translate(-50%, 0)",
            }}
            className="font-mono text-[8px] sm:text-[9px] text-muted whitespace-nowrap"
          >
            {agent.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
