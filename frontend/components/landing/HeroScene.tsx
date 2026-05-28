"use client";

/**
 * HeroScene — Phase 6: alive, glowy, repulsive, premium.
 *
 * Phase 6 additions on top of the Phase 5 alive base:
 *   • Per-axis color + glow palette — each of the 5 clusters has its own
 *     restrained tint and matching halo. Five organisms, not 24 dots.
 *   • Cursor repulsion — every node pushes away from the cursor using
 *     spring-smoothed inverse-distance physics. Strands warp with their
 *     nodes since the path endpoints follow the repulsion.
 *   • Spider-web strands — brighter, almost-white core with cluster-tinted
 *     glow. Higher base opacity so the web reads as a real lattice.
 *   • Verdict layout — fully redesigned. The "+$142 hidden premium"
 *     verdict now lives in a CLEAN OVERLAY CARD docked at the top of the
 *     stage (above the masthead), not jammed into the swarm cluster.
 *     Bracket is just a connector line between $498 ↔ $640.
 *   • Premium input — animated gradient border ring, expanded surface,
 *     icon-led PROBE button, focus-state corner ticks.
 */

import {
  useCallback,
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
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, Globe, RotateCcw } from "lucide-react";

/* ─── Domain model ─────────────────────────────────────────────────── */

const SAMPLE_URL =
  "https://www.united.com/en/us/flightdetails?flight=UA182";

type Phase = "idle" | "focus" | "deploy" | "result";
type Axis = "loc" | "dev" | "cookie" | "ref" | "ctrl";
type Role = "cheapest" | "dearest" | "neutral";

interface Agent {
  i: number;
  axis: Axis;
  label: string;
  price: number | null;
  role?: Role;
}

const AGENTS: Agent[] = [
  { i: 0,  axis: "loc",    label: "IOWA",  price: 498, role: "cheapest" },
  { i: 1,  axis: "loc",    label: "SFO",   price: null },
  { i: 2,  axis: "loc",    label: "DXB",   price: null },
  { i: 3,  axis: "loc",    label: "LDN",   price: 590, role: "neutral" },
  { i: 4,  axis: "loc",    label: "MUM",   price: null },
  { i: 5,  axis: "loc",    label: "MS",    price: null },
  { i: 6,  axis: "loc",    label: "NYC",   price: 640, role: "dearest" },

  { i: 7,  axis: "dev",    label: "iPhn",  price: 620, role: "neutral" },
  { i: 8,  axis: "dev",    label: "Andr",  price: null },
  { i: 9,  axis: "dev",    label: "Mac",   price: null },
  { i: 10, axis: "dev",    label: "Cbk",   price: null },
  { i: 11, axis: "dev",    label: "Glx",   price: null },
  { i: 12, axis: "dev",    label: "iPad",  price: null },
  { i: 13, axis: "dev",    label: "SE",    price: null },

  { i: 14, axis: "cookie", label: "Aged",  price: 585, role: "neutral" },
  { i: 15, axis: "cookie", label: "Frsh",  price: null },
  { i: 16, axis: "cookie", label: "Plat",  price: null },

  { i: 17, axis: "ref",    label: "Kayak", price: null },
  { i: 18, axis: "ref",    label: "Dir",   price: null },
  { i: 19, axis: "ref",    label: "Sky",   price: null },
  { i: 20, axis: "ref",    label: "Dir·M", price: null },

  { i: 21, axis: "ctrl",   label: "BASE",  price: null },
  { i: 22, axis: "ctrl",   label: "CTR·1", price: null },
  { i: 23, axis: "ctrl",   label: "CTR·2", price: null },
];

const CLUSTER_LABEL: Record<Axis, string> = {
  loc:    "Location",
  dev:    "Device",
  cookie: "Cookies",
  ref:    "Referrer",
  ctrl:   "Network",
};

const CLUSTER_ANGLE: Record<Axis, number> = {
  loc:    -Math.PI / 2,
  dev:     Math.PI * 0.20,
  cookie:  Math.PI * 0.58,
  ref:     Math.PI * 0.97,
  ctrl:   -Math.PI * 0.80,
};

const CLUSTER_DELAY: Record<Axis, number> = {
  loc:    0.00,
  dev:    0.25,
  cookie: 0.50,
  ref:    0.70,
  ctrl:   0.85,
};

