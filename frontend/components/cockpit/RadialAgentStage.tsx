"use client";

/**
 * RadialAgentStage — Phase 6 vocabulary in the cockpit.
 *
 * Identical visual language to the landing HeroScene:
 *   • Per-axis colored, glowy nodes (signal / cyan / amber / rose / violet)
 *   • Spider-web strands — gradient stops from bright bone-white at the
 *     center origin to the axis core at the node end
 *   • Cursor halo follows the mouse with spring physics
 *   • Cursor repulsion — nodes and their strand endpoints push away
 *     from the cursor within 160 px radius (cubic falloff)
 *   • Perpetual gentle rotation (~30s/rev) and per-node organic breath
 *   • Curved bezier strands (organic, not straight rays)
 *   • Depth opacity for 2.5D illusion
 *
 * Two modes:
 *   • live   → all of the above, plus wave-driven status reveal
 *   • result → rotation continues at half speed; the cheapest and
 *              dearest pills carry the spread, their strands stay full
 *              signal/overcharge, others dim.
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
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
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
import {
  AXIS_COLOR,
  CLUSTER_ANGLE,
  Pt,
  strandPath,
  depthFactor,
  repulsionOffset,
} from "./orbital";

function indexToAxis(i: number): Axis {
  return INDEX_TO_AXIS[i] || "ctrl";
}

function agentIndex(agent_id: string): number {
  const m = agent_id.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Cluster position with rotation offset. */
