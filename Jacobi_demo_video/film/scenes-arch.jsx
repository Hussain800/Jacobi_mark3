// film/scenes-arch.jsx
// Act III — Architecture pipeline (80–130s)

// ── Beat 11 (80–90s) — Pipeline wireframe with packet pulse ─────────────
function S_B11() {
  const { localTime } = useSprite();
  const nodes = [
    { id: 'url',     x: 220,  y: 380, w: 180, h: 110, name: 'URL',         tag: 'input',     row: 0 },
    { id: 'next',    x: 480,  y: 380, w: 240, h: 110, name: 'NEXT.JS',     tag: 'frontend',  row: 0 },
    { id: 'auth',    x: 800,  y: 380, w: 240, h: 110, name: 'AUTH',        tag: 'google',    row: 0 },
    { id: 'quota',   x: 1120, y: 380, w: 240, h: 110, name: 'QUOTA',       tag: 'fastapi',   row: 0 },
    { id: 'engine',  x: 1440, y: 380, w: 240, h: 110, name: 'ENGINE',      tag: '24 ids',    row: 0 },
    { id: 'norm',    x: 1440, y: 590, w: 240, h: 110, name: 'NORMALIZE',   tag: 'usd · fx',  row: 1 },
    { id: 'report',  x: 1120, y: 590, w: 240, h: 110, name: 'REPORT',      tag: 'spread · topo', row: 1 },
    { id: 'db',      x: 800,  y: 590, w: 240, h: 110, name: 'SUPABASE',    tag: 'profile · hist', row: 1 },
    { id: 'out',     x: 480,  y: 590, w: 240, h: 110, name: 'SHARE',       tag: 'link · pdf', row: 1 },
  ];
  // Edges in execution order
  const edges = [
    ['url','next'], ['next','auth'], ['auth','quota'], ['quota','engine'],
    ['engine','norm'], ['norm','report'], ['report','db'], ['db','out'],
  ];
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  // Per-node entry delay
  const nodeDelay = i => 0.3 + i * 0.35;

  // Packet pulse traveling each edge starting at 4s
  const packetStart = 4.0;
  const edgeDur = 0.6;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        {/* edges */}
        {edges.map(([a, b], i) => {
          const A = nodeMap[a], B = nodeMap[b];
          const ax = A.x + A.w / 2, ay = A.row === 0 ? A.y + A.h / 2 : A.y + A.h / 2;
          const bx = B.x + B.w / 2, by = B.row === 0 ? B.y + B.h / 2 : B.y + B.h / 2;
          // Edge appears when both nodes are placed
          const edgeAppears = nodeDelay(Math.max(nodes.findIndex(n=>n.id===a), nodes.findIndex(n=>n.id===b))) + 0.3;
          if (localTime < edgeAppears) return null;
          // Packet pulse
          const eStart = packetStart + i * 0.5;
          const packetT = Math.max(0, Math.min(1, (localTime - eStart) / edgeDur));
          const px = ax + (bx - ax) * packetT;
          const py = ay + (by - ay) * packetT;
          // Compute attachment points (edge of box)
          const dx = bx - ax, dy = by - ay;
          const len = Math.sqrt(dx*dx + dy*dy);
          const ux = dx / len, uy = dy / len;
          // Connect edges of boxes (approx)
          const ax2 = ax + ux * 90, ay2 = ay + uy * (A.row === B.row ? 55 : 55);
          const bx2 = bx - ux * 90, by2 = by - uy * (A.row === B.row ? 55 : 55);
          return (
            <g key={i}>
              <line x1={ax2} y1={ay2} x2={bx2} y2={by2}
                stroke={J_COLORS.cobaltLine} strokeWidth="1" />
              {packetT > 0 && packetT < 1 && (
                <>
                  <circle cx={px} cy={py} r="5" fill={J_COLORS.cobaltBr}
                    style={{ filter: `drop-shadow(0 0 10px ${J_COLORS.cobaltBr})` }}/>
                  <circle cx={ax2 + (bx2 - ax2) * Math.max(0, packetT - 0.15)}
                          cy={ay2 + (by2 - ay2) * Math.max(0, packetT - 0.15)}
                          r="3" fill={J_COLORS.cobalt} opacity="0.5"/>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* nodes */}
      {nodes.map((n, i) => {
        const delay = nodeDelay(i);
        if (localTime < delay) return null;
        const local = localTime - delay;
        const op = Math.min(1, local / 0.35);
        return (
          <div key={n.id} style={{
            position: 'absolute',
            left: n.x, top: n.y, width: n.w, height: n.h,
            background: J_COLORS.surface,
            border: `1px solid ${J_COLORS.line2}`,
            borderRadius: 8,
            opacity: op,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 16,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.02)',
          }}>
            <div style={{
              fontFamily: J_FONTS.mono, fontWeight: 600,
              fontSize: 19, color: J_COLORS.text,
              letterSpacing: '0.14em',
            }}>{n.name}</div>
            <div style={{
              marginTop: 6,
              fontFamily: J_FONTS.mono, fontSize: 11,
              color: J_COLORS.text3, letterSpacing: '0.22em', textTransform: 'uppercase',
            }}>{n.tag}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Beat 12 (90–102s) — Stack labelled with real tech names ─────────────
function S_B12() {
  const { localTime } = useSprite();
  // Same pipeline but with named real-stack callouts
  const items = [
    { x: 220,  y: 200, label: 'VERCEL · NEXT.JS', sub: 'edge frontend',     delay: 0.3, side: 'top' },
    { x: 480,  y: 200, label: 'GOOGLE OAUTH',     sub: 'identity provider', delay: 1.2, side: 'top' },
    { x: 760,  y: 200, label: 'SUPABASE',         sub: 'profile · history · board', delay: 1.9, side: 'top' },
    { x: 1080, y: 200, label: 'STRIPE',           sub: 'subscription · webhook', delay: 2.7, side: 'top' },
    { x: 1380, y: 200, label: 'FASTAPI',          sub: 'quota · dispatch',  delay: 3.6, side: 'top' },
    { x: 1640, y: 200, label: 'ENGINE',           sub: '24 identities',     delay: 4.4, side: 'top' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Top: stack chips */}
      {items.map((it, i) => {
        if (localTime < it.delay) return null;
        const op = Math.min(1, (localTime - it.delay) / 0.4);
        return (
          <div key={i} style={{
            position: 'absolute',
            left: it.x, top: it.y, width: 230,
            background: J_COLORS.surface,
            border: `1px solid ${J_COLORS.cobaltLine}`,
            borderRadius: 8,
            padding: '16px 18px',
            opacity: op,
            transform: `translateY(${(1 - op) * 10}px)`,
          }}>
            <div style={{
              fontFamily: J_FONTS.mono, fontWeight: 600,
              fontSize: 14, color: J_COLORS.text,
              letterSpacing: '0.16em',
            }}>{it.label}</div>
            <div style={{
              marginTop: 6,
              fontFamily: J_FONTS.mono, fontSize: 11,
              color: J_COLORS.text3, letterSpacing: '0.04em',
              textTransform: 'lowercase',
            }}>{it.sub}</div>
          </div>
        );
      })}

      {/* Center diagram */}
      <div style={{
        position: 'absolute', inset: '380px 220px auto 220px',
        height: 380,
        background: 'radial-gradient(ellipse at 50% 50%, rgba(61,107,255,0.06), transparent 70%)',
      }}>
        <svg width="1480" height="380" style={{ position: 'absolute', inset: 0 }}>
          {/* Central glyph: URL going in left, report coming out right */}
          <g fontFamily={J_FONTS.mono} fill={J_COLORS.text3}>
            <text x="40" y="200" fontSize="13" letterSpacing="3">URL IN</text>
            <text x="40" y="218" fontSize="12" fill={J_COLORS.text2}>booking.com/...</text>
          </g>
          <line x1="220" y1="200" x2="640" y2="200" stroke={J_COLORS.cobaltLine} strokeDasharray="4 3" />
          {/* Center box */}
          <rect x="640" y="120" width="280" height="160" fill={J_COLORS.surface} stroke={J_COLORS.cobaltLine} rx="8"/>
          <text x="780" y="180" textAnchor="middle" fontFamily={J_FONTS.mono} fontSize="14" fill={J_COLORS.text3} letterSpacing="3">PIPELINE</text>
          <text x="780" y="218" textAnchor="middle" fontFamily={J_FONTS.serif} fontStyle="italic" fontSize="42" fill={J_COLORS.text}>orchestrated</text>
          <line x1="920" y1="200" x2="1340" y2="200" stroke={J_COLORS.cobaltLine} strokeDasharray="4 3" />
          <g fontFamily={J_FONTS.mono} fill={J_COLORS.text3}>
            <text x="1380" y="200" fontSize="13" letterSpacing="3">REPORT OUT</text>
            <text x="1380" y="218" fontSize="12" fill={J_COLORS.text2}>spread · index · topology</text>
          </g>

          {/* Webhook back-loop arrow under Stripe ↔ Supabase */}
          {localTime > 5.0 && (
            <g opacity={Math.min(1, (localTime - 5.0) / 0.5)}>
              <path d="M 540 320 Q 460 360 380 320" fill="none" stroke={J_COLORS.cobalt} strokeWidth="1.5" strokeDasharray="3 4"/>
              <polygon points="380,320 388,316 388,324" fill={J_COLORS.cobalt}/>
              <text x="460" y="370" textAnchor="middle" fontFamily={J_FONTS.mono} fontSize="10" letterSpacing="2" fill={J_COLORS.text3} textTransform="uppercase">WEBHOOK</text>
            </g>
          )}
        </svg>
      </div>

      {/* Bottom: data sinks */}
      <div style={{
        position: 'absolute', left: 220, bottom: 200, right: 220,
        display: 'flex', justifyContent: 'space-between', gap: 30,
      }}>
        {['HISTORY · per user', 'BOARD · opt-in', 'SHARE · link-grade'].map((label, i) => {
          const delay = 5.5 + i * 0.4;
          if (localTime < delay) return null;
          const op = Math.min(1, (localTime - delay) / 0.4);
          return (
            <div key={i} style={{
              flex: 1,
              padding: '20px 24px',
              border: `1px solid ${J_COLORS.line2}`,
              borderRadius: 8,
              background: J_COLORS.surface,
              opacity: op,
              fontFamily: J_FONTS.mono, fontSize: 13,
              color: J_COLORS.text2, letterSpacing: '0.22em', textTransform: 'uppercase',
              textAlign: 'center',
            }}>{label}</div>
          );
        })}
      </div>
    </div>
  );
}

// ── Beat 13 (102–115s) — Identity radial deploy (hero) ──────────────────
function S_B13() {
  const { localTime } = useSprite();
  const cx = 960, cy = 480;
  // Three rings: 8 datacenter (r=180), 11 residential (r=300), 5 mobile (r=420)
  const dots = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 8; i++) {
      arr.push({ angle: (i / 8) * Math.PI * 2 - Math.PI / 2, r: 180, wave: 1, delay: 0.4 + i * 0.18 });
    }
    for (let i = 0; i < 11; i++) {
      arr.push({ angle: (i / 11) * Math.PI * 2 + Math.PI / 8, r: 300, wave: 2, delay: 1.7 + i * 0.18 });
    }
    for (let i = 0; i < 5; i++) {
      arr.push({ angle: (i / 5) * Math.PI * 2, r: 420, wave: 3, delay: 3.5 + i * 0.22 });
    }
    return arr;
  }, []);

  const counter = dots.filter(d => localTime > d.delay + 0.6).length;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Center crosshair */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <circle cx={cx} cy={cy} r="14" fill={J_COLORS.cobalt} opacity="0.8" />
        <circle cx={cx} cy={cy} r="10" fill={J_COLORS.cobaltBr}/>
        {[180, 300, 420].map((r, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={J_COLORS.line2} strokeWidth="0.8"
            strokeDasharray="2 5"/>
        ))}

        {/* Scan pulse rings */}
        {[0, 0.7, 1.4].map((offset, i) => {
          const cyclePos = ((localTime + offset) % 2.1) / 2.1;
          const r = 60 + cyclePos * 420;
          const op = (1 - cyclePos) * 0.4;
          return (
            <circle key={'p'+i} cx={cx} cy={cy} r={r}
              fill="none" stroke={J_COLORS.cobalt} strokeWidth="1" opacity={op}/>
          );
        })}

        {/* Dots */}
        {dots.map((d, i) => {
          if (localTime < d.delay) return null;
          const travel = Math.min(1, Easing.easeOutCubic((localTime - d.delay) / 0.5));
          const dx = cx + Math.cos(d.angle) * d.r * travel;
          const dy = cy + Math.sin(d.angle) * d.r * travel;
          const settled = travel >= 1;
          const trailLen = 50 * (1 - travel);
          const trailX = dx - Math.cos(d.angle) * trailLen;
          const trailY = dy - Math.sin(d.angle) * trailLen;
          const colorByWave = d.wave === 1 ? J_COLORS.cobalt : d.wave === 2 ? J_COLORS.cobaltBr : J_COLORS.good;
          return (
            <g key={i}>
              {!settled && (
                <line x1={trailX} y1={trailY} x2={dx} y2={dy}
                  stroke={colorByWave} strokeWidth="1.2" opacity="0.6"/>
              )}
              <circle cx={dx} cy={dy} r={settled ? 6 : 5} fill={colorByWave}
                style={{ filter: `drop-shadow(0 0 8px ${colorByWave})` }}/>
              {settled && (
                <circle cx={dx} cy={dy} r="14" fill="none" stroke={colorByWave}
                  strokeWidth="1" opacity={Math.max(0, 0.7 - ((localTime - d.delay - 0.5) % 1.5))}/>
              )}
            </g>
          );
        })}
      </svg>

      {/* HUD top-left */}
      <div style={{
        position: 'absolute', left: 80, top: 200,
        fontFamily: J_FONTS.mono, color: J_COLORS.text3,
      }}>
        <div style={{ fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase' }}>Live deployment</div>
        <div style={{
          marginTop: 16, fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 144, color: J_COLORS.text,
          letterSpacing: '-0.04em', lineHeight: 0.9,
        }}>
          {String(counter).padStart(2, '0')}
          <span style={{ fontSize: 36, color: J_COLORS.text3, marginLeft: 16 }}>/24</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: J_COLORS.text3 }}>
          {Math.min(11.5, localTime).toFixed(1)}s elapsed
        </div>
      </div>

      {/* HUD bottom: wave labels */}
      <div style={{
        position: 'absolute', left: 80, bottom: 180,
        fontFamily: J_FONTS.mono, fontSize: 14,
        color: J_COLORS.text3, letterSpacing: '0.18em',
      }}>
        <div style={{ color: counter >= 1 ? J_COLORS.cobalt : J_COLORS.text4 }}>● WAVE 1 · DATACENTER · 8</div>
        <div style={{ marginTop: 8, color: counter >= 9 ? J_COLORS.cobaltBr : J_COLORS.text4 }}>● WAVE 2 · RESIDENTIAL · 11</div>
        <div style={{ marginTop: 8, color: counter >= 20 ? J_COLORS.good : J_COLORS.text4 }}>● WAVE 3 · MOBILE · 5</div>
      </div>
    </div>
  );
}

// ── Beat 14 (115–125s) — Normalize → Spread → Topology → Report ─────────
function S_B14() {
  const { localTime } = useSprite();
  const stages = [
    { label: 'NORMALIZE', sub: 'currency · tax · fx', value: 'USD',         delay: 0.3 },
    { label: 'SPREAD',    sub: 'max − baseline',     value: '+$186',         delay: 1.6 },
    { label: 'TOPOLOGY',  sub: 'shape classifier',   value: 'progressive',   delay: 2.9 },
    { label: 'REPORT',    sub: 'evidence chain',     value: 'pdf · csv',     delay: 4.2 },
  ];
  const w = 320, gap = 60;
  const totalW = stages.length * w + (stages.length - 1) * gap;
  const startX = (1920 - totalW) / 2;
  const y = 360;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* connecting lines */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        {stages.slice(0, -1).map((_, i) => {
          const x1 = startX + (i + 1) * w + i * gap;
          const x2 = x1 + gap;
          const delay = stages[i + 1].delay - 0.2;
          if (localTime < delay) return null;
          const t = Math.min(1, (localTime - delay) / 0.4);
          return (
            <g key={i}>
              <line x1={x1} y1={y + 130} x2={x1 + (x2 - x1) * t} y2={y + 130}
                stroke={J_COLORS.cobalt} strokeWidth="2"/>
              <polygon points={`${x1 + (x2-x1)*t},${y+130} ${x1 + (x2-x1)*t - 8},${y+126} ${x1 + (x2-x1)*t - 8},${y+134}`}
                fill={J_COLORS.cobalt} opacity={t > 0.95 ? 1 : 0}/>
            </g>
          );
        })}
      </svg>

      {stages.map((s, i) => {
        if (localTime < s.delay) return null;
        const local = localTime - s.delay;
        const op = Math.min(1, local / 0.4);
        const sc = 0.94 + Math.min(1, local / 0.4) * 0.06;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: startX + i * (w + gap),
            top: y, width: w, height: 260,
            background: J_COLORS.surface,
            border: `1px solid ${J_COLORS.line2}`,
            borderRadius: 12,
            opacity: op,
            transform: `scale(${sc})`,
            transformOrigin: 'center',
            padding: 28,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{
                fontFamily: J_FONTS.mono, fontSize: 12,
                letterSpacing: '0.24em', textTransform: 'uppercase',
                color: J_COLORS.cobaltBr,
              }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{
                marginTop: 14,
                fontFamily: J_FONTS.mono, fontSize: 16,
                letterSpacing: '0.18em', color: J_COLORS.text,
                fontWeight: 600,
              }}>{s.label}</div>
              <div style={{
                marginTop: 6,
                fontFamily: J_FONTS.mono, fontSize: 12,
                color: J_COLORS.text3,
              }}>{s.sub}</div>
            </div>
            <div style={{
              fontFamily: J_FONTS.serif,
              fontStyle: s.value === 'progressive' ? 'italic' : 'normal',
              fontSize: 48,
              color: J_COLORS.cobaltBr,
              letterSpacing: '-0.02em',
            }}>{s.value}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Beat 15 (125–130s) — three sinks ────────────────────────────────────
function S_B15() {
  const { localTime } = useSprite();
  const cards = [
    { name: 'HISTORY', sub: 'every probe · under your account', icon: '◰' },
    { name: 'BOARD',   sub: 'opt-in · public intelligence',     icon: '⌥' },
    { name: 'SHARE',   sub: 'link-grade · evidence',            icon: '↗' },
  ];
  const w = 360, gap = 30;
  const totalW = cards.length * w + (cards.length - 1) * gap;
  const startX = (1920 - totalW) / 2;
  const y = 380;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {cards.map((c, i) => {
        const delay = i * 0.18;
        if (localTime < delay) return null;
        const op = Math.min(1, (localTime - delay) / 0.4);
        const ty = (1 - op) * 20;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: startX + i * (w + gap),
            top: y, width: w, height: 280,
            background: J_COLORS.surface,
            border: `1px solid ${J_COLORS.line2}`,
            borderRadius: 12,
            padding: 36,
            opacity: op,
            transform: `translateY(${ty}px)`,
          }}>
            <div style={{
              fontFamily: J_FONTS.mono, fontSize: 64,
              color: J_COLORS.cobaltBr,
              lineHeight: 1,
            }}>{c.icon}</div>
            <div style={{
              marginTop: 32,
              fontFamily: J_FONTS.mono, fontWeight: 600,
              fontSize: 22, letterSpacing: '0.24em',
              color: J_COLORS.text,
            }}>{c.name}</div>
            <div style={{
              marginTop: 12,
              fontFamily: J_FONTS.mono, fontSize: 14,
              color: J_COLORS.text3, letterSpacing: '0.04em',
            }}>{c.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

window.S_B11 = S_B11;
window.S_B12 = S_B12;
window.S_B13 = S_B13;
window.S_B14 = S_B14;
window.S_B15 = S_B15;
