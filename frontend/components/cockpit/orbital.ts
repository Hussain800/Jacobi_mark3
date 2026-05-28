/**
 * Orbital primitives — shared between the landing HeroScene and the
 * cockpit RadialAgentStage so the two surfaces use a single coordinate
 * + color vocabulary.
 *
 *   AXIS_COLOR    — per-cluster core / glow / soft tints
 *   CLUSTER_ANGLE — radians from stage center to each cluster anchor
 *   CLUSTER_DELAY — staggered deploy timing per cluster (seconds)
 *   strandPath    — quadratic bezier from origin to target (organic curve)
 *   depthFactor   — opacity by angle for 2.5D illusion
 *   repulsionOffset — inverse-distance cursor repulsion with cubic falloff
 */

import { Axis } from "./types";

export const AXIS_COLOR: Record<Axis, { core: string; glow: string; soft: string }> = {
  loc:    { core: "#00d97a", glow: "rgba(0, 217, 122, 0.55)",   soft: "rgba(0, 217, 122, 0.20)" },
  dev:    { core: "#22d3ee", glow: "rgba(34, 211, 238, 0.55)",  soft: "rgba(34, 211, 238, 0.20)" },
  cookie: { core: "#f5b945", glow: "rgba(245, 185, 69, 0.55)",  soft: "rgba(245, 185, 69, 0.20)" },
  ref:    { core: "#ff5d6c", glow: "rgba(255, 93, 108, 0.55)",  soft: "rgba(255, 93, 108, 0.20)" },
  ctrl:   { core: "#a78bfa", glow: "rgba(167, 139, 250, 0.55)", soft: "rgba(167, 139, 250, 0.20)" },
};

export const CLUSTER_ANGLE: Record<Axis, number> = {
  loc:    -Math.PI / 2,
  dev:     Math.PI * 0.20,
  cookie:  Math.PI * 0.58,
  ref:     Math.PI * 0.97,
  ctrl:   -Math.PI * 0.80,
};

export const CLUSTER_DELAY: Record<Axis, number> = {
  loc:    0.00,
  dev:    0.25,
  cookie: 0.50,
  ref:    0.70,
  ctrl:   0.85,
};

export interface Pt { x: number; y: number }

/** Curved bezier from origin to target with a perpendicular bow */
export function strandPath(origin: Pt, target: Pt): string {
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

/** Depth opacity factor by angle — back of orbital plane fades. */
export function depthFactor(target: Pt): number {
  const angle = Math.atan2(target.y, target.x);
  return 0.7 + 0.3 * ((1 + Math.sin(angle)) / 2);
}

/** Inverse-distance repulsion with cubic falloff, capped magnitude. */
export const REPULSE_RADIUS = 160;
export const REPULSE_MAX_PX = 38;

export function repulsionOffset(nodePos: Pt, cursor: Pt | null): Pt {
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
