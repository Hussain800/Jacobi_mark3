"use client";

/**
 * HeroScene — the cinematic landing centerpiece (Phase 2).
 *
 * The whole landing story happens inside this stage:
 *   idle   → 24 nodes pre-clustered in 5 visible groups, dim
 *   focus  → input picks up signal-tinted ground halo, nodes wake
 *   deploy → cluster-staggered radial pulse fans agents outward,
 *            strands draw from the bottom edge of the input
 *   result → priced nodes morph to pills; the two endpoints
 *            (cheapest IOWA $498 ↔ dearest NYC $640) get their
 *            strands recolored signal/overcharge and thickened.
 *            A measurement bracket draws between them with the
 *            "+$142 hidden premium" verdict floating in its gap.
 *            A "↻ Replay scene" chip lets the user re-run the
 *            cinematic.
 *
 * Position math is single-source:
 *   idlePos(i)   — pre-grouped points anchored near each cluster
 *   deployPos(a) — cluster anchor + tangential spread within cluster
 *
 * Routes to /chat?url=<encoded> on submit. Bare hostnames get an
 * https:// prefix. Reduced-motion users jump straight to result.
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
 * 24 agents in 5 axes (7/7/3/4/3).
 *
 * Location cluster is intentionally ordered so the cheapest (IOWA)
 * lands at the far-left tangent and the dearest (NYC) at the far-right
 * tangent — they become the visible endpoints of the spread.
 */
