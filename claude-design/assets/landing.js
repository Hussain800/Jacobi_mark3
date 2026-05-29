/* ============================================================================
   JACOBI — Landing interactions
   ========================================================================== */
(function () {
  "use strict";
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 24 agent identities (also fed to the globe) ----------------------- */
  const AGENTS = [
    { key: 'a1',  city: 'Manhattan',   profile: 'Safari · Manhattan · direct',   price: 642, state: 'over' },
    { key: 'a2',  city: 'New York',    profile: 'iPhone 15 · NYC · direct',       price: 638, state: 'over' },
    { key: 'a3',  city: 'Dubai',       profile: 'iPhone · Dubai · direct',        price: 631, state: 'over' },
    { key: 'a4',  city: 'Los Angeles', profile: 'iPhone · LA · direct',           price: 627, state: 'over' },
    { key: 'a5',  city: 'Tokyo',       profile: 'Safari · Tokyo · direct',        price: 612, state: 'normal' },
    { key: 'a6',  city: 'Chicago',     profile: 'Chrome · Chicago · direct',      price: 612, state: 'normal' },
    { key: 'a7',  city: 'Hong Kong',   profile: 'Safari · Hong Kong · direct',    price: 608, state: 'normal' },
    { key: 'a8',  city: 'Paris',       profile: 'Safari · Paris · direct',        price: 601, state: 'normal' },
    { key: 'a9',  city: 'London',      profile: 'Edge · London · direct',         price: 596, state: 'normal' },
    { key: 'a10', city: 'Seoul',       profile: 'Chrome · Seoul · fiber',         price: 590, state: 'normal' },
    { key: 'a11', city: 'Singapore',   profile: 'Chrome · Singapore · fiber',     price: 588, state: 'normal' },
    { key: 'a12', city: 'Sydney',      profile: 'Chrome · Sydney · fiber',        price: 583, state: 'normal' },
    { key: 'a13', city: 'Frankfurt',   profile: 'Chrome · Frankfurt · fiber',     price: 579, state: 'normal' },
    { key: 'a14', city: 'Toronto',     profile: 'Edge · Toronto · direct',        price: 574, state: 'normal' },
    { key: 'a15', city: 'Amsterdam',   profile: 'Edge · Amsterdam · fiber',       price: 571, state: 'normal' },
    { key: 'a16', city: 'Berlin',      profile: 'Firefox · Berlin · fiber',       price: 566, state: 'normal' },
    { key: 'a17', city: 'Madrid',      profile: 'Chrome · Madrid · fiber',        price: 558, state: 'normal' },
    { key: 'a18', city: 'São Paulo',   profile: 'Android · São Paulo · LTE',      price: 540, state: 'normal' },
    { key: 'a19', city: 'Lagos',       profile: 'Android · Lagos · LTE',          price: 531, state: 'normal' },
    { key: 'a20', city: 'Mumbai',      profile: 'Android · Mumbai · LTE',         price: 524, state: 'normal' },
    { key: 'a21', city: 'Bogotá',      profile: 'Android · Bogotá · VPN',         price: 516, state: 'normal' },
    { key: 'a22', city: 'Bangalore',   profile: 'Firefox · Bangalore · VPN',      price: 512, state: 'normal' },
    { key: 'a23', city: 'Mississippi', profile: 'Android · Mississippi · LTE',    price: 505, state: 'good' },
    { key: 'a24', city: 'Rural Iowa',  profile: 'Chrome · rural Iowa · VPN',      price: 498, state: 'good' },
  ];

  /* ---- Globe ------------------------------------------------------------- */
  let globe = null;
  function initGlobe() {
    const canvas = document.getElementById('globe');
    if (!canvas || typeof THREE === 'undefined' || !window.JacobiGlobe) return;
    globe = window.JacobiGlobe.init(canvas, { agents: AGENTS });
    // kick off the deploy sequence + readout counter shortly after load
    setTimeout(runDeploy, 900);
  }

  function runDeploy() {
    if (!globe) return;
    globe.deploy();
    const statusEl = document.getElementById('gr-status');
    const countEl = document.getElementById('gr-count');
    if (!countEl) return;
    let n = 0;
    if (statusEl) statusEl.textContent = 'deploying identities';
    const total = AGENTS.length, dur = 4200, t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const cur = Math.round(p * total);
      if (cur !== n) { n = cur; countEl.textContent = String(n).padStart(2, '0'); }
      if (p < 1) requestAnimationFrame(tick);
      else if (statusEl) statusEl.textContent = 'topology mapped';
    }
    requestAnimationFrame(tick);
  }

  /* ---- Typed subheadline ------------------------------------------------- */
  function typeLine() {
    const el = document.getElementById('typed');
    if (!el) return;
    const full = '24 agents. One URL. The truth about what you pay.';
    if (reduce) { el.textContent = full; return; }
    let i = 0;
    function step() {
      el.textContent = full.slice(0, i);
      i++;
      if (i <= full.length) {
        // pause a beat on each period for rhythm
        const ch = full[i - 2];
        setTimeout(step, ch === '.' ? 320 : 34 + Math.random() * 26);
      }
    }
    setTimeout(step, 600);
  }

  /* ---- Nav scroll state -------------------------------------------------- */
  function navScroll() {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const on = () => nav.classList.toggle('scrolled', window.scrollY > 24);
    on(); window.addEventListener('scroll', on, { passive: true });
  }

  /* ---- Reveal on scroll -------------------------------------------------- */
  function reveals() {
    const els = Array.from(document.querySelectorAll('[data-reveal]'));
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }

    const show = (el) => {
      if (el.classList.contains('in')) return;
      const sibs = Array.from(el.parentElement.querySelectorAll(':scope > [data-reveal]'));
      const pos = Math.max(0, sibs.indexOf(el));
      el.style.transitionDelay = (pos * 70) + 'ms';
      el.classList.add('in');
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));

    // Robustness: anything already in/above the viewport reveals immediately
    // (covers hidden/throttled tabs where IO never reports intersection).
    const sweepAtFold = () => {
      const h = window.innerHeight || 800;
      els.forEach(e => { if (e.getBoundingClientRect().top < h * 0.95) { show(e); io.unobserve(e); } });
    };
    requestAnimationFrame(sweepAtFold);
    setTimeout(sweepAtFold, 400);
    // Final safety net: never leave content invisible.
    setTimeout(() => els.forEach(show), 2600);
  }

  /* ---- Counters ---------------------------------------------------------- */
  function counters() {
    const els = document.querySelectorAll('[data-count]');
    const run = (el) => {
      const target = parseInt(el.getAttribute('data-count'), 10);
      if (reduce) { el.textContent = target.toLocaleString(); return; }
      const dur = 1600, t0 = performance.now();
      function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * target).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target.toLocaleString();
      }
      requestAnimationFrame(tick);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.5 });
    els.forEach(e => io.observe(e));
  }

  /* ---- Phase icons ------------------------------------------------------- */
  const ICONS = {
    target: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="1.6" fill="currentColor" stroke="none"/><path d="M16 1v6M16 25v6M1 16h6M25 16h6" stroke-linecap="round"/></svg>',
    swarm: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="16" cy="16" r="3"/><circle cx="6" cy="7" r="2"/><circle cx="26" cy="7" r="2"/><circle cx="6" cy="25" r="2"/><circle cx="26" cy="25" r="2"/><path d="M8 8.5 13.5 14M24 8.5 18.5 14M8 23.5 13.5 18M24 23.5 18.5 18" stroke-linecap="round"/></svg>',
    patterns: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 24 11 15l5 4 8-11" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="15" r="1.8" fill="currentColor" stroke="none"/><circle cx="16" cy="19" r="1.8" fill="currentColor" stroke="none"/><circle cx="24" cy="8" r="1.8" fill="currentColor" stroke="none"/><path d="M4 28h24" stroke-linecap="round" opacity=".4"/></svg>',
    verdict: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 3 27 8v8c0 7-4.6 11-11 13C9.6 27 5 23 5 16V8z" stroke-linejoin="round"/><path d="M11 16l3.5 3.5L21 12" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  function icons() {
    document.querySelectorAll('[data-ico]').forEach(el => {
      const k = el.getAttribute('data-ico'); if (ICONS[k]) el.innerHTML = ICONS[k];
    });
  }

  /* ---- Evidence rows ----------------------------------------------------- */
  function evidence() {
    const host = document.getElementById('evidence-rows');
    if (!host) return;
    const sample = [
      { key: 'a1',  profile: 'iPhone · Manhattan · direct', price: 642, state: 'over',    tag: 'top' },
      { key: 'a5',  profile: 'Safari · Tokyo · direct',     price: 612, state: 'normal' },
      { key: 'a9',  profile: 'Edge · London · direct',      price: 596, state: 'normal' },
      { key: 'a22', profile: 'Firefox · Bangalore · VPN',   price: 512, state: 'normal' },
      { key: 'a24', profile: 'Chrome · rural Iowa · VPN',   price: 498, state: 'good',    tag: 'baseline' },
    ];
    const lo = Math.min(...sample.map(s => s.price));
    const hi = Math.max(...sample.map(s => s.price));
    const colorFor = (s) => s === 'over' ? 'var(--over)' : s === 'good' ? 'var(--good)' : 'rgba(151,160,177,0.55)';

    sample.forEach((s, i) => {
      const w = Math.max(6, ((s.price - lo) / (hi - lo)) * 100);
      const row = document.createElement('div');
      row.className = 'ev-row'; row.dataset.key = s.key;
      row.innerHTML =
        '<div>' +
          '<div class="ev-row-head">' +
            '<span class="ev-profile">' + s.profile + '</span>' +
            (s.tag ? '<span class="ev-tag ' + s.tag + '">' + s.tag + '</span>' : '') +
          '</div>' +
          '<div class="ev-bar"><div class="ev-bar-fill" style="background:' + colorFor(s.state) + ';transform:scaleX(0)"></div></div>' +
        '</div>' +
        '<div class="ev-price" style="color:' + (s.state === 'over' ? 'var(--over)' : s.state === 'good' ? 'var(--good)' : 'var(--text-2)') + '">$' + s.price + '</div>';
      host.appendChild(row);

      const fill = row.querySelector('.ev-bar-fill');
      const reveal = () => {
        if (reduce) { fill.style.transform = 'scaleX(' + (w / 100) + ')'; return; }
        fill.style.transition = 'transform 1s var(--ease) ' + (0.2 + i * 0.08) + 's';
        requestAnimationFrame(() => { fill.style.transform = 'scaleX(' + (w / 100) + ')'; });
      };
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { reveal(); io.disconnect(); } }, { threshold: 0.4 });
        io.observe(host);
      } else reveal();

      row.addEventListener('mouseenter', () => globe && globe.highlight(s.key));
      row.addEventListener('mouseleave', () => globe && globe.clearHighlight());
    });

    // index bar fill on view
    const fill = document.querySelector('.evi-fill');
    if (fill) {
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { fill.classList.add('in'); io.disconnect(); } }, { threshold: 0.5 });
      io.observe(fill);
    }
  }

  /* ---- Probe forms → handoff (placeholder until cockpit ships) ----------- */
  function forms() {
    document.querySelectorAll('form').forEach(f => {
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = f.querySelector('.probe-input');
        const url = (input && input.value.trim()) || '';
        // future: window.location = 'probe.html?url=' + encodeURIComponent(url)
        if (globe) { runDeploy(); }
        const stage = document.getElementById('globe-stage');
        if (stage) stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (input && !url) input.focus();
      });
    });
  }

  /* ---- Boot -------------------------------------------------------------- */
  /* ---- Mechanism scroll disassembly ------------------------------------- */
  function mechScroll() {
    const scene = document.getElementById('mech-scene');
    const stack = document.getElementById('mech-stack');
    if (!scene || !stack) return;
    const dots = scene.querySelectorAll('.mech-progress span');
    const update = () => {
      const r = scene.getBoundingClientRect();
      const total = scene.offsetHeight - innerHeight;
      const p = Math.max(0, Math.min(1, -r.top / total));
      stack.style.setProperty('--p', p.toFixed(3));
      const step = Math.min(4, Math.floor(p * 5));
      dots.forEach((d, i) => d.classList.toggle('on', i <= step));
    };
    update();
    addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    addEventListener('resize', update);
  }

  /* ---- Boot -------------------------------------------------------------- */
  function boot() {
    icons(); evidence(); forms(); typeLine();
    initGlobe();
    mechScroll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