/**
 * Per-axis color palette — restrained, no SaaS rainbow. Each axis has a
 * core hex (for typography/glow) and an rgba glow for box-shadow. The
 * five tones are tuned to read coherent in a dark forensic palette:
 *  - loc:    signal green (geographic baseline)
 *  - dev:    cyan (device fingerprint)
 *  - cookie: amber (session state)
 *  - ref:    rose (referrer / aggregator)
 *  - ctrl:   violet (control / baseline network)
 */
const AXIS_COLOR: Record<Axis, { core: string; glow: string; soft: string }> = {
  loc:    { core: "#00d97a", glow: "rgba(0, 217, 122, 0.55)",  soft: "rgba(0, 217, 122, 0.20)" },
  dev:    { core: "#22d3ee", glow: "rgba(34, 211, 238, 0.55)", soft: "rgba(34, 211, 238, 0.20)" },
  cookie: { core: "#f5b945", glow: "rgba(245, 185, 69, 0.55)", soft: "rgba(245, 185, 69, 0.20)" },
  ref:    { core: "#ff5d6c", glow: "rgba(255, 93, 108, 0.55)", soft: "rgba(255, 93, 108, 0.20)" },
  ctrl:   { core: "#a78bfa", glow: "rgba(167, 139, 250, 0.55)", soft: "rgba(167, 139, 250, 0.20)" },
};

/* ─── Position math ────────────────────────────────────────────────── */

interface Pt { x: number; y: number }

function idlePos(agent: Agent, stage: { w: number; h: number }, rot: number): Pt {
  const anchorAngle = CLUSTER_ANGLE[agent.axis] + rot;
  const idleR = Math.min(stage.w * 0.16, stage.h * 0.20);
  const ax = Math.cos(anchorAngle) * idleR;
  const ay = Math.sin(anchorAngle) * idleR * 0.78;
  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const tight = n === 1 ? 0
    : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
      Math.min(stage.w * 0.045, 32);
  return {
    x: ax + Math.cos(tangentAngle) * tight,
    y: ay + Math.sin(tangentAngle) * tight * 0.85,
  };
}

function deployPos(agent: Agent, stage: { w: number; h: number }, rot: number): Pt {
  const anchorAngle = CLUSTER_ANGLE[agent.axis] + rot;
  const anchorR = Math.min(stage.w * 0.40, stage.h * 0.50);
  const ax = Math.cos(anchorAngle) * anchorR;
  const ay = Math.sin(anchorAngle) * anchorR * 0.78;
  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const spread = n === 1 ? 0
    : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
      Math.min(stage.w * 0.16, 120);
  return {
    x: ax + Math.cos(tangentAngle) * spread,
    y: ay + Math.sin(tangentAngle) * spread * 0.85,
  };
}

