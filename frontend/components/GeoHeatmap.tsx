'use client';

import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';

/* ─────────────────────────── Types ─────────────────────────── */

export interface AgentNode {
  id: string;
  lat: number;
  lng: number;
  price: number;
  status: string;
}

export interface GeoHeatmapProps {
  agents: AgentNode[];
  width?: number;
  height?: number;
}

/* ──────────────────── Mathematical Constants ──────────────── */

const DEG = Math.PI / 180;
const R_EARTH_KM = 6371; // mean Earth radius in km

/* ───────────── Albers Equal-Area Conic Projection ─────────── */
/*  Reference parallels & origin chosen for CONUS-style extent  */

interface AlbersParams {
  phi1: number; // standard parallel 1 (rad)
  phi2: number; // standard parallel 2 (rad)
  phi0: number; // origin latitude   (rad)
  lam0: number; // origin longitude  (rad)
  n: number;
  c: number;
  rho0: number;
}

function albersConic(
  stdLat1 = 29.5,
  stdLat2 = 45.5,
  originLat = 37.5,
  originLng = -96
): AlbersParams {
  const phi1 = stdLat1 * DEG;
  const phi2 = stdLat2 * DEG;
  const phi0 = originLat * DEG;
  const lam0 = originLng * DEG;

  const n =
    (Math.sin(phi1) + Math.sin(phi2)) / 2;
  const c =
    Math.cos(phi1) * Math.cos(phi1) + 2 * n * Math.sin(phi1);
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(phi0)) / n;

  return { phi1, phi2, phi0, lam0, n, c, rho0 };
}

function projectAlbers(
  lat: number,
  lng: number,
  p: AlbersParams
): [number, number] {
  const phi = lat * DEG;
  const lam = lng * DEG;
  const theta = p.n * (lam - p.lam0);
  const rho = Math.sqrt(p.c - 2 * p.n * Math.sin(phi)) / p.n;

  const x = rho * Math.sin(theta);
  const y = p.rho0 - rho * Math.cos(theta);
  return [x, y];
}

/* ─────────── Haversine (Great-Circle) Distance ─────────── */

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLng = (lng2 - lng1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) *
      Math.cos(lat2 * DEG) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(a));
}

/* ────────── Color Mapping  #00d992 → #60a5fa → #fb7185 ────── */

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

const COLOR_LO = hexToRgb('#00d992');
const COLOR_MID = hexToRgb('#60a5fa');
const COLOR_HI = hexToRgb('#fb7185');

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function priceToRgb(
  price: number,
  minP: number,
  maxP: number
): [number, number, number] {
  if (maxP === minP) return COLOR_MID;
  const t = (price - minP) / (maxP - minP); // 0 → 1
  return t < 0.5
    ? lerpRgb(COLOR_LO, COLOR_MID, t * 2)
    : lerpRgb(COLOR_MID, COLOR_HI, (t - 0.5) * 2);
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
  );
}

/* ═══════════════════════ Component ═══════════════════════ */

const IDW_RES = 256; // off-screen canvas resolution
const EPSILON_KM = 50; // smoothing factor ε (km)
const POWER = 2; // IDW exponent p

