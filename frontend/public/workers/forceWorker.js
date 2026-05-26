/**
 * forceWorker.js
 * ──────────────────────────────────────────────────────────────────────
 * Self-contained force-directed simulation engine for the proxy routing
 * topology graph.  Runs entirely off the main thread.
 *
 * Protocol
 *   IN  → { type: 'INIT', nodes: Node[], links: Link[] }
 *   IN  → { type: 'STOP' }
 *   OUT → { type: 'TICK', nodes: Node[] }
 *
 * Layout
 *   Layer 0  –  Agents   (left column)
 *   Layer 1  –  Proxies  (center column)
 *   Layer 2  –  Target   (right column)
 *
 * Force model
 *   1. Horizontal position force  → pulls each node toward its layer column
 *   2. Vertical repulsion         → same-layer nodes repel vertically
 *   3. Link spring force          → maintains natural edge lengths
 *   4. Global velocity damping    → ensures convergence
 * ──────────────────────────────────────────────────────────────────────
 */

/* ── Tuning constants ────────────────────────────────────────────────── */
const ALPHA_INITIAL   = 1.0;
const ALPHA_DECAY     = 0.0028;      // per tick — ~250 ticks to cool
const ALPHA_MIN       = 0.001;
const VELOCITY_DECAY  = 0.4;

const LAYER_FORCE_STRENGTH   = 0.35;  // horizontal pull toward column
const REPULSION_STRENGTH     = 800;   // vertical same-layer repulsion
const REPULSION_MIN_DIST     = 20;
const LINK_STRENGTH          = 0.08;
const LINK_DISTANCE          = 180;

const TICK_INTERVAL_MS = 16;          // ~60 fps throttle

/* ── State ───────────────────────────────────────────────────────────── */
let nodes    = [];
let links    = [];
let alpha    = ALPHA_INITIAL;
let running  = false;
let tickTimer = null;
let canvasW  = 900;
let canvasH  = 500;

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Returns the target x-coordinate for a given layer index. */
function layerX(layer) {
  const padding = canvasW * 0.12;
  const usable  = canvasW - padding * 2;
  return padding + (layer / 2) * usable;   // 0 → left, 1 → mid, 2 → right
}

/** Seed nodes with initial positions based on layer membership. */
function initPositions() {
  // Group by layer to compute vertical spacing
  const layerBuckets = [[], [], []];
  for (const n of nodes) {
    layerBuckets[n.layer].push(n);
  }

  for (let l = 0; l < 3; l++) {
    const bucket = layerBuckets[l];
    const count  = bucket.length;
    const gap    = canvasH / (count + 1);
    for (let i = 0; i < count; i++) {
      const n = bucket[i];
      n.x  = layerX(l) + (Math.random() - 0.5) * 20;
      n.y  = gap * (i + 1) + (Math.random() - 0.5) * 10;
      n.vx = 0;
      n.vy = 0;
    }
  }
}

/** Build a fast lookup: node id → node reference. */
function buildIndex() {
  const map = {};
  for (const n of nodes) map[n.id] = n;
  return map;
}

/* ── Force functions ─────────────────────────────────────────────────── */

function applyLayerForce() {
  for (const n of nodes) {
    const target = layerX(n.layer);
    n.vx += (target - n.x) * LAYER_FORCE_STRENGTH * alpha;
  }
}

function applyVerticalRepulsion() {
  // O(n²) within each layer — acceptable for ≤ ~50 nodes per layer
  const layerBuckets = [[], [], []];
  for (const n of nodes) layerBuckets[n.layer].push(n);

  for (let l = 0; l < 3; l++) {
    const bucket = layerBuckets[l];
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        let dy = b.y - a.y;
        if (Math.abs(dy) < REPULSION_MIN_DIST) {
          dy = dy >= 0 ? REPULSION_MIN_DIST : -REPULSION_MIN_DIST;
        }
        const force = (REPULSION_STRENGTH * alpha) / (dy * dy);
        a.vy -= force;
        b.vy += force;
      }
    }
  }
}

function applyLinkForce(index) {
  for (const link of links) {
    const source = index[link.source];
    const target = index[link.target];
    if (!source || !target) continue;

    const dx   = target.x - source.x;
    const dy   = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const diff = (dist - LINK_DISTANCE) / dist;
    const fx   = dx * diff * LINK_STRENGTH * alpha;
    const fy   = dy * diff * LINK_STRENGTH * alpha;

    source.vx += fx;
    source.vy += fy;
    target.vx -= fx;
    target.vy -= fy;
  }
}

function integrateAndDamp() {
  for (const n of nodes) {
    n.vx *= VELOCITY_DECAY;
    n.vy *= VELOCITY_DECAY;
    n.x  += n.vx;
    n.y  += n.vy;

    // Clamp within canvas bounds
    n.x = Math.max(20, Math.min(canvasW - 20, n.x));
    n.y = Math.max(20, Math.min(canvasH - 20, n.y));
  }
}

/* ── Simulation loop ─────────────────────────────────────────────────── */

function tick() {
  if (!running || alpha < ALPHA_MIN) {
    running = false;
    // Send final positions
    postMessage({ type: 'TICK', nodes: serializeNodes(), settled: true });
    return;
  }

  const index = buildIndex();

  applyLayerForce();
  applyVerticalRepulsion();
  applyLinkForce(index);
  integrateAndDamp();

  alpha -= ALPHA_DECAY;
  if (alpha < ALPHA_MIN) alpha = ALPHA_MIN;

  postMessage({ type: 'TICK', nodes: serializeNodes(), settled: false });
}

function serializeNodes() {
  return nodes.map(function (n) {
    return { id: n.id, x: n.x, y: n.y, layer: n.layer, label: n.label, meta: n.meta };
  });
}

function startLoop() {
  if (tickTimer) clearInterval(tickTimer);
  running   = true;
  alpha     = ALPHA_INITIAL;
  tickTimer = setInterval(tick, TICK_INTERVAL_MS);
}

function stopLoop() {
  running = false;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

/* ── Message handler ─────────────────────────────────────────────────── */

self.onmessage = function (evt) {
  var msg = evt.data;

  if (msg.type === 'INIT') {
    stopLoop();

    nodes   = msg.nodes   || [];
    links   = msg.links   || [];
    canvasW = msg.width   || 900;
    canvasH = msg.height  || 500;

    initPositions();
    startLoop();
  }

  if (msg.type === 'STOP') {
    stopLoop();
  }
};
