/**
 * createProbeGlobe — Jacobi's brand object: a "Global Probe Network".
 *
 * Restores the recognizable dotted-earth globe and rebuilds it to a higher
 * craft bar: a thin fresnel atmosphere rim (edge-light, NOT a glow blob), a
 * precise lat/long graticule, hairline coastlines, verdict-coded market nodes,
 * and great-circle route traces that fire on an "audit run". Desaturated and
 * instrument-grade — it must read as a measurement device, never a neon AI orb.
 *
 * Budgeted: bundled three (no CDN), point/pixel caps, single renderer, explicit
 * webgl2||webgl context, fresh canvas per mount (owner's responsibility),
 * dispose() tears everything down.
 */

import * as THREE from "three";

export interface ProbeAgent { city: string; state: "over" | "good" | "normal" }
export interface ProbeGlobeOptions { agents?: ProbeAgent[]; lowPower?: boolean }
export interface ProbeGlobeHandle {
  deploy: () => void;
  resize: () => void;
  dispose: () => void;
}

const CITIES: Record<string, [number, number]> = {
  "New York": [40.71, -74.01], Manhattan: [40.78, -73.97],
  London: [51.51, -0.13], Dubai: [25.2, 55.27], Tokyo: [35.68, 139.69],
  Singapore: [1.35, 103.82], Mumbai: [19.08, 72.88], Bangalore: [12.97, 77.59],
  Frankfurt: [50.11, 8.68], Paris: [48.86, 2.35], "São Paulo": [-23.55, -46.63],
  Sydney: [-33.87, 151.21], Toronto: [43.65, -79.38], "Rural Iowa": [41.88, -93.1],
  Mississippi: [32.35, -89.4], Lagos: [6.52, 3.38], Seoul: [37.57, 126.98],
  "Hong Kong": [22.32, 114.17], Berlin: [52.52, 13.4], Chicago: [41.88, -87.63],
  "Los Angeles": [34.05, -118.24], Madrid: [40.42, -3.7], Amsterdam: [52.37, 4.9],
  "Bogotá": [4.71, -74.07],
};

function llToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function dotTexture(soft: boolean): THREE.CanvasTexture {
  const s = 64, c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  if (soft) {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.6, "rgba(255,255,255,1)");
    g.addColorStop(0.64, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

/* minimal TopoJSON decode (countries-110m) */
interface Topo { transform?: { scale: [number, number]; translate: [number, number] }; arcs: [number, number][][]; objects: Record<string, { type: string; geometries?: { type: string; arcs?: unknown }[] } & { type: string; arcs?: unknown }> }
function decodeArcs(topo: Topo): [number, number][][] {
  const t = topo.transform || { scale: [1, 1], translate: [0, 0] };
  const [sx, sy] = t.scale, [tx, ty] = t.translate;
  return topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty] as [number, number]; }); });
}
function ringPath(refs: number[], arcs: [number, number][][]): [number, number][] {
  const out: [number, number][] = [];
  refs.forEach((ref, i) => { const rev = ref < 0; const arc = arcs[rev ? ~ref : ref]; const pts = rev ? arc.slice().reverse() : arc; (i > 0 ? pts.slice(1) : pts).forEach((p) => out.push(p)); });
  return out;
}