const GeoHeatmap: React.FC<GeoHeatmapProps> = ({
  agents,
  width = 900,
  height = 560,
}) => {
  /* ── refs ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  /* ── state ── */
  const [hovered, setHovered] = useState<AgentNode | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  /* ── derived data ── */
  const { minPrice, maxPrice, albersParams, projected, viewTx } =
    useMemo(() => {
      if (agents.length === 0)
        return {
          minPrice: 0,
          maxPrice: 1,
          albersParams: albersConic(),
          projected: [] as { node: AgentNode; sx: number; sy: number }[],
          viewTx: { scale: 1, tx: 0, ty: 0 },
        };

      const prices = agents.map((a) => a.price);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);

      /* Compute Albers bounds centred on the agent cluster */
      const latMid =
        agents.reduce((s, a) => s + a.lat, 0) / agents.length;
      const lngMid =
        agents.reduce((s, a) => s + a.lng, 0) / agents.length;
      const params = albersConic(
        latMid - 8,
        latMid + 8,
        latMid,
        lngMid
      );

      /* Project all agents */
      const raw = agents.map((a) => {
        const [px, py] = projectAlbers(a.lat, a.lng, params);
        return { node: a, px, py };
      });

      /* Fit into viewport with padding */
      const PAD = 60;
      const xs = raw.map((r) => r.px);
      const ys = raw.map((r) => r.py);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);
      const rangeX = xMax - xMin || 1;
      const rangeY = yMax - yMin || 1;
      const scale = Math.min(
        (width - PAD * 2) / rangeX,
        (height - PAD * 2) / rangeY
      );
      const tx = (width - rangeX * scale) / 2 - xMin * scale;
      const ty = (height - rangeY * scale) / 2 - yMin * scale;

      const projected = raw.map((r) => ({
        node: r.node,
        sx: r.px * scale + tx,
        sy: r.py * scale + ty,
      }));

      return {
        minPrice: minP,
        maxPrice: maxP,
        albersParams: params,
        projected,
        viewTx: { scale, tx, ty },
      };
    }, [agents, width, height]);

  /* ── IDW computation (off-screen 256×256 ImageData) ── */
  const idwImageData = useMemo(() => {
    if (agents.length === 0) return null;

    /* Build inverse-projection LUT:
       For each pixel in IDW_RES grid find corresponding lat/lng,
       then compute Modified Shepard IDW from all agents.            */

    const latRange = agents.map((a) => a.lat);
    const lngRange = agents.map((a) => a.lng);
    const latMin = Math.min(...latRange) - 2;
    const latMax = Math.max(...latRange) + 2;
    const lngMin = Math.min(...lngRange) - 2;
    const lngMax = Math.max(...lngRange) + 2;

    const buf = new Uint8ClampedArray(IDW_RES * IDW_RES * 4);

    for (let iy = 0; iy < IDW_RES; iy++) {
      const lat = latMax - (iy / (IDW_RES - 1)) * (latMax - latMin);
      for (let ix = 0; ix < IDW_RES; ix++) {
        const lng =
          lngMin + (ix / (IDW_RES - 1)) * (lngMax - lngMin);

        let wSum = 0;
        let vSum = 0;

        for (const a of agents) {
          const d = haversineKm(lat, lng, a.lat, a.lng);
          /* Modified Shepard: w = 1 / (d² + ε²)^(p/2) */
          const w = 1 / Math.pow(d * d + EPSILON_KM * EPSILON_KM, POWER / 2);
          wSum += w;
          vSum += w * a.price;
        }

        const price = vSum / wSum;
        const [r, g, b] = priceToRgb(price, minPrice, maxPrice);
        const idx = (iy * IDW_RES + ix) * 4;
        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = 180; // alpha for blending over dark bg
      }
    }

    return new ImageData(buf, IDW_RES, IDW_RES);
  }, [agents, minPrice, maxPrice]);

  /* ── Canvas rendering (GPU-upscaled) ── */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !idwImageData) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    /* Ensure off-screen canvas exists */
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
      offscreenRef.current.width = IDW_RES;
      offscreenRef.current.height = IDW_RES;
    }

    const offCtx = offscreenRef.current.getContext('2d');
    if (!offCtx) return;
    offCtx.putImageData(idwImageData, 0, 0);

    /* Clear and draw upscaled */
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreenRef.current, 0, 0, width, height);
  }, [idwImageData, width, height]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  /* ── Handlers ── */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    []
  );

  /* ── Status colour helper ── */
  const statusColor = (s: string) => {
    switch (s.toLowerCase()) {
      case 'active':
        return '#00d992';
      case 'idle':
        return '#60a5fa';
      case 'alert':
      case 'warning':
        return '#fb7185';
      default:
        return '#a78bfa';
    }
  };

  /* ═══════════════════════ Render ═══════════════════════ */
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/[0.06] font-mono"
      style={{
        width,
        height,
        background: '#08090c',
      }}
      onMouseMove={handleMouseMove}
    >
      {/* ── Layer 1 : Canvas (IDW interpolation) ── */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ imageRendering: 'auto' }}
      />

      {/* ── Layer 2 : SVG Overlay (markers + connections) ── */}
      <svg
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          {/* Pulse animation keyframes via SVG <animate> */}
          <radialGradient id="geo-pulse-grad">
            <stop offset="0%" stopColor="white" stopOpacity="0.35" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Connection lines between nearby agents */}
        {projected.map((a, i) =>
          projected.slice(i + 1).map((b) => {
            const dist = haversineKm(
              a.node.lat,
              a.node.lng,
              b.node.lat,
              b.node.lng
            );
            if (dist > 800) return null; // only connect nearby agents
            const opacity = Math.max(0.04, 0.2 - dist / 5000);
            return (
              <line
                key={`${a.node.id}-${b.node.id}`}
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke="white"
                strokeOpacity={opacity}
                strokeWidth={1}
                strokeDasharray="4 6"
              />
            );
          })
        )}

        {/* Agent markers */}
        {projected.map((p) => {
          const fill = statusColor(p.node.status);
          return (
            <g key={p.node.id} style={{ pointerEvents: 'all' }}>
              {/* Pulse ring */}
              <circle cx={p.sx} cy={p.sy} r={6} fill="url(#geo-pulse-grad)">
                <animate
                  attributeName="r"
                  values="6;18;6"
                  dur="2.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.7;0;0.7"
                  dur="2.5s"
                  repeatCount="indefinite"
                />
              </circle>

              {/* Core dot */}
              <circle
                cx={p.sx}
                cy={p.sy}
                r={5}
                fill={fill}
                stroke="#08090c"
                strokeWidth={2}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(p.node)}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          );
        })}
      </svg>

      {/* ── Layer 3 : HTML Tooltip ── */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-white/[0.08] bg-[#0d0f14]/90 px-3 py-2 text-xs shadow-xl backdrop-blur-md"
          style={{
            left: Math.min(mousePos.x + 14, width - 190),
            top: Math.min(mousePos.y - 10, height - 90),
          }}
        >
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: statusColor(hovered.status) }}
            />
            <span className="text-white/80">{hovered.id}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-white/50">
            <span>Price</span>
            <span className="text-right text-white/90">
              ${hovered.price.toLocaleString()}
            </span>
            <span>Lat</span>
            <span className="text-right text-white/90">
              {hovered.lat.toFixed(4)}
            </span>
            <span>Lng</span>
            <span className="text-right text-white/90">
              {hovered.lng.toFixed(4)}
            </span>
            <span>Status</span>
            <span
              className="text-right capitalize"
              style={{ color: statusColor(hovered.status) }}
            >
              {hovered.status}
            </span>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-white/[0.06] bg-[#08090c]/80 px-3 py-1.5 text-[10px] text-white/40 backdrop-blur-sm">
        <span>${minPrice.toLocaleString()}</span>
        <div
          className="h-1.5 w-20 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, #00d992, #60a5fa, #fb7185)',
          }}
        />
        <span>${maxPrice.toLocaleString()}</span>
      </div>

      {/* ── Empty state ── */}
      {agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/20">
          No agent data available
        </div>
      )}
    </div>
  );
};

export default GeoHeatmap;
