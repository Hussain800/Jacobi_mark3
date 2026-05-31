/* ============================================================================
   JACOBI — shared chrome: nav + footer injected on every page.
   Pages include <div id="nav-root"></div> and <div id="footer-root"></div>.
   ========================================================================== */
(function () {
  const MARK = '<svg class="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
    '<circle cx="16" cy="16" r="12.6" stroke="#3a4868" stroke-width="0.9" opacity="0.8"/>' +
    '<circle cx="16" cy="16" r="7.6" stroke="#7895ff" stroke-width="1.1"/>' +
    '<line x1="16" y1="1.7" x2="16" y2="5.6" stroke="#7895ff" stroke-width="1.4" stroke-linecap="round"/>' +
    '<line x1="16" y1="26.4" x2="16" y2="30.3" stroke="#7895ff" stroke-width="1.4" stroke-linecap="round"/>' +
    '<line x1="1.7" y1="16" x2="5.6" y2="16" stroke="#7895ff" stroke-width="1.4" stroke-linecap="round"/>' +
    '<line x1="26.4" y1="16" x2="30.3" y2="16" stroke="#7895ff" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="20.7" cy="12.9" r="2.2" fill="#7895ff"/>' +
    '<circle cx="20.7" cy="12.9" r="3.6" stroke="#7895ff" stroke-width="0.7" opacity="0.5"/>' +
  '</svg>';

  const LINKS = [
    { label: 'Probe',   href: 'probe.html' },
    { label: 'History', href: 'history.html' },
    { label: 'Board',   href: 'board.html' },
    { label: 'Pricing', href: 'pricing.html' },
  ];

  function currentPage() {
    const p = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return p || 'index.html';
  }

  function nav() {
    const cur = currentPage();
    const links = LINKS.map(l =>
      `<a class="nav-link${cur === l.href ? ' active' : ''}" href="${l.href}">${l.label}</a>`
    ).join('');
    return `<nav class="nav" id="nav"><div class="wrap">
      <a class="brand" href="index.html" aria-label="JACOBI home">${MARK}<span class="word">JACOBI</span></a>
      <div class="nav-links">${links}</div>
      <div class="nav-right">
        <span class="nav-status"><span class="led"></span>System · Operational</span>
        <a class="nav-link signin" href="probe.html">Sign in</a>
      </div>
    </div></nav>`;
  }

  function footer() {
    return `<footer class="footer">
      <div class="wrap footer-grid">
        <div class="footer-brand">
          <a class="brand" href="index.html">${MARK}<span class="word">JACOBI</span></a>
          <p class="footer-desc sec">24-agent adversarial pricing probe. Illuminating the hidden algorithms that decide what you pay&nbsp;online.</p>
        </div>
        <nav class="footer-col">
          <span class="label-mono">Product</span>
          <a class="nav-link" href="probe.html">New probe</a>
          <a class="nav-link" href="board.html">Leaderboard</a>
          <a class="nav-link" href="history.html">History</a>
          <a class="nav-link" href="pricing.html">Pricing</a>
        </nav>
        <nav class="footer-col">
          <span class="label-mono">Company</span>
          <a class="nav-link" href="#">Method</a>
          <a class="nav-link" href="#">Extension</a>
          <a class="nav-link" href="#">Privacy</a>
          <a class="nav-link" href="#">Terms</a>
        </nav>
      </div>
      <div class="wrap footer-bottom">
        <p class="footer-tag">The internet prices you. JACOBI prices&nbsp;back.</p>
        <span class="label-mono">© 2026 JACOBI · all rights reserved</span>
      </div>
    </footer>`;
  }

  function mount() {
    const n = document.getElementById('nav-root');
    const f = document.getElementById('footer-root');
    if (n) n.outerHTML = nav();
    if (f) f.outerHTML = footer();
    const navEl = document.getElementById('nav');
    if (navEl) {
      const on = () => navEl.classList.toggle('scrolled', window.scrollY > 24);
      on(); window.addEventListener('scroll', on, { passive: true });
    }
    reveals();
    counters();
    inject('assets/scene.js');
    inject('assets/effects.js');
  }

  function inject(src) {
    if (document.querySelector(`script[data-jx="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src; s.async = true; s.dataset.jx = src;
    document.body.appendChild(s);
  }

  /* ---- shared scroll reveals (every page) -------------------------------- */
  function reveals() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!els.length) return;
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const show = (el) => {
      if (el.classList.contains('in')) return;
      const sibs = Array.from(el.parentElement.querySelectorAll(':scope > [data-reveal]'));
      el.style.transitionDelay = (Math.max(0, sibs.indexOf(el)) * 70) + 'ms';
      el.classList.add('in');
    };
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
    const sweep = () => { const h = window.innerHeight || 800; els.forEach(e => { if (e.getBoundingClientRect().top < h * 0.95) { show(e); io.unobserve(e); } }); };
    requestAnimationFrame(sweep); setTimeout(sweep, 400);
    setTimeout(() => els.forEach(show), 2600);
  }

  /* ---- shared count-up --------------------------------------------------- */
  function counters() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    const run = (el) => {
      const target = parseFloat(el.getAttribute('data-count'));
      if (reduce) { el.textContent = target.toLocaleString(); return; }
      const dur = 1500, t0 = performance.now();
      (function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(e * target).toLocaleString();
        if (p < 1) requestAnimationFrame(tick); else el.textContent = target.toLocaleString();
      })(performance.now());
    };
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    const io = new IntersectionObserver((es) => { es.forEach(en => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } }); }, { threshold: 0.5 });
    els.forEach(e => io.observe(e));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
