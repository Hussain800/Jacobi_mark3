// film/scenes-walk.jsx
// Act IV — Walkthrough (130–265s).
// Recreates the live product UI natively at 1920×1080 — sharp, vector-quality,
// pixel-perfect to the brand. Cursor + callouts + transitions composited on top.

// ── Shared layout: top nav (matches live site) ──────────────────────────
function JacNav({ active, scrolled = true }) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 80,
      background: scrolled ? 'rgba(7,8,11,0.78)' : 'transparent',
      backdropFilter: 'blur(18px) saturate(140%)',
      borderBottom: scrolled ? `1px solid ${J_COLORS.line}` : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 80px', zIndex: 50,
      fontFamily: J_FONTS.sans,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 13,
          border: `1px solid ${J_COLORS.cobalt}`,
          position: 'relative',
        }}>
          <span style={{ position: 'absolute', left: '50%', top: -5, bottom: -5, width: 1, background: J_COLORS.cobalt, transform: 'translateX(-50%)' }}/>
          <span style={{ position: 'absolute', top: '50%', left: -5, right: -5, height: 1, background: J_COLORS.cobalt, transform: 'translateY(-50%)' }}/>
        </span>
        <span style={{ fontFamily: J_FONTS.mono, fontWeight: 600, fontSize: 18, letterSpacing: '0.22em', color: J_COLORS.text }}>JACOBI</span>
      </div>
      <div style={{ display: 'flex', gap: 38 }}>
        {['Probe','History','Board','Pricing'].map(item => (
          <span key={item} style={{
            fontFamily: J_FONTS.mono, fontSize: 14, letterSpacing: '0.08em',
            color: active === item ? J_COLORS.text : J_COLORS.text2,
            position: 'relative',
          }}>
            {item}
            {active === item && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -8, height: 1, background: J_COLORS.cobalt }}/>}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontFamily: J_FONTS.mono, fontSize: 12, color: J_COLORS.text3, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: J_COLORS.good, boxShadow: `0 0 10px ${J_COLORS.good}` }}/>
          Operational
        </span>
        <span style={{ color: J_COLORS.text }}>Sign in</span>
      </div>
    </div>
  );
}

// ── Reusable globe component ────────────────────────────────────────────
function GlobeViz({ cx, cy, r, dots = 12 }) {
  const points = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * Math.PI * 2;
      const lat = (Math.random() - 0.5) * 1.6;
      arr.push({
        x: cx + Math.cos(a) * r * 0.85,
        y: cy + Math.sin(lat * 0.8) * r * 0.7,
      });
    }
    return arr;
  }, [cx, cy, r, dots]);

  return (
    <svg width={r * 2.4} height={r * 2.4} style={{ position: 'absolute', left: cx - r * 1.2, top: cy - r * 1.2 }}>
      <defs>
        <radialGradient id="gFillW" cx="0.4" cy="0.4">
          <stop offset="0%" stopColor="rgba(61,107,255,0.18)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <circle cx={r * 1.2} cy={r * 1.2} r={r} fill="url(#gFillW)" stroke={J_COLORS.line2}/>
      {[-0.7, -0.35, 0, 0.35, 0.7].map((lat, i) => (
        <ellipse key={'lat'+i} cx={r * 1.2} cy={r * 1.2 + lat * r}
          rx={r * Math.sqrt(1 - lat*lat)}
          ry={r * 0.18 * Math.sqrt(1 - lat*lat)}
          fill="none" stroke={J_COLORS.line} strokeWidth="0.8" opacity="0.7"/>
      ))}
      {[-0.7, -0.35, 0, 0.35, 0.7].map((lon, i) => (
        <ellipse key={'lon'+i} cx={r * 1.2} cy={r * 1.2}
          rx={Math.abs(lon * r * 0.35) || 6} ry={r}
          fill="none" stroke={J_COLORS.line} strokeWidth="0.8" opacity="0.5"/>
      ))}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x - cx + r * 1.2} cy={p.y - cy + r * 1.2} r="4" fill={J_COLORS.cobaltBr}
            style={{ filter: `drop-shadow(0 0 6px ${J_COLORS.cobaltBr})` }}/>
          <circle cx={p.x - cx + r * 1.2} cy={p.y - cy + r * 1.2} r="9"
            fill="none" stroke={J_COLORS.cobalt} strokeWidth="0.8" opacity="0.5"/>
        </g>
      ))}
    </svg>
  );
}

