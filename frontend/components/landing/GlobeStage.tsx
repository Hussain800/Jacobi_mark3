"use client";

/**
 * GlobeStage — the globe framed as a measurement instrument: coordinate crop
 * marks, a live HUD readout, and a verdict legend around the canvas.
 *
 * - Decides 3D vs. fallback (WebGL + motion-friendly + not tiny).
 * - Lazy-mounts the heavy <ProbeGlobe> after first paint (idle), so the hero
 *   headline wins LCP.
 * - reduced-motion / no-WebGL / small → a high-fidelity STATIC globe (never the
 *   old flat concentric-circle SVG).
 */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AGENTS } from "./data";

const ProbeGlobe = dynamic(() => import("./ProbeGlobe"), { ssr: false });

export default function GlobeStage() {
  const [mode, setMode] = useState<"pending" | "3d" | "fallback">("pending");
  const [mount3D, setMount3D] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);

  // capability detection + lazy mount
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = matchMedia("(max-width: 600px)").matches;
    let webgl = false;
    try { const c = document.createElement("canvas"); webgl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { webgl = false; }
    setLowPower(((navigator.hardwareConcurrency as number | undefined) || 4) <= 4);
    // ?static forces the high-fidelity static globe (used for headless screenshots)
    const forceStatic = new URLSearchParams(window.location.search).has("static");
    if (!(webgl && !reduced && !small && !forceStatic)) { setMode("fallback"); return; }
    setMode("3d");
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    let idle = 0, to = 0;
    if (w.requestIdleCallback) idle = w.requestIdleCallback(() => setMount3D(true), { timeout: 1500 });
    else to = window.setTimeout(() => setMount3D(true), 700);
    return () => { if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle); if (to) clearTimeout(to); };
  }, []);

  // deploy counter (00 -> 24) for the identity readout
  useEffect(() => {
    if (mode === "pending") return;
    const countEl = countRef.current;
    if (!countEl) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || mode === "fallback") { countEl.textContent = "24"; return; }
    const dur = 4600, t0 = performance.now(); let alive = true, n = -1, raf = 0;
    const tick = (now: number) => {
      if (!alive) return;
      const p = Math.min(1, (now - t0) / dur), cur = Math.round(p * 24);
      if (cur !== n) { n = cur; countEl.textContent = String(n).padStart(2, "0"); }
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const start = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 1000);
    return () => { alive = false; clearTimeout(start); cancelAnimationFrame(raf); };
  }, [mode]);

  return (
    <div className="jx-globe-stage" aria-label="Global probe network — sample audit" role="img">
      <div className="jx-globe-viewport">
        <span className="jx-globe-crop tl" /><span className="jx-globe-crop tr" />
        <span className="jx-globe-crop bl" /><span className="jx-globe-crop br" />
        {mode === "3d" && mount3D
          ? <ProbeGlobe agents={AGENTS} lowPower={lowPower} onError={() => setMode("fallback")} />
          : <GlobeFallback />}
        <div className="jx-legend" aria-hidden>
          <span className="jx-legend__item"><span className="jx-legend__dot base" />baseline</span>
          <span className="jx-legend__item"><span className="jx-legend__dot norm" />context</span>
          <span className="jx-legend__item"><span className="jx-legend__dot dev" />exposed</span>
        </div>
      </div>
      <div className="jx-globe-readout" aria-hidden>
        <div className="jx-readout__count"><span className="jx-readout__n" ref={countRef}>00</span><span className="jx-readout__of">/ 24 identities</span></div>
      </div>
    </div>
  );
}

/* ---- high-fidelity static fallback globe (no WebGL) ---------------------- */
function GlobeFallback() {
  return (
    <div className="jx-globe-fallback" aria-hidden>
      <svg viewBox="0 0 440 440" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="jxg-body" cx="46%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#0e1426" /><stop offset="68%" stopColor="#080b13" /><stop offset="100%" stopColor="#05070d" />
          </radialGradient>
          <radialGradient id="jxg-rim" cx="50%" cy="50%" r="50%">
            <stop offset="78%" stopColor="rgba(61,107,255,0)" /><stop offset="93%" stopColor="rgba(61,107,255,0.18)" /><stop offset="100%" stopColor="rgba(61,107,255,0)" />
          </radialGradient>
        </defs>
        <circle cx="220" cy="220" r="205" fill="url(#jxg-rim)" />
        <circle cx="220" cy="220" r="165" fill="url(#jxg-body)" stroke="rgba(74,94,148,0.4)" strokeWidth="1" />
        {/* latitude lines */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const cy = 220 - 165 * Math.sin((lat * Math.PI) / 180) * 0.96;
          const rx = 165 * Math.cos((lat * Math.PI) / 180);
          const ry = Math.max(3, rx * 0.32);
          return <ellipse key={lat} cx="220" cy={cy} rx={rx} ry={ry} fill="none" stroke="rgba(51,69,122,0.5)" strokeWidth={lat === 0 ? 1.1 : 0.7} />;
        })}
        {/* longitude lines */}
        {[18, 54, 90, 126, 162].map((lng) => (
          <ellipse key={lng} cx="220" cy="220" rx={165 * Math.abs(Math.cos((lng * Math.PI) / 180))} ry="165" fill="none" stroke="rgba(36,49,80,0.7)" strokeWidth="0.7" />
        ))}
        {/* probe nodes (deterministic scatter, verdict-coded) */}
        {NODES.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={n.r + 3} fill="none" stroke={n.c} strokeOpacity="0.35" strokeWidth="1" />
            <circle cx={n.x} cy={n.y} r={n.r} fill={n.c} />
          </g>
        ))}
        {/* a couple of route traces */}
        <path d="M222 150 Q300 120 322 196" fill="none" stroke="rgba(61,107,255,0.4)" strokeWidth="1" />
        <path d="M222 150 Q150 150 138 214" fill="none" stroke="rgba(61,107,255,0.32)" strokeWidth="1" />
      </svg>
    </div>
  );
}

const NODES = [
  { x: 222, y: 150, r: 3, c: "#E5524E" }, { x: 246, y: 132, r: 2.4, c: "#E5524E" },
  { x: 322, y: 196, r: 2.4, c: "#6E92FF" }, { x: 300, y: 168, r: 2.2, c: "#6E92FF" },
  { x: 270, y: 210, r: 2.2, c: "#6E92FF" }, { x: 250, y: 246, r: 2.2, c: "#6E92FF" },
  { x: 200, y: 232, r: 2.2, c: "#6E92FF" }, { x: 168, y: 196, r: 2.2, c: "#6E92FF" },
  { x: 138, y: 214, r: 2.4, c: "#35B083" }, { x: 190, y: 270, r: 2.4, c: "#35B083" },
];
