/**
 * Orbital primitives — the shared coordinate vocabulary for the cockpit
 * RadialAgentStage.
 *
 * Phase 7 simplification: stripped all per-axis color, cursor repulsion,
 * and depth opacity helpers. The new design language is neutral —
 * agents are gray/white by default, signal-green only for cheapest,
 * overcharge-rose only for the dearest endpoint.
 */

import { Axis } from "./types";

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

/**
 * Curved bezier from origin to target with a perpendicular bow.
 * Adjacent strands bow in opposite directions because adjacent indexes
 * have different angles, avoiding parallel-tracks look.
 */
export function strandPath(origin: Pt, target: Pt): string {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const angle = Math.atan2(dy, dx);
  const length = Math.hypot(dx, dy);
  const perp = angle + Math.PI / 2;
  const bow = Math.min(length * 0.10, 28);
  const midX = origin.x + dx * 0.5 + Math.cos(perp) * bow;
  const midY = origin.y + dy * 0.5 + Math.sin(perp) * bow;
  return `M ${origin.x} ${origin.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
}