export function createProbeGlobe(canvas: HTMLCanvasElement, opts: ProbeGlobeOptions = {}): ProbeGlobeHandle {
  const agents = opts.agents || [];
  const low = !!opts.lowPower;

  const COL = {
    land:   new THREE.Color("#7d8aa8"),
    grat:   new THREE.Color("#243150"),
    gratEq: new THREE.Color("#33457a"),
    coast:  new THREE.Color("#4a5e94"),
    rim:    new THREE.Color("#3d6bff"),
    base:   new THREE.Color("#35B083"),
    dev:    new THREE.Color("#E5524E"),
    norm:   new THREE.Color("#6E92FF"),
    comet:  new THREE.Color("#acc2ff"),
  };

  // ---- context (explicit; avoids three's webgl2->webgl re-probe crash) ----
  const attrs: WebGLContextAttributes = { alpha: true, antialias: !low, premultipliedAlpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false };
  const gl = (canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null) || (canvas.getContext("webgl", attrs) as WebGLRenderingContext | null);
  if (!gl) throw new Error("webgl-unavailable");

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: !low });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0, 23);

  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin); scene.add(root);
  root.rotation.z = -0.36;

  const R = 4;
  const coreDot = dotTexture(false), softDot = dotTexture(true);
  const trash: { dispose: () => void }[] = [coreDot, softDot, renderer];
  let disposed = false;

  // ---- globe body (near-black, slightly lit) ------------------------------
  const bodyGeo = new THREE.SphereGeometry(R * 0.985, low ? 40 : 64, low ? 40 : 64);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x080b12 });
  spin.add(new THREE.Mesh(bodyGeo, bodyMat));
  trash.push(bodyGeo, bodyMat);

  // ---- fresnel atmosphere rim (thin edge-light, NOT a blob) ----------------
  const rimGeo = new THREE.SphereGeometry(R * 1.035, 48, 48);
  const rimMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    uniforms: { uColor: { value: COL.rim } },
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vP; void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - max(dot(v, vN), 0.0), 3.8); gl_FragColor = vec4(uColor * f, f * 0.42); }`,
  });
  spin.add(new THREE.Mesh(rimGeo, rimMat));
  trash.push(rimGeo, rimMat);

  // ---- graticule (thin lat/long instrument grid) --------------------------
  const grat = new THREE.Group();
  const gMat = new THREE.LineBasicMaterial({ color: COL.grat, transparent: true, opacity: 0.5 });
  const gMatEq = new THREE.LineBasicMaterial({ color: COL.gratEq, transparent: true, opacity: 0.62 });
  trash.push(gMat, gMatEq);
  for (let lat = -60; lat <= 60; lat += 30) { const p: THREE.Vector3[] = []; for (let lng = 0; lng <= 360; lng += 3) p.push(llToVec3(lat, lng, R * 1.002)); const g = new THREE.BufferGeometry().setFromPoints(p); grat.add(new THREE.Line(g, lat === 0 ? gMatEq : gMat)); trash.push(g); }
  for (let lng = 0; lng < 360; lng += 30) { const p: THREE.Vector3[] = []; for (let lat = -90; lat <= 90; lat += 3) p.push(llToVec3(lat, lng, R * 1.002)); const g = new THREE.BufferGeometry().setFromPoints(p); grat.add(new THREE.Line(g, gMat)); trash.push(g); }
  spin.add(grat);

  // ---- coastlines (hairline, async) ---------------------------------------
  const coastMat = new THREE.LineBasicMaterial({ color: COL.coast, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending });
  trash.push(coastMat);
  fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json").then((r) => r.json()).then((topo: Topo) => {
    if (disposed) return;
    const arcs = decodeArcs(topo);
    const obj = topo.objects && (topo.objects.countries || topo.objects.land);
    if (!obj) return;
    const geoms = obj.geometries || [obj];
    const grp = new THREE.Group();
    geoms.forEach((gm) => {
      if (!gm || !gm.type || !gm.arcs) return;
      const polys = gm.type === "Polygon" ? [gm.arcs as number[][]] : gm.type === "MultiPolygon" ? (gm.arcs as number[][][]) : [];
      polys.forEach((poly) => poly.forEach((refs) => {
        const ring = ringPath(refs as number[], arcs); if (ring.length < 2) return;
        const pts = ring.map(([lng, lat]) => llToVec3(lat, lng, R * 1.006));
        const g = new THREE.BufferGeometry().setFromPoints(pts); grp.add(new THREE.Line(g, coastMat)); trash.push(g);
      }));
    });
    spin.add(grp);
  }).catch(() => {});

  // ---- land dots (recognizable earth, sampled from a land mask) ------------
  function buildDots(sampler: ((lat: number, lng: number) => boolean) | null) {
    if (disposed) return;
    const N = low ? 9000 : 18000, pos: number[] = [], col: number[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
      const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      const lat = (Math.asin(y) * 180) / Math.PI, lng = (Math.atan2(z, x) * 180) / Math.PI;
      if (sampler && !sampler(lat, lng)) continue;
      const v = llToVec3(lat, lng, R * 1.004); pos.push(v.x, v.y, v.z);
      const f = 0.62 + 0.38 * Math.random(); col.push(COL.land.r * f, COL.land.g * f, COL.land.b * f);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.07, map: softDot, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, opacity: 0.95, alphaTest: 0.02, blending: THREE.NormalBlending });
    spin.add(new THREE.Points(g, m)); trash.push(g, m);
  }
  const img = new Image(); img.crossOrigin = "anonymous"; let resolved = false;
  const fb = () => { if (resolved || disposed) return; resolved = true; buildDots(null); };
  img.onload = () => { if (resolved || disposed) return; try {
    const cw = 720, ch = 360, cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const cx = cv.getContext("2d")!; cx.drawImage(img, 0, 0, cw, ch); const d = cx.getImageData(0, 0, cw, ch).data;
    const sampler = (lat: number, lng: number) => { const u = (lng + 180) / 360, vv = (90 - lat) / 180; const px = Math.min(cw - 1, Math.max(0, Math.floor(u * cw))), py = Math.min(ch - 1, Math.max(0, Math.floor(vv * ch))); const idx = (py * cw + px) * 4; return (d[idx] + d[idx + 1] + d[idx + 2]) / 3 > 18; };
    resolved = true; buildDots(sampler);
  } catch { fb(); } };
  img.onerror = fb; img.src = "https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png";
  const fbTimer = window.setTimeout(fb, 4000);

  // ---- market nodes (ring + dot, verdict-coded) ---------------------------
  const markerGroup = new THREE.Group(); spin.add(markerGroup);
  const markers: { ring: THREE.Sprite; core: THREE.Sprite; v: THREE.Vector3 }[] = [];
  agents.forEach((a) => {
    const cc = CITIES[a.city] || [0, 0]; const v = llToVec3(cc[0], cc[1], R * 1.012);
    const base = a.state === "over" ? COL.dev : a.state === "good" ? COL.base : COL.norm;
    const ringMat = new THREE.SpriteMaterial({ map: softDot, color: base, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Sprite(ringMat); ring.scale.setScalar(0.34);
    const coreMat = new THREE.SpriteMaterial({ map: coreDot, color: base.clone().lerp(new THREE.Color("#ffffff"), 0.4), transparent: true, opacity: 0, depthWrite: false });
    const core = new THREE.Sprite(coreMat); core.scale.setScalar(0.11);
    const node = new THREE.Group(); node.position.copy(v); node.add(ring); node.add(core); markerGroup.add(node);
    markers.push({ ring, core, v }); trash.push(ringMat, coreMat);
  });

  // ---- route traces (great-circle arcs from the NYC hub) -------------------
  const hub = llToVec3(40.71, -74.01, R * 1.01);
  const arcGroup = new THREE.Group(); spin.add(arcGroup);
  const arcs: { line: THREE.Line; mat: THREE.LineBasicMaterial; curve: THREE.QuadraticBezierCurve3; comet: THREE.Sprite; total: number }[] = [];
  markers.forEach((mk) => {
    const mid = hub.clone().add(mk.v).multiplyScalar(0.5);
    const lift = 1 + Math.min(0.4, hub.distanceTo(mk.v) / (R * 4.6));
    mid.normalize().multiplyScalar(R * lift);
    const curve = new THREE.QuadraticBezierCurve3(hub.clone(), mid, mk.v.clone());
    const pts = curve.getPoints(48); const g = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: COL.rim, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(g, mat); line.geometry.setDrawRange(0, 0); arcGroup.add(line);
    const cometMat = new THREE.SpriteMaterial({ map: softDot, color: COL.comet, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const comet = new THREE.Sprite(cometMat); comet.scale.setScalar(0.16); arcGroup.add(comet);
    arcs.push({ line, mat, curve, comet, total: pts.length }); trash.push(g, mat, cometMat);
  });

  // ---- interaction: drag to rotate (Google-Earth style) with inertia ------
  let drag = false, ppx = 0, ppy = 0, vx = 0, vy = 0;
  const autov = 0.0016, X_CLAMP = 1.35;
  canvas.style.cursor = "grab";
  const onDown = (e: PointerEvent) => {
    drag = true; ppx = e.clientX; ppy = e.clientY; vx = 0; vy = 0;
    canvas.style.cursor = "grabbing";
    try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onUp = (e?: PointerEvent) => {
    drag = false; canvas.style.cursor = "grab";
    try { if (e && e.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onDragMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - ppx, dy = e.clientY - ppy; ppx = e.clientX; ppy = e.clientY;
    vx = dx * 0.005; vy = dy * 0.005;
    spin.rotation.y += vx;
    spin.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, spin.rotation.x + vy));
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onDragMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp as EventListener);
  canvas.addEventListener("pointerleave", onUp as EventListener);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(Math.min(low ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  const t0 = performance.now(); let deployStart = -1; const deployDur = 4600;
  function deploy() { deployStart = performance.now(); }
  let raf = 0;
  let onscreen = true;
  function frame(now: number) {
    if (disposed) return;
    if (!onscreen) { raf = 0; return; }   // pause render loop when offscreen
    const t = (now - t0) / 1000;
    if (!drag) spin.rotation.y += autov;
    // inertia after release
    vx *= 0.94; vy *= 0.94;
    if (!drag) {
      if (Math.abs(vx) > 0.0001) spin.rotation.y += vx;
      if (Math.abs(vy) > 0.0001) spin.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, spin.rotation.x + vy));
    }
    root.rotation.x = -0.04;

    const dp = deployStart < 0 ? 1 : Math.min(1, (now - deployStart) / deployDur);
    markers.forEach((mk, i) => {
      const stagger = i / Math.max(1, markers.length);
      const local = deployStart < 0 ? 1 : Math.max(0, Math.min(1, (dp - stagger * 0.6) / 0.4));
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.8 + i);
      mk.core.material.opacity = local;
      mk.core.scale.setScalar(0.11 + 0.015 * pulse);
      mk.ring.material.opacity = local * (0.18 + 0.12 * pulse);
      const a = arcs[i]; const reveal = Math.max(0, Math.min(1, (dp - stagger * 0.6) / 0.34));
      a.line.geometry.setDrawRange(0, Math.floor(reveal * a.total));
      a.mat.opacity = deployStart < 0 ? 0 : reveal >= 1 ? 0.06 : reveal * 0.22;
      if (reveal > 0 && reveal < 1) { a.comet.position.copy(a.curve.getPoint(reveal)); a.comet.material.opacity = 0.9; } else a.comet.material.opacity = 0;
    });
    renderer.render(scene, camera); raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // pause rendering when the globe scrolls offscreen (perf; eases GPU load)
  const visObs = new IntersectionObserver((es) => {
    const vis = es[0].isIntersecting;
    if (vis) { if (!onscreen) { onscreen = true; if (!raf) raf = requestAnimationFrame(frame); } }
    else onscreen = false;
  }, { threshold: 0 });
  visObs.observe(canvas);

  return {
    deploy, resize,
    dispose() {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(fbTimer); ro.disconnect(); visObs.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onDragMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp as EventListener);
      canvas.removeEventListener("pointerleave", onUp as EventListener);
      img.onload = null; img.onerror = null;
      trash.forEach((d) => { try { d.dispose(); } catch { /* noop */ } });
      try { renderer.forceContextLoss(); } catch { /* noop */ }
    },
  };
}

export { CITIES };
