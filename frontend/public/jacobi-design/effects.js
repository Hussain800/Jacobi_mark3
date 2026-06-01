/* ============================================================================
   JACOBI — Interactive effects (v4)
   · Native cursor (the custom gravity-field cursor was removed: hiding the OS
     pointer behind a 4px dot + swirling particles made clicks feel laggy and
     mis-aligned, and stacked another rAF loop on top of the scene canvas).
     The native cursor is pixel-perfect and zero-latency — keep it.
   · Hero parallax (subtle, pointer-driven)
   · Light tilt on [data-tilt]
   ========================================================================== */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(hover: none)').matches;
  if (reduce || isTouch) return;

  // Track pointer purely for the parallax/tilt effects below — no custom
  // cursor DOM, no `cursor: none`, native pointer stays visible and exact.
  let tx = innerWidth / 2, ty = innerHeight / 2;
  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY;
  }, { passive: true });

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