const AGENTS: Agent[] = [
  // Location (7) — IOWA cheapest at left, NYC dearest at right
  { i: 0,  axis: "loc",    label: "IOWA",  price: 498, role: "cheapest" },
  { i: 1,  axis: "loc",    label: "SFO",   price: null },
  { i: 2,  axis: "loc",    label: "DXB",   price: null },
  { i: 3,  axis: "loc",    label: "LDN",   price: 590, role: "neutral" },
  { i: 4,  axis: "loc",    label: "MUM",   price: null },
  { i: 5,  axis: "loc",    label: "MS",    price: null },
  { i: 6,  axis: "loc",    label: "NYC",   price: 640, role: "dearest" },

  // Device (7)
  { i: 7,  axis: "dev",    label: "iPhn",  price: 620, role: "neutral" },
  { i: 8,  axis: "dev",    label: "Andr",  price: null },
  { i: 9,  axis: "dev",    label: "Mac",   price: null },
  { i: 10, axis: "dev",    label: "Cbk",   price: null },
  { i: 11, axis: "dev",    label: "Glx",   price: null },
  { i: 12, axis: "dev",    label: "iPad",  price: null },
  { i: 13, axis: "dev",    label: "SE",    price: null },

  // Cookies (3)
  { i: 14, axis: "cookie", label: "Aged",  price: 585, role: "neutral" },
  { i: 15, axis: "cookie", label: "Frsh",  price: null },
  { i: 16, axis: "cookie", label: "Plat",  price: null },

  // Referrer (4)
  { i: 17, axis: "ref",    label: "Kayak", price: null },
  { i: 18, axis: "ref",    label: "Dir",   price: null },
  { i: 19, axis: "ref",    label: "Sky",   price: null },
  { i: 20, axis: "ref",    label: "Dir·M", price: null },

  // Controls / network (3)
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

/**
 * Cluster anchor angle (radians from stage center).
 * loc on top, dev right, cookie bottom-right, ref bottom-left, ctrl top-left.
 */
const CLUSTER_ANGLE: Record<Axis, number> = {
  loc:    -Math.PI / 2,
  dev:     Math.PI * 0.20,
  cookie:  Math.PI * 0.58,
  ref:     Math.PI * 0.97,
  ctrl:   -Math.PI * 0.80,
};

/** Cluster deploy delay (s) — staggered so the 5 axes fire in sequence. */
const CLUSTER_DELAY: Record<Axis, number> = {
  loc:    0.00,
  dev:    0.25,
  cookie: 0.50,
  ref:    0.70,
  ctrl:   0.85,
};

/**
 * Strand origin offset — strands emerge from the bottom edge of the
 * URL input rather than the geometric center of the stage.
 */
const INPUT_BOTTOM_OFFSET = 36;

/* ─── Position math ────────────────────────────────────────────────── */

function idlePos(agent: Agent, stage: { w: number; h: number }) {
  // Pre-grouped: nodes idle NEAR their cluster anchor, tightly packed,
  // so the 5-axis structure is visible from frame 1.
  const anchorAngle = CLUSTER_ANGLE[agent.axis];
  const idleR = Math.min(stage.w * 0.18, stage.h * 0.22);
  const ax = Math.cos(anchorAngle) * idleR;
  const ay = Math.sin(anchorAngle) * idleR * 0.78;

  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const tightSpread =
    n === 1
      ? 0
      : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
        Math.min(stage.w * 0.05, 38);

  return {
    x: ax + Math.cos(tangentAngle) * tightSpread,
    y: ay + Math.sin(tangentAngle) * tightSpread * 0.85,
  };
}

function deployPos(agent: Agent, stage: { w: number; h: number }) {
  const anchorAngle = CLUSTER_ANGLE[agent.axis];
  const anchorR = Math.min(stage.w * 0.42, stage.h * 0.54);
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
        Math.min(stage.w * 0.18, 130);

  return {
    x: ax + Math.cos(tangentAngle) * spread,
    y: ay + Math.sin(tangentAngle) * spread * 0.85,
  };
}

/* ─── Strand styling by phase + role ───────────────────────────────── */

function strandStyle(agent: Agent, phase: Phase) {
  if (phase === "result") {
    if (agent.role === "cheapest") {
      return { stroke: "rgba(0, 217, 122, 0.85)", strokeWidth: 1.4, opacity: 1 };
    }
    if (agent.role === "dearest") {
      return { stroke: "rgba(255, 93, 108, 0.85)", strokeWidth: 1.4, opacity: 1 };
    }
    return { stroke: "rgba(155, 161, 173, 0.16)", strokeWidth: 0.5, opacity: 0.5 };
  }
  return { stroke: "rgba(155, 161, 173, 0.30)", strokeWidth: 0.7, opacity: 0.6 };
}

/* ─── Component ────────────────────────────────────────────────────── */

export default function HeroScene() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 960, h: 640 });
  const [runKey, setRunKey] = useState(0); // bumping replays the cinematic

  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Stage size — pre-paint then live */
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

  const positions = useMemo(
    () =>
      AGENTS.map((a) => ({
        idle:   idlePos(a, stage),
        deploy: deployPos(a, stage),
      })),
    [stage],
  );

  /* Resolved endpoint pill coordinates for the verdict bracket */
  const endpoints = useMemo(() => {
    const cheapest = AGENTS.find((a) => a.role === "cheapest");
    const dearest  = AGENTS.find((a) => a.role === "dearest");
    if (!cheapest || !dearest) return null;
    return {
      cheapest: deployPos(cheapest, stage),
      dearest:  deployPos(dearest,  stage),
      cheapestPrice: cheapest.price!,
      dearestPrice:  dearest.price!,
    };
  }, [stage]);

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

  /* Bracket geometry — sits ~30px below the two endpoint pills (between
     them and the input), with a centered gap for the verdict label. */
  const bracket = useMemo(() => {
    if (!endpoints) return null;
    const yOffset = 36; // below pills, toward input
    const aX = endpoints.cheapest.x;
    const bX = endpoints.dearest.x;
    const yA = endpoints.cheapest.y + yOffset;
    const yB = endpoints.dearest.y  + yOffset;
    // pill tick height
    const tick = 10;
    // gap around label (center of bracket)
    const labelGap = 86;
    const midX = (aX + bX) / 2;
    const midY = (yA + yB) / 2;

    // Two path segments so we can leave a clean gap for the label.
    const left  = `M ${aX} ${endpoints.cheapest.y + 14} L ${aX} ${yA} L ${midX - labelGap / 2} ${midY}`;
    const right = `M ${bX} ${endpoints.dearest.y + 14} L ${bX} ${yB} L ${midX + labelGap / 2} ${midY}`;
    void tick;
    return { left, right, midX, midY };
  }, [endpoints]);

  return (
    <section
      id="jacobi-hero"
      className="relative isolate overflow-hidden px-5 sm:px-8 pt-12 sm:pt-16 pb-10"
      aria-label="JACOBI hero scene"
    >
      {/* Ambient top light — one soft halo, no gradient soup */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(0,217,122,0.05),transparent_70%)]"
      />
      {/* Faint vignette at the corners — anchors the stage */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_60%,rgba(0,0,0,0.45))]"
      />

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative mx-auto max-w-[1080px] h-[86vh] min-h-[620px] sm:min-h-[680px]"
      >
        {/* ─── Strand layer (svg) ─────────────────────────────────── */}
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
            const style = strandStyle(a, phase);
            const clusterDelay =
              phase === "deploy" ? CLUSTER_DELAY[a.axis] : 0;
            return (
              <motion.line
                key={a.i}
                x1={0}
                y1={INPUT_BOTTOM_OFFSET}
                x2={target.x}
                y2={target.y}
                stroke={style.stroke}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  strandActive
                    ? {
                        pathLength: 1,
                        opacity: style.opacity,
                        strokeWidth: style.strokeWidth,
                      }
                    : { pathLength: 0, opacity: 0, strokeWidth: 0.5 }
                }
                transition={{
                  pathLength: {
                    duration: 0.9,
                    delay: phase === "deploy" ? clusterDelay : 0,
                    ease: [0.22, 1, 0.36, 1],
                  },
                  opacity: { duration: 0.6 },
                  strokeWidth: { duration: 0.7 },
                  stroke: { duration: 0.7 },
                }}
              />
            );
          })}

          {/* Verdict measurement bracket — draws at result phase.
              Lives inside the strand svg so its coords share the
              stage-centered viewBox. */}
          {bracket && (
            <g>
              <motion.path
                d={bracket.left}
                fill="none"
                stroke="rgba(0, 217, 122, 0.55)"
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
                stroke="rgba(255, 93, 108, 0.55)"
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
        </svg>

        {/* ─── Agent + cluster-label layer ────────────────────────── */}
        <div className="absolute inset-0 z-10 pointer-events-none">
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
            />
          ))}

          {/* Cluster labels — readable from focus phase onward */}
          {stage.w > 0 &&
            (Object.keys(CLUSTER_ANGLE) as Axis[]).map((axis) => {
              const angle = CLUSTER_ANGLE[axis];
              const r = Math.min(stage.w * 0.42, stage.h * 0.54) + 38;
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
                  className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary whitespace-nowrap"
                >
                  <span className="w-1 h-1 rounded-full bg-secondary/55" />
                  {CLUSTER_LABEL[axis]}
                </motion.div>
              );
            })}
        </div>

        {/* ─── Verdict label (HTML, positioned over svg bracket) ──── */}
        {bracket && (
          <AnimatePresence>
            {phase === "result" && (
              <motion.div
                key="verdict"
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.7,
                  delay: 1.15,
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
                <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-overcharge mb-1">
                  Hidden premium
                </div>
                <div className="font-serif text-3xl sm:text-4xl text-primary leading-none tabular-nums">
                  +$142
                </div>
                <div className="hidden sm:block font-mono text-[10px] text-muted mt-2 tracking-wide">
                  Same flight. Same seat. Different identity.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ─── Center stack: masthead, headline, input ────────────── */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4">
          {/* Masthead — static. No pulsing dot. */}
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
            {/* Ground halo beneath the input — wakes on focus phase */}
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
                  // During the cinematic, soften the CTA so eyes stay on
                  // the deploying agents; bring it back to full signal
                  // at result.
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

            {/* Trust micro-line — no "Try sample" (the cinematic IS the sample) */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted">
              <span className="text-secondary">Bright Data</span>
              <span className="text-muted/40">&middot;</span>
              <span>24 profile probes</span>
              <span className="text-muted/40">&middot;</span>
              <span>Evidence-backed verdict</span>
            </div>
          </motion.form>
        </div>

        {/* ─── Replay scene chip — only after result ──────────────── */}
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

        {/* Sample-probe attribution — quiet, bottom-left */}
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

/* ─── Agent node — circle ↔ price pill ─────────────────────────────── */

function AgentNode({
  agent,
  phase,
  idle,
  deploy,
  cx,
  cy,
  reducedMotion,
}: {
  agent: Agent;
  phase: Phase;
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
  const isEndpoint =
    phase === "result" &&
    (agent.role === "cheapest" || agent.role === "dearest");

  const opacity =
    phase === "idle"   ? 0.50 :
    phase === "focus"  ? 0.78 :
                         1;

  /* Bubble styling */
  let bubble = "bg-secondary/30 border border-secondary/35";
  if (phase === "focus")  bubble = "bg-secondary/45 border border-secondary/45";
  if (isDeployed)         bubble = "bg-raised border border-line";
  if (showPrice) {
    if (agent.role === "cheapest")
      bubble = "bg-signal text-ink border border-signal shadow-[0_0_24px_rgba(0,217,122,0.35)]";
    else if (agent.role === "dearest")
      bubble = "bg-overcharge text-ink border border-overcharge shadow-[0_0_24px_rgba(255,93,108,0.35)]";
    else
      bubble = "bg-raised border border-secondary/45 text-secondary";
  }

  /* Size: endpoints (~1.5×) larger than neutrals, neutrals larger than dots */
  let sizeCls = "w-[5px] h-[5px] sm:w-[6px] sm:h-[6px]";
  if (showPrice) {
    if (isEndpoint) {
      sizeCls =
        "min-w-[68px] sm:min-w-[78px] h-[32px] sm:h-[36px] px-3";
    } else {
      sizeCls =
        "min-w-[50px] sm:min-w-[58px] h-[24px] sm:h-[26px] px-2.5";
    }
  }

  /* Stagger delay: per-cluster, with small intra-cluster offset */
  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const deployDelay =
    phase === "deploy"
      ? CLUSTER_DELAY[agent.axis] + idxInCluster * 0.05
      : 0;

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
        scale:   { duration: 0.5 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className="pointer-events-none"
    >
      {/* Endpoint pulse — subtle scale punch when the cheapest/dearest
          pills land. Communicates "this is the answer." */}
      <motion.div
        layout={!reducedMotion}
        animate={
          isEndpoint
            ? { scale: [1, 1.08, 1] }
            : { scale: 1 }
        }
        transition={
          isEndpoint
            ? { duration: 1.6, delay: 0.9, times: [0, 0.4, 1], ease: "easeOut" }
            : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
        }
        className={`flex items-center justify-center rounded-full ${bubble} ${sizeCls} transition-colors duration-300`}
        style={{ transform: "translate(-50%, -50%)" }}
      >
        {showPrice && (
          <motion.span
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className={
              isEndpoint
                ? "font-mono text-[13px] sm:text-[14px] font-semibold tabular-nums whitespace-nowrap"
                : "font-mono text-[10px] sm:text-[11px] font-semibold tabular-nums whitespace-nowrap"
            }
          >
            ${agent.price}
          </motion.span>
        )}
      </motion.div>

      {/* Tiny label below deployed dots (non-priced) */}
      <AnimatePresence>
        {showLabel && (
          <motion.span
            key="label"
            initial={reducedMotion ? false : { opacity: 0, y: -2 }}
            animate={{ opacity: 0.55, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.5 + idxInCluster * 0.025,
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