// ── Beat 16 (130–142s) — Landing page (THE GLOBE IS HERE) ───────────────
function S_B16() {
  const { localTime, duration } = useSprite();
  const scale = 1 + Math.min(1, localTime / 12) * 0.04;

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: 'center 35%' }}>
      <JacNav active="Probe" />

      {/* Hero left content */}
      <div style={{ position: 'absolute', top: 200, left: 100, maxWidth: 1100 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '8px 18px',
          border: `1px solid ${J_COLORS.line2}`,
          borderRadius: 100,
          fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: J_COLORS.text2,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: J_COLORS.cobalt, boxShadow: `0 0 8px ${J_COLORS.cobalt}` }}/>
          1,247,892 probes · running now
        </div>

        <div style={{
          marginTop: 40,
          fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 132, color: J_COLORS.text,
          letterSpacing: '-0.04em', lineHeight: 0.98,
        }}>
          Your browser is a<br/>
          <span style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', fontWeight: 400, color: J_COLORS.cobaltBr }}>bargaining tool</span>
        </div>

        <div style={{
          marginTop: 32,
          fontFamily: J_FONTS.serif, fontStyle: 'italic',
          fontSize: 28, color: J_COLORS.text2, maxWidth: 720,
          lineHeight: 1.35,
        }}>
          24 agents. One URL. The truth about what you actually pay.
        </div>

        <div style={{
          marginTop: 56,
          width: 880, padding: '24px 28px',
          background: J_COLORS.surface,
          border: `1px solid ${J_COLORS.line2}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 20,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontFamily: J_FONTS.mono, fontSize: 13, color: J_COLORS.text3, letterSpacing: '0.18em' }}>
            <span style={{ color: J_COLORS.cobalt, marginRight: 10 }}>⌖</span>24 AGENTS
          </span>
          <span style={{ flex: 1, fontFamily: J_FONTS.mono, fontSize: 18, color: J_COLORS.text3 }}>
            paste a flight, hotel or product URL
          </span>
          <button style={{
            padding: '14px 28px',
            background: J_COLORS.cobalt, color: '#fff',
            border: 'none', borderRadius: 8,
            fontFamily: J_FONTS.mono, fontWeight: 600, fontSize: 14,
            letterSpacing: '0.06em',
          }}>Inspect →</button>
        </div>

        <div style={{
          marginTop: 30,
          display: 'flex', gap: 28,
          fontFamily: J_FONTS.mono, fontSize: 11,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: J_COLORS.text3,
        }}>
          <span><span style={{ color: J_COLORS.cobalt }}>●</span> 24 SYNTHETIC IDENTITIES</span>
          <span><span style={{ color: J_COLORS.cobaltBr }}>●</span> 4 DISCRIMINATION VECTORS</span>
          <span><span style={{ color: J_COLORS.good }}>●</span> EVIDENCE-GRADE OUTPUT</span>
        </div>
      </div>

      {/* GLOBE on right — same vector quality as on the live site */}
      <div style={{ position: 'absolute', right: 90, top: 220 }}>
        <GlobeViz cx={300} cy={300} r={250} dots={14} />
      </div>
    </div>
  );
}

// ── Beat 17 (142–158s) — Pricing page (recreated) ───────────────────────
function S_B17() {
  const { localTime } = useSprite();
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <JacNav active="Pricing" />

      <div style={{ position: 'absolute', top: 130, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Pricing
        </div>
        <div style={{
          marginTop: 18,
          fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 96, color: J_COLORS.text,
          letterSpacing: '-0.035em',
        }}>
          Run the truth, <span style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', color: J_COLORS.cobaltBr, fontWeight: 400 }}>free</span>.
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 400, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 26,
      }}>
        {[
          { name: 'FREE',       price: '$0',  per: '/ forever',  cta: 'Start probing', tag: 'For the curious shopper.',                       probes: '24 probes / month',  ext: 'Shareable result links · Verdict' },
          { name: 'PRO',        price: '$29', per: '/ month',    cta: 'Go Pro',         tag: 'For the analyst who needs the paper trail.',     probes: '50 probes / month',  ext: 'Forensic PDF · CSV · JSON',         highlight: true },
          { name: 'ENTERPRISE', price: 'Talk',per: '/ custom',   cta: 'Contact',        tag: 'For teams investigating at scale.',              probes: 'Custom volume',      ext: 'API · SSO · team workspaces',       gold: true },
        ].map((p, i) => (
          <div key={i} style={{
            width: 400, padding: '44px 36px',
            background: J_COLORS.surface,
            border: `1px solid ${p.highlight ? J_COLORS.cobaltLine : J_COLORS.line}`,
            borderRadius: 16,
            position: 'relative',
            boxShadow: p.highlight ? '0 0 60px -20px rgba(61,107,255,0.5)' : 'none',
          }}>
            {p.highlight && (
              <div style={{
                position: 'absolute', top: -12, right: 24,
                padding: '6px 14px',
                background: J_COLORS.cobalt, color: '#fff',
                borderRadius: 100,
                fontFamily: J_FONTS.mono, fontSize: 11, letterSpacing: '0.2em',
              }}>MOST POPULAR</div>
            )}
            <div style={{
              fontFamily: J_FONTS.mono, fontSize: 14,
              color: p.highlight ? J_COLORS.cobaltBr : (p.gold ? J_COLORS.gold : J_COLORS.text2),
              letterSpacing: '0.22em',
            }}>{p.name}</div>
            <div style={{ marginTop: 18 }}>
              <span style={{
                fontFamily: J_FONTS.serif, fontSize: 84,
                color: J_COLORS.text, letterSpacing: '-0.03em',
              }}>{p.price}</span>
              <span style={{
                fontFamily: J_FONTS.mono, fontSize: 14,
                color: J_COLORS.text3, marginLeft: 8,
              }}>{p.per}</span>
            </div>
            <p style={{
              marginTop: 12,
              fontFamily: J_FONTS.serif, fontSize: 18,
              color: J_COLORS.text2,
            }}>{p.tag}</p>
            <button style={{
              display: 'block', marginTop: 28,
              width: '100%', padding: '16px',
              background: p.highlight ? J_COLORS.cobalt : 'transparent',
              color: p.highlight ? '#fff' : J_COLORS.text,
              border: p.highlight ? 'none' : `1px solid ${J_COLORS.line2}`,
              borderRadius: 8,
              fontFamily: J_FONTS.mono, fontWeight: 600, fontSize: 14,
              letterSpacing: '0.04em',
            }}>{p.cta}</button>
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${J_COLORS.line}`, display: 'flex', alignItems: 'center', gap: 12, fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text }}>
              <span style={{ color: J_COLORS.cobalt }}>✓</span> {p.probes}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text2 }}>
              <span style={{ color: J_COLORS.cobalt }}>✓</span> Full 24-agent deployment
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text2 }}>
              <span style={{ color: J_COLORS.cobalt }}>✓</span> {p.ext}
            </div>
          </div>
        ))}
      </div>

      {localTime > 4 && (
        <div style={{
          position: 'absolute', top: 970, left: '50%',
          transform: 'translateX(-50%)',
          padding: '14px 26px',
          background: 'rgba(8,10,16,0.92)',
          border: `1px solid ${J_COLORS.cobaltLine}`,
          borderRadius: 8,
          fontFamily: J_FONTS.mono, fontSize: 15,
          color: J_COLORS.cobaltBr, letterSpacing: '0.22em', textTransform: 'uppercase',
          opacity: Math.min(1, (localTime - 4) / 0.6),
        }}>
          Each probe runs the full 24-identity engine
        </div>
      )}
    </div>
  );
}

