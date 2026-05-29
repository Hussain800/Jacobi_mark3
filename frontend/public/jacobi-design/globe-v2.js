/* ============================================================================
   JACOBI — Probe Globe v2 (production landing)
   Extends globe.js (the static-prototype version) with three additions:
     1. Country outlines drawn from world-atlas TopoJSON (cobalt hairlines)
     2. Free Google-Earth-style rotation: drag controls both X and Y axes
        with inertia; the auto-spin pauses while dragging
     3. Auto-spin is slightly faster (~57% faster than v1)
   Everything else (markers, arcs, deploy/highlight API) is byte-identical
   to v1 so React hooks can keep using `window.JacobiGlobe.init(canvas)`.
   ========================================================================== */
(function () {
  const CITIES = {
    "New York":   [40.71, -74.01], "Manhattan": [40.78, -73.97],
    "London":     [51.51, -0.13],  "Dubai":     [25.20, 55.27],
    "Tokyo":      [35.68, 139.69], "Singapore": [1.35, 103.82],
    "Mumbai":     [19.08, 72.88],  "Bangalore": [12.97, 77.59],
    "Frankfurt":  [50.11, 8.68],   "Paris":     [48.86, 2.35],
    "São Paulo":  [-23.55, -46.63],"Sydney":    [-33.87, 151.21],
    "Toronto":    [43.65, -79.38], "Rural Iowa":[41.88, -93.10],
    "Mississippi":[32.35, -89.40], "Lagos":     [6.52, 3.38],
    "Seoul":      [37.57, 126.98], "Hong Kong": [22.32, 114.17],
    "Berlin":     [52.52, 13.40],  "Chicago":   [41.88, -87.63],
    "Los Angeles":[34.05,-118.24], "Madrid":    [40.42, -3.70],
    "Amsterdam":  [52.37, 4.90],   "Bogotá":    [4.71, -74.07],
  };

  function llToVec3(lat, lng, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }

  function roundDotTexture(soft) {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    if (soft) {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.62, 'rgba(255,255,255,1)');
      g.addColorStop(0.66, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /* ─── Country outlines (TopoJSON → THREE.Line) ───────────────────────── */

  // Minimal TopoJSON decoder. Inlined to avoid an extra script tag.
  // Based on the TopoJSON spec — handles only what world-atlas needs
  // (GeometryCollection with Polygon / MultiPolygon objects in `countries`).
  function decodeArcs(topo) {
    const t = topo.transform || { scale: [1, 1], translate: [0, 0] };
    const [sx, sy] = t.scale, [tx, ty] = t.translate;
    return topo.arcs.map(arc => {
      let x = 0, y = 0;
      return arc.map(([dx, dy]) => {
        x += dx; y += dy;
        return [x * sx + tx, y * sy + ty];
      });
    });
  }
  function ringPath(arcRefs, arcs) {
    const out = [];
    arcRefs.forEach((ref, i) => {
      const reversed = ref < 0;
      const arc = arcs[reversed ? ~ref : ref];
      const pts = reversed ? arc.slice().reverse() : arc;
      // skip first point of subsequent arcs to avoid duplicates
      (i > 0 ? pts.slice(1) : pts).forEach(p => out.push(p));
    });
    return out;
  }
  function drawCountries(spin, R, topo) {
    const arcs = decodeArcs(topo);
    const obj = topo.objects && (topo.objects.countries || topo.objects.land);
    if (!obj) return;
    const geometries = obj.geometries || (obj.type === 'GeometryCollection' ? obj.geometries : [obj]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x5a78c8, transparent: true, opacity: 0.55,
      // additive blending makes overlapping borders read clearly on dark globe
      blending: THREE.AdditiveBlending,
    });
    const group = new THREE.Group();
    geometries.forEach(geom => {
      if (!geom || !geom.type || !geom.arcs) return;
      const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.type === 'MultiPolygon' ? geom.arcs : [];
      polys.forEach(poly => {
        poly.forEach(ringRefs => {
          const ring = ringPath(ringRefs, arcs);
          if (ring.length < 2) return;
          const pts = ring.map(([lng, lat]) => llToVec3(lat, lng, R * 1.006));
          const g = new THREE.BufferGeometry().setFromPoints(pts);
          group.add(new THREE.Line(g, mat));
        });
      });
    });
    spin.add(group);
  }

  function init(canvas, opts) {
    opts = opts || {};
    const agents = opts.agents || [];
    const C = {
      land:   new THREE.Color('#9fb0d8'),
      cobalt: new THREE.Color('#5d83ff'),
      bright: new THREE.Color('#9fb6ff'),
      over:   new THREE.Color('#ff5468'),
      good:   new THREE.Color('#3ad79f'),
    };

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 0, 22);

    const root = new THREE.Group();
    const spin = new THREE.Group();
    root.add(spin); scene.add(root);
    root.rotation.z = -0.36;

    const R = 4;
    const coreDot = roundDotTexture(false);
    const softDot = roundDotTexture(true);

    // globe body
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.985, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x0a0d15 })
    );
    spin.add(body);

    // graticule
    const grat = new THREE.Group();
    const gmat   = new THREE.LineBasicMaterial({ color: 0x2c3a63, transparent: true, opacity: 0.55 });
    const gmatEq = new THREE.LineBasicMaterial({ color: 0x3b56a0, transparent: true, opacity: 0.7  });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lng = 0; lng <= 360; lng += 3) pts.push(llToVec3(lat, lng, R * 1.002));
      grat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lat === 0 ? gmatEq : gmat));
    }
    for (let lng = 0; lng < 360; lng += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(llToVec3(lat, lng, R * 1.002));
      grat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat));
    }
    spin.add(grat);

    /* Country outlines — fetched async, drawn when ready */
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
      .then(r => r.json())
      .then(topo => drawCountries(spin, R, topo))
      .catch(() => {}); // silent fallback: still have dotted land + graticule

    // ---- land dots (same as v1) -------------------------------------------
    let landPoints = null;
    function buildDots(sampler) {
      const N = 17000, pos = [], col = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const radius = Math.sqrt(1 - y * y);
        const theta = golden * i;
        const x = Math.cos(theta) * radius, z = Math.sin(theta) * radius;
        const lat = Math.asin(y) * 180 / Math.PI;
        const lng = Math.atan2(z, x) * 180 / Math.PI;
        if (sampler && !sampler(lat, lng)) continue;
        const v = llToVec3(lat, lng, R * 1.004);
        pos.push(v.x, v.y, v.z);
        const f = 0.7 + 0.3 * Math.random();
        col.push(C.land.r * f, C.land.g * f, C.land.b * f);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size: 0.072, map: softDot, vertexColors: true, transparent: true,
        depthWrite: false, sizeAttenuation: true, opacity: 1.0, alphaTest: 0.02,
        blending: THREE.NormalBlending,
      });
      landPoints = new THREE.Points(g, m);
      spin.add(landPoints);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    let resolved = false;
    const fallback = () => { if (resolved) return; resolved = true; buildDots(null); };
    img.onload = function () {
      if (resolved) return;
      try {
        const cw = 720, ch = 360, cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cw, ch);
        const data = cx.getImageData(0, 0, cw, ch).data;
        const sampler = (lat, lng) => {
          const u = (lng + 180) / 360, vv = (90 - lat) / 180;
          const px = Math.min(cw - 1, Math.max(0, Math.floor(u * cw)));
          const py = Math.min(ch - 1, Math.max(0, Math.floor(vv * ch)));
          const idx = (py * cw + px) * 4;
          return (data[idx] + data[idx + 1] + data[idx + 2]) / 3 > 18;
        };
        resolved = true; buildDots(sampler);
      } catch (e) { fallback(); }
    };
    img.onerror = fallback;
    img.src = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';
    setTimeout(fallback, 4000);

    // ---- agent markers + arcs (same as v1) --------------------------------
    const markerGroup = new THREE.Group(); spin.add(markerGroup);
    const markers = [];
    agents.forEach((a) => {
      const cc = CITIES[a.city] || [0, 0];
      const v = llToVec3(cc[0], cc[1], R * 1.015);
      const base = a.state === 'over' ? C.over : a.state === 'good' ? C.good : C.cobalt;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: base, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(0.42);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreDot, color: base.clone().lerp(new THREE.Color('#ffffff'), 0.35), transparent: true, opacity: 0, depthWrite: false }));
      core.scale.setScalar(0.135);
      const node = new THREE.Group();
      node.position.copy(v); node.add(halo); node.add(core);
      markerGroup.add(node);
      markers.push({ node, halo, core, base, v, agent: a, hot: false });
    });

    const hub = llToVec3(40.71, -74.01, R * 1.012);
    const arcs = [];
    const arcGroup = new THREE.Group(); spin.add(arcGroup);
    markers.forEach((mk) => {
      const mid = hub.clone().add(mk.v).multiplyScalar(0.5);
      const lift = 1 + Math.min(0.38, hub.distanceTo(mk.v) / (R * 4.8));
      mid.normalize().multiplyScalar(R * lift);
      const curve = new THREE.QuadraticBezierCurve3(hub.clone(), mid, mk.v.clone());
      const pts = curve.getPoints(46);
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: C.cobalt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const line = new THREE.Line(g, mat); line.geometry.setDrawRange(0, 0);
      arcGroup.add(line);
      const comet = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: C.bright, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      comet.scale.setScalar(0.2); arcGroup.add(comet);
      arcs.push({ line, mat, curve, comet, total: pts.length });
    });

    /* ─── Interaction — Google Earth style free rotation ─────────────────
     *
     * Drag horizontally → rotate Y (longitude).
     * Drag vertically   → rotate X (latitude), clamped so the user can't
     *                     flip past the poles.
     * Both axes have inertia after release. Auto-spin (~57% faster than
     * v1) resumes when the user isn't dragging.
     */
    let drag = false, px = 0, py = 0;
    let vx = 0, vy = 0;
    const autov = 0.0022; // up from 0.0014
    const X_CLAMP = 1.3;  // ≈ 75° — keeps the poles from inverting
    canvas.addEventListener('pointerdown', e => {
      drag = true; px = e.clientX; py = e.clientY; vx = 0; vy = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    function endDrag(e) {
      drag = false;
      try { if (e && e.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      vx = dx * 0.005;
      vy = dy * 0.005;
      spin.rotation.y += vx;
      spin.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, spin.rotation.x + vy));
    });
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', endDrag);

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(canvas); resize();

    let t0 = performance.now(), deployStart = -1, deployDur = 4200;
    function deploy() { deployStart = performance.now(); }

    function frame(now) {
      const t = (now - t0) / 1000;
      if (!drag) spin.rotation.y += autov;
      // momentum
      vx *= 0.94; vy *= 0.94;
      if (!drag) {
        if (Math.abs(vx) > 0.0001) spin.rotation.y += vx;
        if (Math.abs(vy) > 0.0001) {
          spin.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, spin.rotation.x + vy));
        }
      }

      const dp = deployStart < 0 ? 1 : Math.min(1, (now - deployStart) / deployDur);
      markers.forEach((mk, i) => {
        const stagger = i / markers.length;
        const local = deployStart < 0 ? 1 : Math.max(0, Math.min(1, (dp - stagger * 0.6) / 0.4));
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i);
        mk.core.material.opacity = local;
        mk.core.scale.setScalar((mk.hot ? 0.2 : 0.135) + (mk.hot ? 0.04 : 0.02) * pulse);
        mk.halo.material.opacity = local * (mk.hot ? 0.55 : 0.22 + 0.1 * pulse);
        mk.halo.scale.setScalar(mk.hot ? 0.62 : 0.42);
        const arc = arcs[i];
        const reveal = Math.max(0, Math.min(1, (dp - stagger * 0.6) / 0.32));
        arc.line.geometry.setDrawRange(0, Math.floor(reveal * arc.total));
        arc.mat.opacity = deployStart < 0 ? 0 : (reveal >= 1 ? 0.07 : reveal * 0.2);
        if (reveal > 0 && reveal < 1) { arc.comet.position.copy(arc.curve.getPoint(reveal)); arc.comet.material.opacity = 0.85; }
        else arc.comet.material.opacity = 0;
      });
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      deploy,
      highlight(key) { markers.forEach(m => m.hot = (key != null && m.agent.key === key)); },
      clearHighlight() { markers.forEach(m => m.hot = false); },
      get markers() { return markers; },
      resize,
    };
  }

  window.JacobiGlobe = { init, CITIES };
})();
