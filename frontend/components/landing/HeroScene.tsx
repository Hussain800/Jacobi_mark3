"use client";

/**
 * HeroScene — Phase 5: the landing centerpiece is alive.
 *
 * Phases:
 *   idle   → 24 nodes pre-clustered in 5 visible groups, dim, BREATHING
 *   focus  → input picks up signal halo, nodes wake
 *   deploy → cluster-staggered radial pulse fans agents outward
 *   result → priced pills + bracket + verdict; rotation + breath continue
 *
 * Phase 5 additions vs Phase 2:
 *   • Perpetual gentle rotation (0.0006 rad / 50 ms ≈ 35 s full revolution)
 *     that continues in ALL phases — the swarm is never frozen.
 *   • Per-node breath — each node has its own oscillation phase + period,
 *     so the cluster looks like 24 micro-organisms, not synchronized dots.
 *   • Curved bezier strands (organic, not straight rays).
 *   • Depth opacity — back of orbital plane fades for 2.5D effect.
 *   • 2.5D parallax — cluster anchors drift slightly with mouse position.
 *   • Cursor halo — a soft signal-tinted radial gradient follows the
 *     mouse. Nodes near the cursor brighten and grow.
 *   • Hover responsiveness — hovering a node scales + glows it, thickens
 *     its strand, and dims peers slightly.
 *   • Verdict layout fixed — the "+$142" sits in a compact bracket
 *     BETWEEN the endpoint pills; verbose caption moved BELOW the input
 *     so it no longer collides with the headline.
 *
 * Routes to /chat?url=<encoded> on submit. Reduced-motion: jumps to
 * result, suspends rotation/parallax/cursor effects.
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
} from "framer-motion";
import { ArrowRight, Globe, RotateCcw } from "lucide-react";

/* ─── Constants ────────────────────────────────────────────────────── */

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

/**
 * 24 agents. Location cluster ordered so cheapest (IOWA) lands at the
 * far-left tangent and dearest (NYC) at the far-right tangent — the two
 * become the visible endpoints of the spread.
 */
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

/* ─── Position math ────────────────────────────────────────────────── */

function idlePos(agent: Agent, stage: { w: number; h: number }, rot: number) {
  const anchorAngle = CLUSTER_ANGLE[agent.axis] + rot;
  const idleR = Math.min(stage.w * 0.16, stage.h * 0.20);
  const ax = Math.cos(anchorAngle) * idleR;
  const ay = Math.sin(anchorAngle) * idleR * 0.78;

  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const tight =
    n === 1
      ? 0
      : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
        Math.min(stage.w * 0.045, 32);

  return {
    x: ax + Math.cos(tangentAngle) * tight,
    y: ay + Math.sin(tangentAngle) * tight * 0.85,
  };
}

function deployPos(agent: Agent, stage: { w: number; h: number }, rot: number) {
  const anchorAngle = CLUSTER_ANGLE[agent.axis] + rot;
  const anchorR = Math.min(stage.w * 0.40, stage.h * 0.50);
  const ax = Math.cos(anchorAngle) * anchorR;
  const ay = Math.sin(anchorAngle) * anchorR * 0.78;

  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const spread =
    n === 1
      ? 0
      : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
        Math.min(stage.w * 0.16, 120);

  return {
    x: ax + Math.cos(tangentAngle) * spread,
    y: ay + Math.sin(tangentAngle) * spread * 0.85,
  };
}

/**
 * Curved bezier strand path — origin is the input bottom edge, target is
 * the agent's deploy position. The control point is offset perpendicular
 * so adjacent strands bow in opposing directions.
 */
