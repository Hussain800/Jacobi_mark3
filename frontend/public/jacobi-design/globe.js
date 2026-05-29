/* ============================================================================
   JACOBI — Probe Globe (v2)
   A clear, floating dotted earth with graticule outlines so it unmistakably
   reads as a globe. 24 agent identities at real city coordinates, crisp
   markers (no neon halo), restrained deploy arcs. No box, no corner artifacts.
   window.JacobiGlobe.init(canvas, opts) -> API
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

    // globe body — dark sphere so continents read against it + occludes back
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.985, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x0a0d15 })
    );
    spin.add(body);

    // graticule — faint lat/long lines so the form unmistakably reads as a globe
    const grat = new THREE.Group();
    const gmat = new THREE.LineBasicMaterial({ color: 0x2c3a63, transparent: true, opacity: 0.55 });
    const gmatEq = new THREE.LineBasicMaterial({ color: 0x3b56a0, transparent: true, opacity: 0.7 });
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

    // ---- land dots ----------------------------------------------------------
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
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size: 0.072, map: softDot, vertexColors: true, transparent: true,
        depthWrite: false, sizeAttenuation: true, opacity: 1.0, alphaTest: 0.02,
        blending: THREE.NormalBlending
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

    // ---- agent markers — crisp, minimal glow --------------------------------
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

    // ---- arcs — restrained ---------------------------------------------------
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

    // ---- interaction --------------------------------------------------------
    let drag = false, px = 0, vx = 0, autov = 0.0014, tiltX = 0, tiltTarget = 0;
    canvas.addEventListener('pointerdown', e => { drag = true; px = e.clientX; vx = 0; });
    window.addEventListener('pointermove', e => {
      if (drag) { const dx = e.clientX - px; px = e.clientX; vx = dx * 0.005; spin.rotation.y += vx; }
      tiltTarget = (e.clientY / window.innerHeight - 0.5) * 0.16;
    });
    window.addEventListener('pointerup', () => drag = false);
    canvas.addEventListener('pointerleave', () => drag = false);

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
      vx *= 0.94; if (!drag && Math.abs(vx) > 0.0001) spin.rotation.y += vx;
      tiltX += (tiltTarget - tiltX) * 0.05; root.rotation.x = tiltX;

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