/* Curved bezier strand */
function strandPath(origin: Pt, target: Pt) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const angle = Math.atan2(dy, dx);
  const length = Math.hypot(dx, dy);
  const perp = angle + Math.PI / 2;
  const bow = Math.min(length * 0.12, 32);
  const midX = origin.x + dx * 0.5 + Math.cos(perp) * bow;
  const midY = origin.y + dy * 0.5 + Math.sin(perp) * bow;
  return `M ${origin.x} ${origin.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
}

function depthFactor(target: Pt) {
  const angle = Math.atan2(target.y, target.x);
  return 0.7 + 0.3 * ((1 + Math.sin(angle)) / 2);
}

/* Repulsion physics — node pushes away from cursor when close. */
const REPULSE_RADIUS = 160;
const REPULSE_MAX_PX = 38;

function repulsionOffset(nodePos: Pt, cursor: Pt | null): Pt {
  if (!cursor) return { x: 0, y: 0 };
  const dx = nodePos.x - cursor.x;
  const dy = nodePos.y - cursor.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= REPULSE_RADIUS || dist < 0.5) return { x: 0, y: 0 };
  const force = Math.pow((REPULSE_RADIUS - dist) / REPULSE_RADIUS, 2.2);
  return {
    x: (dx / dist) * force * REPULSE_MAX_PX,
    y: (dy / dist) * force * REPULSE_MAX_PX,
  };
}

const INPUT_BOTTOM_OFFSET = 36;

/* ─── Main component ───────────────────────────────────────────────── */

export default function HeroScene() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 960, h: 720 });
  const [runKey, setRunKey] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [rotationOffset, setRotationOffset] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null as unknown as HTMLInputElement);

  /* Mouse / cursor tracking */
  const cursorPxX  = useMotionValue(0);
  const cursorPxY  = useMotionValue(0);
  const cursorHaloX = useSpring(cursorPxX, { stiffness: 140, damping: 24 });
  const cursorHaloY = useSpring(cursorPxY, { stiffness: 140, damping: 24 });

  /* Cursor in stage-centered coords (origin at stage center) — drives
     repulsion. Springs make node retreat feel weighty rather than jittery. */
  const cursorStageX = useMotionValue(0);
  const cursorStageY = useMotionValue(0);
  const cursorRepX   = useSpring(cursorStageX, { stiffness: 150, damping: 22 });
  const cursorRepY   = useSpring(cursorStageY, { stiffness: 150, damping: 22 });

  /* Normalized for parallax */
  const mouseNormX = useMotionValue(0);
  const mouseNormY = useMotionValue(0);
  const PARALLAX_NODES = 12;
  const PARALLAX_STRANDS = 6;
  const parallaxNodesX   = useSpring(useTransform(mouseNormX, (v) => v * PARALLAX_NODES),   { stiffness: 60, damping: 20 });
  const parallaxNodesY   = useSpring(useTransform(mouseNormY, (v) => v * PARALLAX_NODES),   { stiffness: 60, damping: 20 });
  const parallaxStrandsX = useSpring(useTransform(mouseNormX, (v) => v * PARALLAX_STRANDS), { stiffness: 60, damping: 20 });
  const parallaxStrandsY = useSpring(useTransform(mouseNormY, (v) => v * PARALLAX_STRANDS), { stiffness: 60, damping: 20 });

  const [cursorInside, setCursorInside] = useState(false);

  /* Stage size */
  useLayoutEffect(() => {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setStage({ w: r.width, h: r.height });
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
    if (reducedMotion) { setPhase("result"); return; }
    setPhase("idle");
    const t1 = setTimeout(() => setPhase("focus"),  1200);
    const t2 = setTimeout(() => setPhase("deploy"), 2400);
    const t3 = setTimeout(() => setPhase("result"), 4600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [reducedMotion, runKey]);

  /* Perpetual gentle rotation */
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setRotationOffset((prev) => (prev + 0.0006) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(id);
  }, [reducedMotion]);

  /* Mouse tracking */
  useEffect(() => {
    if (reducedMotion) return;
    const el = stageRef.current;
    if (!el) return;
    const handle = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      cursorPxX.set(px);
      cursorPxY.set(py);
      // Stage-centered coords for repulsion
      cursorStageX.set(px - rect.width / 2);
      cursorStageY.set(py - rect.height / 2);
      // Normalized for parallax
      mouseNormX.set((px - rect.width / 2) / (rect.width / 2));
      mouseNormY.set((py - rect.height / 2) / (rect.height / 2));
    };
    const enter = () => setCursorInside(true);
    const leave = () => {
      setCursorInside(false);
      mouseNormX.set(0); mouseNormY.set(0);
      cursorStageX.set(99999); cursorStageY.set(99999); // pull cursor "off stage"
    };
    el.addEventListener("mousemove", handle);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", handle);
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    };
  }, [mouseNormX, mouseNormY, cursorPxX, cursorPxY, cursorStageX, cursorStageY, reducedMotion]);

  /* Positions */
  const positions = useMemo(
    () =>
      AGENTS.map((a) => ({
        idle:   idlePos(a, stage, rotationOffset),
        deploy: deployPos(a, stage, rotationOffset),
      })),
    [stage, rotationOffset],
  );

  const endpoints = useMemo(() => {
    const cheapest = AGENTS.find((a) => a.role === "cheapest");
    const dearest  = AGENTS.find((a) => a.role === "dearest");
    if (!cheapest || !dearest) return null;
    return {
      cheapest:      deployPos(cheapest, stage, rotationOffset),
      dearest:       deployPos(dearest,  stage, rotationOffset),
      cheapestPrice: cheapest.price!,
      dearestPrice:  dearest.price!,
    };
  }, [stage, rotationOffset]);

  const submit = useCallback(() => {
    let raw = url.trim();
    if (!raw) { inputRef.current?.focus(); return; }
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    router.push(`/chat?url=${encodeURIComponent(raw)}`);
  }, [url, router]);

  const replay = useCallback(() => {
    if (reducedMotion) return;
    setRunKey((k) => k + 1);
  }, [reducedMotion]);

  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const strandActive = phase === "deploy" || phase === "result";

  /* Just a connector line between endpoints — verdict text lives in
     the docked overlay card now, not in the swarm */
  const connector = useMemo(() => {
    if (!endpoints) return null;
    const a = endpoints.cheapest;
    const b = endpoints.dearest;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const offsetY = -28; // small bow upward
    return `M ${a.x} ${a.y - 14} Q ${midX} ${midY + offsetY} ${b.x} ${b.y - 14}`;
  }, [endpoints]);

  return (
    <section
      id="jacobi-hero"
      className="relative isolate overflow-hidden px-5 sm:px-8 pt-10 sm:pt-14 pb-10"
      aria-label="JACOBI hero scene"
    >
      {/* Ambient lighting */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(0,217,122,0.06),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_60%,rgba(0,0,0,0.5))]"
      />

      {/* ─── Top verdict card — docked above masthead, no collision ──── */}
      <AnimatePresence>
        {phase === "result" && endpoints && (
          <motion.div
            key="verdict-card"
            initial={reducedMotion ? false : { opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.7, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-30 mx-auto max-w-[420px] mb-6 sm:mb-8"
          >
            <div className="relative rounded-lg border border-line bg-raised/90 backdrop-blur-md px-5 py-3 flex items-center gap-4">
              {/* Cheapest pill mini */}
              <div className="font-mono text-[11px] text-signal tabular-nums whitespace-nowrap">
                ${endpoints.cheapestPrice}
              </div>
              {/* Connector with arrow */}
              <div className="flex-1 relative">
                <div className="h-px bg-gradient-to-r from-signal via-line to-overcharge" />
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
                  <div className="font-mono text-[8px] uppercase tracking-[0.22em] text-overcharge bg-raised px-2 inline-block">
                    +${endpoints.dearestPrice - endpoints.cheapestPrice} hidden premium
                  </div>
                </div>
              </div>
              {/* Dearest pill mini */}
              <div className="font-mono text-[11px] text-overcharge tabular-nums whitespace-nowrap">
                ${endpoints.dearestPrice}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Stage ───────────────────────────────────────────────────── */}
      <div
        ref={stageRef}
        className="relative mx-auto max-w-[1080px] h-[82vh] min-h-[620px] sm:min-h-[680px]"
      >
        {/* Cursor halo */}
        {!reducedMotion && (
          <AnimatePresence>
            {cursorInside && (
              <motion.div
                key="cursor-halo"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                style={{
                  position: "absolute",
                  left: cursorHaloX,
                  top:  cursorHaloY,
                  width: 360,
                  height: 360,
                  marginLeft: -180,
                  marginTop:  -180,
                  pointerEvents: "none",
                  willChange: "transform",
                  background:
                    "radial-gradient(circle, rgba(0,217,122,0.22) 0%, rgba(0,217,122,0.08) 30%, transparent 70%)",
                  borderRadius: "50%",
                  filter: "blur(10px)",
                }}
                className="z-[5]"
              />
            )}
          </AnimatePresence>
        )}

        {/* SVG strand layer — spider-web, brighter */}
        <motion.svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          viewBox={`-${cx} -${cy} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
          style={reducedMotion ? {} : { x: parallaxStrandsX, y: parallaxStrandsY }}
        >
          <defs>
            {(Object.keys(AXIS_COLOR) as Axis[]).map((axis) => {
              const c = AXIS_COLOR[axis];
              return (
                <linearGradient key={axis} id={`web-${axis}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="rgba(225,232,245,0.55)" />
                  <stop offset="100%" stopColor={c.core} stopOpacity="0.5" />
                </linearGradient>
              );
            })}
          </defs>

          {AGENTS.map((a, i) => (
            <Strand
              key={a.i}
              agent={a}
              target={positions[i].deploy}
              hovered={hoveredIdx === a.i}
              phase={phase}
              strandActive={strandActive}
              cursorRepX={cursorRepX}
              cursorRepY={cursorRepY}
              reducedMotion={!!reducedMotion}
            />
          ))}

          {/* Endpoint connector — visual link between cheapest ↔ dearest */}
          {connector && (
            <motion.path
              d={connector}
              fill="none"
              stroke="url(#endpoint-gradient)"
              strokeWidth={1.2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={phase === "result"
                ? { pathLength: 1, opacity: 0.7 }
                : { pathLength: 0, opacity: 0 }}
              transition={{
                pathLength: { duration: 1, delay: 0.55, ease: [0.22, 1, 0.36, 1] },
                opacity:    { duration: 0.5, delay: 0.55 },
              }}
            />
          )}
          <defs>
            <linearGradient id="endpoint-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#00d97a" stopOpacity="0.85" />
              <stop offset="50%"  stopColor="#e8eaed" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ff5d6c" stopOpacity="0.85" />
            </linearGradient>
          </defs>
        </motion.svg>

        {/* Agent + label layer */}
        <motion.div
          className="absolute inset-0 z-10"
          style={reducedMotion ? {} : { x: parallaxNodesX, y: parallaxNodesY }}
        >
          {AGENTS.map((a, i) => (
            <AgentNode
              key={a.i}
              agent={a}
              phase={phase}
              idle={positions[i].idle}
              deploy={positions[i].deploy}
              cx={cx}
              cy={cy}
              reducedMotion={!!reducedMotion}
              depth={depthFactor(positions[i].deploy)}
              isHovered={hoveredIdx === a.i}
              onHoverChange={(h) => setHoveredIdx(h ? a.i : (cur) => (cur === a.i ? null : cur))}
              cursorRepX={cursorRepX}
              cursorRepY={cursorRepY}
            />
          ))}

          {/* Cluster labels */}
          {stage.w > 0 &&
            (Object.keys(CLUSTER_ANGLE) as Axis[]).map((axis) => {
              const angle = CLUSTER_ANGLE[axis] + rotationOffset;
              const r = Math.min(stage.w * 0.40, stage.h * 0.50) + 38;
              const lx = cx + Math.cos(angle) * r;
              const ly = cy + Math.sin(angle) * r * 0.78;
              const target =
                phase === "idle"  ? 0.32 :
                phase === "focus" ? 0.72 :
                                    0.85;
              const c = AXIS_COLOR[axis];
              return (
                <motion.div
                  key={axis}
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: target, scale: 1 }}
                  transition={{
                    duration: 0.7,
                    delay: phase === "deploy" ? CLUSTER_DELAY[axis] : 0,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    position: "absolute",
                    left: lx,
                    top: ly,
                    transform: "translate(-50%, -50%)",
                  }}
                  className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] whitespace-nowrap pointer-events-none"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: c.core, boxShadow: `0 0 8px ${c.glow}` }}
                  />
                  <span style={{ color: c.core, opacity: 0.85 }}>{CLUSTER_LABEL[axis]}</span>
                </motion.div>
              );
            })}
        </motion.div>

        {/* Center stack: masthead, headline, premium input */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-7 flex items-center gap-3"
          >
            <span className="text-secondary">JACOBI</span>
            <span aria-hidden className="h-2.5 w-px bg-line" />
            <span>pricing forensics</span>
          </motion.div>

          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-[34px] sm:text-5xl lg:text-[64px] leading-[1.0] tracking-tight text-primary text-center mb-8 max-w-[640px]"
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

          {/* Premium URL input */}
          <PremiumInput
            url={url}
            setUrl={setUrl}
            onSubmit={submit}
            inputRef={inputRef}
            phase={phase}
            focused={inputFocused}
            setFocused={setInputFocused}
            reducedMotion={!!reducedMotion}
          />

          {/* Trust line / verdict caption */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted min-h-[20px]">
            <AnimatePresence mode="wait">
              {phase === "result" ? (
                <motion.div
                  key="verdict-caption"
                  initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="flex flex-wrap items-center justify-center gap-x-3"
                >
                  <span className="text-overcharge tracking-wide">Same flight.</span>
                  <span className="text-overcharge/70">Same seat.</span>
                  <span className="text-overcharge tracking-wide">Different identity.</span>
                </motion.div>
              ) : (
                <motion.div
                  key="trust"
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-wrap items-center justify-center gap-x-3"
                >
                  <span className="text-secondary">Bright Data</span>
                  <span className="text-muted/40">&middot;</span>
                  <span>24 profile probes</span>
                  <span className="text-muted/40">&middot;</span>
                  <span>Evidence-backed verdict</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Replay chip */}
        <AnimatePresence>
          {phase === "result" && !reducedMotion && (
            <motion.button
              key="replay"
              type="button"
              onClick={replay}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 z-30 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line bg-raised/80 backdrop-blur-sm text-[10px] font-mono uppercase tracking-[0.18em] text-secondary hover:text-primary hover:border-signal/50 transition-colors"
              aria-label="Replay scene"
            >
              <RotateCcw className="w-3 h-3" />
              Replay scene
            </motion.button>
          )}
        </AnimatePresence>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: phase === "result" ? 0.55 : 0 }}
          transition={{ duration: 0.7, delay: 1.0 }}
          className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 z-30 font-mono text-[10px] uppercase tracking-[0.2em] text-muted"
        >
          UA182 &middot; JFK&rarr;LHR &middot; live sample
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Premium input box ────────────────────────────────────────────── */

function PremiumInput({
  url,
  setUrl,
  onSubmit,
  inputRef,
  phase,
  focused,
  setFocused,
  reducedMotion,
}: {
  url: string;
  setUrl: (s: string) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  phase: Phase;
  focused: boolean;
  setFocused: (f: boolean) => void;
  reducedMotion: boolean;
}) {
  // Reveal-stronger border ring when focused or during cinematic
  const ringActive = focused || phase !== "idle";

  return (
    <motion.form
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.25 }}
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="w-full max-w-2xl pointer-events-auto relative"
    >
      {/* Animated gradient border halo behind input */}
      <motion.div
        aria-hidden
        animate={{
          opacity: ringActive ? 1 : 0.4,
          scale:   focused   ? 1.015 : 1,
        }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background:
            "linear-gradient(110deg, rgba(0,217,122,0.45) 0%, rgba(34,211,238,0.25) 35%, rgba(167,139,250,0.25) 65%, rgba(255,93,108,0.45) 100%)",
          filter: "blur(12px)",
          transform: "translate3d(0,0,0)",
        }}
      />

      {/* Ground halo */}
      <motion.span
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{
          opacity: phase === "idle" ? 0 : phase === "focus" ? 0.5 : 0.7,
        }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="pointer-events-none absolute inset-x-6 -bottom-6 h-16 rounded-full blur-2xl [background:radial-gradient(50%_50%_at_50%_0%,rgba(0,217,122,0.55),transparent_70%)]"
      />

      {/* Input surface */}
      <div className="relative bg-ink/95 backdrop-blur-md rounded-xl border border-line">
        {/* Corner tick marks — appear on focus */}
        {[
          { pos: "top-0 left-0",    rot: "rotate-0",    translate: "" },
          { pos: "top-0 right-0",   rot: "rotate-90",   translate: "" },
          { pos: "bottom-0 right-0",rot: "rotate-180",  translate: "" },
          { pos: "bottom-0 left-0", rot: "-rotate-90",  translate: "" },
        ].map((t, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={false}
            animate={{ opacity: ringActive ? 1 : 0 }}
            transition={{ duration: 0.4 }}
            className={`pointer-events-none absolute w-3 h-3 ${t.pos} ${t.rot}`}
            style={{
              borderTop:  "1px solid rgba(0, 217, 122, 0.6)",
              borderLeft: "1px solid rgba(0, 217, 122, 0.6)",
              margin: 2,
            }}
          />
        ))}

        <div className="flex items-stretch">
          <span className="flex items-center pl-5 pr-3 text-signal/70 shrink-0">
            <Globe className="w-4 h-4" />
          </span>
          <input
            id="jacobi-probe-input"
            ref={inputRef}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={()  => setFocused(false)}
            placeholder="Paste a flight, hotel, or product URL"
            aria-label="Paste a URL to probe"
            className="flex-1 bg-transparent py-5 sm:py-6 pr-2 text-primary placeholder-muted/70 outline-none text-base sm:text-[17px] font-mono caret-signal min-w-0 tracking-tight"
          />
          <motion.button
            type="submit"
            whileHover={reducedMotion ? undefined : { scale: 1.03 }}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            animate={{
              filter:
                phase === "result" || phase === "idle"
                  ? "saturate(1) brightness(1)"
                  : "saturate(0.7) brightness(0.95)",
            }}
            transition={{ duration: 0.5 }}
            className="relative m-2 inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg bg-signal text-ink font-mono text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.18em] hover:brightness-110 active:scale-[0.98] transition-[transform,filter] shrink-0 shadow-[0_0_24px_rgba(0,217,122,0.35)]"
          >
            <span>Probe</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>
    </motion.form>
  );
}

/* ─── Strand — curved bezier with cluster tint + repulsion ─────────── */

function Strand({
  agent,
  target,
  hovered,
  phase,
  strandActive,
  cursorRepX,
  cursorRepY,
  reducedMotion,
}: {
  agent: Agent;
  target: Pt;
  hovered: boolean;
  phase: Phase;
  strandActive: boolean;
  cursorRepX: MotionValue<number>;
  cursorRepY: MotionValue<number>;
  reducedMotion: boolean;
}) {
  // Compute repulsion-warped target via useTransform so the strand
  // endpoint follows the node when it pushes away from cursor
  const dx = useTransform([cursorRepX, cursorRepY], ([cx, cy]) => {
    if (reducedMotion) return 0;
    const off = repulsionOffset(target, { x: cx as number, y: cy as number });
    return off.x;
  });
  const dy = useTransform([cursorRepX, cursorRepY], ([cx, cy]) => {
    if (reducedMotion) return 0;
    const off = repulsionOffset(target, { x: cx as number, y: cy as number });
    return off.y;
  });
  const d = useTransform([dx, dy], ([ox, oy]) => {
    const t = { x: target.x + (ox as number), y: target.y + (oy as number) };
    return strandPath({ x: 0, y: INPUT_BOTTOM_OFFSET }, t);
  });

  const color = AXIS_COLOR[agent.axis];

  let stroke = `url(#web-${agent.axis})`;
  let strokeWidth = 0.9;
  let opacity = 0.7;

  if (phase === "result") {
    if (agent.role === "cheapest") {
      stroke = "rgba(0, 217, 122, 0.92)";
      strokeWidth = 1.8;
      opacity = 1;
    } else if (agent.role === "dearest") {
      stroke = "rgba(255, 93, 108, 0.92)";
      strokeWidth = 1.8;
      opacity = 1;
    } else {
      stroke = `url(#web-${agent.axis})`;
      opacity = 0.55;
    }
  } else if (hovered) {
    stroke = color.core;
    strokeWidth = 1.6;
    opacity = 1;
  }

  return (
    <motion.path
      d={d as unknown as string}
      fill="none"
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={strandActive
        ? { pathLength: 1, opacity }
        : { pathLength: 0, opacity: 0 }}
      transition={{
        pathLength: {
          duration: 0.9,
          delay: phase === "deploy" ? CLUSTER_DELAY[agent.axis] : 0,
          ease: [0.22, 1, 0.36, 1],
        },
        opacity:     { duration: 0.5 },
        stroke:      { duration: 0.6 },
        strokeWidth: { duration: 0.6 },
      }}
      stroke={stroke}
      strokeWidth={strokeWidth}
      style={{ filter: hovered ? `drop-shadow(0 0 6px ${color.glow})` : undefined }}
    />
  );
}

/* ─── Agent node — glowy, color-tinted, repulsive ─────────────────── */

function AgentNode({
  agent,
  phase,
  idle,
  deploy,
  cx,
  cy,
  reducedMotion,
  depth,
  isHovered,
  onHoverChange,
  cursorRepX,
  cursorRepY,
}: {
  agent: Agent;
  phase: Phase;
  idle: Pt;
  deploy: Pt;
  cx: number;
  cy: number;
  reducedMotion: boolean;
  depth: number;
  isHovered: boolean;
  onHoverChange: (h: boolean) => void;
  cursorRepX: MotionValue<number>;
  cursorRepY: MotionValue<number>;
}) {
  const isDeployed = phase === "deploy" || phase === "result";
  const pos = isDeployed ? deploy : idle;
  const showPrice = phase === "result" && agent.price !== null;
  const showLabel = isDeployed && !showPrice;
  const isEndpoint = phase === "result" && (agent.role === "cheapest" || agent.role === "dearest");
  const color = AXIS_COLOR[agent.axis];

  // Repulsion offset — purely visual, doesn't fight Framer's tween
  const repX = useTransform([cursorRepX, cursorRepY], ([mx, my]) => {
    if (reducedMotion) return 0;
    return repulsionOffset(pos, { x: mx as number, y: my as number }).x;
  });
  const repY = useTransform([cursorRepX, cursorRepY], ([mx, my]) => {
    if (reducedMotion) return 0;
    return repulsionOffset(pos, { x: mx as number, y: my as number }).y;
  });

  /* Sizing */
  let sizeCls = "w-[8px] h-[8px] sm:w-[10px] sm:h-[10px]";
  if (showPrice) {
    sizeCls = isEndpoint
      ? "min-w-[68px] sm:min-w-[78px] h-[32px] sm:h-[36px] px-3"
      : "min-w-[50px] sm:min-w-[58px] h-[24px] sm:h-[26px] px-2.5";
  }

  /* Bubble styling — glowy with cluster color */
  let bubbleStyle: React.CSSProperties = {
    transform: "translate(-50%, -50%)",
    backgroundColor: color.soft,
    borderColor: `${color.core}50`,
    boxShadow: `0 0 12px ${color.glow}, inset 0 0 4px ${color.soft}`,
  };
  let textColor: string | undefined;

  if (phase === "idle") {
    bubbleStyle.opacity = 0.55;
    bubbleStyle.boxShadow = `0 0 6px ${color.soft}`;
  } else if (phase === "focus") {
    bubbleStyle.opacity = 0.85;
    bubbleStyle.boxShadow = `0 0 10px ${color.glow}`;
  } else if (isDeployed && !showPrice) {
    bubbleStyle.backgroundColor = "rgba(12, 14, 19, 0.9)";
    bubbleStyle.borderColor = color.core;
    bubbleStyle.boxShadow = `0 0 14px ${color.glow}, inset 0 0 6px ${color.soft}`;
  }
  if (showPrice) {
    if (agent.role === "cheapest") {
      bubbleStyle.backgroundColor = "#00d97a";
      bubbleStyle.borderColor = "#00d97a";
      bubbleStyle.boxShadow = "0 0 32px rgba(0, 217, 122, 0.65), 0 0 12px rgba(0, 217, 122, 0.45)";
      textColor = "#07080c";
    } else if (agent.role === "dearest") {
      bubbleStyle.backgroundColor = "#ff5d6c";
      bubbleStyle.borderColor = "#ff5d6c";
      bubbleStyle.boxShadow = "0 0 32px rgba(255, 93, 108, 0.65), 0 0 12px rgba(255, 93, 108, 0.45)";
      textColor = "#07080c";
    } else {
      bubbleStyle.backgroundColor = "rgba(12, 14, 19, 0.95)";
      bubbleStyle.borderColor = `${color.core}80`;
      bubbleStyle.boxShadow = `0 0 16px ${color.glow}`;
      textColor = color.core;
    }
  }
  if (isHovered && !showPrice) {
    bubbleStyle.boxShadow = `0 0 22px ${color.core}, 0 0 8px ${color.glow}`;
  }

  /* Stagger */
  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const deployDelay =
    phase === "deploy"
      ? CLUSTER_DELAY[agent.axis] + idxInCluster * 0.05
      : 0;

  const baseOpacity =
    phase === "idle"  ? 0.6 :
    phase === "focus" ? 0.85 :
                        1;
  const targetOpacity = Math.max(0.55, baseOpacity * depth);

  return (
    <motion.div
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      initial={
        reducedMotion
          ? false
          : { x: cx + idle.x, y: cy + idle.y, opacity: 0, scale: 0.6 }
      }
      animate={{
        x: cx + pos.x,
        y: cy + pos.y,
        opacity: targetOpacity,
        scale: isHovered ? 1.28 : 1,
      }}
      transition={{
        x:       { duration: 1.1, delay: deployDelay, ease: [0.22, 1, 0.36, 1] },
        y:       { duration: 1.1, delay: deployDelay, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.5 },
        scale:   { duration: 0.3 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className="pointer-events-auto cursor-pointer"
    >
      {/* Repulsion layer — visual offset away from cursor without
          fighting the base position animation */}
      <motion.div style={{ x: repX, y: repY, willChange: "transform" }}>
        {/* Breath */}
        <motion.div
          animate={
            isEndpoint
              ? { scale: [1, 1.05, 1] }
              : phase === "idle" || phase === "focus"
                ? { scale: [1, 1.10, 1] }
                : { scale: [1, 1.05, 1] }
          }
          transition={{
            duration: 2.4 + (agent.i % 6) * 0.35,
            repeat: Infinity,
            ease: "easeInOut",
            delay: (agent.i % 9) * 0.18,
          }}
          className={`flex items-center justify-center rounded-full border transition-colors duration-300 ${sizeCls}`}
          style={bubbleStyle}
        >
          {showPrice && (
            <span
              className={
                isEndpoint
                  ? "font-mono text-[12px] sm:text-[13px] font-semibold tabular-nums whitespace-nowrap"
                  : "font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap"
              }
              style={textColor ? { color: textColor } : undefined}
            >
              ${agent.price}
            </span>
          )}
        </motion.div>

        {/* Label */}
        <AnimatePresence>
          {showLabel && (
            <motion.span
              key="label"
              initial={reducedMotion ? false : { opacity: 0, y: -2 }}
              animate={{ opacity: isHovered ? 1 : 0.65, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.4,
                delay: phase === "deploy" ? 0.5 + idxInCluster * 0.025 : 0,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                position: "absolute",
                top: 14,
                left: 0,
                transform: "translate(-50%, 0)",
                color: isHovered ? color.core : "#5b6270",
                textShadow: isHovered ? `0 0 6px ${color.glow}` : undefined,
              }}
              className="font-mono text-[8px] sm:text-[9px] whitespace-nowrap pointer-events-none transition-colors"
            >
              {agent.label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
