'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/* ── Types ────────────────────────────────────────────────────────────── */

interface Agent {
  id: string;
  status: string;     // 'active' | 'idle' | 'error' …
  exitIp: string;
  latency: number;    // ms
}

interface TopologyGraphProps {
  agents: Agent[];
  targetHost: string;
}

interface SimNode {
  id: string;
  x: number;
  y: number;
  layer: number;      // 0 = agent, 1 = proxy, 2 = target
  label: string;
  meta?: Record<string, unknown>;
}

interface SimLink {
  source: string;
  target: string;
}

/* ── Palette ──────────────────────────────────────────────────────────── */

const COLORS = {
  agent:  '#00d992',
  proxy:  '#60a5fa',
  target: '#fb7185',
  bg:     '#0c0d12',
  grid:   '#1a1c24',
  text:   '#94a3b8',
  link:   '#2e3340',
  pulse:  '#00d992',
} as const;

const CANVAS_W = 900;
const CANVAS_H = 500;
const NODE_R   = 18;

/* ── Component ────────────────────────────────────────────────────────── */

const TopologyGraph: React.FC<TopologyGraphProps> = ({ agents, targetHost }) => {
  const svgRef     = useRef<SVGSVGElement | null>(null);
  const workerRef  = useRef<Worker | null>(null);
  const nodesRef   = useRef<Record<string, SVGGElement | null>>({});
  const linksRef   = useRef<Record<string, SVGLineElement | null>>({});
  const pulseRef   = useRef<Record<string, SVGCircleElement | null>>({});
  const labelRef   = useRef<Record<string, SVGTextElement | null>>({});
  const frameIdRef = useRef<number>(0);

  /* ── Derive topology from props ──────────────────────────────────── */

  const { simNodes, simLinks, proxyIds } = useMemo(() => {
    // Unique exit IPs become proxy nodes
    const proxySet = new Set<string>();
    agents.forEach((a) => {
      if (a.exitIp) proxySet.add(a.exitIp);
    });
    const proxyIds = Array.from(proxySet);

    const simNodes: SimNode[] = [];
    const simLinks: SimLink[] = [];

    // Agent nodes (layer 0)
    agents.forEach((a) => {
      simNodes.push({
        id: a.id,
        x: 0,
        y: 0,
        layer: 0,
        label: a.id.slice(0, 8),
        meta: { status: a.status, latency: a.latency },
      });
    });

    // Proxy nodes (layer 1)
    proxyIds.forEach((ip) => {
      simNodes.push({
        id: `proxy-${ip}`,
        x: 0,
        y: 0,
        layer: 1,
        label: ip,
      });
    });

    // Target node (layer 2)
    simNodes.push({
      id: 'target',
      x: 0,
      y: 0,
      layer: 2,
      label: targetHost,
    });

    // Links: agent → proxy
    agents.forEach((a) => {
      if (a.exitIp) {
        simLinks.push({ source: a.id, target: `proxy-${a.exitIp}` });
      }
    });

    // Links: proxy → target
    proxyIds.forEach((ip) => {
      simLinks.push({ source: `proxy-${ip}`, target: 'target' });
    });

    return { simNodes, simLinks, proxyIds };
  }, [agents, targetHost]);

  /* ── Worker lifecycle ────────────────────────────────────────────── */

  useEffect(() => {
    const worker = new Worker('/workers/forceWorker.js');
    workerRef.current = worker;

    worker.onmessage = (evt: MessageEvent) => {
      const { type, nodes } = evt.data as { type: string; nodes: SimNode[]; settled: boolean };
      if (type !== 'TICK') return;

      // Cancel any pending rAF to avoid stacking
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);

      frameIdRef.current = requestAnimationFrame(() => {
        applyPositions(nodes);
      });
    };

    // Send init
    worker.postMessage({
      type: 'INIT',
      nodes: simNodes,
      links: simLinks,
      width: CANVAS_W,
      height: CANVAS_H,
    });

    return () => {
      worker.postMessage({ type: 'STOP' });
      worker.terminate();
      workerRef.current = null;
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    };
  }, [simNodes, simLinks]);

  /* ── Direct DOM mutation (bypass Virtual DOM) ────────────────────── */

  const applyPositions = useCallback((updatedNodes: SimNode[]) => {
    const nodeMap: Record<string, SimNode> = {};
    for (const n of updatedNodes) {
      nodeMap[n.id] = n;

      // Move node group
      const g = nodesRef.current[n.id];
      if (g) {
        g.setAttribute('transform', `translate(${n.x}, ${n.y})`);
      }

      // Pulse ring
      const pulse = pulseRef.current[n.id];
      if (pulse) {
        pulse.setAttribute('cx', String(n.x));
        pulse.setAttribute('cy', String(n.y));
      }
    }

    // Update links
    for (const link of simLinks) {
      const s = nodeMap[link.source];
      const t = nodeMap[link.target];
      if (!s || !t) continue;
      const el = linksRef.current[`${link.source}→${link.target}`];
      if (el) {
        el.setAttribute('x1', String(s.x));
        el.setAttribute('y1', String(s.y));
        el.setAttribute('x2', String(t.x));
        el.setAttribute('y2', String(t.y));
      }
    }
  }, [simLinks]);

  /* ── Colour helper ───────────────────────────────────────────────── */

  const nodeColor = (layer: number): string => {
    if (layer === 0) return COLORS.agent;
    if (layer === 1) return COLORS.proxy;
    return COLORS.target;
  };

  const isActive = (node: SimNode): boolean => {
    return node.meta?.status === 'active';
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div
      style={{
        background: COLORS.bg,
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid #1e2030',
        boxShadow: '0 0 60px rgba(0,217,146,0.04)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: COLORS.agent,
              boxShadow: `0 0 8px ${COLORS.agent}`,
              display: 'inline-block',
            }}
          />
          <span
            style={{
              color: '#e2e8f0',
              fontSize: '13px',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Routing Topology
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {[
            { label: 'Agents', color: COLORS.agent },
            { label: 'Proxies', color: COLORS.proxy },
            { label: 'Target', color: COLORS.target },
          ].map((item) => (
            <div
              key={item.label}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: item.color,
                  opacity: 0.85,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  color: COLORS.text,
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width="100%"
        height="auto"
        style={{
          borderRadius: '12px',
          background: `
            radial-gradient(circle at 20% 50%, rgba(0,217,146,0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 50%, rgba(251,113,133,0.03) 0%, transparent 50%),
            ${COLORS.bg}
          `,
        }}
      >
        <defs>
          {/* Glow filter for active nodes */}
          <filter id="glow-agent" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-proxy" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-target" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Animated dash for links */}
          <style>{`
            @keyframes dash-flow {
              to { stroke-dashoffset: -24; }
            }
            @keyframes pulse-ring {
              0%   { r: ${NODE_R}; opacity: 0.6; }
              100% { r: ${NODE_R + 14}; opacity: 0; }
            }
            .link-line {
              stroke-dasharray: 6 6;
              animation: dash-flow 0.8s linear infinite;
            }
            .pulse-indicator {
              animation: pulse-ring 1.6s ease-out infinite;
            }
          `}</style>
        </defs>

        {/* Grid lines (subtle) */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={`vgrid-${i}`}
            x1={CANVAS_W * ((i + 1) / 7)}
            y1={0}
            x2={CANVAS_W * ((i + 1) / 7)}
            y2={CANVAS_H}
            stroke={COLORS.grid}
            strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: 4 }).map((_, i) => (
          <line
            key={`hgrid-${i}`}
            x1={0}
            y1={CANVAS_H * ((i + 1) / 5)}
            x2={CANVAS_W}
            y2={CANVAS_H * ((i + 1) / 5)}
            stroke={COLORS.grid}
            strokeWidth={0.5}
          />
        ))}

        {/* Links */}
        {simLinks.map((link) => (
          <line
            key={`${link.source}→${link.target}`}
            ref={(el) => {
              linksRef.current[`${link.source}→${link.target}`] = el;
            }}
            className="link-line"
            x1={0}
            y1={0}
            x2={0}
            y2={0}
            stroke={COLORS.link}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}

        {/* Pulse indicators (active nodes only) */}
        {simNodes
          .filter((n) => isActive(n))
          .map((n) => (
            <circle
              key={`pulse-${n.id}`}
              ref={(el) => {
                pulseRef.current[n.id] = el;
              }}
              className="pulse-indicator"
              cx={0}
              cy={0}
              r={NODE_R}
              fill="none"
              stroke={nodeColor(n.layer)}
              strokeWidth={1.5}
              opacity={0.5}
            />
          ))}

        {/* Nodes */}
        {simNodes.map((n) => (
          <g
            key={n.id}
            ref={(el) => {
              nodesRef.current[n.id] = el;
            }}
            transform="translate(0,0)"
            style={{ cursor: 'pointer' }}
          >
            {/* Outer halo */}
            <circle
              r={NODE_R + 4}
              fill="none"
              stroke={nodeColor(n.layer)}
              strokeWidth={0.6}
              opacity={0.25}
            />

            {/* Main circle */}
            <circle
              r={NODE_R}
              fill={COLORS.bg}
              stroke={nodeColor(n.layer)}
              strokeWidth={2}
              filter={
                n.layer === 0
                  ? 'url(#glow-agent)'
                  : n.layer === 1
                    ? 'url(#glow-proxy)'
                    : 'url(#glow-target)'
              }
            />

            {/* Icon (layer-dependent) */}
            {n.layer === 0 && (
              /* Agent: simple shield shape */
              <path
                d="M0-8 L6-4 L6 3 Q6 8 0 10 Q-6 8-6 3 L-6-4Z"
                fill="none"
                stroke={COLORS.agent}
                strokeWidth={1.2}
                opacity={0.9}
              />
            )}
            {n.layer === 1 && (
              /* Proxy: two connected circles */
              <>
                <circle cx={-4} cy={-2} r={3.5} fill="none" stroke={COLORS.proxy} strokeWidth={1.2} opacity={0.9} />
                <circle cx={4} cy={2} r={3.5} fill="none" stroke={COLORS.proxy} strokeWidth={1.2} opacity={0.9} />
                <line x1={-1} y1={0} x2={1} y2={0} stroke={COLORS.proxy} strokeWidth={1} opacity={0.6} />
              </>
            )}
            {n.layer === 2 && (
              /* Target: crosshair */
              <>
                <circle cx={0} cy={0} r={5} fill="none" stroke={COLORS.target} strokeWidth={1.2} opacity={0.9} />
                <line x1={-8} y1={0} x2={8} y2={0} stroke={COLORS.target} strokeWidth={0.8} opacity={0.6} />
                <line x1={0} y1={-8} x2={0} y2={8} stroke={COLORS.target} strokeWidth={0.8} opacity={0.6} />
              </>
            )}

            {/* Label */}
            <text
              ref={(el) => {
                labelRef.current[n.id] = el;
              }}
              y={NODE_R + 16}
              textAnchor="middle"
              fill={COLORS.text}
              fontSize={10}
              fontFamily="'JetBrains Mono', 'Fira Code', monospace"
              style={{ userSelect: 'none' }}
            >
              {n.label}
            </text>

            {/* Latency badge (agents only) */}
            {n.layer === 0 && n.meta?.latency != null && (
              <text
                y={NODE_R + 28}
                textAnchor="middle"
                fill={COLORS.agent}
                fontSize={9}
                fontFamily="'JetBrains Mono', monospace"
                opacity={0.7}
              >
                {String(n.meta.latency ?? "")}ms
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Footer stats */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          marginTop: '14px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          color: COLORS.text,
        }}
      >
        <span>
          <span style={{ color: COLORS.agent, fontWeight: 700 }}>{agents.length}</span>{' '}
          agents
        </span>
        <span>
          <span style={{ color: COLORS.proxy, fontWeight: 700 }}>{proxyIds.length}</span>{' '}
          proxies
        </span>
        <span>
          target:{' '}
          <span style={{ color: COLORS.target, fontWeight: 700 }}>{targetHost}</span>
        </span>
      </div>
    </div>
  );
};

export default TopologyGraph;
