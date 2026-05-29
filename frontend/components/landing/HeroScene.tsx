"use client";

/**
 * HeroScene — Phase 7: silent forensic chamber.
 *
 * Apple-restrained narrative. No perpetual motion, no rainbow tints, no
 * cursor effects. Motion is staged and meaningful:
 *
 *   idle    → headline + URL input, no swarm visible
 *   focus   → input picks up a subtle internal light
 *   deploy  → 24 neutral white agents fan into 5 cluster anchors with
 *             curved strands drawing in cluster-by-cluster
 *   prices  → 5 priced nodes morph from dots to neutral pills
 *   result  → 3 neutral pills + 19 unpriced dots fade to near-black;
 *             cheapest (signal-green $498) and dearest (overcharge-rose
 *             $640) remain bright; a hairline bracket connects them;
 *             "+$142 hidden premium" verdict appears between them;
 *             caption "Same flight. Same seat. Different identity."
 *             appears below the input.
 *
 * Geometry contract: the strand for agent i ends at exactly the same
 * pixel as the node for agent i. Both layers consume positions[i]
 * directly with the SAME viewBox/transform — no parallax offsets, no
 * repulsion offsets, no per-layer drift. Circles and lines connect.
 *
 * Routes to /chat?url=<encoded> on submit. Reduced motion jumps to
 * the final endpoint+verdict state.
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
import { CLUSTER_ANGLE, CLUSTER_DELAY, Pt, strandPath } from "../cockpit/orbital";

type Phase = "idle" | "focus" | "deploy" | "prices" | "result";
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
  // Location (7) — IOWA cheapest at far-left tangent, NYC dearest at far-right
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

/* Position math — no rotation, deterministic */
function deployPos(agent: Agent, stage: { w: number; h: number }): Pt {
  const anchorAngle = CLUSTER_ANGLE[agent.axis];
  const anchorR = Math.min(stage.w * 0.38, stage.h * 0.48);
  const ax = Math.cos(anchorAngle) * anchorR;
  const ay = Math.sin(anchorAngle) * anchorR * 0.80;

  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const spread = n === 1
    ? 0
    : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
      Math.min(stage.w * 0.15, 115);

  return {
    x: ax + Math.cos(tangentAngle) * spread,
    y: ay + Math.sin(tangentAngle) * spread * 0.85,
  };
}

const INPUT_BOTTOM_OFFSET = 36;

