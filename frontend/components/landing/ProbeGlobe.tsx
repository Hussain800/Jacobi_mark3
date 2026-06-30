"use client";

/**
 * ProbeGlobe — the heavy, code-split chunk that imports Three.js. Loaded only
 * via next/dynamic({ssr:false}) AFTER first paint (see GlobeStage), so bundling
 * `three` never blocks the hero's LCP.
 *
 * Fresh <canvas> per mount: React Strict Mode / Fast Refresh remount this; a
 * canvas whose context was lost can't hand out a new one, so we create a brand
 * new canvas each lifecycle and remove it on cleanup.
 */

import { useEffect, useRef } from "react";
import { createProbeGlobe, type ProbeAgent, type ProbeGlobeHandle } from "./globe/createProbeGlobe";

export default function ProbeGlobe({
  agents, lowPower = false, onError,
}: { agents: ProbeAgent[]; lowPower?: boolean; onError?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(canvas);

    let handle: ProbeGlobeHandle | null = null;
    try {
      handle = createProbeGlobe(canvas, { agents, lowPower });
    } catch {
      canvas.remove(); onError?.(); return;
    }
    const deployTimer = window.setTimeout(() => handle?.deploy(), 1000);

    return () => {
      window.clearTimeout(deployTimer);
      handle?.dispose();
      canvas.remove();
    };
  }, [agents, lowPower, onError]);

  return <div ref={hostRef} className="jx-globe-canvas" />;
}
