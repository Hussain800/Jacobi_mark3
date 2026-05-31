// film/scenes-close.jsx
// Acts V (265–290s) and VI (290–300s)

// ── Beat 27 (265–273s) — Buyer grid ─────────────────────────────────────
function S_B27() {
  const { localTime } = useSprite();
  const buyers = [
    { name: 'TRAVEL',              line: 'flights · hotels · OTAs' },
    { name: 'ECOMMERCE',           line: 'marketplaces · DTC' },
    { name: 'JOURNALISM',          line: 'evidence files' },
    { name: 'CONSUMER PROTECTION', line: 'class-action · NGO' },
    { name: 'PROCUREMENT',         line: 'vendor audits' },
    { name: 'MARKET INTELLIGENCE', line: 'topology mapping' },
    { name: 'COMPLIANCE',          line: 'parity attestation' },
    { name: 'COMPETITIVE INTEL',   line: 'pricing surfaces' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 80 }}>
      <div style={{ textAlign: 'center', marginTop: 60 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 14, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>● Who pays for evidence</div>
      </div>

      <div style={{
        marginTop: 70,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 24,
        maxWidth: 1700,
        margin: '70px auto 0',
      }}>
        {buyers.map((b, i) => {
          const delay = i * 0.12;
          if (localTime < delay) return null;
          const op = Math.min(1, (localTime - delay) / 0.4);
          return (
            <div key={i} style={{
              padding: '36px 32px', height: 220,
              background: J_COLORS.surface,
              border: `1px solid ${J_COLORS.line2}`,
              borderRadius: 12,
              opacity: op,
              transform: `translateY(${(1 - op) * 14}px)`,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div style={{
                fontFamily: J_FONTS.mono, fontSize: 16, fontWeight: 600,
                color: J_COLORS.cobaltBr, letterSpacing: '0.22em',
              }}>{b.name}</div>
              <div style={{
                fontFamily: J_FONTS.serif, fontStyle: 'italic',
                fontSize: 32, color: J_COLORS.text2,
                letterSpacing: '-0.01em',
              }}>{b.line}</div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 60, textAlign: 'center',
        fontFamily: J_FONTS.serif, fontStyle: 'italic',
        fontSize: 56, color: J_COLORS.text,
        opacity: localTime > 1.5 ? Math.min(1, (localTime - 1.5) / 0.6) : 0,
      }}>
        Eight buyers. <span style={{ color: J_COLORS.cobaltBr }}>One engine.</span>
      </div>
    </div>
  );
}

// ── Beat 28 (273–283s) — Tiers + roadmap ────────────────────────────────
function S_B28() {
  const { localTime } = useSprite();
  const tiers = [
    { name: 'FREE',       price: '$0',  per: '/forever', spec: '24 probes / mo',  color: J_COLORS.text2 },
    { name: 'PRO',        price: '$29', per: '/month',   spec: '50 probes / mo · forensic export', color: J_COLORS.cobaltBr, highlight: true },
    { name: 'ENTERPRISE', price: 'Talk',per: '/custom',  spec: 'API · team · SSO', color: J_COLORS.gold },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ textAlign: 'center', marginTop: 120 }}>
        <div style={{ fontFamily: J_FONTS.mono, fontSize: 14, letterSpacing: '0.32em', textTransform: 'uppercase', color: J_COLORS.text3 }}>● Business model</div>
      </div>

      <div style={{
        marginTop: 80,
        display: 'flex', justifyContent: 'center', gap: 28,
      }}>
        {tiers.map((t, i) => {
          const delay = i * 0.2 + 0.2;
          if (localTime < delay) return null;
          const op = Math.min(1, (localTime - delay) / 0.4);
          return (
            <div key={i} style={{
              width: 440, padding: '48px 40px',
              background: J_COLORS.surface,
              border: `1px solid ${t.highlight ? J_COLORS.cobaltLine : J_COLORS.line}`,
              borderRadius: 16,
              opacity: op,
              transform: `translateY(${(1 - op) * 16}px)`,
              boxShadow: t.highlight ? '0 0 60px -20px rgba(61,107,255,0.4)' : 'none',
            }}>
              <div style={{
                fontFamily: J_FONTS.mono, fontSize: 14,
                color: t.color, letterSpacing: '0.24em',
              }}>{t.name}</div>
              <div style={{
                marginTop: 22,
                fontFamily: J_FONTS.serif, fontSize: 120,
                color: J_COLORS.text, letterSpacing: '-0.03em', lineHeight: 1,
              }}>{t.price}<span style={{ fontFamily: J_FONTS.mono, fontSize: 18, color: J_COLORS.text3, marginLeft: 8 }}>{t.per}</span></div>
              <div style={{
                marginTop: 24, paddingTop: 24,
                borderTop: `1px solid ${J_COLORS.line}`,
                fontFamily: J_FONTS.mono, fontSize: 17,
                color: J_COLORS.text, letterSpacing: '0.04em',
              }}>{t.spec}</div>
            </div>
          );
        })}
      </div>

      {/* Roadmap whisper */}
      <div style={{
        position: 'absolute', bottom: 140, left: 0, right: 0,
        textAlign: 'center',
        fontFamily: J_FONTS.mono, fontSize: 16,
        letterSpacing: '0.3em', textTransform: 'uppercase',
        color: J_COLORS.text3,
        opacity: localTime > 4 ? Math.min(1, (localTime - 4) / 0.6) : 0,
      }}>
        subscription today &nbsp;→&nbsp; <span style={{ color: J_COLORS.cobaltBr }}>api &amp; teams next</span>
      </div>
    </div>
  );
}

// ── Beat 29 (283–290s) — Positioning lock ───────────────────────────────
function S_B29() {
  const { localTime } = useSprite();
  const lines = [
    { t: 0,   text: 'Not screenshots.',         color: J_COLORS.text },
    { t: 1.4, text: 'Not guesses.',             color: J_COLORS.text2 },
    { t: 2.8, text: 'A repeatable investigation.', color: J_COLORS.cobaltBr, scale: 1.03 },
  ];
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20,
    }}>
      {lines.map((ln, i) => {
        if (localTime < ln.t) return null;
        const op = Math.min(1, (localTime - ln.t) / 0.6);
        return (
          <div key={i} style={{
            fontFamily: J_FONTS.serif,
            fontStyle: i < 2 ? 'italic' : 'normal',
            fontSize: 104,
            color: ln.color,
            letterSpacing: '-0.015em',
            opacity: op,
            transform: `scale(${1 + ((ln.scale || 1) - 1) * op}) translateY(${(1 - op) * 16}px)`,
          }}>{ln.text}</div>
        );
      })}
    </div>
  );
}

