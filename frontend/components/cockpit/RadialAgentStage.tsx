"use client";

/**
 * RadialAgentStage — Phase 4: the persistent investigation stage.
 *
 * Two modes, same component:
 *
 *   mode = "live"   →  perpetual slow rotation (0.04° / 50 ms ≈ 30s full turn),
 *                      per-node organic breath, curved bezier strands that
 *                      draw in as agents return. Designed to feel like a
 *                      living organism rather than static dots.
 *
 *   mode = "result" →  rotation frozen, breath dampened, strands stable.
 *                      The two endpoint pills (cheapest signal-green,
 *                      dearest overcharge-rose) carry the spread.
 *                      Entrance animations skipped so the result reveal
 *                      is calm, not noisy.
 *
 * The component is designed to be MOUNTED ONCE and switched between modes
 * via the `mode` prop — Phase 3's jarring "scan stage unmounts, result
 * stage remounts" pattern is eliminated.
 *
 * Visual vocabulary mirrors the landing HeroScene so /chat feels like the
 * same product.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Agent,
  TopologyReport,
  Axis,
  AXIS_LABEL,
  INDEX_TO_AXIS,
  SHORT_LABELS,
} from "./types";
import AgentDetailDrawer from "./AgentDetailDrawer";

const CLUSTER_ANGLE: Record<Axis, number> = {
  loc:    -Math.PI / 2,
  dev:     Math.PI * 0.20,
  cookie:  Math.PI * 0.58,
  ref:     Math.PI * 0.97,
  ctrl:   -Math.PI * 0.80,
};

function indexToAxis(i: number): Axis {
  return INDEX_TO_AXIS[i] || "ctrl";
}

function agentIndex(agent_id: string): number {
  const m = agent_id.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

interface StagePos {
  x: number;
  y: number;
}

/**
 * Cluster position math.
 *
 * `rotationOffset` is added uniformly to all cluster anchor angles so the
 * whole swarm can rotate as one organism in live mode.
 */
function clusterPos(
  idx: number,
  axis: Axis,
  stage: { w: number; h: number },
  rotationOffset = 0,
): StagePos {
  const anchorAngle = CLUSTER_ANGLE[axis] + rotationOffset;
  const anchorR = Math.min(stage.w * 0.34, stage.h * 0.40);
  const ax = Math.cos(anchorAngle) * anchorR;
  const ay = Math.sin(anchorAngle) * anchorR * 0.82;

  const peers: number[] = [];
  for (let i = 0; i < 24; i++) if (indexToAxis(i) === axis) peers.push(i);
  const idxInCluster = peers.indexOf(idx);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const spread =
    n === 1
      ? 0
      : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
        Math.min(stage.w * 0.14, 110);

  return {
    x: ax + Math.cos(tangentAngle) * spread,
    y: ay + Math.sin(tangentAngle) * spread * 0.85,
  };
}

/**
 * Build a quadratic-bezier path from the center to a target with a
 * controlled curve so strands feel organic instead of straight rays.
 */
function strandPath(target: StagePos): string {
  // Perpendicular offset for the control point — gives each strand a
  // gentle bow. The sign alternates with target angle so adjacent strands
  // curve in opposite directions, avoiding parallel "tracks".
  const angle = Math.atan2(target.y, target.x);
  const length = Math.hypot(target.x, target.y);
  const perp = angle + Math.PI / 2;
  const bow = Math.min(length * 0.12, 32);
  const midX = target.x * 0.5 + Math.cos(perp) * bow;
  const midY = target.y * 0.5 + Math.sin(perp) * bow;
  return `M 0 0 Q ${midX} ${midY} ${target.x} ${target.y}`;
}

/**
 * Depth-opacity — gives an illusion of 3D rotation. Nodes whose angle
 * puts them on the "back" of the orbital plane fade slightly.
 */
function depthOpacity(target: StagePos): number {
  const angle = Math.atan2(target.y, target.x);
  return 0.65 + 0.35 * ((1 + Math.sin(angle)) / 2);
}

type NodeStatus = "pending" | "in_flight" | "success" | "detected" | "failed";

interface NodeState {
  idx: number;
  axis: Axis;
  status: NodeStatus;
  price: number | null;
  agent: Agent | null;
  isCheapest: boolean;
  isDearest: boolean;
}

