/* ============================================================================
   JACOBI — Interactive effects (v3)
   · Gravity-field cursor — a sharp 1:1 dot, a soft cobalt glow, and 4 lagging
     particles that swarm toward the pointer like a tiny gravity field. No
     visible ring (was distracting + made buttons feel mis-aligned). Click
     targets are never displaced.
   · Hero parallax (subtle)
   · Light tilt on [data-tilt]
   ========================================================================== */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(hover: none)').matches;
  if (reduce || isTouch) return;
  document.documentElement.classList.add('has-jx-cursor');

  /* ---- gravity-field cursor --------------------------------------------- */
  const wrap = document.createElement('div');
  wrap.className = 'jx-cursor';
  wrap.innerHTML = [
    '<div class="jx-cursor-glow"></div>',
    '<div class="jx-cursor-dot"></div>',
    '<div class="jx-particle p1"></div>',
    '<div class="jx-particle p2"></div>',
    '<div class="jx-particle p3"></div>',
    '<div class="jx-particle p4"></div>',
  ].join('');
  document.body.appendChild(wrap);
  const dot   = wrap.querySelector('.jx-cursor-dot');
  const glow  = wrap.querySelector('.jx-cursor-glow');
  const parts = Array.from(wrap.querySelectorAll('.jx-particle'));

  // Visual sizes (must match CSS)
  const DOT  = 4;
  const GLOW = 28;
  const PART = 3;

  // Snap-class targets — does NOT move the element, only adds a hover class
  // so the cursor brightens. Keeps button click targets exactly where they
  // visually appear.
  const SNAP = 'a, button, input, [role="button"], .case-row, .pi-submit, .btn, .nav-link, .bt-row, .plan-cta';

  let tx = innerWidth / 2, ty = innerHeight / 2;
  // Each particle has its own lagging position. Different lerp factors
  // produce the orbital/trailing feel — lighter particles "follow" faster.
  const partState = parts.map((_, i) => ({
    x: tx, y: ty,
    lerp: 0.18 + i * 0.04,        // 0.18, 0.22, 0.26, 0.30
    angle: (i / parts.length) * Math.PI * 2,
    radius: 10 + i * 2,
  }));
  // Glow also lags very slightly so motion feels weighty.
  let gx = tx, gy = ty;

  let snapEl = null;

  addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY;
    wrap.style.opacity = '1';
    const el = e.target && e.target.closest ? e.target.closest(SNAP) : null;
    if (el !== snapEl) {
      snapEl = el;
      wrap.classList.toggle('snap', !!el);
    }
  }, { passive: true });

  addEventListener('pointerdown', () => wrap.classList.add('press'));
  addEventListener('pointerup',   () => wrap.classList.remove('press'));
  addEventListener('blur',        () => { wrap.style.opacity = '0'; });
  addEventListener('mouseleave',  () => { wrap.style.opacity = '0'; });
  addEventListener('mouseenter',  () => { wrap.style.opacity = '1'; });

  let t = 0;
  (function loop(){
    t += 0.016;

    // Dot tracks 1:1, no lag, so clicks always feel exact.
    dot.style.transform = `translate3d(${tx - DOT / 2}px, ${ty - DOT / 2}px, 0)`;

    // Glow lags very subtly — gives motion a sense of weight without making
    // it feel laggy.
    gx += (tx - gx) * 0.42;
    gy += (ty - gy) * 0.42;
    glow.style.transform = `translate3d(${gx - GLOW / 2}px, ${gy - GLOW / 2}px, 0)`;

    // Particles — gravity-toward-cursor with a slow rotation around it so
    // the field "swirls" while it follows.
    partState.forEach((p, i) => {
      p.angle += 0.012 + i * 0.003;
      const targetX = tx + Math.cos(p.angle) * p.radius;
      const targetY = ty + Math.sin(p.angle) * p.radius;
      p.x += (targetX - p.x) * p.lerp;
      p.y += (targetY - p.y) * p.lerp;
      parts[i].style.transform = `translate3d(${p.x - PART / 2}px, ${p.y - PART / 2}px, 0)`;
    });

    requestAnimationFrame(loop);
  })();

  /* ---- hero parallax (subtle) ------------------------------------------- */
  const hero = document.querySelector('.hero-grid');
  let copy, stage;
  if (hero) { copy = hero.querySelector('.hero-copy'); stage = hero.querySelector('.globe-stage'); }
  let plx = 0, ply = 0;
  (function pLoop(){
    const nx = (tx / innerWidth)  - 0.5;
    const ny = (ty / innerHeight) - 0.5;
    plx += (nx - plx) * 0.05; ply += (ny - ply) * 0.05;
    if (copy)  copy.style.transform  = `translate3d(${(plx * -8).toFixed(2)}px, ${(ply * -4).toFixed(2)}px, 0)`;
    if (stage) stage.style.transform = `translate3d(${(plx * 12).toFixed(2)}px, ${(ply *  8).toFixed(2)}px, 0)`;
    requestAnimationFrame(pLoop);
  })();

  /* ---- tilt on [data-tilt] ---------------------------------------------- */
  function setupTilt() {
    document.querySelectorAll('[data-tilt]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width  - 0.5);
        const py = ((e.clientY - r.top)  / r.height - 0.5);
        el.style.transform = `perspective(900px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 4).toFixed(2)}deg) translateZ(0)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupTilt);
  else setupTilt();
})();