// ── Beat 30 (290–296s) — Collapse to report ─────────────────────────────
function S_B30() {
  const { localTime } = useSprite();
  // Particles converge to center, settle into a final report tile
  const particles = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 90; i++) {
      const angle = (i / 90) * Math.PI * 2 + Math.random() * 0.4;
      const r = 350 + Math.random() * 350;
      arr.push({
        startX: 960 + Math.cos(angle) * r,
        startY: 540 + Math.sin(angle) * r,
        targetX: 960 + (Math.random() - 0.5) * 320,
        targetY: 540 + (Math.random() - 0.5) * 160,
        delay: Math.random() * 0.4,
      });
    }
    return arr;
  }, []);

  const reportT = Math.max(0, Math.min(1, (localTime - 2.5) / 0.8));

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {particles.map((p, i) => {
        const t = Easing.easeInOutCubic(Math.max(0, Math.min(1, (localTime - p.delay) / 1.6)));
        const x = p.startX + (p.targetX - p.startX) * t;
        const y = p.startY + (p.targetY - p.startY) * t;
        const op = (1 - reportT * 0.85);
        return (
          <div key={i} style={{
            position: 'absolute', left: x - 2, top: y - 2,
            width: 4, height: 4, borderRadius: 2,
            background: J_COLORS.cobalt,
            boxShadow: `0 0 8px ${J_COLORS.cobaltBr}`,
            opacity: op,
          }}/>
        );
      })}

      {/* Final report tile */}
      {reportT > 0 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 520, padding: '48px 56px',
          background: J_COLORS.surface,
          border: `1px solid ${J_COLORS.cobaltLine}`,
          borderRadius: 12,
          opacity: reportT,
          boxShadow: '0 60px 140px -30px rgba(0,0,0,0.8)',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: J_FONTS.mono, fontSize: 12, letterSpacing: '0.32em', color: J_COLORS.text3 }}>REPORT · #2K9</div>
          <div style={{
            marginTop: 22,
            fontFamily: J_FONTS.serif, fontSize: 104,
            color: J_COLORS.cobaltBr, letterSpacing: '-0.03em', lineHeight: 1,
          }}>+$144</div>
          <div style={{ marginTop: 12, fontFamily: J_FONTS.mono, fontSize: 14, color: J_COLORS.text3, letterSpacing: '0.16em' }}>EVIDENCE · YOURS</div>
        </div>
      )}
    </div>
  );
}

// ── Beat 31 (296–300s) — Final lock ─────────────────────────────────────
function S_B31() {
  const { localTime } = useSprite();
  const breath = 1 + Math.sin(localTime * 1.2) * 0.005;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      transform: `scale(${breath})`,
    }}>
      <div style={{
        fontFamily: J_FONTS.sans, fontWeight: 600,
        fontSize: 188, color: J_COLORS.text,
        letterSpacing: '0.16em',
        opacity: Math.min(1, localTime / 0.6),
        textShadow: '0 0 80px rgba(61,107,255,0.25)',
      }}>
        JAC<span style={{ color: J_COLORS.cobalt }}>[&nbsp;]</span>BI
      </div>
      <div style={{
        marginTop: 36,
        width: 480, height: 1, background: J_COLORS.line,
        opacity: Math.min(1, (localTime - 0.4) / 0.6),
      }}/>
      <div style={{
        marginTop: 30,
        fontFamily: J_FONTS.serif, fontStyle: 'italic',
        fontSize: 38, color: J_COLORS.text2,
        opacity: Math.min(1, (localTime - 0.7) / 0.6),
      }}>
        pricing intelligence for the fragmented web
      </div>
      <div style={{
        marginTop: 60,
        fontFamily: J_FONTS.mono, fontSize: 16,
        letterSpacing: '0.32em',
        color: J_COLORS.text3,
        opacity: Math.min(1, (localTime - 1.0) / 0.6),
      }}>
        jacobi-v2.vercel.app &nbsp;·&nbsp; github.com/Hussain800/Jacobi_v2
      </div>
    </div>
  );
}

window.S_B27 = S_B27;
window.S_B28 = S_B28;
window.S_B29 = S_B29;
window.S_B30 = S_B30;
window.S_B31 = S_B31;