interface Props {
  report: TopologyReport | null;
  scanStarted?: number;
  mode: "live" | "result";
  showLabels?: boolean;
  compact?: boolean;
}

export default function RadialAgentStage({
  report,
  scanStarted = 0,
  mode,
  showLabels = true,
  compact = false,
}: Props) {
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 520 });
  const [selected, setSelected] = useState<Agent | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [rotationOffset, setRotationOffset] = useState(0);

  const isComplete = mode === "result";

  /* Live tick during scan so in-flight estimate updates */
  useEffect(() => {
    if (isComplete || scanStarted === 0) return;
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, [isComplete, scanStarted]);

  /* Perpetual gentle rotation in live mode — the heartbeat of the swarm.
     ~30 seconds for a full revolution. Off in result and reduced-motion. */
  useEffect(() => {
    if (isComplete || reducedMotion) return;
    const id = setInterval(() => {
      setRotationOffset((prev) => (prev + 0.0007) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(id);
  }, [isComplete, reducedMotion]);

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

  /* Resolve current 24-node state from the live report */
  const nodes: NodeState[] = useMemo(() => {
    const agentsById = new Map<number, Agent>();
    (report?.agents || []).forEach((a) => agentsById.set(agentIndex(a.agent_id), a));

    let cheapestIdx = -1;
    let dearestIdx = -1;
    if (isComplete && report) {
      let cheapest: Agent | null = null;
      let dearest: Agent | null = null;
      report.agents.forEach((a) => {
        if (a.price == null || a.status !== "success") return;
        if (!cheapest || a.price < cheapest.price!) cheapest = a;
        if (!dearest || a.price > dearest.price!) dearest = a;
      });
      if (cheapest !== null) cheapestIdx = agentIndex((cheapest as Agent).agent_id);
      if (dearest !== null)  dearestIdx  = agentIndex((dearest  as Agent).agent_id);
    }

    return Array.from({ length: 24 }, (_, i) => {
      const a = agentsById.get(i) || null;
      const axis = indexToAxis(i);
      let status: NodeStatus = "pending";
      if (a) {
        status = (a.status as NodeStatus) || "success";
      } else if (scanStarted > 0 && !isComplete) {
        const wave = i < 8 ? 0 : i < 16 ? 1 : 2;
        const ms = now - scanStarted;
        const waveDelay = wave * 2000 + (i % 8) * 400;
        status = ms > waveDelay ? "in_flight" : "pending";
      }
      return {
        idx: i,
        axis,
        status,
        price: a?.price ?? null,
        agent: a,
        isCheapest: i === cheapestIdx,
        isDearest:  i === dearestIdx,
      };
    });
  }, [report, scanStarted, isComplete, now]);

  /* Pre-compute positions; rotationOffset feeds into every cluster */
  const positions = useMemo(
    () => nodes.map((n) => clusterPos(n.idx, n.axis, stage, rotationOffset)),
    [nodes, stage, rotationOffset],
  );

  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const totalDone = nodes.filter(
    (n) => n.status === "success" || n.status === "detected" || n.status === "failed",
  ).length;

  const onNodeClick = useCallback((n: NodeState) => {
    if (!n.agent) return;
    if (n.status === "pending" || n.status === "in_flight") return;
    setSelected(n.agent);
  }, []);

  // Cluster label positions (rotation-aware)
  const clusterLabels = useMemo(() => {
    if (!stage.w) return [];
    const r = Math.min(stage.w * 0.34, stage.h * 0.40) + 40;
    return (Object.keys(CLUSTER_ANGLE) as Axis[]).map((axis) => {
      const angle = CLUSTER_ANGLE[axis] + rotationOffset;
      return {
        axis,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r * 0.82,
      };
    });
  }, [stage, cx, cy, rotationOffset]);

  const height = compact
    ? "h-[48vh] min-h-[360px] sm:min-h-[420px]"
    : "h-[58vh] min-h-[440px] sm:min-h-[500px]";

  return (
    <div className="relative">
      <div ref={stageRef} className={`relative mx-auto w-full max-w-[920px] ${height}`}>
        {/* Center anchor — represents the URL command core */}
        <motion.div
          aria-hidden
          initial={false}
          animate={{
            opacity: isComplete ? 0.55 : 0.85,
            scale: isComplete ? 1 : [1, 1.12, 1],
          }}
          transition={{
            scale:   { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 0.6 },
          }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-signal pointer-events-none z-20"
        />
        <div
          aria-hidden
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl bg-signal/10 pointer-events-none ${
            isComplete ? "w-32 h-32" : "w-44 h-44"
          }`}
        />

        {/* SVG strand layer — curved bezier paths */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          viewBox={`-${cx} -${cy} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {nodes.map((n, i) => {
            const target = positions[i];
            const path = strandPath(target);
            const visible =
              n.status === "in_flight" ||
              n.status === "success" ||
              n.status === "detected" ||
              n.status === "failed";

            // Strand styling by state
            let stroke = "rgba(155, 161, 173, 0.18)";
            let strokeWidth = 0.6;
            let opacity = 0.45;

            if (isComplete) {
              if (n.isCheapest) {
                stroke = "rgba(0, 217, 122, 0.85)";
                strokeWidth = 1.6;
                opacity = 1;
              } else if (n.isDearest) {
                stroke = "rgba(255, 93, 108, 0.85)";
                strokeWidth = 1.6;
                opacity = 1;
              } else if (n.status === "detected" || n.status === "failed") {
                stroke = "rgba(255, 93, 108, 0.20)";
                opacity = 0.4;
              } else {
                stroke = "rgba(155, 161, 173, 0.12)";
                opacity = 0.35;
              }
            } else if (hoveredIdx === n.idx) {
              stroke = "rgba(0, 217, 122, 0.6)";
              strokeWidth = 1.2;
              opacity = 0.9;
            }

            return (
              <motion.path
                key={n.idx}
                d={path}
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  visible
                    ? { pathLength: 1, opacity }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{
                  pathLength: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
                  opacity:    { duration: 0.5 },
                }}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            );
          })}
        </svg>

        {/* Cluster labels */}
        {showLabels &&
          clusterLabels.map((l) => (
            <div
              key={l.axis}
              style={{
                position: "absolute",
                left: l.x,
                top: l.y,
                transform: "translate(-50%, -50%)",
              }}
              className="hidden md:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary/85 whitespace-nowrap pointer-events-none"
            >
              <span className="w-1 h-1 rounded-full bg-secondary/55" />
              {AXIS_LABEL[l.axis]}
            </div>
          ))}

        {/* Agent nodes */}
        {nodes.map((n, i) => {
          const pos = positions[i];
          return (
            <AgentNode
              key={n.idx}
              node={n}
              pos={pos}
              cx={cx}
              cy={cy}
              reducedMotion={!!reducedMotion}
              mode={mode}
              depthOp={depthOpacity(pos)}
              isHovered={hoveredIdx === n.idx}
              onClick={() => onNodeClick(n)}
              onHover={(h) => setHoveredIdx(h ? n.idx : (cur) => (cur === n.idx ? null : cur))}
            />
          );
        })}

        {/* Status badge — sits center-bottom of stage */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center pointer-events-none">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {isComplete ? "Probe complete" : "Live deployment"}
          </div>
          <div className="font-mono text-[12px] text-secondary tabular-nums mt-0.5">
            {totalDone}<span className="text-muted">/24 agents</span>
            {scanStarted > 0 && !isComplete && (
              <span className="ml-3 text-muted">
                {((now - scanStarted) / 1000).toFixed(1)}s
              </span>
            )}
            {isComplete && report?.elapsed_seconds && (
              <span className="ml-3 text-muted">
                {report.elapsed_seconds.toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <AgentDetailDrawer
            agent={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Agent node ───────────────────────────────────────────────────── */

function AgentNode({
  node,
  pos,
  cx,
  cy,
  reducedMotion,
  mode,
  depthOp,
  isHovered,
  onClick,
  onHover,
}: {
  node: NodeState;
  pos: StagePos;
  cx: number;
  cy: number;
  reducedMotion: boolean;
  mode: "live" | "result";
  depthOp: number;
  isHovered: boolean;
  onClick: () => void;
  onHover: (h: boolean) => void;
}) {
  const isComplete = mode === "result";
  const isEndpoint = isComplete && (node.isCheapest || node.isDearest);
  const showPrice =
    isComplete && node.price !== null && node.status === "success";
  const clickable =
    node.agent &&
    (node.status === "success" ||
      node.status === "detected" ||
      node.status === "failed");

  /* Bubble styling */
  let bubble = "bg-secondary/25 border border-secondary/30";
  if (node.status === "in_flight")
    bubble = "bg-signal/35 border border-signal/45";
  if (node.status === "success" && !showPrice)
    bubble = "bg-raised border border-line";
  if (node.status === "detected" || node.status === "failed")
    bubble = "bg-overcharge/15 border border-overcharge/35";
  if (showPrice) {
    if (node.isCheapest)
      bubble = "bg-signal text-ink border border-signal shadow-[0_0_28px_rgba(0,217,122,0.45)]";
    else if (node.isDearest)
      bubble = "bg-overcharge text-ink border border-overcharge shadow-[0_0_28px_rgba(255,93,108,0.45)]";
    else
      bubble = "bg-raised border border-secondary/45 text-secondary";
  }

  let sizeCls = "w-[7px] h-[7px] sm:w-[8px] sm:h-[8px]";
  if (showPrice) {
    if (isEndpoint) {
      sizeCls = "min-w-[68px] sm:min-w-[78px] h-[32px] sm:h-[36px] px-3";
    } else {
      sizeCls = "min-w-[48px] sm:min-w-[56px] h-[24px] sm:h-[26px] px-2.5";
    }
  }

  /* Hover boost */
  if (isHovered && !showPrice && node.status !== "pending") {
    bubble = bubble.replace("border-line", "border-signal/60")
                   .replace("border-secondary/30", "border-signal/40")
                   .replace("border-secondary/45", "border-signal/40");
  }

  const baseOpacity =
    node.status === "pending" ? 0.42 :
    node.status === "in_flight" ? 0.92 :
    1;
  // Blend base × depth — but never below 0.5 for priced results
  const targetOpacity = isComplete
    ? Math.max(0.7, baseOpacity * depthOp)
    : baseOpacity * depthOp;

  return (
    <motion.button
      type="button"
      onClick={clickable ? onClick : undefined}
      onMouseEnter={() => clickable && onHover(true)}
      onMouseLeave={() => onHover(false)}
      initial={
        reducedMotion || isComplete
          ? false
          : { opacity: 0, scale: 0.5, x: cx, y: cy }
      }
      animate={{
        x: cx + pos.x,
        y: cy + pos.y,
        opacity: targetOpacity,
        scale: isHovered ? 1.18 : 1,
      }}
      transition={{
        x:       { duration: isComplete ? 0.6 : 0.9, ease: [0.22, 1, 0.36, 1] },
        y:       { duration: isComplete ? 0.6 : 0.9, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.4 },
        scale:   { duration: 0.3 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className={`${clickable ? "cursor-pointer" : "cursor-default"} pointer-events-auto`}
      aria-label={node.agent ? node.agent.agent_id : `agent ${node.idx}`}
    >
      <motion.div
        layout={!reducedMotion}
        // Per-node breath: each cluster breathes slightly differently
        animate={
          isComplete
            ? isEndpoint
              ? { scale: [1, 1.06, 1] }
              : { scale: 1 }
            : node.status === "in_flight"
              ? { scale: [1, 1.22, 1] }
              : node.status === "pending"
                ? { scale: [1, 1.05, 1] }
                : { scale: [1, 1.04, 1] }
        }
        transition={
          isComplete && isEndpoint
            ? { duration: 1.6, delay: 0.4, ease: "easeOut" }
            : node.status === "in_flight"
              ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
              : {
                  duration: 2.6 + (node.idx % 5) * 0.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (node.idx % 7) * 0.15,
                }
        }
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
            ${node.price}
          </span>
        )}
      </motion.div>

      {/* Static small label below pending/in-flight/non-priced dots */}
      {!showPrice && (
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 0,
            transform: "translate(-50%, 0)",
            opacity:
              isHovered ? 1 :
              node.status === "pending" ? 0.35 :
              node.status === "in_flight" ? 0.75 :
              0.55,
          }}
          className="font-mono text-[8px] sm:text-[9px] text-muted whitespace-nowrap pointer-events-none hidden sm:block"
        >
          {SHORT_LABELS[node.idx]}
        </span>
      )}
    </motion.button>
  );
}