// ── Beat 18 (158–162s) — Google sign-in ─────────────────────────────────
function S_B18() {
  const { localTime } = useSprite();
  return (
    <div style={{ position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(ellipse at center, rgba(61,107,255,0.04), transparent 60%), ${J_COLORS.ink}`,
    }}>
      <div style={{
        width: 520, padding: '48px 56px',
        background: J_COLORS.surface,
        border: `1px solid ${J_COLORS.line2}`,
        borderRadius: 16,
        boxShadow: '0 40px 100px -20px rgba(0,0,0,0.7)',
      }}>
        <div style={{
          fontFamily: J_FONTS.mono, fontSize: 12, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: J_COLORS.text3,
        }}><span style={{ color: J_COLORS.cobalt }}>●</span> Sign in</div>
        <div style={{ marginTop: 18, fontFamily: J_FONTS.serif, fontSize: 40, color: J_COLORS.text }}>Welcome back.</div>
        <button style={{
          marginTop: 32, width: '100%', padding: '18px',
          background: '#fff', color: '#1f1f1f',
          border: 'none', borderRadius: 8,
          fontFamily: J_FONTS.sans, fontWeight: 600, fontSize: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
          transform: localTime > 1.5 && localTime < 2.0 ? 'scale(0.96)' : 'scale(1)',
          transition: 'transform .2s',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        <div style={{ marginTop: 22, fontFamily: J_FONTS.mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: J_COLORS.text4, textAlign: 'center' }}>
          SUPABASE · OAUTH · ENCRYPTED SESSION
        </div>
      </div>

      {localTime > 2.5 && (
        <div style={{
          position: 'absolute', top: 100, right: 100,
          display: 'flex', alignItems: 'center', gap: 14,
          opacity: Math.min(1, (localTime - 2.5) / 0.5),
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            background: 'linear-gradient(135deg, #6e92ff, #3d6bff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: J_FONTS.sans, fontWeight: 600, fontSize: 16, color: '#fff',
          }}>H</div>
          <span style={{ fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text2, letterSpacing: '0.1em' }}>hussain@</span>
        </div>
      )}
    </div>
  );
}

// ── Beat 19 (162–175s) — Probe cockpit ──────────────────────────────────
function S_B19() {
  const { localTime } = useSprite();
  const url = 'booking.com/hotel/ny-grand-luxe';
  const charsVisible = localTime < 2.5 ? 0
    : localTime > 5.0 ? url.length
    : Math.round(((localTime - 2.5) / 2.5) * url.length);
  const visibleUrl = url.slice(0, charsVisible);
  const publicOn = localTime > 7.5;
  const launching = localTime > 9.5 && localTime < 10.5;

  const cursorKeyframes = [
    { t: 0,   x: 1000, y: 200 },
    { t: 1.5, x: 800,  y: 540 },
    { t: 2.4, x: 800,  y: 540 },
    { t: 6.5, x: 620,  y: 660 },
    { t: 7.5, x: 620,  y: 660 },
    { t: 9.0, x: 1240, y: 540 },
    { t: 9.5, x: 1240, y: 540 },
    { t: 12.0, x: 1240, y: 540 },
  ];
  const clicks = [2.4, 7.5, 9.5];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <JacNav active="Probe" />

      <div style={{ position: 'absolute', top: 200, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Jacobi · probe cockpit
        </div>
        <div style={{
          marginTop: 24, fontFamily: J_FONTS.serif,
          fontSize: 96, color: J_COLORS.text,
          letterSpacing: '-0.02em', lineHeight: 1.05,
        }}>
          Paste a URL.<br/>
          <span style={{ fontStyle: 'italic', color: J_COLORS.cobaltBr }}>Twenty-four shoppers</span> go to work.
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 520, left: '50%',
        transform: 'translateX(-50%)',
        width: 1080, padding: '22px 28px',
        background: J_COLORS.surface,
        border: `1px solid ${charsVisible > 0 ? J_COLORS.cobaltLine : J_COLORS.line2}`,
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 20,
        boxShadow: charsVisible > 0 ? '0 0 60px -10px rgba(61,107,255,0.5)' : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        <span style={{ fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text3, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          <span style={{ color: J_COLORS.cobalt, marginRight: 10 }}>⌖</span>24 AGENTS
        </span>
        <span style={{ flex: 1, fontFamily: J_FONTS.mono, fontSize: 20, color: charsVisible > 0 ? J_COLORS.text : J_COLORS.text3 }}>
          {charsVisible > 0 ? visibleUrl : 'paste a flight, hotel or product URL'}
          {charsVisible > 0 && charsVisible < url.length && (
            <span style={{ display: 'inline-block', width: 2, height: 22, background: J_COLORS.cobalt, marginLeft: 4, verticalAlign: 'middle', opacity: Math.floor(localTime * 2) % 2 === 0 ? 1 : 0 }}/>
          )}
        </span>
        <button style={{
          padding: '14px 32px',
          background: launching ? J_COLORS.cobaltBr : J_COLORS.cobalt,
          color: '#fff', border: 'none', borderRadius: 8,
          fontFamily: J_FONTS.mono, fontWeight: 600, fontSize: 15, letterSpacing: '0.06em',
          transform: launching ? 'scale(0.96)' : 'scale(1)',
        }}>Probe →</button>
      </div>

      <div style={{
        position: 'absolute', top: 620, left: '50%',
        transform: 'translateX(-50%)',
        width: 1080,
        display: 'flex', alignItems: 'center', gap: 18,
        paddingLeft: 28,
      }}>
        <div style={{
          width: 40, height: 22, borderRadius: 11,
          background: publicOn ? J_COLORS.cobalt : J_COLORS.line2,
          position: 'relative',
          transition: 'background 0.3s',
        }}>
          <div style={{
            position: 'absolute', top: 2,
            left: publicOn ? 20 : 2,
            width: 18, height: 18, borderRadius: 9,
            background: '#fff',
            transition: 'left 0.3s',
          }}/>
        </div>
        <span style={{ fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text2, letterSpacing: '0.04em' }}>
          Include on public board
        </span>
      </div>

      <AnimatedCursor keyframes={cursorKeyframes} click={clicks} />
    </div>
  );
}

// ── Beat 20 (175–188s) — Live deployment ────────────────────────────────
function S_B20() {
  const { localTime } = useSprite();
  const cx = 700, cy = 540;
  const dots = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 8; i++) arr.push({ a: (i/8) * Math.PI*2 - Math.PI/2, r: 160, wave: 1, delay: 0.6 + i*0.18 });
    for (let i = 0; i < 11; i++) arr.push({ a: (i/11) * Math.PI*2 + Math.PI/8, r: 280, wave: 2, delay: 2.0 + i*0.18 });
    for (let i = 0; i < 5; i++) arr.push({ a: (i/5) * Math.PI*2, r: 400, wave: 3, delay: 4.0 + i*0.24 });
    return arr;
  }, []);
  const counter = dots.filter(d => localTime > d.delay + 0.5).length;
  const elapsed = Math.min(11.2, localTime).toFixed(1);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <JacNav active="Probe" />

      <div style={{ position: 'absolute', top: 130, left: 80, display: 'flex', justifyContent: 'space-between', right: 80 }}>
        <div>
          <button style={{
            background: 'none', border: 'none',
            fontFamily: J_FONTS.mono, fontSize: 13, color: J_COLORS.text3, letterSpacing: '0.1em',
          }}>← new probe</button>
          <div style={{ marginTop: 8, fontFamily: J_FONTS.mono, fontSize: 18, color: J_COLORS.text2 }}>
            <span style={{ color: J_COLORS.cobalt, marginRight: 10 }}>⌖</span>
            booking.com/hotel/ny-grand-luxe
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '8px 18px',
          border: `1px solid ${J_COLORS.line2}`,
          borderRadius: 100,
          fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: J_COLORS.text2,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: J_COLORS.cobalt, boxShadow: `0 0 8px ${J_COLORS.cobalt}` }}/>
          {counter >= 24 ? 'complete' : 'deploying'}
        </div>
      </div>

      <svg width="1200" height="900" style={{ position: 'absolute', left: 60, top: 220 }}>
        <circle cx={cx - 60} cy={cy - 220} r="14" fill={J_COLORS.cobalt}/>
        <circle cx={cx - 60} cy={cy - 220} r="9" fill={J_COLORS.cobaltBr}/>
        {[160, 280, 400].map((r, i) => (
          <circle key={i} cx={cx - 60} cy={cy - 220} r={r} fill="none" stroke={J_COLORS.line2} strokeWidth="0.8" strokeDasharray="2 5"/>
        ))}
        {[0, 0.7, 1.4].map((offset, i) => {
          const cyclePos = ((localTime + offset) % 2.1) / 2.1;
          const r = 60 + cyclePos * 400;
          const op = (1 - cyclePos) * 0.35;
          return <circle key={'p'+i} cx={cx - 60} cy={cy - 220} r={r} fill="none" stroke={J_COLORS.cobalt} strokeWidth="1" opacity={op}/>;
        })}
        {dots.map((d, i) => {
          if (localTime < d.delay) return null;
          const travel = Math.min(1, Easing.easeOutCubic((localTime - d.delay) / 0.5));
          const dx = (cx - 60) + Math.cos(d.a) * d.r * travel;
          const dy = (cy - 220) + Math.sin(d.a) * d.r * travel;
          const color = d.wave === 1 ? J_COLORS.cobalt : d.wave === 2 ? J_COLORS.cobaltBr : J_COLORS.good;
          return (
            <g key={i}>
              <circle cx={dx} cy={dy} r={travel >= 1 ? 7 : 5} fill={color}
                style={{ filter: `drop-shadow(0 0 10px ${color})` }}/>
              {travel < 1 && (
                <line x1={(cx-60)} y1={(cy-220)} x2={dx} y2={dy}
                  stroke={color} strokeWidth="0.8" opacity="0.3"/>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{
        position: 'absolute', top: 240, right: 100, width: 480,
        padding: 40,
        background: J_COLORS.surface,
        border: `1px solid ${J_COLORS.line}`,
        borderRadius: 14,
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>Live deployment</div>
        <div style={{
          marginTop: 18, fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 144, color: J_COLORS.text, lineHeight: 0.9,
          letterSpacing: '-0.04em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {String(counter).padStart(2,'0')}
          <span style={{ fontSize: 36, color: J_COLORS.text3, marginLeft: 14 }}>/24</span>
        </div>
        <div style={{ marginTop: 16, fontFamily: J_FONTS.mono, fontSize: 15, color: J_COLORS.text3 }}>{elapsed}s elapsed</div>
        <div style={{ marginTop: 32, fontFamily: J_FONTS.mono, fontSize: 14, letterSpacing: '0.14em' }}>
          <div style={{ color: counter >= 1 ? J_COLORS.cobalt : J_COLORS.text4 }}>● wave 1 · datacenter</div>
          <div style={{ marginTop: 10, color: counter >= 9 ? J_COLORS.cobaltBr : J_COLORS.text4 }}>● wave 2 · residential</div>
          <div style={{ marginTop: 10, color: counter >= 20 ? J_COLORS.good : J_COLORS.text4 }}>● wave 3 · mobile</div>
        </div>
      </div>
    </div>
  );
}

// ── Beat 21 (188–204s) — Verdict KPIs ───────────────────────────────────
function S_B21() {
  const { localTime } = useSprite();
  const spreadVal = localTime < 1 ? 0 : Math.min(144, Math.round(((localTime - 1) / 1.5) * 144));
  const indexVal = localTime < 4 ? 0 : Math.min(71, Math.round(((localTime - 4) / 1.5) * 71));
  const topoVisible = localTime > 8;

  return (
    <div style={{ position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(61,107,255,0.06), transparent 70%), ${J_COLORS.ink}` }}>
      <JacNav active="Probe" />

      <div style={{ position: 'absolute', top: 130, left: 80, right: 80 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Verdict · UA182 · JFK → LHR
        </div>
        <div style={{ marginTop: 20, height: 1, background: J_COLORS.line }}/>
      </div>

      <div style={{
        position: 'absolute', top: 270, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 80,
        padding: '0 80px',
      }}>
        <div style={{ minWidth: 420 }}>
          <div style={{ fontFamily: J_FONTS.mono, fontSize: 14, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>Hidden premium</div>
          <div style={{
            marginTop: 18, fontFamily: J_FONTS.serif, fontSize: 280,
            color: J_COLORS.cobaltBr, letterSpacing: '-0.04em', lineHeight: 0.9,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 60px rgba(61,107,255,0.3)',
          }}>+${spreadVal}</div>
          <div style={{ marginTop: 8, fontFamily: J_FONTS.mono, fontSize: 16, color: J_COLORS.text3 }}>
            29% over baseline · 24/24 returned
          </div>
        </div>

        {localTime > 3.6 && (
          <div style={{ minWidth: 320, opacity: Math.min(1, (localTime - 3.6) / 0.6) }}>
            <div style={{ fontFamily: J_FONTS.mono, fontSize: 14, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>Discrimination index</div>
            <div style={{
              marginTop: 18, fontFamily: J_FONTS.sans, fontWeight: 600, fontSize: 280,
              color: J_COLORS.text, letterSpacing: '-0.04em', lineHeight: 0.9,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {indexVal}<span style={{ fontSize: 96, color: J_COLORS.text3 }}>/100</span>
            </div>
            <div style={{ marginTop: 14, height: 6, width: 360, background: J_COLORS.line2, borderRadius: 3 }}>
              <div style={{
                height: 6, width: (indexVal / 100) * 360,
                background: J_COLORS.cobalt, borderRadius: 3,
                boxShadow: `0 0 10px ${J_COLORS.cobalt}`,
              }}/>
            </div>
          </div>
        )}

        {topoVisible && (
          <div style={{ minWidth: 320, opacity: Math.min(1, (localTime - 8) / 0.6) }}>
            <div style={{ fontFamily: J_FONTS.mono, fontSize: 14, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>Topology</div>
            <div style={{ marginTop: 18, fontFamily: J_FONTS.serif, fontStyle: 'italic', fontSize: 156, color: J_COLORS.text, letterSpacing: '-0.02em', lineHeight: 1 }}>Progressive</div>
            <div style={{ marginTop: 14, fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text3 }}>
              prices climb with willingness-to-pay signals
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Beat 22 (204–216s) — Evidence rows ──────────────────────────────────
function S_B22() {
  const { localTime } = useSprite();
  const rows = [
    { id: 'a24', tag: 'iPhone · Manhattan · direct',       price: 640, color: J_COLORS.over },
    { id: 'a19', tag: 'iPhone · Berlin · Skyscanner',      price: 558, color: J_COLORS.text },
    { id: 'a13', tag: 'Android · LA · direct',             price: 512, color: J_COLORS.text },
    { id: 'a07', tag: 'Android · Iowa · Kayak',            price: 454, color: J_COLORS.good },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, background: J_COLORS.ink }}>
      <JacNav active="Probe" />

      <div style={{ position: 'absolute', top: 130, left: 80 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Evidence rows
        </div>
        <div style={{
          marginTop: 14, fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 84, color: J_COLORS.text,
          letterSpacing: '-0.035em',
        }}>
          Same flight. <span style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', color: J_COLORS.cobaltBr, fontWeight: 400 }}>Four prices.</span>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 380, left: 80, right: 80 }}>
        {rows.map((r, i) => {
          const delay = i * 0.4;
          if (localTime < delay) return null;
          const op = Math.min(1, (localTime - delay) / 0.4);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              padding: '28px 36px',
              marginTop: i === 0 ? 0 : 14,
              background: J_COLORS.surface,
              border: `1px solid ${i === 0 ? J_COLORS.over + '40' : J_COLORS.line}`,
              borderRadius: 10,
              opacity: op,
              transform: `translateY(${(1 - op) * 16}px)`,
              boxShadow: i === 0 ? `0 0 40px -10px ${J_COLORS.over}40` : 'none',
            }}>
              <div style={{ width: 100, fontFamily: J_FONTS.mono, fontSize: 16, color: J_COLORS.text3, letterSpacing: '0.1em' }}>{r.id}</div>
              <div style={{ flex: 1, fontFamily: J_FONTS.mono, fontSize: 22, color: J_COLORS.text2 }}>{r.tag}</div>
              <div style={{ fontFamily: J_FONTS.serif, fontSize: 56, color: r.color, letterSpacing: '-0.02em' }}>${r.price}</div>
            </div>
          );
        })}

        {localTime > 2.2 && (
          <div style={{
            marginTop: 28,
            padding: '24px 36px',
            background: 'rgba(255,84,104,0.06)',
            border: `1px solid ${J_COLORS.over}50`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            opacity: Math.min(1, (localTime - 2.2) / 0.6),
          }}>
            <div>
              <div style={{ fontFamily: J_FONTS.mono, fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: J_COLORS.over }}>DRIVER</div>
              <div style={{ marginTop: 8, fontFamily: J_FONTS.serif, fontStyle: 'italic', fontSize: 42, color: J_COLORS.text }}>location</div>
            </div>
            <div style={{ fontFamily: J_FONTS.serif, fontSize: 64, color: J_COLORS.over, letterSpacing: '-0.02em' }}>−$186 max delta</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Beat 23 (216–222s) — History ────────────────────────────────────────
function S_B23() {
  const { localTime } = useSprite();
  const rows = [
    { target: 'UA182 · JFK → LHR',          agents: '24/24', spread: '+$144', topo: 'progressive', ago: '2d ago' },
    { target: 'booking.com · Lisbon hotel',  agents: '23/24', spread: '+$28',  topo: 'regressive',  ago: '3d ago' },
    { target: 'amazon · Sony WH-1000XM5',    agents: '24/24', spread: '+$11',  topo: 'flat',        ago: '5d ago' },
    { target: 'delta.com · ATL → SEA',       agents: '24/24', spread: '+$76',  topo: 'progressive', ago: '7d ago' },
    { target: 'hertz.com · SFO weekend',     agents: '22/24', spread: '+$92',  topo: 'aggressive',  ago: '9d ago' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, background: J_COLORS.ink }}>
      <JacNav active="History" />

      <div style={{ position: 'absolute', top: 130, left: 80 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Your history · 12 probes
        </div>
        <div style={{
          marginTop: 14, fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 84, color: J_COLORS.text, letterSpacing: '-0.035em',
        }}>The <span style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', color: J_COLORS.cobaltBr, fontWeight: 400 }}>paper trail.</span></div>
      </div>

      <div style={{ position: 'absolute', top: 380, left: 80, right: 80 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 130px 130px 180px 120px',
          padding: '14px 24px',
          borderBottom: `1px solid ${J_COLORS.line}`,
          fontFamily: J_FONTS.mono, fontSize: 11,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: J_COLORS.text4,
        }}>
          <div>#</div><div>TARGET</div><div>AGENTS</div><div>SPREAD</div><div>TOPOLOGY</div><div>WHEN</div>
        </div>
        {rows.map((r, i) => {
          const delay = i * 0.18;
          if (localTime < delay) return null;
          const op = Math.min(1, (localTime - delay) / 0.4);
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 130px 130px 180px 120px',
              padding: '20px 24px',
              borderBottom: `1px solid ${J_COLORS.line}`,
              alignItems: 'center',
              opacity: op,
              fontFamily: J_FONTS.mono, fontSize: 16,
            }}>
              <div style={{ color: J_COLORS.text3 }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ color: J_COLORS.text, fontSize: 18 }}>{r.target}</div>
              <div style={{ color: J_COLORS.text2 }}>{r.agents}</div>
              <div style={{ color: J_COLORS.cobaltBr, fontSize: 19 }}>{r.spread}</div>
              <div style={{ color: J_COLORS.text2, fontFamily: J_FONTS.serif, fontStyle: 'italic', fontSize: 22 }}>{r.topo}</div>
              <div style={{ color: J_COLORS.text3, fontSize: 14 }}>{r.ago}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Beat 24 (222–234s) — Board ──────────────────────────────────────────
function S_B24() {
  const { localTime } = useSprite();
  const rows = [
    { rank: 1, target: 'booking.com / cancun-luxe',     spread: '+$321', topo: 'aggressive',   index: 92 },
    { rank: 2, target: 'ua182 · JFK → LHR',             spread: '+$186', topo: 'progressive',  index: 71 },
    { rank: 3, target: 'hertz.com · SFO weekend',       spread: '+$144', topo: 'progressive',  index: 64 },
    { rank: 4, target: 'iberia.com · MAD → BOS',        spread: '+$98',  topo: 'regressive',   index: 52 },
    { rank: 5, target: 'airbnb.com / lisbon-january',   spread: '+$76',  topo: 'progressive',  index: 48 },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, background: J_COLORS.ink }}>
      <JacNav active="Board" />

      <div style={{ position: 'absolute', top: 130, left: 80 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Global board
        </div>
        <div style={{
          marginTop: 14, fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 84, color: J_COLORS.text, letterSpacing: '-0.035em',
        }}>The <span style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', color: J_COLORS.cobaltBr, fontWeight: 400 }}>leaderboard.</span></div>
        <div style={{ marginTop: 14, fontFamily: J_FONTS.serif, fontSize: 20, color: J_COLORS.text2, maxWidth: 900 }}>
          Public probes — opted in by the user, or curated. Anyone can read the evidence.
        </div>
      </div>

      <div style={{ position: 'absolute', top: 470, left: 80, right: 80 }}>
        {rows.map((r, i) => {
          const delay = i * 0.18;
          if (localTime < delay) return null;
          const op = Math.min(1, (localTime - delay) / 0.4);
          const isTop = r.rank === 1;
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 160px 220px 100px',
              padding: '22px 28px',
              marginTop: i === 0 ? 0 : 10,
              background: J_COLORS.surface,
              border: `1px solid ${isTop ? J_COLORS.over + '60' : J_COLORS.line}`,
              borderRadius: 10,
              alignItems: 'center',
              opacity: op,
              boxShadow: isTop ? `0 0 40px -10px ${J_COLORS.over}30` : 'none',
            }}>
              <div style={{ fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text3, letterSpacing: '0.1em' }}>#{String(r.rank).padStart(2, '0')}</div>
              <div style={{ fontFamily: J_FONTS.mono, fontSize: 20, color: J_COLORS.text }}>{r.target}</div>
              <div style={{ fontFamily: J_FONTS.serif, fontSize: 40, color: isTop ? J_COLORS.over : J_COLORS.cobaltBr, letterSpacing: '-0.02em' }}>{r.spread}</div>
              <div style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', fontSize: 28, color: isTop ? J_COLORS.over : J_COLORS.text }}>{r.topo}</div>
              <div style={{ fontFamily: J_FONTS.sans, fontWeight: 600, fontSize: 32, color: J_COLORS.text, letterSpacing: '-0.02em' }}>{r.index}<span style={{ fontSize: 14, color: J_COLORS.text3 }}>/100</span></div>
            </div>
          );
        })}
        <div style={{
          marginTop: 28,
          fontFamily: J_FONTS.mono, fontSize: 12,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: J_COLORS.text4,
          textAlign: 'center',
        }}>opted in or curated · never private user scans</div>
      </div>
    </div>
  );
}

// ── Beat 25 (234–248s) — Share ──────────────────────────────────────────
function S_B25() {
  const { localTime } = useSprite();
  const copied = localTime > 4 && localTime < 6;
  return (
    <div style={{ position: 'absolute', inset: 0, background: J_COLORS.ink }}>
      <JacNav active="Probe" />

      <div style={{ position: 'absolute', top: 130, left: 80, right: 80 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Share · evidence link
        </div>
        <div style={{
          marginTop: 14, fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 84, color: J_COLORS.text, letterSpacing: '-0.035em',
        }}>Send the <span style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', color: J_COLORS.cobaltBr, fontWeight: 400 }}>file.</span></div>
      </div>

      <div style={{ position: 'absolute', top: 380, left: 80, right: 80, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          flex: 1,
          padding: '22px 28px',
          background: J_COLORS.surface,
          border: `1px solid ${J_COLORS.line2}`,
          borderRadius: 10,
          fontFamily: J_FONTS.mono, fontSize: 22, color: J_COLORS.text2,
        }}>jacobi-v2.vercel.app/p/2k9-ua182-jfk-lhr</div>
        <button style={{
          padding: '22px 36px',
          background: copied ? J_COLORS.good : J_COLORS.cobalt,
          color: '#fff', border: 'none', borderRadius: 10,
          fontFamily: J_FONTS.mono, fontWeight: 600, fontSize: 16,
          letterSpacing: '0.06em',
          transform: copied ? 'scale(0.96)' : 'scale(1)',
          transition: 'all .25s',
        }}>{copied ? '✓ Copied' : 'Copy link'}</button>
      </div>

      <div style={{ position: 'absolute', top: 520, left: 80, right: 80, display: 'flex', gap: 22 }}>
        {[
          { who: 'JOURNALIST', quote: '"…send it to the desk."', sub: 'A reproducible evidence file' },
          { who: 'PROCUREMENT', quote: '"…flag the vendor."',     sub: 'Attach to the quarterly review' },
          { who: 'REGULATOR',   quote: '"…open the file."',       sub: 'A complaint with structure' },
        ].map((c, i) => {
          const delay = i * 0.3 + 1.5;
          if (localTime < delay) return null;
          const op = Math.min(1, (localTime - delay) / 0.5);
          return (
            <div key={i} style={{
              flex: 1, padding: '44px 36px',
              background: J_COLORS.surface,
              border: `1px solid ${J_COLORS.line}`,
              borderRadius: 14,
              opacity: op, transform: `translateY(${(1 - op) * 20}px)`,
            }}>
              <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, color: J_COLORS.cobaltBr, letterSpacing: '0.32em' }}>{c.who}</div>
              <div style={{ marginTop: 32, fontFamily: J_FONTS.serif, fontStyle: 'italic', fontSize: 44, color: J_COLORS.text, letterSpacing: '-0.01em' }}>{c.quote}</div>
              <div style={{ marginTop: 26, fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text3 }}>{c.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Beat 26 (248–265s) — Forensic export ────────────────────────────────
function S_B26() {
  const { localTime } = useSprite();
  const downloaded = localTime > 5;
  return (
    <div style={{ position: 'absolute', inset: 0, background: J_COLORS.ink }}>
      <JacNav active="Probe" />

      <div style={{ position: 'absolute', top: 130, left: 80, right: 80 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 13, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>
          <span style={{ color: J_COLORS.cobalt }}>●</span> Forensic record · PRO
        </div>
        <div style={{
          marginTop: 14, fontFamily: J_FONTS.sans, fontWeight: 600,
          fontSize: 72, color: J_COLORS.text, letterSpacing: '-0.035em',
        }}>Legal-grade <span style={{ fontFamily: J_FONTS.serif, fontStyle: 'italic', color: J_COLORS.cobaltBr, fontWeight: 400 }}>export.</span></div>
      </div>

      <div style={{
        position: 'absolute', top: 320, left: 80, width: 1100, height: 660,
        background: '#fff', borderRadius: 8, overflow: 'hidden',
        boxShadow: '0 60px 140px -30px rgba(0,0,0,0.7)',
        padding: 50,
        fontFamily: 'Georgia, serif', color: '#111',
      }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 11, letterSpacing: '0.32em', color: '#666' }}>JACOBI · FORENSIC RECORD · #2k9-UA182</div>
        <div style={{ marginTop: 8, height: 1, background: '#ddd' }}/>
        <div style={{ marginTop: 24, fontSize: 42, fontWeight: 700 }}>UA182 · JFK → London Heathrow</div>
        <div style={{ marginTop: 8, fontSize: 16, color: '#666', fontFamily: J_FONTS.mono }}>probed · 24/24 agents · 2026-05-30 14:22 UTC</div>
        <div style={{ marginTop: 36, display: 'flex', gap: 60 }}>
          <div><div style={{ fontSize: 12, letterSpacing: '0.22em', color: '#888', textTransform: 'uppercase', fontFamily: J_FONTS.mono }}>Spread</div><div style={{ fontSize: 56, marginTop: 6 }}>+$144</div></div>
          <div><div style={{ fontSize: 12, letterSpacing: '0.22em', color: '#888', textTransform: 'uppercase', fontFamily: J_FONTS.mono }}>Index</div><div style={{ fontSize: 56, marginTop: 6 }}>71<span style={{ fontSize: 22, color: '#888' }}>/100</span></div></div>
          <div><div style={{ fontSize: 12, letterSpacing: '0.22em', color: '#888', textTransform: 'uppercase', fontFamily: J_FONTS.mono }}>Topology</div><div style={{ fontSize: 50, marginTop: 6, fontStyle: 'italic' }}>Progressive</div></div>
        </div>
        <div style={{ marginTop: 30, fontSize: 14, fontFamily: J_FONTS.mono, color: '#555' }}>
          <div style={{ marginBottom: 6 }}>┌ identity · location · device · referrer · price ─────────────────────────────┐</div>
          <div>│ a01 · Manhattan, US · iPhone 15 Pro · direct ······························ $640 │</div>
          <div>│ a02 · Berlin, DE · iPhone 15 Pro · skyscanner ···························· $558 │</div>
          <div>│ a03 · Los Angeles, US · Pixel 8 · direct ································· $512 │</div>
          <div>│ a04 · rural IA, US · Pixel 8 · kayak ····································· $454 │</div>
          <div>│ … 20 more identities ····················································· │</div>
          <div>└──────────────────────────────────────────────────────────────────────────────┘</div>
          <div style={{ marginTop: 14 }}>Driver attribution: <b>location</b> · max delta -$186 · evidence: 24 signatures</div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 320, right: 80, width: 480 }}>
        {['PDF', 'CSV', 'JSON'].map((fmt, i) => {
          const isPdf = fmt === 'PDF';
          const isDownloaded = isPdf && downloaded;
          return (
            <div key={i} style={{
              marginTop: i === 0 ? 0 : 18,
              padding: '28px 32px',
              background: isPdf ? J_COLORS.cobalt : J_COLORS.surface,
              border: `1px solid ${isPdf ? J_COLORS.cobalt : J_COLORS.line2}`,
              borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transform: isPdf && localTime > 4 && localTime < 4.4 ? 'scale(0.97)' : 'scale(1)',
              transition: 'transform .15s',
            }}>
              <div>
                <div style={{ fontFamily: J_FONTS.mono, fontSize: 22, fontWeight: 600, color: isPdf ? '#fff' : J_COLORS.text, letterSpacing: '0.12em' }}>{fmt}</div>
                <div style={{ marginTop: 6, fontFamily: J_FONTS.mono, fontSize: 13, color: isPdf ? 'rgba(255,255,255,0.7)' : J_COLORS.text3, letterSpacing: '0.06em' }}>
                  {fmt === 'PDF' ? 'paper trail · legal-grade' : fmt === 'CSV' ? 'raw rows · spreadsheet' : 'machine-readable'}
                </div>
              </div>
              <div style={{ fontFamily: J_FONTS.mono, fontSize: 14, color: isPdf ? '#fff' : J_COLORS.text2 }}>
                {isDownloaded ? '✓ saved' : '↓'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.S_B16 = S_B16;
window.S_B17 = S_B17;
window.S_B18 = S_B18;
window.S_B19 = S_B19;
window.S_B20 = S_B20;
window.S_B21 = S_B21;
window.S_B22 = S_B22;
window.S_B23 = S_B23;
window.S_B24 = S_B24;
window.S_B25 = S_B25;
window.S_B26 = S_B26;
