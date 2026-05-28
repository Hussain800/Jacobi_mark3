"use client";

/**
 * RadialAgentStage — primary live visualization on /chat.
 *
 * 24 nodes arranged in 5 axis clusters around a center anchor. As
 * agents return from the backend (driven by report.agents), their
 * status visualization upgrades: pending → in-flight (pulsing) →
 * success (filled tier color) → priced result (price chip). On
 * result phase, the cheapest + dearest agents are highlighted as
 * endpoints with signal/overcharge tinting and slightly larger pills.
 *
 * Clicking a returned node opens AgentDetailDrawer.
 *
 * Visual vocabulary deliberately mirrors the landing HeroScene so
 * /chat feels like the same product, not a separate dashboard.
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

function clusterPos(idx: number, axis: Axis, stage: { w: number; h: number }): StagePos {
  const anchorAngle = CLUSTER_ANGLE[axis];
  const anchorR = Math.min(stage.w * 0.36, stage.h * 0.42);
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
        Math.min(stage.w * 0.16, 120);

  return {
    x: ax + Math.cos(tangentAngle) * spread,
    y: ay + Math.sin(tangentAngle) * spread * 0.85,
  };
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
  isComplete: boolean;
  showLabels?: boolean;
}

export default function RadialAgentStage({
  report,
  scanStarted = 0,
  isComplete,
  showLabels = true,
}: Props) {
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 520 });
  const [selected, setSelected] = useState<Agent | null>(null);
  const [now, setNow] = useState(Date.now());

  /* Live tick while scanning so the in-flight estimate stays current */
  useEffect(() => {
    if (isComplete || scanStarted === 0) return;
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, [isComplete, scanStarted]);

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

  /* Resolve which 24 nodes exist and what their current visual state is */
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
      if (cheapest !== null) {
        const c = cheapest as Agent;
        cheapestIdx = agentIndex(c.agent_id);
      }
      if (dearest !== null) {
        const d = dearest as Agent;
        dearestIdx = agentIndex(d.agent_id);
      }
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
        isDearest: i === dearestIdx,
      };
    });
  }, [report, scanStarted, isComplete, now]);

  /* Pre-compute pixel positions for each cluster member */
  const positions = useMemo(
    () => nodes.map((n) => clusterPos(n.idx, n.axis, stage)),
    [nodes, stage],
  );

  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const totalDone = nodes.filter((n) => n.status === "success" || n.status === "detected" || n.status === "failed").length;

  const onNodeClick = useCallback((n: NodeState) => {
    if (!n.agent) return;
    if (n.status === "pending" || n.status === "in_flight") return;
    setSelected(n.agent);
  }, []);

  return (
    <div className="relative">
      <div
        ref={stageRef}
        className="relative mx-auto w-full max-w-[860px] h-[58vh] min-h-[420px] sm:min-h-[480px]"
      >
        {/* Faint center pulse — represents the URL anchor */}
        <motion.div
          aria-hidden
          initial={false}
          animate={{
            opacity: isComplete ? 0.4 : 0.7,
            scale: isComplete ? 1 : [1, 1.08, 1],
          }}
          transition={{
            scale: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 0.6 },
          }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-signal pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full blur-2xl bg-signal/10 pointer-events-none"
        />

        {/* SVG strand layer */}
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
            const visible =
              n.status === "in_flight" ||
              n.status === "success" ||
              n.status === "detected" ||
              n.status === "failed";
            let stroke = "rgba(155, 161, 173, 0.18)";
            let strokeWidth = 0.5;
            let op = 0.4;
            if (isComplete) {
              if (n.isCheapest) {
                stroke = "rgba(0, 217, 122, 0.85)";
                strokeWidth = 1.4;
                op = 1;
              } else if (n.isDearest) {
                stroke = "rgba(255, 93, 108, 0.85)";
                strokeWidth = 1.4;
                op = 1;
              } else if (n.status === "detected" || n.status === "failed") {
                stroke = "rgba(255, 93, 108, 0.22)";
                op = 0.5;
              } else {
                stroke = "rgba(155, 161, 173, 0.12)";
                op = 0.4;
              }
            }
            return (
              <motion.line
                key={n.idx}
                x1={0}
                y1={0}
                x2={target.x}
                y2={target.y}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  visible
                    ? { pathLength: 1, opacity: op }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{
                  pathLength: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: 0.4 },
                }}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Cluster labels */}
        {showLabels &&
          stage.w > 0 &&
          (Object.keys(CLUSTER_ANGLE) as Axis[]).map((axis) => {
            const angle = CLUSTER_ANGLE[axis];
            const r = Math.min(stage.w * 0.36, stage.h * 0.42) + 34;
            const lx = cx + Math.cos(angle) * r;
            const ly = cy + Math.sin(angle) * r * 0.82;
            return (
              <div
                key={axis}
                style={{
                  position: "absolute",
                  left: lx,
                  top: ly,
                  transform: "translate(-50%, -50%)",
                }}
                className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary/85 whitespace-nowrap pointer-events-none"
              >
                <span className="w-1 h-1 rounded-full bg-secondary/55" />
                {AXIS_LABEL[axis]}
              </div>
            );
          })}

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
              isComplete={isComplete}
              onClick={() => onNodeClick(n)}
            />
          );
        })}

        {/* Live counter — sits center-bottom of the stage */}
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
  isComplete,
  onClick,
}: {
  node: NodeState;
  pos: StagePos;
  cx: number;
  cy: number;
  reducedMotion: boolean;
  isComplete: boolean;
  onClick: () => void;
}) {
  const isEndpoint = isComplete && (node.isCheapest || node.isDearest);
  const showPrice =
    isComplete && node.price !== null && node.status === "success";
  const clickable =
    node.agent &&
    (node.status === "success" ||
      node.status === "detected" ||
      node.status === "failed");

  let bubble = "bg-secondary/25 border border-secondary/30";
  if (node.status === "in_flight")
    bubble = "bg-signal/30 border border-signal/40";
  if (node.status === "success" && !showPrice)
    bubble = "bg-raised border border-line";
  if (node.status === "detected" || node.status === "failed")
    bubble = "bg-overcharge/15 border border-overcharge/35";
  if (showPrice) {
    if (node.isCheapest)
      bubble = "bg-signal text-ink border border-signal shadow-[0_0_24px_rgba(0,217,122,0.35)]";
    else if (node.isDearest)
      bubble = "bg-overcharge text-ink border border-overcharge shadow-[0_0_24px_rgba(255,93,108,0.35)]";
    else
      bubble = "bg-raised border border-secondary/45 text-secondary";
  }

  let sizeCls = "w-[6px] h-[6px] sm:w-[7px] sm:h-[7px]";
  if (showPrice) {
    if (isEndpoint) {
      sizeCls = "min-w-[64px] sm:min-w-[72px] h-[30px] sm:h-[34px] px-3";
    } else {
      sizeCls = "min-w-[46px] sm:min-w-[54px] h-[22px] sm:h-[24px] px-2";
    }
  }

  const opacity =
    node.status === "pending" ? 0.42 : node.status === "in_flight" ? 0.95 : 1;

  return (
    <motion.button
      type="button"
      onClick={clickable ? onClick : undefined}
      initial={
        reducedMotion ? false : { opacity: 0, scale: 0.6, x: cx, y: cy }
      }
      animate={{
        x: cx + pos.x,
        y: cy + pos.y,
        opacity,
        scale: 1,
      }}
      transition={{
        x: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
        y: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.4 },
        scale: { duration: 0.4 },
      }}
      whileHover={clickable ? { scale: 1.12 } : undefined}
      style={{ position: "absolute", top: 0, left: 0 }}
      className={`${clickable ? "cursor-pointer" : "cursor-default"} pointer-events-auto`}
      aria-label={node.agent ? node.agent.agent_id : `agent ${node.idx}`}
    >
      <motion.div
        layout={!reducedMotion}
        animate={
          isEndpoint
            ? { scale: [1, 1.08, 1] }
            : node.status === "in_flight"
              ? { scale: [1, 1.18, 1] }
              : { scale: 1 }
        }
        transition={
          isEndpoint
            ? { duration: 1.4, delay: 0.7, ease: "easeOut" }
            : node.status === "in_flight"
              ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
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

      {/* Tiny static label below pending/in-flight dots so cluster
          structure is legible even before agents return */}
      {!showPrice && (
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 0,
            transform: "translate(-50%, 0)",
            opacity:
              node.status === "pending"
                ? 0.35
                : node.status === "in_flight"
                  ? 0.7
                  : 0.5,
          }}
          className="font-mono text-[8px] sm:text-[9px] text-muted whitespace-nowrap pointer-events-none"
        >
          {SHORT_LABELS[node.idx]}
        </span>
      )}
    </motion.button>
  );
}
