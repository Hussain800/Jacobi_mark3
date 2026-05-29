/* ============================================================================
   JACOBI — Premium interactive effects (v2)
   · Dual-element cursor — dot tracks the real pointer 1:1 (no lag), ring
     uses *proximity* snapping (28 px aura) so the user no longer has to
     hit the small dot inside the larger ring. Clicks still happen at the
     real pointer position; the ring is purely visual feedback.
   · Refined magnetic primary CTAs
   · Hero parallax
   · Light tilt on [data-tilt]
   ========================================================================== */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(hover: none)').matches;
  if (reduce || isTouch) return;
  document.documentElement.classList.add('has-jx-cursor');

  /* ---- dual cursor ------------------------------------------------------- */
  const wrap = document.createElement('div');
  wrap.className = 'jx-cursor';
  wrap.innerHTML = '<div class="jx-cursor-ring"></div><div class="jx-cursor-dot"></div>';
  document.body.appendChild(wrap);
  const ring = wrap.querySelector('.jx-cursor-ring');
  const dot  = wrap.querySelector('.jx-cursor-dot');
  // Visual size of the dot (matches CSS .jx-cursor-dot width)
  const DOT_SIZE = 8;

  let tx = innerWidth / 2, ty = innerHeight / 2;
  let rx = tx, ry = ty;      // ring position (lagging for soft trail)
  let snapEl = null, snapBox = null;

  // Selectors the ring snaps to.
  const SNAP = 'a, button, .case-row, .log-row, .plan, .phase, [data-tilt], input, [role="button"], .bt-row, .nav-link, .pi-submit, .btn';

  // Proximity radius. If the cursor is within PROX_RADIUS px of ANY edge of
  // a snap element, the ring previews that element. Cheap because we just
  // re-test the cached candidates from the cheap direct-hit path first.
  const PROX_RADIUS = 32;

  function nearestSnap(x, y) {
    let best = null, bestDist = Infinity;
    document.querySelectorAll(SNAP).forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // Distance from cursor to nearest edge of the element
      const ddx = Math.max(r.left - x, 0, x - r.right);
      const ddy = Math.max(r.top  - y, 0, y - r.bottom);
      const d = Math.hypot(ddx, ddy);
      if (d < bestDist) { bestDist = d; best = { el, box: r }; }
    });
    return bestDist <= PROX_RADIUS ? best : null;
  }

  addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY;
    wrap.style.opacity = '1';
    // Direct hit first (cheap), then proximity fallback
    let el = e.target && e.target.closest ? e.target.closest(SNAP) : null;
    let box = el ? el.getBoundingClientRect() : null;
    if (!el) {
      const near = nearestSnap(tx, ty);
      if (near) { el = near.el; box = near.box; }
    }
    if (el !== snapEl) {
      snapEl = el;
      snapBox = box;
      wrap.classList.toggle('snap', !!el);
    } else if (el) {
      snapBox = box;
    }
  }, { passive: true });

  addEventListener('pointerdown', () => wrap.classList.add('press'));
  addEventListener('pointerup', () => wrap.classList.remove('press'));
  addEventListener('blur', () => { wrap.style.opacity = '0'; });

  (function loop(){
    // Dot — 1:1 with the real pointer, no lag.
    dot.style.transform = `translate3d(${tx - DOT_SIZE / 2}px, ${ty - DOT_SIZE / 2}px, 0)`;

    // Ring — when snapped, gently morph to target's rect; otherwise softly trail.
    if (snapEl && snapBox) {
      const cx = snapBox.left + snapBox.width / 2;
      const cy = snapBox.top + snapBox.height / 2;
      const w = Math.min(snapBox.width  + 14, 280);
      const h = Math.min(snapBox.height + 14, 84);
      rx += (cx - rx) * 0.32;
      ry += (cy - ry) * 0.32;
      ring.style.transform = `translate3d(${rx - w/2}px, ${ry - h/2}px, 0)`;
      ring.style.width  = w + 'px';
      ring.style.height = h + 'px';
      ring.style.borderRadius = (snapBox.width > 240 ? 10 : 8) + 'px';
    } else {
      rx += (tx - rx) * 0.22;
      ry += (ty - ry) * 0.22;
      ring.style.transform = `translate3d(${rx - 18}px, ${ry - 18}px, 0)`;
      ring.style.width  = '36px';
      ring.style.height = '36px';
      ring.style.borderRadius = '50%';
    }
    requestAnimationFrame(loop);
  })();

  /* ---- magnetic primary CTAs (subtle attract within 90px) --------------- */
  const magnetSel = '.btn-primary, .pi-submit, .case-row .case-arrow, .log-row .log-arrow';
  const cache = new Map();
  function magnetize() {
    document.querySelectorAll(magnetSel).forEach(el => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const ddx = tx - cx, ddy = ty - cy;
      const d = Math.hypot(ddx, ddy);
      const reach = 90;
      if (d < reach) {
        const f = (1 - d / reach) * 6;
        el.style.transform = `translate(${(ddx / (d || 1) * f).toFixed(2)}px, ${(ddy / (d || 1) * f).toFixed(2)}px)`;
        cache.set(el, true);
      } else if (cache.get(el)) {
        el.style.transform = '';
        cache.set(el, false);
      }
    });
  }
  (function mLoop(){ magnetize(); requestAnimationFrame(mLoop); })();

  /* ---- hero parallax ---------------------------------------------------- */
  const hero = document.querySelector('.hero-grid');
  let copy, stage;
  if (hero) { copy = hero.querySelector('.hero-copy'); stage = hero.querySelector('.globe-stage'); }
  let plx = 0, ply = 0;
  (function pLoop(){
    const nx = (tx / innerWidth)  - 0.5;
    const ny = (ty / innerHeight) - 0.5;
    plx += (nx - plx) * 0.05; ply += (ny - ply) * 0.05;
    if (copy)  copy.style.transform  = `translate3d(${(plx * -10).toFixed(2)}px, ${(ply *  -6).toFixed(2)}px, 0)`;
    if (stage) stage.style.transform = `translate3d(${(plx *  14).toFixed(2)}px, ${(ply *   9).toFixed(2)}px, 0)`;
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
