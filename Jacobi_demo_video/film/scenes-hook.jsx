// film/scenes-hook.jsx
// Acts I (0–35s) and II (35–80s)
// Cinematic problem-set + Jacobi brand reveal.

// ── Act I, Beat 1 (0–7s) — URL types itself ─────────────────────────────
function S_B01() {
  const { localTime } = useSprite();
  // Typed URL: reveal char-by-char over 4s, then hold
  const url = 'https://www.booking.com/hotel/ny-grand-luxe-suites';
  const typeStart = 0.8, typeEnd = 4.0;
  let chars = 0;
  if (localTime > typeStart) {
    chars = Math.min(url.length, Math.round(((localTime - typeStart) / (typeEnd - typeStart)) * url.length));
  }
  const visibleUrl = url.slice(0, chars);
  const cursorBlink = Math.floor(localTime * 2) % 2 === 0 ? 1 : 0;

  // Slow push-in
  const scale = 1 + (localTime / 7) * 0.04;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `scale(${scale})`,
      transformOrigin: 'center',
    }}>
      <div style={{
        position: 'relative',
        width: 900, padding: '22px 32px',
        background: J_COLORS.surface,
        border: `1px solid ${J_COLORS.line}`,
        borderRadius: 8,
        fontFamily: J_FONTS.mono,
        fontSize: 22, color: J_COLORS.text2,
        letterSpacing: '0.02em',
      }}>
        <span style={{ color: J_COLORS.text3, marginRight: 12 }}>⌖</span>
        {visibleUrl}
        <span style={{
          display: 'inline-block', width: 2, height: 24,
          background: J_COLORS.cobalt, marginLeft: 4,
          verticalAlign: 'middle',
          opacity: cursorBlink,
        }}/>
      </div>
    </div>
  );
}

// ── Act I, Beat 2 (7–14s) — URL forks into 4 prices ─────────────────────
function S_B02() {
  const { localTime } = useSprite();
  // URL pill at top (carried from previous beat — settle position)
  // Lines fork down to 4 price endpoints
  const lineProgress = Math.min(1, Easing.easeOutCubic(localTime / 2.5));
  const prices = [
    { label: '$454', x: 360 },
    { label: '$487', x: 700 },
    { label: '$512', x: 1240 },
    { label: '$640', x: 1560, red: true },
  ];
  const startY = 280, endY = 720;
  const redFlicker = (localTime > 6.0 && localTime < 6.4) ? 0.3 : 1;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* URL pill */}
      <div style={{
        position: 'absolute', top: 200, left: '50%', transform: 'translateX(-50%)',
        padding: '18px 30px',
        background: J_COLORS.surface,
        border: `1px solid ${J_COLORS.line}`,
        borderRadius: 8,
        fontFamily: J_FONTS.mono, fontSize: 20, color: J_COLORS.text2,
      }}>
        <span style={{ color: J_COLORS.text3, marginRight: 12 }}>⌖</span>
        booking.com/hotel/ny-grand-luxe-suites
      </div>

      {/* Fork lines SVG */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {prices.map((p, i) => {
          const delay = i * 0.15;
          const progress = Math.max(0, Math.min(1, Easing.easeOutCubic((localTime - delay - 1.2) / 1.4)));
          const midX = 960;
          const midY = 380 + i * 4;
          const pathLen = 480;
          return (
            <g key={i}>
              <path d={`M ${midX} ${startY + 20} L ${midX} ${midY} L ${p.x} ${midY} L ${p.x} ${endY - 80}`}
                fill="none"
                stroke={p.red ? J_COLORS.over : J_COLORS.cobalt}
                strokeWidth="1.5"
                strokeDasharray={pathLen}
                strokeDashoffset={pathLen * (1 - progress)}
                opacity={p.red ? redFlicker : 0.9}
              />
              {progress > 0.7 && (
                <circle cx={p.x} cy={endY - 80} r="4" fill={p.red ? J_COLORS.over : J_COLORS.cobalt} opacity={p.red ? redFlicker : 1} />
              )}
            </g>
          );
        })}
      </svg>

      {/* Price labels */}
      {prices.map((p, i) => {
        const delay = i * 0.15 + 2.4;
        if (localTime < delay) return null;
        const op = Math.min(1, (localTime - delay) / 0.4);
        return (
          <div key={i} style={{
            position: 'absolute',
            left: p.x, top: endY - 50,
            transform: 'translateX(-50%)',
            fontFamily: J_FONTS.serif,
            fontSize: 64, color: p.red ? J_COLORS.over : J_COLORS.text,
            opacity: op * (p.red ? redFlicker : 1),
            letterSpacing: '-0.02em',
          }}>{p.label}</div>
        );
      })}
    </div>
  );
}

