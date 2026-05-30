"use client";

/**
 * RadialAgentStage — Phase 7: silent forensic instrument.
 *
 * Apple-restrained cockpit visualization. No axis colors, no cursor
 * effects, no perpetual rotation. Agents are neutral; only the
 * cheapest (signal-green) and dearest (overcharge-rose) carry color
 * on result.
 *
 * Geometry contract — strand endpoint == node center exactly. Both
 * layers consume positions[i] directly, no per-layer transforms.
 *
 * Modes:
 *   live   → wave-driven status reveal as backend returns data
 *   result → 5 priced nodes morph to pills; on result, irrelevant
 *            agents fade; cheapest + dearest remain bright; their
 *            strands carry the only color in the scene.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  Agent,
  TopologyReport,
  Axis,
  AXIS_LABEL,
  INDEX_TO_AXIS,
  SHORT_LABELS,
} from "./types";
import AgentDetailDrawer from "./AgentDetailDrawer";
import { CLUSTER_ANGLE, Pt, strandPath } from "./orbital";

function indexToAxis(i: number): Axis {
  return INDEX_TO_AXIS[i] || "ctrl";
}

function agentIndex(agent_id: string): number {
  const m = agent_id.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function clusterPos(idx: number, axis: Axis, stage: { w: number; h: number }): Pt {
  const anchorAngle = CLUSTER_ANGLE[axis];
  const anchorR = Math.min(stage.w * 0.34, stage.h * 0.42);
  const ax = Math.cos(anchorAngle) * anchorR;
  const ay = Math.sin(anchorAngle) * anchorR * 0.82;

  const peers: number[] = [];
  for (let i = 0; i < 24; i++) if (indexToAxis(i) === axis) peers.push(i);
  const idxInCluster = peers.indexOf(idx);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const spread = n === 1 ? 0
    : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
      Math.min(stage.w * 0.14, 110);

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
  mode: "live" | "result";
  showLabels?: boolean;
  compact?: boolean;
}

export default function RadialAgentStage({
  report,
  scanStarted = 0,
  mode,
  showLabels = false,
  compact = false,
}: Props) {
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 520 });
  const [selected, setSelected] = useState<Agent | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const isResult = mode === "result";

  /* Live tick during scan */
  useEffect(() => {
    if (isResult || scanStarted === 0) return;
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, [isResult, scanStarted]);

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

  /* Resolve 24-node state */
  const nodes: NodeState[] = useMemo(() => {
    const agentsById = new Map<number, Agent>();
    (report?.agents || []).forEach((a) => agentsById.set(agentIndex(a.agent_id), a));

    let cheapestIdx = -1;
    let dearestIdx = -1;
    if (isResult && report) {
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
      } else if (scanStarted > 0 && !isResult) {
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
  }, [report, scanStarted, isResult, now]);

  const positions = useMemo(
    () => nodes.map((n) => clusterPos(n.idx, n.axis, stage)),
    [nodes, stage],
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

  const height = compact
    ? "h-[52vh] min-h-[380px] sm:min-h-[440px]"
    : "h-[60vh] min-h-[440px] sm:min-h-[500px]";

  return (
    <div className="relative">
      <div ref={stageRef} className={`relative mx-auto w-full max-w-[920px] ${height}`}>
        {/* Center anchor — single soft point */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-secondary/50 pointer-events-none z-[3]"
        />

        {/* SVG strand layer — no transforms, raw position math */}
        <svg
          className="absolute inset-0 pointer-events-none z-[1]"
          width="100%"
          height="100%"
          viewBox={`-${cx} -${cy} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {nodes.map((n) => {
            const target = positions[n.idx];
            const path = strandPath({ x: 0, y: 0 }, target);

            const visible =
              n.status === "in_flight" ||
              n.status === "success" ||
              n.status === "detected" ||
              n.status === "failed";

            let stroke = "rgba(232, 234, 237, 0.18)";
            let strokeWidth = 0.7;
            let opacity = 0.55;

            if (isResult) {
              if (n.isCheapest) {
                stroke = "rgba(0, 217, 122, 0.85)";
                strokeWidth = 1.5;
                opacity = 1;
              } else if (n.isDearest) {
                stroke = "rgba(255, 93, 108, 0.85)";
                strokeWidth = 1.5;
                opacity = 1;
              } else if (n.status === "detected" || n.status === "failed") {
                stroke = "rgba(255, 93, 108, 0.18)";
                opacity = 0.3;
              } else {
                stroke = "rgba(232, 234, 237, 0.08)";
                opacity = 0.22;
              }
            } else if (hoveredIdx === n.idx) {
              stroke = "rgba(232, 234, 237, 0.55)";
              strokeWidth = 1.1;
              opacity = 0.9;
            }

            return (
              <motion.path
                key={n.idx}
                d={path}
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={visible
                  ? { pathLength: 1, opacity }
                  : { pathLength: 0, opacity: 0 }}
                transition={{
                  pathLength: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
                  opacity:    { duration: 0.7 },
                }}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            );
          })}
        </svg>

        {/* Agent nodes */}
        <div className="absolute inset-0 z-[2]">
          {nodes.map((n) => (
            <CockpitAgentNode
              key={n.idx}
              node={n}
              pos={positions[n.idx]}
              cx={cx}
              cy={cy}
              reducedMotion={!!reducedMotion}
              isResult={isResult}
              isHovered={hoveredIdx === n.idx}
              onClick={() => onNodeClick(n)}
              onHover={(h) =>
                setHoveredIdx(h ? n.idx : (cur) => (cur === n.idx ? null : cur))
              }
            />
          ))}
        </div>

        {/* Cluster labels — only on hover or result mode (axis hover) */}
        {showLabels && hoveredIdx !== null && (
          <ClusterLabel
            axis={nodes[hoveredIdx].axis}
            stage={stage}
            cx={cx}
            cy={cy}
          />
        )}

        {/* Status badge */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center pointer-events-none">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {isResult ? "Probe complete" : "Live deployment"}
          </div>
          <div className="font-mono text-[12px] text-secondary tabular-nums mt-0.5">
            {totalDone}<span className="text-muted">/24 agents</span>
            {scanStarted > 0 && !isResult && (
              <span className="ml-3 text-muted">
                {((now - scanStarted) / 1000).toFixed(1)}s
              </span>
            )}
            {isResult && report?.elapsed_seconds && (
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

function ClusterLabel({
  axis,
  stage,
  cx,
  cy,
}: {
  axis: Axis;
  stage: { w: number; h: number };
  cx: number;
  cy: number;
}) {
  const angle = CLUSTER_ANGLE[axis];
  const anchorR = Math.min(stage.w * 0.34, stage.h * 0.42);
  const r = anchorR + 70;
  const lx = cx + Math.cos(angle) * r;
  const ly = cy + Math.sin(angle) * r * 0.82;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 0.8, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: "absolute",
        left: lx,
        top: ly,
        transform: "translate(-50%, -50%)",
      }}
      className="hidden md:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary whitespace-nowrap pointer-events-none z-[4]"
    >
      <span className="w-1 h-1 rounded-full bg-secondary/55" />
      {AXIS_LABEL[axis]}
    </motion.div>
  );
}

/* ─── Agent node ───────────────────────────────────────────────────── */

function CockpitAgentNode({
  node,
  pos,
  cx,
  cy,
  reducedMotion,
  isResult,
  isHovered,
  onClick,
  onHover,
}: {
  node: NodeState;
  pos: Pt;
  cx: number;
  cy: number;
  reducedMotion: boolean;
  isResult: boolean;
  isHovered: boolean;
  onClick: () => void;
  onHover: (h: boolean) => void;
}) {
  const isEndpoint = isResult && (node.isCheapest || node.isDearest);
  const showPrice = isResult && node.price !== null && node.status === "success";
  const clickable =
    node.agent &&
    (node.status === "success" || node.status === "detected" || node.status === "failed");

  /* Opacity — on result, irrelevant agents fade */
  let targetOpacity = 0;
  if (node.status === "pending") {
    targetOpacity = isResult ? 0.10 : 0.45;
  } else if (node.status === "in_flight") {
    targetOpacity = 0.9;
  } else if (isResult) {
    if (isEndpoint) targetOpacity = 1;
    else if (node.price !== null) targetOpacity = 0.20;
    else if (node.status === "detected" || node.status === "failed") targetOpacity = 0.30;
    else targetOpacity = 0.12;
  } else {
    targetOpacity = 1;
  }

  /* Bubble — neutral by default; signal/overcharge only for endpoints */
  let bubbleStyle: React.CSSProperties = {
    transform: "translate(-50%, -50%)",
    backgroundColor: "rgba(232, 234, 237, 0.10)",
    border: "1px solid rgba(232, 234, 237, 0.22)",
  };
  let textColor: string | undefined;

  if (node.status === "in_flight") {
    bubbleStyle.backgroundColor = "rgba(232, 234, 237, 0.20)";
    bubbleStyle.border = "1px solid rgba(232, 234, 237, 0.40)";
  } else if (node.status === "detected" || node.status === "failed") {
    bubbleStyle.backgroundColor = "rgba(255, 93, 108, 0.12)";
    bubbleStyle.border = "1px solid rgba(255, 93, 108, 0.35)";
  }
  if (showPrice) {
    if (node.isCheapest) {
      bubbleStyle = {
        transform: "translate(-50%, -50%)",
        backgroundColor: "#00d97a",
        border: "1px solid #00d97a",
      };
      textColor = "#07080c";
    } else if (node.isDearest) {
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
        border: "1px solid rgba(232, 234, 237, 0.18)",
      };
      textColor = "rgba(232, 234, 237, 0.7)";
    }
  }
  if (isHovered && !showPrice) {
    bubbleStyle.backgroundColor = "rgba(232, 234, 237, 0.22)";
    bubbleStyle.border = "1px solid rgba(232, 234, 237, 0.45)";
  }

  /* Size */
  let sizeCls = "w-[6px] h-[6px] sm:w-[7px] sm:h-[7px]";
  if (showPrice) {
    sizeCls = isEndpoint
      ? "min-w-[68px] sm:min-w-[78px] h-[32px] sm:h-[36px] px-3"
      : "min-w-[50px] sm:min-w-[58px] h-[24px] sm:h-[26px] px-2.5";
  }

  /* Endpoint label */
  const endpointLabel = isResult && (node.isCheapest || node.isDearest);

  return (
    <motion.div
      onMouseEnter={() => clickable && onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={clickable ? onClick : undefined}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.6, x: cx, y: cy }}
      animate={{
        x: cx + pos.x,
        y: cy + pos.y,
        opacity: targetOpacity,
        scale: isHovered && !isResult ? 1.20 : 1,
      }}
      transition={{
        x:       { duration: isResult ? 0.6 : 0.9, ease: [0.22, 1, 0.36, 1] },
        y:       { duration: isResult ? 0.6 : 0.9, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.7 },
        scale:   { duration: 0.3 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className={`${clickable ? "cursor-pointer" : "cursor-default"} pointer-events-auto`}
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
            ${node.price}
          </span>
        )}
      </div>

      {/* Hover label OR endpoint label */}
      <AnimatePresence>
        {((isHovered && !isResult) || endpointLabel) && !showPrice && (
          <motion.span
            key="label"
            initial={reducedMotion ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              top: 14,
              left: 0,
              transform: "translate(-50%, 0)",
            }}
            className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted whitespace-nowrap pointer-events-none hidden sm:block"
          >
            {SHORT_LABELS[node.idx]}
          </motion.span>
        )}
        {endpointLabel && showPrice && (
          <motion.span
            key="endpoint-label"
            initial={reducedMotion ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            style={{
              position: "absolute",
              top: 26,
              left: 0,
              transform: "translate(-50%, 0)",
            }}
            className={`font-mono text-[9px] uppercase tracking-[0.22em] whitespace-nowrap pointer-events-none ${
              node.isCheapest ? "text-signal" : "text-overcharge"
            }`}
          >
            {SHORT_LABELS[node.idx]}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