function strandPath(origin: { x: number; y: number }, target: { x: number; y: number }) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const angle = Math.atan2(dy, dx);
  const length = Math.hypot(dx, dy);
  const perp = angle + Math.PI / 2;
  const bow = Math.min(length * 0.14, 36);
  const midX = origin.x + dx * 0.5 + Math.cos(perp) * bow;
  const midY = origin.y + dy * 0.5 + Math.sin(perp) * bow;
  return `M ${origin.x} ${origin.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
}

/** Depth opacity by angle — back of the plane fades, front is bright. */
function depthFactor(target: { x: number; y: number }) {
  const angle = Math.atan2(target.y, target.x);
  return 0.7 + 0.3 * ((1 + Math.sin(angle)) / 2);
}

/* ─── Component ────────────────────────────────────────────────────── */

const INPUT_BOTTOM_OFFSET = 36;

export default function HeroScene() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 960, h: 640 });
  const [runKey, setRunKey] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [rotationOffset, setRotationOffset] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Mouse-tracked motion values.
   *
   * - mouseNormX/Y are normalized -1..1 (stage center = 0) — used for
   *   parallax.
   * - cursorPxX/Y are raw pixel coords inside the stage — used to position
   *   the cursor halo. Spring smoothing on both keeps response weighty.
   */
  const mouseNormX = useMotionValue(0);
  const mouseNormY = useMotionValue(0);
  const cursorPxX  = useMotionValue(0);
  const cursorPxY  = useMotionValue(0);
  const cursorHaloX = useSpring(cursorPxX, { stiffness: 120, damping: 22 });
  const cursorHaloY = useSpring(cursorPxY, { stiffness: 120, damping: 22 });

  /* Parallax converts normalized -1..1 to pixel offsets via useTransform
     so the motion values update reactively in style props. */
  const PARALLAX_NODES   = 14;
  const PARALLAX_STRANDS = 7;
  const parallaxNodesXRaw   = useTransform(mouseNormX, (v) => v * PARALLAX_NODES);
  const parallaxNodesYRaw   = useTransform(mouseNormY, (v) => v * PARALLAX_NODES);
  const parallaxStrandsXRaw = useTransform(mouseNormX, (v) => v * PARALLAX_STRANDS);
  const parallaxStrandsYRaw = useTransform(mouseNormY, (v) => v * PARALLAX_STRANDS);
  const parallaxNodesX   = useSpring(parallaxNodesXRaw,   { stiffness: 60, damping: 20 });
  const parallaxNodesY   = useSpring(parallaxNodesYRaw,   { stiffness: 60, damping: 20 });
  const parallaxStrandsX = useSpring(parallaxStrandsXRaw, { stiffness: 60, damping: 20 });
  const parallaxStrandsY = useSpring(parallaxStrandsYRaw, { stiffness: 60, damping: 20 });

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

  /* Phase timeline — driven by runKey so Replay restarts cleanly */
  useEffect(() => {
    if (reducedMotion) {
      setPhase("result");
      return;
    }
    setPhase("idle");
    const t1 = setTimeout(() => setPhase("focus"), 1200);
    const t2 = setTimeout(() => setPhase("deploy"), 2400);
    const t3 = setTimeout(() => setPhase("result"), 4600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [reducedMotion, runKey]);

  /* Perpetual gentle rotation — the heartbeat of the swarm.
     Continues across ALL phases including result. Halts on reduced motion. */
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setRotationOffset((prev) => (prev + 0.0006) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(id);
  }, [reducedMotion]);

  /* Mouse tracking — drives cursor halo + cluster parallax */
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
      const nx = (px - rect.width / 2) / (rect.width / 2);
      const ny = (py - rect.height / 2) / (rect.height / 2);
      mouseNormX.set(nx);
      mouseNormY.set(ny);
    };
    const enter = () => setCursorInside(true);
    const leave = () => {
      setCursorInside(false);
      mouseNormX.set(0);
      mouseNormY.set(0);
    };
    el.addEventListener("mousemove", handle);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", handle);
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    };
  }, [mouseNormX, mouseNormY, cursorPxX, cursorPxY, reducedMotion]);

  /* Pre-compute positions including current rotation */
  const positions = useMemo(
    () =>
      AGENTS.map((a) => ({
        idle:   idlePos(a, stage, rotationOffset),
        deploy: deployPos(a, stage, rotationOffset),
      })),
    [stage, rotationOffset],
  );

  /* Endpoint pill positions (used by verdict bracket) */
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
    if (!raw) {
      inputRef.current?.focus();
      return;
    }
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

  /**
   * Bracket geometry — a clean horizontal line connecting the two
   * endpoint pills, with a small gap in the middle for the "+$142" label.
   * Sits ABOVE the pills (pushed away from the headline), drawn as two
   * separate SVG paths so the label has breathing room.
   */
  const bracket = useMemo(() => {
    if (!endpoints) return null;
    const yOffset = -36; // negative = above the pills (away from headline)
    const aX = endpoints.cheapest.x;
    const bX = endpoints.dearest.x;
    const yA = endpoints.cheapest.y + yOffset;
    const yB = endpoints.dearest.y  + yOffset;
    const midX = (aX + bX) / 2;
    const midY = (yA + yB) / 2;
    const labelGap = 70;

    const left  = `M ${aX} ${endpoints.cheapest.y - 14} L ${aX} ${yA} L ${midX - labelGap / 2} ${midY}`;
    const right = `M ${bX} ${endpoints.dearest.y  - 14} L ${bX} ${yB} L ${midX + labelGap / 2} ${midY}`;
    return { left, right, midX, midY };
  }, [endpoints]);

  return (
    <section
      id="jacobi-hero"
      className="relative isolate overflow-hidden px-5 sm:px-8 pt-12 sm:pt-16 pb-10"
      aria-label="JACOBI hero scene"
    >
      {/* Ambient top light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(0,217,122,0.05),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_60%,rgba(0,0,0,0.45))]"
      />

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative mx-auto max-w-[1080px] h-[88vh] min-h-[680px] sm:min-h-[720px]"
      >
        {/* Cursor halo — soft signal-tinted glow following the mouse.
            Spring-smoothed for weight. Only renders when cursor is inside. */}
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
                  width: 320,
                  height: 320,
                  marginLeft: -160,
                  marginTop:  -160,
                  pointerEvents: "none",
                  willChange: "transform",
                  background:
                    "radial-gradient(circle, rgba(0,217,122,0.20) 0%, rgba(0,217,122,0.07) 32%, transparent 68%)",
                  borderRadius: "50%",
                  filter: "blur(8px)",
                }}
                className="z-[5]"
              />
            )}
          </AnimatePresence>
        )}

        {/* SVG strand layer — curved bezier paths with parallax */}
        <motion.svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          viewBox={`-${cx} -${cy} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
          style={reducedMotion ? {} : { x: parallaxStrandsX, y: parallaxStrandsY }}
        >
          {AGENTS.map((a, i) => {
            const target = positions[i].deploy;
            const path = strandPath({ x: 0, y: INPUT_BOTTOM_OFFSET }, target);

            // Strand styling by phase + role + hover
            let stroke = "rgba(155, 161, 173, 0.22)";
            let strokeWidth = 0.7;
            let opacity = 0.6;

            if (phase === "result") {
              if (a.role === "cheapest") {
                stroke = "rgba(0, 217, 122, 0.85)";
                strokeWidth = 1.6;
                opacity = 1;
              } else if (a.role === "dearest") {
                stroke = "rgba(255, 93, 108, 0.85)";
                strokeWidth = 1.6;
                opacity = 1;
              } else {
                stroke = "rgba(155, 161, 173, 0.16)";
                opacity = 0.45;
              }
            } else if (hoveredIdx === a.i) {
              stroke = "rgba(0, 217, 122, 0.7)";
              strokeWidth = 1.4;
              opacity = 0.95;
            }

            return (
              <motion.path
                key={a.i}
                d={path}
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  strandActive
                    ? { pathLength: 1, opacity }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{
                  pathLength: {
                    duration: 0.9,
                    delay: phase === "deploy" ? CLUSTER_DELAY[a.axis] : 0,
                    ease: [0.22, 1, 0.36, 1],
                  },
                  opacity: { duration: 0.5 },
                  stroke: { duration: 0.6 },
                  strokeWidth: { duration: 0.6 },
                }}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            );
          })}

          {/* Verdict bracket — only on result */}
          {bracket && (
            <g>
              <motion.path
                d={bracket.left}
                fill="none"
                stroke="rgba(0, 217, 122, 0.6)"
                strokeWidth={1}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  phase === "result"
                    ? { pathLength: 1, opacity: 1 }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{
                  pathLength: { duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] },
                  opacity:    { duration: 0.5, delay: 0.5 },
                }}
              />
              <motion.path
                d={bracket.right}
                fill="none"
                stroke="rgba(255, 93, 108, 0.6)"
                strokeWidth={1}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  phase === "result"
                    ? { pathLength: 1, opacity: 1 }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{
                  pathLength: { duration: 0.9, delay: 0.55, ease: [0.22, 1, 0.36, 1] },
                  opacity:    { duration: 0.5, delay: 0.55 },
                }}
              />
            </g>
          )}
        </motion.svg>

        {/* Agent + cluster-label layer — parallax-shifted wrapper */}
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
            />
          ))}

          {/* Cluster labels — readable from focus phase onward */}
          {stage.w > 0 &&
            (Object.keys(CLUSTER_ANGLE) as Axis[]).map((axis) => {
              const angle = CLUSTER_ANGLE[axis] + rotationOffset;
              const r = Math.min(stage.w * 0.40, stage.h * 0.50) + 36;
              const lx = cx + Math.cos(angle) * r;
              const ly = cy + Math.sin(angle) * r * 0.78;
              const target =
                phase === "idle"  ? 0.32 :
                phase === "focus" ? 0.72 :
                                    0.85;
              return (
                <motion.div
                  key={axis}
                  initial={
                    reducedMotion
                      ? false
                      : { opacity: 0, scale: 0.92 }
                  }
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
                  className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary whitespace-nowrap pointer-events-none"
                >
                  <span className="w-1 h-1 rounded-full bg-secondary/55" />
                  {CLUSTER_LABEL[axis]}
                </motion.div>
              );
            })}
        </motion.div>

        {/* Verdict numeral — floats in the bracket gap */}
        {bracket && (
          <AnimatePresence>
            {phase === "result" && (
              <motion.div
                key="verdict-num"
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.7,
                  delay: 1.0,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  position: "absolute",
                  left: cx + bracket.midX,
                  top:  cy + bracket.midY,
                  transform: "translate(-50%, -50%)",
                }}
                className="z-15 text-center pointer-events-none"
              >
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-overcharge mb-1 whitespace-nowrap">
                  Hidden premium
                </div>
                <div className="font-serif text-3xl sm:text-4xl text-primary leading-none tabular-nums">
                  +$142
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Center stack: masthead, headline, input */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4">
          {/* Masthead */}
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

          {/* Headline */}
          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1],
            }}
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

          {/* URL input — the command core */}
          <motion.form
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="w-full max-w-xl pointer-events-auto relative"
          >
            <motion.span
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{
                opacity: phase === "idle" ? 0 : phase === "focus" ? 0.5 : 0.7,
              }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="pointer-events-none absolute inset-x-6 -bottom-6 h-16 rounded-full blur-2xl [background:radial-gradient(50%_50%_at_50%_0%,rgba(0,217,122,0.55),transparent_70%)]"
            />

            <motion.div
              animate={
                phase === "idle"
                  ? { boxShadow: "0 0 0 0 rgba(0,217,122,0)" }
                  : {
                      boxShadow:
                        "0 0 0 1px rgba(0,217,122,0.35), 0 0 60px rgba(0,217,122,0.10)",
                    }
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="group relative flex items-stretch bg-raised border border-line rounded-md focus-within:border-signal/55 transition-colors"
            >
              <span className="flex items-center pl-4 sm:pl-5 pr-2 sm:pr-3 text-muted shrink-0">
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
                placeholder="Paste a flight, hotel, or product URL"
                aria-label="Paste a URL to probe"
                className="flex-1 bg-transparent py-4 sm:py-5 pr-2 text-primary placeholder-muted/70 outline-none text-sm sm:text-base font-mono caret-signal min-w-0"
              />
              <motion.button
                type="submit"
                animate={{
                  filter:
                    phase === "result" || phase === "idle"
                      ? "saturate(1) brightness(1)"
                      : "saturate(0.65) brightness(0.92)",
                }}
                transition={{ duration: 0.6 }}
                className="m-1.5 sm:m-2 inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md bg-signal text-ink font-mono text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.12em] hover:brightness-110 active:scale-[0.98] transition-[transform,filter] shrink-0"
              >
                Probe
                <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
            </motion.div>

            {/* Trust micro-line — on result, swaps in the verdict caption.
                Solves the "Same flight. Same seat. Different identity"
                collision with the headline by moving it below the input. */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted min-h-[20px]">
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
          </motion.form>
        </div>

        {/* Replay scene chip — only after result */}
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

        {/* Sample attribution */}
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

/* ─── Agent node — alive, hover-responsive ─────────────────────────── */

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
}: {
  agent: Agent;
  phase: Phase;
  idle: { x: number; y: number };
  deploy: { x: number; y: number };
  cx: number;
  cy: number;
  reducedMotion: boolean;
  depth: number;
  isHovered: boolean;
  onHoverChange: (h: boolean) => void;
}) {
  const isDeployed = phase === "deploy" || phase === "result";
  const pos = isDeployed ? deploy : idle;
  const showPrice = phase === "result" && agent.price !== null;
  const showLabel = isDeployed && !showPrice;
  const isEndpoint =
    phase === "result" &&
    (agent.role === "cheapest" || agent.role === "dearest");

  /* Bubble styling */
  let bubble = "bg-secondary/25 border border-secondary/30";
  if (phase === "focus")  bubble = "bg-secondary/45 border border-secondary/45";
  if (isDeployed)         bubble = "bg-raised border border-line";
  if (showPrice) {
    if (agent.role === "cheapest")
      bubble = "bg-signal text-ink border border-signal shadow-[0_0_28px_rgba(0,217,122,0.45)]";
    else if (agent.role === "dearest")
      bubble = "bg-overcharge text-ink border border-overcharge shadow-[0_0_28px_rgba(255,93,108,0.45)]";
    else
      bubble = "bg-raised border border-secondary/45 text-secondary";
  }
  if (isHovered && !showPrice) {
    bubble = "bg-signal/40 border border-signal/60 shadow-[0_0_18px_rgba(0,217,122,0.4)]";
  }

  let sizeCls = "w-[6px] h-[6px] sm:w-[7px] sm:h-[7px]";
  if (showPrice) {
    if (isEndpoint) {
      sizeCls = "min-w-[68px] sm:min-w-[78px] h-[32px] sm:h-[36px] px-3";
    } else {
      sizeCls = "min-w-[50px] sm:min-w-[58px] h-[24px] sm:h-[26px] px-2.5";
    }
  }

  /* Stagger delay — per-cluster, with small intra-cluster offset */
  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const deployDelay =
    phase === "deploy"
      ? CLUSTER_DELAY[agent.axis] + idxInCluster * 0.05
      : 0;

  /* Base opacity blended with depth — never below 0.45 even at "back" */
  const baseOpacity =
    phase === "idle"   ? 0.55 :
    phase === "focus"  ? 0.80 :
                         1;
  const targetOpacity = Math.max(0.45, baseOpacity * depth);

  return (
    <motion.button
      type="button"
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
        scale: isHovered ? 1.25 : 1,
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
        scale:   { duration: 0.3 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className="pointer-events-auto cursor-pointer"
      tabIndex={-1}
    >
      {/* Per-node organic breath — different period per node so the swarm
          looks like 24 separate micro-organisms, not synchronized dots */}
      <motion.div
        layout={!reducedMotion}
        animate={
          isEndpoint
            ? { scale: [1, 1.06, 1] }
            : phase === "idle" || phase === "focus"
              ? { scale: [1, 1.08, 1] }
              : { scale: [1, 1.04, 1] }
        }
        transition={{
          duration: 2.4 + (agent.i % 6) * 0.35,
          repeat: Infinity,
          ease: "easeInOut",
          delay: (agent.i % 9) * 0.18,
        }}
        className={`flex items-center justify-center rounded-full transition-colors duration-300 ${bubble} ${sizeCls}`}
        style={{ transform: "translate(-50%, -50%)" }}
      >
        {showPrice && (
          <span
            className={
              isEndpoint
                ? "font-mono text-[12px] sm:text-[13px] font-semibold tabular-nums whitespace-nowrap"
                : "font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap"
            }
          >
            ${agent.price}
          </span>
        )}
      </motion.div>

      {/* Label below dots — brightens on hover */}
      <AnimatePresence>
        {showLabel && (
          <motion.span
            key="label"
            initial={reducedMotion ? false : { opacity: 0, y: -2 }}
            animate={{ opacity: isHovered ? 1 : 0.55, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.4,
              delay: phase === "deploy" ? 0.5 + idxInCluster * 0.025 : 0,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              position: "absolute",
              top: 12,
              left: 0,
              transform: "translate(-50%, 0)",
            }}
            className={`font-mono text-[8px] sm:text-[9px] whitespace-nowrap pointer-events-none transition-colors ${
              isHovered ? "text-signal" : "text-muted"
            }`}
          >
            {agent.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