export default function HeroScene() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 960, h: 720 });
  const [runKey, setRunKey] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  /* Phase timeline — staged sequence, no perpetual motion */
  useEffect(() => {
    if (reducedMotion) { setPhase("result"); return; }
    setPhase("idle");
    const t1 = setTimeout(() => setPhase("focus"),  1200);
    const t2 = setTimeout(() => setPhase("deploy"), 2400);
    const t3 = setTimeout(() => setPhase("prices"), 4700);
    const t4 = setTimeout(() => setPhase("result"), 6200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [reducedMotion, runKey]);

  const positions = useMemo(
    () => AGENTS.map((a) => deployPos(a, stage)),
    [stage],
  );

  const endpoints = useMemo(() => {
    const cheapest = AGENTS.find((a) => a.role === "cheapest");
    const dearest  = AGENTS.find((a) => a.role === "dearest");
    if (!cheapest || !dearest) return null;
    return {
      cheapest:      positions[cheapest.i],
      dearest:       positions[dearest.i],
      cheapestPrice: cheapest.price!,
      dearestPrice:  dearest.price!,
    };
  }, [positions]);

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
  const strandActive = phase === "deploy" || phase === "prices" || phase === "result";
  const showAllAgents = phase === "deploy" || phase === "prices";
  // On result, only cheapest + dearest remain bright. Everything else
  // (priced neutrals + unpriced dots + strands) dims toward black.
  const isResult = phase === "result";

  /* Bracket between endpoints — drawn on result, above the pills */
  const bracket = useMemo(() => {
    if (!endpoints) return null;
    const a = endpoints.cheapest;
    const b = endpoints.dearest;
    const yOffset = -54; // above the pills, clear of headline
    const aY = a.y + yOffset;
    const bY = b.y + yOffset;
    const midX = (a.x + b.x) / 2;
    const midY = (aY + bY) / 2;
    const labelGap = 100;
    const left  = `M ${a.x} ${a.y - 22} L ${a.x} ${aY} L ${midX - labelGap / 2} ${midY}`;
    const right = `M ${b.x} ${b.y - 22} L ${b.x} ${bY} L ${midX + labelGap / 2} ${midY}`;
    return { left, right, midX, midY };
  }, [endpoints]);

  return (
    <section
      id="jacobi-hero"
      className="relative isolate overflow-hidden px-5 sm:px-8 pt-12 sm:pt-16 pb-10"
      aria-label="JACOBI hero scene"
    >
      {/* Ambient top light — single soft halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(255,255,255,0.03),transparent_75%)]"
      />

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative mx-auto max-w-[1080px] h-[84vh] min-h-[640px] sm:min-h-[700px]"
      >
        {/* SVG layer — strands + bracket. Same geometry as nodes, no
            parallax, no offsets. Strand endpoint == node center. */}
        <svg
          className="absolute inset-0 pointer-events-none z-[1]"
          width="100%"
          height="100%"
          viewBox={`-${cx} -${cy} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {AGENTS.map((a, i) => {
            const target = positions[i];
            const path = strandPath({ x: 0, y: INPUT_BOTTOM_OFFSET }, target);

            // Strand color/width by phase + role
            let stroke = "rgba(232, 234, 237, 0.18)";
            let strokeWidth = 0.7;
            let opacity = 0.55;

            if (isResult) {
              if (a.role === "cheapest") {
                stroke = "rgba(0, 217, 122, 0.85)";
                strokeWidth = 1.5;
                opacity = 1;
              } else if (a.role === "dearest") {
                stroke = "rgba(255, 93, 108, 0.85)";
                strokeWidth = 1.5;
                opacity = 1;
              } else {
                stroke = "rgba(232, 234, 237, 0.08)";
                opacity = 0.25;
              }
            } else if (hoveredIdx === a.i) {
              stroke = "rgba(232, 234, 237, 0.55)";
              strokeWidth = 1.1;
              opacity = 0.9;
            }

            return (
              <motion.path
                key={a.i}
                d={path}
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={strandActive
                  ? { pathLength: 1, opacity }
                  : { pathLength: 0, opacity: 0 }}
                transition={{
                  pathLength: {
                    duration: 0.9,
                    delay: phase === "deploy" ? CLUSTER_DELAY[a.axis] : 0,
                    ease: [0.22, 1, 0.36, 1],
                  },
                  opacity:    { duration: 0.8 },
                  stroke:     { duration: 0.8 },
                  strokeWidth: { duration: 0.6 },
                }}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            );
          })}

          {/* Bracket — drawn on result, above the endpoint pills */}
          {bracket && (
            <>
              <motion.path
                d={bracket.left}
                fill="none"
                stroke="rgba(0, 217, 122, 0.55)"
                strokeWidth={1}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={isResult
                  ? { pathLength: 1, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }}
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
                animate={isResult
                  ? { pathLength: 1, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }}
                transition={{
                  pathLength: { duration: 0.9, delay: 0.55, ease: [0.22, 1, 0.36, 1] },
                  opacity:    { duration: 0.5, delay: 0.55 },
                }}
              />
            </>
          )}
        </svg>

        {/* Agent nodes — same geometry as strands, no transforms */}
        <div className="absolute inset-0 z-[2] pointer-events-none">
          {AGENTS.map((a, i) => (
            <AgentNode
              key={a.i}
              agent={a}
              phase={phase}
              pos={positions[i]}
              cx={cx}
              cy={cy}
              reducedMotion={!!reducedMotion}
              showAll={showAllAgents}
              isResult={isResult}
              isHovered={hoveredIdx === a.i}
              onHover={(h) => setHoveredIdx(h ? a.i : (cur) => (cur === a.i ? null : cur))}
            />
          ))}
        </div>

        {/* Verdict numeral — floats above the bracket */}
        {bracket && (
          <AnimatePresence>
            {isResult && (
              <motion.div
                key="verdict"
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.8,
                  delay: 1.0,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  position: "absolute",
                  left: cx + bracket.midX,
                  top:  cy + bracket.midY,
                  transform: "translate(-50%, -50%)",
                }}
                className="z-[3] text-center pointer-events-none"
              >
                <div className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted mb-1 whitespace-nowrap">
                  Hidden premium
                </div>
                <div className="font-serif text-3xl sm:text-4xl text-primary leading-none tabular-nums">
                  +$142
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Center stack: masthead, headline, premium input */}
        <div className="absolute inset-0 z-[20] flex flex-col items-center justify-center px-4">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-8 flex items-center gap-3"
          >
            <span className="text-secondary">JACOBI</span>
            <span aria-hidden className="h-2.5 w-px bg-line" />
            <span>pricing forensics</span>
          </motion.div>

          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-[36px] sm:text-[52px] lg:text-[64px] leading-[1.02] tracking-tight text-primary text-center mb-10 max-w-[640px]"
          >
            Run one URL through{" "}
            <em className="not-italic text-signal">24 versions</em>{" "}
            of you.
          </motion.h1>

          {/* Apple-style control surface input */}
          <ChamberInput
            url={url}
            setUrl={setUrl}
            onSubmit={submit}
            inputRef={inputRef}
            phase={phase}
            focused={inputFocused}
            setFocused={setInputFocused}
            reducedMotion={!!reducedMotion}
          />

          {/* Trust line OR verdict caption on result */}
          <div className="mt-6 text-[11px] font-mono text-muted min-h-[20px] tracking-wide">
            <AnimatePresence mode="wait">
              {isResult ? (
                <motion.div
                  key="caption"
                  initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="text-secondary"
                >
                  Same flight. Same seat.{" "}
                  <span className="text-overcharge">Different identity.</span>
                </motion.div>
              ) : (
                <motion.div
                  key="trust"
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-muted"
                >
                  Bright Data &middot; 24 profile probes &middot; Evidence-backed verdict
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Replay chip */}
        <AnimatePresence>
          {isResult && !reducedMotion && (
            <motion.button
              key="replay"
              type="button"
              onClick={replay}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 z-[30] inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line bg-raised/80 backdrop-blur-sm text-[10px] font-mono uppercase tracking-[0.22em] text-muted hover:text-primary hover:border-secondary/40 transition-colors"
              aria-label="Replay scene"
            >
              <RotateCcw className="w-3 h-3" />
              Replay
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ─── Apple-style chamber input ─────────────────────────────────────
 *
 * Dark slab. Hairline border. Subtle internal light from a top-edge
 * gradient. No outer halo glow, no corner ticks, no gradient border ring.
 * The PROBE button is solid signal-green at calm saturation — no shadow,
 * no overpowering glow.
 */

function ChamberInput({
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
  const ringActive = focused || phase !== "idle";

  return (
    <motion.form
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25 }}
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="w-full max-w-xl relative pointer-events-auto"
    >
      <motion.div
        animate={{
          borderColor: ringActive ? "rgba(232, 234, 237, 0.22)" : "rgba(232, 234, 237, 0.10)",
        }}
        transition={{ duration: 0.5 }}
        className="relative rounded-lg border bg-[#0a0c11] overflow-hidden"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 0 rgba(0, 0, 0, 0.6), 0 14px 40px -16px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Subtle internal light — single soft top sheen */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(232, 234, 237, 0.18) 50%, transparent 100%)",
          }}
        />

        <div className="flex items-stretch">
          <span className="flex items-center pl-5 pr-3 text-muted shrink-0">
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
            className="flex-1 bg-transparent py-4 sm:py-5 pr-2 text-primary placeholder-muted/60 outline-none text-base font-mono caret-signal min-w-0"
          />
          <button
            type="submit"
            className="m-1.5 sm:m-2 inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-md bg-signal text-ink font-mono text-[11px] font-semibold uppercase tracking-[0.18em] hover:brightness-105 active:scale-[0.98] transition-[transform,filter] shrink-0"
          >
            <span>Probe</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </motion.form>
  );
}

/* ─── Agent node — neutral by default, signal/overcharge endpoints ─── */

function AgentNode({
  agent,
  phase,
  pos,
  cx,
  cy,
  reducedMotion,
  showAll,
  isResult,
  isHovered,
  onHover,
}: {
  agent: Agent;
  phase: Phase;
  pos: Pt;
  cx: number;
  cy: number;
  reducedMotion: boolean;
  showAll: boolean;
  isResult: boolean;
  isHovered: boolean;
  onHover: (h: boolean) => void;
}) {
  const showPrice = (phase === "prices" || isResult) && agent.price !== null;
  const isEndpoint = isResult && (agent.role === "cheapest" || agent.role === "dearest");

  /* On result, only endpoints remain bright. Everything else fades. */
  let targetOpacity = 0;
  if (phase === "deploy" || phase === "prices") {
    targetOpacity = 1;
  } else if (isResult) {
    if (isEndpoint) targetOpacity = 1;
    else if (agent.price !== null) targetOpacity = 0.18; // priced neutrals fade
    else targetOpacity = 0.10; // unpriced dots fade further
  }

  /* Bubble style */
  let bubbleStyle: React.CSSProperties = {
    transform: "translate(-50%, -50%)",
    backgroundColor: "rgba(232, 234, 237, 0.10)",
    border: "1px solid rgba(232, 234, 237, 0.22)",
  };
  let textColor: string | undefined;

  if (showPrice) {
    if (agent.role === "cheapest") {
      bubbleStyle = {
        transform: "translate(-50%, -50%)",
        backgroundColor: "#00d97a",
        border: "1px solid #00d97a",
      };
      textColor = "#07080c";
    } else if (agent.role === "dearest") {
      bubbleStyle = {
        transform: "translate(-50%, -50%)",
        backgroundColor: "#ff5d6c",
        border: "1px solid #ff5d6c",
      };
      textColor = "#07080c";
    } else {
      bubbleStyle = {
        transform: "translate(-50%, -50%)",
        backgroundColor: "rgba(20, 22, 28, 0.95)",
        border: "1px solid rgba(232, 234, 237, 0.20)",
      };
      textColor = "rgba(232, 234, 237, 0.7)";
    }
  }

  if (isHovered && !showPrice) {
    bubbleStyle.backgroundColor = "rgba(232, 234, 237, 0.22)";
    bubbleStyle.border = "1px solid rgba(232, 234, 237, 0.45)";
  }

  /* Size — dots small, neutral priced pills medium, endpoint pills 1.5x */
  let sizeCls = "w-[6px] h-[6px] sm:w-[7px] sm:h-[7px]";
  if (showPrice) {
    sizeCls = isEndpoint
      ? "min-w-[68px] sm:min-w-[78px] h-[32px] sm:h-[36px] px-3"
      : "min-w-[48px] sm:min-w-[54px] h-[24px] sm:h-[26px] px-2.5";
  }

  /* Stagger delay — per-cluster on deploy, no further animation */
  const peers = AGENTS.filter((a) => a.axis === agent.axis);
  const idxInCluster = peers.findIndex((a) => a.i === agent.i);
  const deployDelay = phase === "deploy"
    ? CLUSTER_DELAY[agent.axis] + idxInCluster * 0.04
    : 0;

  /* Endpoint label — appears only on result for the two endpoints */
  const endpointLabel = isResult && (agent.role === "cheapest" || agent.role === "dearest");

  return (
    <motion.button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      tabIndex={-1}
      initial={reducedMotion ? false : { x: cx + pos.x, y: cy + pos.y, opacity: 0, scale: 0.7 }}
      animate={{
        x: cx + pos.x,
        y: cy + pos.y,
        opacity: targetOpacity,
        scale: isHovered && !isResult ? 1.18 : 1,
      }}
      transition={{
        x:       { duration: 0.9, delay: deployDelay, ease: [0.22, 1, 0.36, 1] },
        y:       { duration: 0.9, delay: deployDelay, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.8, delay: phase === "deploy" ? deployDelay : 0 },
        scale:   { duration: 0.3 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className={`${showAll || (isResult && isEndpoint) ? "pointer-events-auto cursor-pointer" : "pointer-events-none"}`}
    >
      <div
        className={`flex items-center justify-center rounded-full ${sizeCls} transition-colors duration-300`}
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
      </div>

      {/* Hover label OR endpoint label */}
      <AnimatePresence>
        {((isHovered && showAll) || endpointLabel) && (
          <motion.span
            key="label"
            initial={reducedMotion ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              top: showPrice ? 24 : 14,
              left: 0,
              transform: "translate(-50%, 0)",
            }}
            className={`font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.18em] whitespace-nowrap pointer-events-none ${
              agent.role === "cheapest"
                ? "text-signal"
                : agent.role === "dearest"
                  ? "text-overcharge"
                  : "text-muted"
            }`}
          >
            {agent.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
