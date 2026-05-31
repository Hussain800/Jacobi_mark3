/* ============================================================================
   JACOBI — Probe cockpit: cases, radial 24-agent web, deploy → verdict.
   ========================================================================== */
(function () {
  "use strict";
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ---- demo cases -------------------------------------------------------- */
  const CASES = [
    { name: 'Leela Palace Bangalore', host: 'www.booking.com', base: 245, topo: 'aggressive' },
    { name: 'Tokyo Hotels Search',    host: 'www.booking.com', base: 120, topo: 'progressive' },
    { name: 'Knickerbocker NYC',      host: 'www.booking.com', base: 350, topo: 'progressive' },
    { name: 'DXB → KTM Flights',      host: 'www.google.com',  base: 420, topo: 'aggressive' },
    { name: 'Wireless Headphones',    host: 'www.amazon.com',  base: 65,  topo: 'selective' },
  ];

  /* ---- 24 agents: 3 waves × 8, relative price multipliers ---------------- */
  // rel = price relative to the cheapest (baseline = 1.00)
  const AGENTS = [
    // Wave 1 — datacenter
    { city: 'Manhattan',   dev: 'Safari · MacBook',  net: 'datacenter', rel: 1.29 },
    { city: 'New York',    dev: 'iPhone 15 Pro',     net: 'datacenter', rel: 1.27 },
    { city: 'London',      dev: 'Edge · Surface',    net: 'datacenter', rel: 1.19 },
    { city: 'Dubai',       dev: 'iPhone 15',         net: 'datacenter', rel: 1.26 },
    { city: 'Frankfurt',   dev: 'Chrome · ThinkPad', net: 'datacenter', rel: 1.16 },
    { city: 'Tokyo',       dev: 'Safari · iPad',     net: 'datacenter', rel: 1.22 },
    { city: 'Singapore',   dev: 'Chrome · Pixelbook',net: 'datacenter', rel: 1.18 },
    { city: 'Toronto',     dev: 'Edge · Dell XPS',   net: 'datacenter', rel: 1.15 },
    // Wave 2 — residential
    { city: 'Paris',       dev: 'Safari · MacBook',  net: 'residential', rel: 1.20 },
    { city: 'Los Angeles', dev: 'iPhone 15 Pro',     net: 'residential', rel: 1.25 },
    { city: 'Chicago',     dev: 'Chrome · iMac',     net: 'residential', rel: 1.22 },
    { city: 'Berlin',      dev: 'Firefox · Linux',   net: 'residential', rel: 1.13 },
    { city: 'Madrid',      dev: 'Chrome · MacBook',  net: 'residential', rel: 1.12 },
    { city: 'Amsterdam',   dev: 'Edge · Surface',    net: 'residential', rel: 1.14 },
    { city: 'Seoul',       dev: 'Chrome · Galaxy',   net: 'residential', rel: 1.18 },
    { city: 'Hong Kong',   dev: 'Safari · iPhone',   net: 'residential', rel: 1.21 },
    // Wave 3 — mobile
    { city: 'São Paulo',   dev: 'Android · Moto',    net: 'mobile', rel: 1.08 },
    { city: 'Lagos',       dev: 'Android · Tecno',   net: 'mobile', rel: 1.06 },
    { city: 'Mumbai',      dev: 'Android · Redmi',   net: 'mobile', rel: 1.05 },
    { city: 'Bogotá',      dev: 'Android · Moto',    net: 'mobile', rel: 1.03 },
    { city: 'Bangalore',   dev: 'Firefox · Android', net: 'mobile', rel: 1.02 },
    { city: 'Sydney',      dev: 'Chrome · Pixel',    net: 'mobile', rel: 1.17 },
    { city: 'Mississippi', dev: 'Android · Galaxy',  net: 'mobile', rel: 1.01 },
    { city: 'Rural Iowa',  dev: 'Chrome · Android',  net: 'mobile', rel: 1.00 },
  ].map((a, i) => {
    a.key = 'a' + (i + 1);
    a.wave = Math.floor(i / 8);            // 0,1,2
    a.posInWave = i % 8;
    a.state = a.rel >= 1.22 ? 'over' : a.rel <= 1.02 ? 'good' : 'normal';
    // a few agents get blocked/detected for realism (not the baseline)
    a.blocked = (i === 4 || i === 14);
    return a;
  });

  const WAVES = [
    { label: 'Wave 1 · datacenter', r: 150 },
    { label: 'Wave 2 · residential', r: 250 },
    { label: 'Wave 3 · mobile', r: 350 },
  ];
  const CX = 450, CY = 450;

  let nodeEls = [];   // {agent, group, dot, ring, line, lineLen, angle, x, y}
  let activeCase = CASES[2];

  /* ---- build the radial web --------------------------------------------- */
  function buildRadial() {
    const svg = $('#radial-svg');
    svg.innerHTML = '';
    nodeEls = [];

    // faint guide rings
    WAVES.forEach(w => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', CX); c.setAttribute('cy', CY); c.setAttribute('r', w.r);
      c.setAttribute('class', 'radial-guide');
      svg.appendChild(c);
    });

    // lines first (under nodes)
    const lineLayer = document.createElementNS(SVGNS, 'g');
    const nodeLayer = document.createElementNS(SVGNS, 'g');
    svg.appendChild(lineLayer); svg.appendChild(nodeLayer);

    AGENTS.forEach(a => {
      const w = WAVES[a.wave];
      const offset = a.wave * 0.39 - Math.PI / 2;
      const angle = (a.posInWave / 8) * Math.PI * 2 + offset;
      const x = CX + w.r * Math.cos(angle);
      const y = CY + w.r * Math.sin(angle);

      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', CX); line.setAttribute('y1', CY);
      line.setAttribute('x2', x); line.setAttribute('y2', y);
      line.setAttribute('class', 'radial-line');
      const len = Math.hypot(x - CX, y - CY);
      line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      lineLayer.appendChild(line);

      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'radial-node');
      g.setAttribute('transform', `translate(${x} ${y})`);
      const ring = document.createElementNS(SVGNS, 'circle');
      ring.setAttribute('r', 11); ring.setAttribute('class', 'rn-ring');
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('r', 5.5); dot.setAttribute('class', 'rn-dot');
      g.appendChild(ring); g.appendChild(dot);
      nodeLayer.appendChild(g);

      g.addEventListener('mouseenter', () => showTip(a, x, y));
      g.addEventListener('mouseleave', hideTip);

      nodeEls.push({ agent: a, group: g, dot, ring, line, lineLen: len, x, y });
    });

    // hub target
    [30, 20, 11].forEach((r, i) => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', CX); c.setAttribute('cy', CY); c.setAttribute('r', r);
      c.setAttribute('class', 'radial-hub' + (i === 2 ? ' core' : ''));
      svg.appendChild(c);
    });

    // waves legend
    const wl = $('#rr-waves');
    wl.innerHTML = WAVES.map((w, i) =>
      `<div class="rr-wave" data-wave="${i}"><span class="rw-dot"></span>${w.label}</div>`
    ).join('');
  }

  /* ---- tooltip ----------------------------------------------------------- */
  let tip;
  function showTip(a, x, y) {
    hideTip();
    const stage = $('#radial-stage');
    const rect = stage.getBoundingClientRect();
    const scale = rect.width / 900;
    tip = document.createElement('div');
    tip.className = 'rn-tip mono';
    const price = a.returned ? '$' + a.price : '— · in flight';
    tip.innerHTML = `<strong>${a.city}</strong><span>${a.dev}</span><span>${a.net}</span><span class="rn-tip-price ${a.state}">${a.blocked ? 'blocked' : price}</span>`;
    tip.style.left = (x * scale) + 'px';
    tip.style.top = (y * scale) + 'px';
    stage.appendChild(tip);
  }
  function hideTip() { if (tip) { tip.remove(); tip = null; } }

  /* ---- compute verdict --------------------------------------------------- */
  function computeResults() {
    const base = activeCase.base;
    AGENTS.forEach(a => { a.price = Math.round(base * a.rel); a.returned = false; });
    const returned = AGENTS.filter(a => !a.blocked);
    const lo = Math.min(...returned.map(a => a.price));
    const hi = Math.max(...returned.map(a => a.price));
    const spread = hi - lo;
    const pct = Math.round((spread / lo) * 100);
    const index = Math.min(99, Math.round(pct * 2.4 + 12));
    return { lo, hi, spread, pct, index, success: returned.length, total: 24 };
  }

  let organicRunning = false;
  function startOrganic() {
    if (organicRunning) return;
    organicRunning = true;
    const t0 = performance.now();
    (function loop(now) {
      const t = (now - t0) / 1000;
      for (let i = 0; i < nodeEls.length; i++) {
        const n = nodeEls[i];
        if (!n || !n.agent.returned) continue;
        const ox = Math.sin(t * 0.55 + i * 0.41) * 3.4;
        const oy = Math.cos(t * 0.47 + i * 0.73) * 2.8;
        n.group.setAttribute('transform', `translate(${n.x + ox} ${n.y + oy})`);
      }
      requestAnimationFrame(loop);
    })(performance.now());
  }

  /* ---- state machine ----------------------------------------------------- */
  let timer = null, t0 = 0;
  function startProbe(label) {
    $('#cockpit').classList.remove('active');
    $('#deck').classList.add('active');
    $('#deck-url').textContent = label;
    $('#deck-phase').textContent = 'deploying';
    $('#rail-verdict').hidden = true;
    $('#rail-live').hidden = false;
    $('#telemetry').innerHTML = '';
    window.scrollTo(0, 0);

    buildRadial();
    startOrganic();
    const R = computeResults();

    // reset readout
    $('#rr-n').textContent = '0';
    $('#rr-t').textContent = '0.0';
    t0 = performance.now();
    if (timer) clearInterval(timer);
    timer = setInterval(() => { $('#rr-t').textContent = ((performance.now() - t0) / 1000).toFixed(1); }, 100);

    if (reduce) { finishProbe(R); return; }

    let returnedCount = 0;
    const order = nodeEls.map((n, i) => i);
    const perAgentDelay = 150;       // stagger
    nodeEls.forEach((n, idx) => {
      const fireAt = 300 + n.agent.wave * 700 + n.agent.posInWave * 70;
      const returnAt = fireAt + 600 + Math.random() * 700;
      // fire
      setTimeout(() => {
        n.line.classList.add('firing');
        n.line.style.strokeDashoffset = '0';
        n.group.classList.add('deploying');
        highlightWave(n.agent.wave);
      }, fireAt);
      // return / resolve
      setTimeout(() => {
        n.line.classList.remove('firing');
        n.agent.returned = true;
        // randomize phases so the web doesn't pulse in unison
        const dl1 = (Math.random() * -3.4).toFixed(2) + 's';
        const dl2 = (Math.random() * -4).toFixed(2) + 's';
        n.dot.style.animationDelay = dl1;
        n.line.style.animationDelay = dl2;
        if (n.agent.blocked) {
          n.group.classList.add('blocked');
          n.line.classList.add('done');
        } else {
          n.group.classList.add('done', n.agent.state);
          n.line.classList.add('done', n.agent.state);
          returnedCount++;
          $('#rr-n').textContent = String(returnedCount);
          addTelemetry(n.agent);
        }
        if (idx === nodeEls.length - 1 || allResolved()) {
          setTimeout(() => finishProbe(R), 700);
        }
      }, returnAt);
    });
  }

  function allResolved() { return AGENTS.every(a => a.returned); }

  function highlightWave(w) {
    document.querySelectorAll('.rr-wave').forEach(el => {
      el.classList.toggle('active', +el.dataset.wave === w);
    });
  }

  function addTelemetry(a) {
    const t = $('#telemetry');
    const row = document.createElement('div');
    row.className = 'tele-row ' + a.state;
    row.innerHTML = `<span class="tele-ok">✓</span><span class="tele-city">${a.city}</span><span class="tele-net">${a.net}</span><span class="tele-price tnum">$${a.price}</span>`;
    t.prepend(row);
    while (t.children.length > 8) t.lastChild.remove();
  }

  function finishProbe(R) {
    if (timer) { clearInterval(timer); timer = null; }
    $('#deck-phase').textContent = 'complete';
    $('#rr-n').textContent = String(R.success);
    document.querySelectorAll('.rr-wave').forEach(el => el.classList.remove('active'));
    // make sure every node resolved (instant path / reduce)
    nodeEls.forEach(n => {
      n.agent.returned = true;
      n.line.style.strokeDashoffset = '0';
      n.line.classList.remove('firing');
      n.dot.style.animationDelay = (Math.random() * -3.4).toFixed(2) + 's';
      n.line.style.animationDelay = (Math.random() * -4).toFixed(2) + 's';
      if (n.agent.blocked) { n.group.classList.add('blocked'); n.line.classList.add('done'); }
      else { n.group.classList.add('done', n.agent.state); n.line.classList.add('done', n.agent.state); }
    });

    // fill verdict
    const topo = activeCase.topo;
    const TOPO = { uniform: ['#3ad79f', 'Uniform'], selective: ['#d8b06a', 'Selective'], progressive: ['#ff9d52', 'Progressive'], aggressive: ['#ff5468', 'Aggressive'] };
    const [col, lab] = TOPO[topo];
    const badge = $('#topo-badge');
    badge.style.color = col; badge.style.borderColor = col + '55'; badge.style.background = col + '14';
    $('.tb-dot', badge).style.background = col; $('.tb-dot', badge).style.boxShadow = '0 0 8px ' + col;
    $('#topo-label').textContent = lab;

    animateNum($('#v-spread'), R.spread, 900, v => v);
    $('#v-pct').textContent = R.pct;
    $('#v-success').textContent = R.success + '/' + R.total;
    animateNum($('#v-index'), R.index, 1100);
    setTimeout(() => { $('#v-index-fill').style.setProperty('--w', R.index + '%'); $('#v-index-fill').classList.add('in'); }, 120);

    const top = AGENTS.filter(a => !a.blocked).reduce((m, a) => a.price > m.price ? a : m);
    const low = AGENTS.filter(a => !a.blocked).reduce((m, a) => a.price < m.price ? a : m);
    const article = /^[aeiou]/i.test(lab) ? 'An' : 'A';
    $('#verdict-text').innerHTML =
      `${article} <strong style="color:${col}">${lab.toLowerCase()}</strong> pricing topology. A shopper in ` +
      `<span class="over">${top.city}</span> on ${top.dev} paid <span class="over">$${top.price}</span> — ` +
      `<span class="over">$${R.spread} more</span> than <span class="good">${low.city}</span> on ${low.dev} ` +
      `(<span class="good">$${low.price}</span>) for the identical listing. The dominant signal was <strong style="color:var(--text)">location</strong>.`;

    buildImpact();

    $('#rail-live').hidden = true;
    $('#rail-verdict').hidden = false;
  }

  function buildImpact() {
    const vectors = [
      { name: 'Location', pct: 41 },
      { name: 'Device', pct: 13 },
      { name: 'Referrer', pct: 5 },
      { name: 'Cookies', pct: 4 },
    ];
    const max = 41;
    $('#impact-bars').innerHTML = vectors.map(v =>
      `<div class="impact-row">
        <span class="impact-name mono">${v.name}</span>
        <div class="impact-track"><div class="impact-fill" style="width:${(v.pct / max) * 100}%"></div></div>
        <span class="impact-val mono">${v.pct}%</span>
      </div>`
    ).join('');
  }

  function animateNum(el, target, dur, fmt) {
    fmt = fmt || (v => v.toLocaleString());
    if (reduce) { el.textContent = fmt(target); return; }
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(e * target));
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }

  /* ---- cases list -------------------------------------------------------- */
  function renderCases() {
    $('#cases-list').innerHTML = CASES.map((c, i) =>
      `<button class="case-row" data-i="${i}">
        <span class="case-info"><span class="case-name">${c.name}</span><span class="case-host mono">${c.host}</span></span>
        <span class="case-meta"><span class="case-price mono">$${c.base}</span><span class="case-arrow">→</span></span>
      </button>`
    ).join('');
    document.querySelectorAll('.case-row').forEach(b => {
      b.addEventListener('click', () => {
        activeCase = CASES[+b.dataset.i];
        startProbe('https://' + activeCase.host + '/…');
      });
    });
  }

  /* ---- boot -------------------------------------------------------------- */
  function boot() {
    renderCases();
    $('#cockpit').classList.add('active');
    $('#cockpit-form').addEventListener('submit', e => {
      e.preventDefault();
      const val = $('#cockpit-input').value.trim();
      activeCase = CASES[2];
      startProbe(val ? (val.startsWith('http') ? val : 'https://' + val) : 'https://www.booking.com/…');
    });
    $('#deck-back').addEventListener('click', () => {
      $('#deck').classList.remove('active');
      $('#cockpit').classList.add('active');
      if (timer) { clearInterval(timer); timer = null; }
      window.scrollTo(0, 0);
    });
    $('#v-share').addEventListener('click', () => {
      $('#v-share').textContent = 'Link copied ✓';
      setTimeout(() => { $('#v-share').textContent = 'Copy result link'; }, 1800);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