// ── Act I, Beat 3 (14–23s) — 24-tile grid of "same URL, 24 prices" ───────
function S_B03() {
  const { localTime } = useSprite();
  // 6 cols × 4 rows
  const tileW = 240, tileH = 150, gap = 24;
  const totalW = 6 * tileW + 5 * gap;
  const totalH = 4 * tileH + 3 * gap;
  const startX = (1920 - totalW) / 2;
  const startY = (1080 - totalH) / 2;

  // Tile data (24 unique prices, baseline $454)
  const prices = [
    454, 478, 491, 502, 521, 538,
    461, 485, 498, 514, 537, 562,
    467, 489, 506, 527, 558, 598,
    472, 496, 512, 534, 579, 640,
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {prices.map((p, i) => {
        const col = i % 6, row = Math.floor(i / 6);
        const tileDelay = (row * 6 + col) * 0.12 + 0.5;
        if (localTime < tileDelay) return null;
        const local = localTime - tileDelay;
        const op = Math.min(1, local / 0.35);
        const sc = 0.92 + Math.min(1, local / 0.35) * 0.08;
        const isMax = p === 640;
        const isMin = p === 454;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: startX + col * (tileW + gap),
            top: startY + row * (tileH + gap),
            width: tileW, height: tileH,
            background: J_COLORS.surface,
            border: `1px solid ${isMax ? J_COLORS.over : J_COLORS.line}`,
            borderRadius: 8,
            opacity: op,
            transform: `scale(${sc})`,
            transformOrigin: 'center',
            overflow: 'hidden',
          }}>
            {/* fake browser bar */}
            <div style={{
              height: 22, background: '#0a0d14',
              borderBottom: `1px solid ${J_COLORS.line}`,
              display: 'flex', alignItems: 'center', padding: '0 10px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#26272a', marginRight: 5 }} />
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#26272a', marginRight: 5 }} />
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#26272a' }} />
              <span style={{
                marginLeft: 14, fontFamily: J_FONTS.mono, fontSize: 8,
                color: J_COLORS.text4, letterSpacing: '0.04em',
              }}>booking.com/ny-grand-luxe</span>
            </div>
            {/* price */}
            <div style={{
              padding: '20px 14px',
              fontFamily: J_FONTS.mono, fontSize: 10,
              color: J_COLORS.text3,
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              <div>NIGHTLY · NYC</div>
              <div style={{
                marginTop: 16,
                fontFamily: J_FONTS.serif,
                fontSize: 36,
                color: isMax ? J_COLORS.over : (isMin ? J_COLORS.good : J_COLORS.text),
                letterSpacing: '-0.02em',
                textTransform: 'none',
              }}>${p}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Act I, Beat 4 (23–28s) — zoom + isolate worst tile ──────────────────
function S_B04() {
  const { localTime } = useSprite();
  // Continue showing dimmed grid, then zoom into the worst tile (top-right red).
  const tileW = 240, tileH = 150, gap = 24;
  const totalW = 6 * tileW + 5 * gap;
  const totalH = 4 * tileH + 3 * gap;
  const startX = (1920 - totalW) / 2;
  const startY = (1080 - totalH) / 2;
  const prices = [
    454, 478, 491, 502, 521, 538,
    461, 485, 498, 514, 537, 562,
    467, 489, 506, 527, 558, 598,
    472, 496, 512, 534, 579, 640,
  ];

  // worst tile is index 23 (last)
  const worstCol = 5, worstRow = 3;
  const worstX = startX + worstCol * (tileW + gap);
  const worstY = startY + worstRow * (tileH + gap);
  const tileCx = worstX + tileW / 2;
  const tileCy = worstY + tileH / 2;

  // Camera zoom toward worst tile over 2.5s, scale 1 -> 1.6, translate so center -> screen center
  const t = Easing.easeOutCubic(Math.min(1, localTime / 2.5));
  const scale = 1 + t * 0.6;
  const tx = (960 - tileCx) * t;
  const ty = (540 - tileCy) * t;
  const dim = 0.04 + t * 0.5; // others dim to ~0.54

  return (
    <div style={{
      position: 'absolute', inset: 0,
      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
      transformOrigin: 'center',
    }}>
      {prices.map((p, i) => {
        const col = i % 6, row = Math.floor(i / 6);
        const isWorst = (col === worstCol && row === worstRow);
        const op = isWorst ? 1 : (1 - dim);
        const isMax = p === 640, isMin = p === 454;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: startX + col * (tileW + gap),
            top: startY + row * (tileH + gap),
            width: tileW, height: tileH,
            background: J_COLORS.surface,
            border: `1px solid ${isMax ? J_COLORS.over : J_COLORS.line}`,
            borderRadius: 8,
            opacity: op,
            overflow: 'hidden',
          }}>
            <div style={{
              height: 22, background: '#0a0d14',
              borderBottom: `1px solid ${J_COLORS.line}`,
              display: 'flex', alignItems: 'center', padding: '0 10px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#26272a', marginRight: 5 }} />
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#26272a', marginRight: 5 }} />
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#26272a' }} />
              <span style={{ marginLeft: 14, fontFamily: J_FONTS.mono, fontSize: 8, color: J_COLORS.text4 }}>booking.com/ny-grand-luxe</span>
            </div>
            <div style={{ padding: '20px 14px', fontFamily: J_FONTS.mono, fontSize: 10, color: J_COLORS.text3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              <div>NIGHTLY · NYC</div>
              <div style={{
                marginTop: 16,
                fontFamily: J_FONTS.serif,
                fontSize: 36,
                color: isMax ? J_COLORS.over : (isMin ? J_COLORS.good : J_COLORS.text),
                letterSpacing: '-0.02em',
                textTransform: 'none',
              }}>${p}</div>
              {isWorst && localTime > 1.5 && (
                <div style={{
                  marginTop: 8,
                  fontFamily: J_FONTS.mono, fontSize: 8,
                  color: J_COLORS.over, letterSpacing: '0.16em',
                  opacity: Math.min(1, (localTime - 1.5) / 0.6),
                }}>
                  +$186 · iPhone · Manhattan · direct
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Act I, Beat 5 (28–35s) — collapse to particle field + orbital rings ─
function S_B05() {
  const { localTime } = useSprite();
  // 80 particles, all converging from random outer positions to center
  const particles = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2 + (Math.random() * 0.5);
      const r = 400 + Math.random() * 400;
      arr.push({
        startX: 960 + Math.cos(angle) * r,
        startY: 540 + Math.sin(angle) * r,
        delay: Math.random() * 0.6,
        red: Math.random() < 0.04,
      });
    }
    return arr;
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {particles.map((p, i) => {
        const t = Easing.easeInOutCubic(Math.max(0, Math.min(1, (localTime - p.delay) / 2.2)));
        const x = p.startX + (960 - p.startX) * t;
        const y = p.startY + (540 - p.startY) * t;
        const op = 1 - Math.max(0, (localTime - 2.5) / 1.5) * 0.6;
        return (
          <div key={i} style={{
            position: 'absolute', left: x - 2, top: y - 2,
            width: 4, height: 4, borderRadius: 2,
            background: p.red ? J_COLORS.over : J_COLORS.cobalt,
            boxShadow: `0 0 6px ${p.red ? J_COLORS.over : J_COLORS.cobaltBr}`,
            opacity: op,
          }} />
        );
      })}

      {/* orbital rings - draw after 2.5s */}
      {localTime > 2.5 && (
        <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
          {[160, 240, 340].map((r, i) => {
            const delay = 2.5 + i * 0.4;
            const local = Math.max(0, localTime - delay);
            const op = Math.min(1, local / 0.6);
            const circ = 2 * Math.PI * r;
            const dashOffset = circ * (1 - Math.min(1, local / 1.0));
            return (
              <circle key={i} cx="960" cy="540" r={r}
                fill="none" stroke={J_COLORS.cobalt} strokeWidth="1"
                strokeDasharray={circ}
                strokeDashoffset={dashOffset}
                opacity={op * 0.5}
              />
            );
          })}
        </svg>
      )}

      {/* faint pre-brand letters */}
      {localTime > 4 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 72, color: J_COLORS.text,
          letterSpacing: '0.18em',
          opacity: Math.min(0.2, (localTime - 4) / 2),
        }}>
          JAC<span style={{ color: J_COLORS.cobalt }}>[&nbsp;]</span>BI
        </div>
      )}
    </div>
  );
}

// ── Act II, Beat 6 (35–42s) — Brand reveal ──────────────────────────────
function S_B06() {
  const { localTime } = useSprite();
  // Letters fade in fast, brackets flicker
  const op = Math.min(1, localTime / 1.0);
  const ruleW = Math.min(420, (localTime - 1.0) * 800);
  const bracketOpacity = (localTime > 1.4 && localTime < 1.5) ? 0.3 :
                        (localTime > 1.55 && localTime < 1.6) ? 0.5 : 1;

  return (
    <div style={{ position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: J_FONTS.sans, fontWeight: 600,
        fontSize: 180, color: J_COLORS.text,
        letterSpacing: '0.16em',
        opacity: op,
        textShadow: '0 0 60px rgba(61,107,255,0.2)',
      }}>
        JAC<span style={{ color: J_COLORS.cobalt, opacity: bracketOpacity }}>[&nbsp;]</span>BI
      </div>
      <div style={{
        marginTop: 40,
        width: ruleW, height: 1,
        background: J_COLORS.line,
        opacity: 0.6,
      }}/>
      {localTime > 2.0 && (
        <div style={{
          marginTop: 36,
          fontFamily: J_FONTS.mono, fontSize: 22,
          color: J_COLORS.text2,
          letterSpacing: '0.4em', textTransform: 'uppercase',
          opacity: Math.min(1, (localTime - 2.0) / 0.8),
        }}>
          Pricing intelligence for the fragmented web
        </div>
      )}
    </div>
  );
}

// ── Act II, Beat 7 (42–55s) — Globe deploy ──────────────────────────────
function S_B07() {
  const { localTime } = useSprite();
  // Latitude/longitude grid + dots painting on
  const cx = 1300, cy = 540, r = 320;
  // Build identity points
  const points = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 24; i++) {
      const lat = (Math.random() - 0.5) * 1.5;
      const lon = (Math.random() - 0.5) * 1.5;
      arr.push({
        x: cx + Math.cos(lon) * Math.sin(Math.PI / 2 + lat * 0.3) * r * 0.9,
        y: cy + Math.sin(lat) * r * 0.75,
        delay: i * 0.35,
        red: i === 7 || i === 19,
      });
    }
    return arr;
  }, []);

  // Counter ticks up
  const counterT = Math.max(0, Math.min(24, Math.floor((localTime - 0.4) / 0.35)));

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* URL input on the left */}
      <div style={{
        position: 'absolute', left: 100, top: 460, width: 600,
        padding: '20px 24px',
        background: J_COLORS.surface,
        border: `1px solid ${J_COLORS.cobaltLine}`,
        borderRadius: 8,
        fontFamily: J_FONTS.mono, fontSize: 18, color: J_COLORS.text2,
      }}>
        <span style={{ color: J_COLORS.cobalt, marginRight: 12 }}>⌖</span>
        booking.com/hotel/ny-grand-luxe
      </div>
      {/* Telemetry HUD left */}
      <div style={{
        position: 'absolute', left: 100, top: 540,
        fontFamily: J_FONTS.mono, color: J_COLORS.text3,
      }}>
        <div style={{ fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: J_COLORS.text3 }}>Live deployment</div>
        <div style={{
          marginTop: 18,
          fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 96, color: J_COLORS.text,
          letterSpacing: '-0.03em', lineHeight: 1,
        }}>
          {String(counterT).padStart(2, '0')}
          <span style={{ fontSize: 32, color: J_COLORS.text3, marginLeft: 12 }}>/ 24 live</span>
        </div>
        <div style={{ marginTop: 20, fontSize: 13, letterSpacing: '0.16em', color: J_COLORS.text3 }}>
          {counterT < 9 ? '● WAVE 1 · DATACENTER' :
           counterT < 19 ? '● WAVE 2 · RESIDENTIAL' :
                          '● WAVE 3 · MOBILE'}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: J_COLORS.text4 }}>JFK → LHR · UA182 · residential mesh</div>
      </div>

      {/* Globe SVG */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="globeFill" cx="0.4" cy="0.4">
            <stop offset="0%" stopColor="rgba(61,107,255,0.10)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="url(#globeFill)" stroke={J_COLORS.line} strokeWidth="1"/>
        {/* latitude lines */}
        {[-0.6, -0.3, 0, 0.3, 0.6].map((lat, i) => (
          <ellipse key={'lat'+i} cx={cx} cy={cy + lat * r} rx={r * Math.sqrt(1 - lat*lat)} ry={r * 0.18 * Math.sqrt(1 - lat*lat)}
            fill="none" stroke={J_COLORS.line} strokeWidth="0.7" opacity="0.7"/>
        ))}
        {/* longitude lines */}
        {[-0.7, -0.35, 0, 0.35, 0.7].map((lon, i) => (
          <ellipse key={'lon'+i} cx={cx} cy={cy} rx={r * 0.35 * Math.abs(lon) || 6} ry={r}
            fill="none" stroke={J_COLORS.line} strokeWidth="0.7" opacity="0.5"/>
        ))}
        {/* identity dots */}
        {points.map((p, i) => {
          const local = localTime - p.delay;
          if (local < 0) return null;
          const op = Math.min(1, local / 0.3);
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4"
                fill={p.red ? J_COLORS.over : J_COLORS.cobalt}
                opacity={op}
                style={{ filter: `drop-shadow(0 0 6px ${p.red ? J_COLORS.over : J_COLORS.cobaltBr})` }}
              />
              <circle cx={p.x} cy={p.y} r={4 + (local % 1.2) * 12}
                fill="none"
                stroke={p.red ? J_COLORS.over : J_COLORS.cobalt}
                strokeWidth="0.8"
                opacity={Math.max(0, op * (1 - (local % 1.2) / 1.2) * 0.5)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Act II, Beat 8 (55–65s) — Spread bars emerge ────────────────────────
function S_B08() {
  const { localTime } = useSprite();
  const rows = [
    { id: 'a07', tag: 'Android · Iowa · Kayak',      price: 454, color: J_COLORS.good },
    { id: 'a13', tag: 'Android · Berlin · direct',   price: 487, color: J_COLORS.cobalt },
    { id: 'a02', tag: 'iPhone · LA · direct',        price: 512, color: J_COLORS.cobalt },
    { id: 'a19', tag: 'iPhone · Berlin · Skyscanner',price: 558, color: J_COLORS.cobalt },
    { id: 'a23', tag: 'iPhone · Manhattan · loyalty',price: 598, color: J_COLORS.cobaltBr },
    { id: 'a24', tag: 'iPhone · Manhattan · direct', price: 640, color: J_COLORS.over },
  ];
  const minP = 454, maxP = 640, span = 1100;
  const startX = 220;

  // Spread counter 0 -> 186
  const spread = Math.round(Math.max(0, Math.min(186, ((localTime - 0.8) / 2) * 186)));

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 80 }}>
      <div style={{
        fontFamily: J_FONTS.mono, fontSize: 14,
        letterSpacing: '0.3em', textTransform: 'uppercase',
        color: J_COLORS.text3, marginTop: 40, marginLeft: 140,
      }}>● UA182 · JFK → LHR · 24/24 returned</div>

      <div style={{ marginTop: 60, marginLeft: 140, position: 'relative' }}>
        {rows.map((r, i) => {
          const delay = i * 0.18 + 0.4;
          if (localTime < delay) return null;
          const local = localTime - delay;
          const barProgress = Math.min(1, Easing.easeOutCubic(local / 0.6));
          const barW = ((r.price - minP) / (maxP - minP)) * span * barProgress + 60;
          return (
            <div key={i} style={{
              marginTop: i === 0 ? 0 : 30,
              display: 'flex', alignItems: 'center',
              opacity: Math.min(1, local / 0.3),
            }}>
              <div style={{
                width: 80, fontFamily: J_FONTS.mono, fontSize: 14,
                color: J_COLORS.text3, letterSpacing: '0.1em',
              }}>{r.id}</div>
              <div style={{
                width: 360, fontFamily: J_FONTS.mono, fontSize: 16,
                color: J_COLORS.text2,
              }}>{r.tag}</div>
              <div style={{
                width: barW, height: 24,
                background: r.color,
                opacity: 0.85,
                borderRadius: 2,
                marginLeft: 20,
              }}/>
              <div style={{
                marginLeft: 18,
                fontFamily: J_FONTS.serif, fontSize: 32,
                color: r.color,
              }}>${r.price}</div>
            </div>
          );
        })}
      </div>

      {/* SPREAD readout right side */}
      <div style={{
        position: 'absolute', right: 140, top: 200,
        textAlign: 'right',
      }}>
        <div style={{
          fontFamily: J_FONTS.mono, fontSize: 14,
          letterSpacing: '0.3em', textTransform: 'uppercase',
          color: J_COLORS.text3,
        }}>Spread</div>
        <div style={{
          marginTop: 12,
          fontFamily: J_FONTS.serif,
          fontSize: 200, color: J_COLORS.cobaltBr,
          letterSpacing: '-0.03em', lineHeight: 1,
        }}>+${spread}</div>
        <div style={{
          marginTop: 4,
          fontFamily: J_FONTS.mono, fontSize: 16,
          color: J_COLORS.text3, letterSpacing: '0.18em',
        }}>29% OVER BASELINE</div>
      </div>
    </div>
  );
}

// ── Act II, Beat 9 (65–75s) — Report writes itself ──────────────────────
function S_B09() {
  const { localTime } = useSprite();

  // Type-on body lines
  const lines = [
    { t: 0.4,  text: '› UA182 · JFK → LHR · 24/24 agents returned' },
    { t: 1.4,  text: '› iPhone · Manhattan · direct ······· $640' },
    { t: 2.0,  text: '› iPhone · Berlin · Skyscanner ······ $558' },
    { t: 2.6,  text: '› Android · LA · direct ············· $512' },
    { t: 3.2,  text: '› Android · Iowa · Kayak ············ $454' },
    { t: 4.0,  text: '› Driver: location · max delta -$186' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 1280,
        background: J_COLORS.surface,
        border: `1px solid ${J_COLORS.line}`,
        borderRadius: 12,
        padding: '44px 56px',
        boxShadow: '0 60px 140px -40px rgba(0,0,0,0.8)',
      }}>
        <div style={{
          fontFamily: J_FONTS.mono, fontSize: 13,
          color: J_COLORS.text3, letterSpacing: '0.32em', textTransform: 'uppercase',
        }}>FORENSIC RECORD · #2k9-ua182</div>
        <div style={{ marginTop: 14, height: 1, background: J_COLORS.line }}/>

        <div style={{ marginTop: 30, display: 'flex', gap: 80 }}>
          <div>
            <div style={{ fontFamily: J_FONTS.mono, fontSize: 12, color: J_COLORS.text3, letterSpacing: '0.22em', textTransform: 'uppercase' }}>TOPOLOGY</div>
            <div style={{ marginTop: 6, fontFamily: J_FONTS.serif, fontStyle: 'italic', fontSize: 56, color: J_COLORS.text }}>Progressive</div>
          </div>
          <div>
            <div style={{ fontFamily: J_FONTS.mono, fontSize: 12, color: J_COLORS.text3, letterSpacing: '0.22em', textTransform: 'uppercase' }}>SPREAD</div>
            <div style={{ marginTop: 6, fontFamily: J_FONTS.serif, fontSize: 56, color: J_COLORS.cobaltBr }}>+$186</div>
          </div>
          <div>
            <div style={{ fontFamily: J_FONTS.mono, fontSize: 12, color: J_COLORS.text3, letterSpacing: '0.22em', textTransform: 'uppercase' }}>INDEX</div>
            <div style={{ marginTop: 6, fontFamily: J_FONTS.sans, fontWeight: 600, fontSize: 56, color: J_COLORS.text, letterSpacing: '-0.02em' }}>
              71<span style={{ fontSize: 28, color: J_COLORS.text3 }}>/100</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 36, height: 1, background: J_COLORS.line }}/>

        <div style={{ marginTop: 22 }}>
          {lines.map((ln, i) => {
            if (localTime < ln.t) return null;
            return (
              <div key={i} style={{
                marginTop: i === 0 ? 0 : 10,
                fontFamily: J_FONTS.mono, fontSize: 18,
                color: i === 5 ? J_COLORS.over : J_COLORS.text2,
                letterSpacing: '0.02em',
                opacity: Math.min(1, (localTime - ln.t) / 0.3),
              }}>{ln.text}</div>
            );
          })}
        </div>

        <div style={{ marginTop: 30, height: 1, background: J_COLORS.line }}/>
        <div style={{
          marginTop: 16,
          fontFamily: J_FONTS.mono, fontSize: 12,
          color: J_COLORS.text3, letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>EVIDENCE · 24/24 AGENTS RETURNED · STORED · SHAREABLE</div>
      </div>
    </div>
  );
}

// ── Act II, Beat 10 (75–80s) — Thesis line ──────────────────────────────
function S_B10() {
  const { localTime } = useSprite();
  return (
    <div style={{ position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        fontFamily: J_FONTS.serif, fontStyle: 'italic',
        fontSize: 96, color: J_COLORS.text,
        letterSpacing: '-0.01em',
        opacity: Math.min(1, localTime / 0.6),
        transform: `translateY(${(1 - Math.min(1, localTime / 0.6)) * 20}px)`,
      }}>
        Paste a URL.
      </div>
      {localTime > 1.5 && (
        <div style={{
          marginTop: 20,
          fontFamily: J_FONTS.serif, fontStyle: 'italic',
          fontSize: 96, color: J_COLORS.cobaltBr,
          letterSpacing: '-0.01em',
          opacity: Math.min(1, (localTime - 1.5) / 0.7),
          transform: `translateY(${(1 - Math.min(1, (localTime - 1.5) / 0.7)) * 20}px)`,
        }}>
          Read the verdict.
        </div>
      )}
    </div>
  );
}

window.S_B01 = S_B01;
window.S_B02 = S_B02;
window.S_B03 = S_B03;
window.S_B04 = S_B04;
window.S_B05 = S_B05;
window.S_B06 = S_B06;
window.S_B07 = S_B07;
window.S_B08 = S_B08;
window.S_B09 = S_B09;
window.S_B10 = S_B10;