function clusterPos(idx: number, axis: Axis, stage: { w: number; h: number }, rot = 0): Pt {
  const anchorAngle = CLUSTER_ANGLE[axis] + rot;
  const anchorR = Math.min(stage.w * 0.34, stage.h * 0.40);
  const ax = Math.cos(anchorAngle) * anchorR;
  const ay = Math.sin(anchorAngle) * anchorR * 0.82;

  const peers: number[] = [];
  for (let i = 0; i < 24; i++) if (indexToAxis(i) === axis) peers.push(i);
  const idxInCluster = peers.indexOf(idx);
  const n = peers.length;
  const tangentAngle = anchorAngle + Math.PI / 2;
  const spread = n === 1
    ? 0
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

  /* Cursor tracking — motion values + springs */
  const cursorPxX  = useMotionValue(0);
  const cursorPxY  = useMotionValue(0);
  const cursorHaloX = useSpring(cursorPxX, { stiffness: 140, damping: 24 });
  const cursorHaloY = useSpring(cursorPxY, { stiffness: 140, damping: 24 });
  const cursorStageX = useMotionValue(99999);
  const cursorStageY = useMotionValue(99999);
  const cursorRepX = useSpring(cursorStageX, { stiffness: 150, damping: 22 });
  const cursorRepY = useSpring(cursorStageY, { stiffness: 150, damping: 22 });

  // Unified parallax so nodes and strands move together (no drift)
  const mouseNormX = useMotionValue(0);
  const mouseNormY = useMotionValue(0);
  const PARALLAX_MAG = 8;
  const parallaxX = useSpring(useTransform(mouseNormX, (v) => v * PARALLAX_MAG), { stiffness: 60, damping: 20 });
  const parallaxY = useSpring(useTransform(mouseNormY, (v) => v * PARALLAX_MAG), { stiffness: 60, damping: 20 });
  const [cursorInside, setCursorInside] = useState(false);

  /* Live tick during scan */
  useEffect(() => {
    if (isComplete || scanStarted === 0) return;
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, [isComplete, scanStarted]);

  /* Perpetual rotation — slower in result */
  useEffect(() => {
    if (reducedMotion) return;
    const speed = isComplete ? 0.0003 : 0.0007;
    const id = setInterval(() => {
      setRotationOffset((prev) => (prev + speed) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(id);
  }, [isComplete, reducedMotion]);

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
      cursorStageX.set(px - rect.width / 2);
      cursorStageY.set(py - rect.height / 2);
      mouseNormX.set((px - rect.width / 2) / (rect.width / 2));
      mouseNormY.set((py - rect.height / 2) / (rect.height / 2));
    };
    const enter = () => setCursorInside(true);
    const leave = () => {
      setCursorInside(false);
      mouseNormX.set(0); mouseNormY.set(0);
      cursorStageX.set(99999); cursorStageY.set(99999);
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

  /* Resolve 24-node state from report */
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

  const clusterLabels = useMemo(() => {
    if (!stage.w) return [];
    const anchorR = Math.min(stage.w * 0.34, stage.h * 0.40);
    const r = anchorR + 70; // clear the tangential pill fan
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
    ? "h-[52vh] min-h-[400px] sm:min-h-[460px]"
    : "h-[64vh] min-h-[480px] sm:min-h-[540px]";

  return (
    <div className="relative">
      <div ref={stageRef} className={`relative mx-auto w-full max-w-[940px] ${height}`}>
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
                  width: 320,
                  height: 320,
                  marginLeft: -160,
                  marginTop:  -160,
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

        {/* Center anchor */}
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
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-signal pointer-events-none z-20"
          style={{ boxShadow: "0 0 22px rgba(0, 217, 122, 0.65)" }}
        />

        {/* SVG strand layer — same parallax as node layer for perfect alignment */}
        <motion.svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          viewBox={`-${cx} -${cy} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
          style={reducedMotion ? {} : { x: parallaxX, y: parallaxY }}
        >
          <defs>
            {(Object.keys(AXIS_COLOR) as Axis[]).map((axis) => (
              <linearGradient key={axis} id={`cockpit-web-${axis}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgba(225, 232, 245, 0.6)" />
                <stop offset="100%" stopColor={AXIS_COLOR[axis].core} stopOpacity="0.55" />
              </linearGradient>
            ))}
          </defs>
          {nodes.map((n) => (
            <CockpitStrand
              key={n.idx}
              node={n}
              target={positions[n.idx]}
              hovered={hoveredIdx === n.idx}
              isComplete={isComplete}
              cursorRepX={cursorRepX}
              cursorRepY={cursorRepY}
              reducedMotion={!!reducedMotion}
            />
          ))}
        </motion.svg>

        {/* Cluster labels */}
        {showLabels &&
          clusterLabels.map((l) => {
            const c = AXIS_COLOR[l.axis];
            return (
              <div
                key={l.axis}
                style={{
                  position: "absolute",
                  left: l.x,
                  top: l.y,
                  transform: "translate(-50%, -50%)",
                }}
                className="hidden md:flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] whitespace-nowrap pointer-events-none"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: c.core, boxShadow: `0 0 8px ${c.glow}` }}
                />
                <span style={{ color: c.core, opacity: 0.85 }}>{AXIS_LABEL[l.axis]}</span>
              </div>
            );
          })}

        {/* Agent nodes — same parallax */}
        <motion.div
          className="absolute inset-0 z-10"
          style={reducedMotion ? {} : { x: parallaxX, y: parallaxY }}
        >
          {nodes.map((n) => (
            <CockpitAgentNode
              key={n.idx}
              node={n}
              pos={positions[n.idx]}
              cx={cx}
              cy={cy}
              reducedMotion={!!reducedMotion}
              isComplete={isComplete}
              depth={depthFactor(positions[n.idx])}
              isHovered={hoveredIdx === n.idx}
              onClick={() => onNodeClick(n)}
              onHover={(h) =>
                setHoveredIdx(h ? n.idx : (cur) => (cur === n.idx ? null : cur))
              }
              cursorRepX={cursorRepX}
              cursorRepY={cursorRepY}
            />
          ))}
        </motion.div>

        {/* Status badge */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center pointer-events-none">
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

/* ─── Strand — curved bezier with cluster tint + repulsion ─────────── */

function CockpitStrand({
  node,
  target,
  hovered,
  isComplete,
  cursorRepX,
  cursorRepY,
  reducedMotion,
}: {
  node: NodeState;
  target: Pt;
  hovered: boolean;
  isComplete: boolean;
  cursorRepX: MotionValue<number>;
  cursorRepY: MotionValue<number>;
  reducedMotion: boolean;
}) {
  /* Strand endpoint follows the same repulsion as its node */
  const d = useTransform([cursorRepX, cursorRepY], ([rx, ry]) => {
    const off = reducedMotion ? { x: 0, y: 0 } : repulsionOffset(target, { x: rx as number, y: ry as number });
    const t = { x: target.x + off.x, y: target.y + off.y };
    return strandPath({ x: 0, y: 0 }, t);
  });

  const visible =
    node.status === "in_flight" ||
    node.status === "success" ||
    node.status === "detected" ||
    node.status === "failed";

  const c = AXIS_COLOR[node.axis];
  let stroke = `url(#cockpit-web-${node.axis})`;
  let strokeWidth = 0.9;
  let opacity = 0.7;

  if (isComplete) {
    if (node.isCheapest) {
      stroke = "rgba(0, 217, 122, 0.92)";
      strokeWidth = 1.8;
      opacity = 1;
    } else if (node.isDearest) {
      stroke = "rgba(255, 93, 108, 0.92)";
      strokeWidth = 1.8;
      opacity = 1;
    } else if (node.status === "detected" || node.status === "failed") {
      stroke = "rgba(255, 93, 108, 0.25)";
      opacity = 0.5;
    } else {
      stroke = `url(#cockpit-web-${node.axis})`;
      opacity = 0.45;
    }
  } else if (hovered) {
    stroke = c.core;
    strokeWidth = 1.6;
    opacity = 1;
  }

  return (
    <motion.path
      d={d as unknown as string}
      fill="none"
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={visible ? { pathLength: 1, opacity } : { pathLength: 0, opacity: 0 }}
      transition={{
        pathLength: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
        opacity:    { duration: 0.5 },
        stroke:     { duration: 0.6 },
        strokeWidth: { duration: 0.6 },
      }}
      stroke={stroke}
      strokeWidth={strokeWidth}
      style={{ filter: hovered ? `drop-shadow(0 0 6px ${c.glow})` : undefined }}
    />
  );
}

/* ─── Agent node — glowy, color-tinted, repulsive ─────────────────── */

function CockpitAgentNode({
  node,
  pos,
  cx,
  cy,
  reducedMotion,
  isComplete,
  depth,
  isHovered,
  onClick,
  onHover,
  cursorRepX,
  cursorRepY,
}: {
  node: NodeState;
  pos: Pt;
  cx: number;
  cy: number;
  reducedMotion: boolean;
  isComplete: boolean;
  depth: number;
  isHovered: boolean;
  onClick: () => void;
  onHover: (h: boolean) => void;
  cursorRepX: MotionValue<number>;
  cursorRepY: MotionValue<number>;
}) {
  const isEndpoint = isComplete && (node.isCheapest || node.isDearest);
  const showPrice = isComplete && node.price !== null && node.status === "success";
  const clickable =
    node.agent &&
    (node.status === "success" || node.status === "detected" || node.status === "failed");
  const c = AXIS_COLOR[node.axis];

  /* Repulsion offset */
  const repX = useTransform([cursorRepX, cursorRepY], ([rx, ry]) => {
    if (reducedMotion) return 0;
    return repulsionOffset(pos, { x: rx as number, y: ry as number }).x;
  });
  const repY = useTransform([cursorRepX, cursorRepY], ([rx, ry]) => {
    if (reducedMotion) return 0;
    return repulsionOffset(pos, { x: rx as number, y: ry as number }).y;
  });

  /* Sizing */
  let sizeCls = "w-[8px] h-[8px] sm:w-[10px] sm:h-[10px]";
  if (showPrice) {
    sizeCls = isEndpoint
      ? "min-w-[68px] sm:min-w-[78px] h-[32px] sm:h-[36px] px-3"
      : "min-w-[50px] sm:min-w-[58px] h-[24px] sm:h-[26px] px-2.5";
  }

  /* Bubble style — glowy with cluster color */
  let bubbleStyle: React.CSSProperties = {
    transform: "translate(-50%, -50%)",
    backgroundColor: c.soft,
    borderColor: `${c.core}50`,
    boxShadow: `0 0 12px ${c.glow}, inset 0 0 4px ${c.soft}`,
  };
  let textColor: string | undefined;

  if (node.status === "pending") {
    bubbleStyle.opacity = 0.55;
    bubbleStyle.boxShadow = `0 0 6px ${c.soft}`;
  } else if (node.status === "in_flight") {
    bubbleStyle.opacity = 1;
    bubbleStyle.backgroundColor = c.soft;
    bubbleStyle.borderColor = c.core;
    bubbleStyle.boxShadow = `0 0 18px ${c.glow}`;
  } else if (node.status === "success" && !showPrice) {
    bubbleStyle.backgroundColor = "rgba(12, 14, 19, 0.9)";
    bubbleStyle.borderColor = c.core;
    bubbleStyle.boxShadow = `0 0 14px ${c.glow}, inset 0 0 6px ${c.soft}`;
  } else if (node.status === "detected" || node.status === "failed") {
    bubbleStyle.backgroundColor = "rgba(255, 93, 108, 0.15)";
    bubbleStyle.borderColor = "rgba(255, 93, 108, 0.5)";
    bubbleStyle.boxShadow = "0 0 14px rgba(255, 93, 108, 0.45)";
  }
  if (showPrice) {
    if (node.isCheapest) {
      bubbleStyle.backgroundColor = "#00d97a";
      bubbleStyle.borderColor = "#00d97a";
      bubbleStyle.boxShadow = "0 0 32px rgba(0, 217, 122, 0.65), 0 0 12px rgba(0, 217, 122, 0.45)";
      textColor = "#07080c";
    } else if (node.isDearest) {
      bubbleStyle.backgroundColor = "#ff5d6c";
      bubbleStyle.borderColor = "#ff5d6c";
      bubbleStyle.boxShadow = "0 0 32px rgba(255, 93, 108, 0.65), 0 0 12px rgba(255, 93, 108, 0.45)";
      textColor = "#07080c";
    } else {
      bubbleStyle.backgroundColor = "rgba(12, 14, 19, 0.95)";
      bubbleStyle.borderColor = `${c.core}80`;
      bubbleStyle.boxShadow = `0 0 16px ${c.glow}`;
      textColor = c.core;
    }
  }
  if (isHovered && !showPrice) {
    bubbleStyle.boxShadow = `0 0 22px ${c.core}, 0 0 8px ${c.glow}`;
  }

  const baseOpacity =
    node.status === "pending"   ? 0.55 :
    node.status === "in_flight" ? 0.95 :
                                   1;
  const targetOpacity = Math.max(0.55, baseOpacity * depth);

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
        scale: isHovered ? 1.28 : 1,
      }}
      transition={{
        x:       { duration: isComplete ? 0.6 : 0.9, ease: [0.22, 1, 0.36, 1] },
        y:       { duration: isComplete ? 0.6 : 0.9, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.4 },
        scale:   { duration: 0.3 },
      }}
      style={{ position: "absolute", top: 0, left: 0 }}
      className={`${clickable ? "cursor-pointer" : "cursor-default"} pointer-events-auto`}
    >
      <motion.div style={{ x: repX, y: repY, willChange: "transform" }}>
        <motion.div
          animate={
            isEndpoint
              ? { scale: [1, 1.05, 1] }
              : node.status === "in_flight"
                ? { scale: [1, 1.18, 1] }
                : node.status === "pending"
                  ? { scale: [1, 1.07, 1] }
                  : { scale: [1, 1.04, 1] }
          }
          transition={{
            duration: 2.4 + (node.idx % 6) * 0.35,
            repeat: Infinity,
            ease: "easeInOut",
            delay: (node.idx % 9) * 0.18,
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
              ${node.price}
            </span>
          )}
        </motion.div>

        {!showPrice && (
          <span
            style={{
              position: "absolute",
              top: 14,
              left: 0,
              transform: "translate(-50%, 0)",
              color: isHovered ? c.core : "#5b6270",
              textShadow: isHovered ? `0 0 6px ${c.glow}` : undefined,
              opacity:
                isHovered ? 1 :
                node.status === "pending" ? 0.35 :
                node.status === "in_flight" ? 0.75 :
                0.55,
            }}
            className="font-mono text-[8px] sm:text-[9px] whitespace-nowrap pointer-events-none transition-colors hidden sm:block"
          >
            {SHORT_LABELS[node.idx]}
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}
