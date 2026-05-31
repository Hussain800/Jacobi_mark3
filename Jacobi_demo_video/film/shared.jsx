// film/shared.jsx
// Shared helpers for the Jacobi submission film.
// Loads after animations.jsx. All visual primitives match the live site's tokens.

const J_COLORS = {
  ink:        '#06070c',
  ink2:       '#090b10',
  surface:    '#0c0f15',
  surface2:   '#11151d',
  surface3:   '#161b25',
  line:       '#1a1f2a',
  line2:      '#262c39',
  text:       '#eceef3',
  text2:      '#97a0b1',
  text3:      '#5b6473',
  text4:      '#3d4452',
  cobalt:     '#3d6bff',
  cobaltBr:   '#6e92ff',
  cobaltDeep: '#2a4fd6',
  cobaltSoft: 'rgba(61,107,255,0.12)',
  cobaltLine: 'rgba(61,107,255,0.30)',
  over:       '#ff5468',
  good:       '#34d39b',
  gold:       '#d8b06a',
};

const J_FONTS = {
  serif: "'Instrument Serif', Georgia, serif",
  sans:  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif",
  mono:  "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
};

// ── Global film backdrop ────────────────────────────────────────────────
function FilmBackdrop() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `
        radial-gradient(1400px 700px at 75% -10%, rgba(61,107,255,0.05), transparent 60%),
        radial-gradient(1100px 700px at 5% 30%, rgba(255,84,104,0.025), transparent 55%),
        ${J_COLORS.ink}
      `,
      pointerEvents: 'none',
    }} />
  );
}

// Film grain (matches body::after on live site)
function FilmGrain() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none',
      opacity: 0.04,
      mixBlendMode: 'overlay',
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize: '240px 240px',
      zIndex: 9000,
    }} />
  );
}

// Top-left "live" indicator (only during walkthrough)
function LiveBadge({ visible = true }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', top: 36, left: 48,
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: J_FONTS.mono,
      fontSize: 14, letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: J_COLORS.text2,
      zIndex: 200,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: 4,
        background: J_COLORS.good,
        boxShadow: `0 0 10px ${J_COLORS.good}`,
        animation: 'jpulse 2s ease-in-out infinite',
      }} />
      <span>LIVE · jacobi-v2.vercel.app</span>
    </div>
  );
}

// Watermark (top-right brand)
function Watermark({ visible = true }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', top: 36, right: 48,
      display: 'flex', alignItems: 'center', gap: 14,
      fontFamily: J_FONTS.mono,
      fontWeight: 600, fontSize: 14, letterSpacing: '0.22em',
      color: J_COLORS.text2,
      zIndex: 200,
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 10,
        border: `1px solid ${J_COLORS.cobalt}`,
        position: 'relative',
        display: 'inline-block',
      }}>
        <span style={{
          position: 'absolute', left: '50%', top: -5, bottom: -5,
          width: 1, background: J_COLORS.cobalt, transform: 'translateX(-50%)',
        }} />
        <span style={{
          position: 'absolute', top: '50%', left: -5, right: -5,
          height: 1, background: J_COLORS.cobalt, transform: 'translateY(-50%)',
        }} />
      </span>
      <span>JAC<span style={{ color: J_COLORS.cobalt }}>[&nbsp;]</span>BI</span>
    </div>
  );
}

// ── Subtitle caption (burned-in, lower-third) ───────────────────────────
function Caption({ start, end, primary, mono, value, eyebrow, sub, position = 'lower' }) {
  const { time } = useTimeline();
  if (time < start - 0.1 || time > end + 0.5) return null;

  // fade in/out
  const fadeIn = 0.35;
  const fadeOut = 0.35;
  const local = time - start;
  const dur = end - start;
  let opacity = 1;
  if (local < fadeIn) opacity = Math.max(0, local / fadeIn);
  else if (local > dur - fadeOut) opacity = Math.max(0, (dur - local) / fadeOut);

  const positions = {
    lower:  { bottom: 88, left: '50%', transform: `translate(-50%, 0)`, textAlign: 'center' },
    center: { top: '50%', left: '50%', transform: `translate(-50%, -50%)`, textAlign: 'center' },
    top:    { top: 110,  left: '50%', transform: `translate(-50%, 0)`, textAlign: 'center' },
  };

  return (
    <div style={{
      position: 'absolute',
      maxWidth: 1500,
      padding: '0 60px',
      opacity,
      zIndex: 300,
      ...positions[position],
    }}>
      {eyebrow && (
        <div style={{
          fontFamily: J_FONTS.mono,
          fontSize: 13, letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: J_COLORS.text3,
          marginBottom: 14,
        }}>
          {eyebrow}
        </div>
      )}
      {primary && (
        <div style={{
          fontFamily: J_FONTS.serif,
          fontSize: 56, lineHeight: 1.2,
          color: J_COLORS.text,
          letterSpacing: '-0.005em',
        }}>
          {primary}
        </div>
      )}
      {mono && (
        <div style={{
          fontFamily: J_FONTS.mono,
          fontSize: 22, letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: J_COLORS.text2,
          marginTop: primary ? 22 : 0,
        }}>
          {mono}
          {value && (
            <span style={{ color: J_COLORS.cobaltBr, marginLeft: 14 }}>{value}</span>
          )}
        </div>
      )}
      {sub && (
        <div style={{
          fontFamily: J_FONTS.serif,
          fontStyle: 'italic',
          fontSize: 32, lineHeight: 1.3,
          color: J_COLORS.text2,
          marginTop: 14,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Hairline rule ────────────────────────────────────────────────────────
function Hairline({ x, y, w, h = 1, color = J_COLORS.line }) {
  return <div style={{
    position: 'absolute', left: x, top: y, width: w, height: h,
    background: color, zIndex: 5,
  }} />;
}

// ── Reticle / corner crosshair ──────────────────────────────────────────
function Reticle({ x, y, size = 28, color = J_COLORS.cobalt }) {
  const half = size / 2;
  return (
    <div style={{
      position: 'absolute',
      left: x - half, top: y - half,
      width: size, height: size, zIndex: 10,
    }}>
      <div style={{ position: 'absolute', left: half, top: -4, bottom: -4, width: 1, background: color, transform: 'translateX(-50%)' }} />
      <div style={{ position: 'absolute', top: half, left: -4, right: -4, height: 1, background: color, transform: 'translateY(-50%)' }} />
      <div style={{ position: 'absolute', inset: 0, border: `1px solid ${color}`, borderRadius: '50%' }} />
    </div>
  );
}

// ── Browser chrome frame for screenshots ────────────────────────────────
function BrowserFrame({ x, y, w, h, children, url, dim = 0, scale = 1 }) {
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      width: w, height: h,
      borderRadius: 14,
      overflow: 'hidden',
      background: J_COLORS.ink,
      boxShadow: '0 40px 100px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
      transform: `scale(${scale})`,
      transformOrigin: 'center',
    }}>
      {/* chrome bar */}
      <div style={{
        height: 38,
        background: '#0a0d14',
        borderBottom: `1px solid ${J_COLORS.line}`,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px',
        fontFamily: J_FONTS.mono, fontSize: 12,
        color: J_COLORS.text3,
      }}>
        <span style={{ width: 11, height: 11, borderRadius: 6, background: '#26272a' }} />
        <span style={{ width: 11, height: 11, borderRadius: 6, background: '#26272a' }} />
        <span style={{ width: 11, height: 11, borderRadius: 6, background: '#26272a' }} />
        {url && <span style={{ marginLeft: 22, opacity: 0.7 }}>{url}</span>}
      </div>
      <div style={{ position: 'relative', width: '100%', height: 'calc(100% - 38px)', overflow: 'hidden' }}>
        {children}
        {dim > 0 && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,7,12,'+ dim +')', pointerEvents: 'none' }}/>
        )}
      </div>
    </div>
  );
}

// ── Animated cursor (Screen-Studio style) ───────────────────────────────
// Provide an array of keyframes: [{t, x, y}] (t in localTime). Tween smoothly.
function AnimatedCursor({ keyframes, click = [], ease = Easing.easeOutCubic }) {
  const { localTime } = useSprite();

  if (!keyframes || keyframes.length === 0) return null;

  let cx = keyframes[0].x, cy = keyframes[0].y;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i], b = keyframes[i + 1];
    if (localTime >= a.t && localTime <= b.t) {
      const t = (localTime - a.t) / Math.max(0.001, b.t - a.t);
      const e = ease(t);
      cx = a.x + (b.x - a.x) * e;
      cy = a.y + (b.y - a.y) * e;
      break;
    } else if (localTime > b.t) {
      cx = b.x; cy = b.y;
    }
  }

  // click pulse: if localTime is within 0.4s after any click time, show pulse
  let pulse = 0;
  click.forEach(ct => {
    const d = localTime - ct;
    if (d >= 0 && d < 0.5) pulse = Math.max(pulse, 1 - d / 0.5);
  });

  return (
    <>
      {pulse > 0 && (
        <div style={{
          position: 'absolute', left: cx - 24, top: cy - 24,
          width: 48, height: 48, borderRadius: 24,
          border: `2px solid ${J_COLORS.cobalt}`,
          opacity: pulse * 0.6,
          transform: `scale(${1 + (1 - pulse) * 0.8})`,
          pointerEvents: 'none',
          zIndex: 999,
        }}/>
      )}
      <svg width="32" height="32" viewBox="0 0 32 32"
        style={{
          position: 'absolute', left: cx - 4, top: cy - 4,
          zIndex: 1000, pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))',
        }}>
        <path d="M4 2 L4 22 L10 17 L13 24 L17 22 L14 15 L22 14 Z"
              fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    </>
  );
}

// ── Callout pin (animated annotation pointing at something) ─────────────
function Callout({ x, y, label, value, side = 'right', delay = 0 }) {
  const { localTime } = useSprite();
  const local = localTime - delay;
  if (local < 0) return null;
  const fadeIn = 0.35;
  const opacity = Math.min(1, local / fadeIn);
  const offset = side === 'right' ? 30 : -30;

  return (
    <div style={{
      position: 'absolute',
      left: x + offset, top: y - 14,
      transform: side === 'left' ? 'translateX(-100%)' : 'none',
      opacity,
      zIndex: 500,
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(8,10,16,0.92)',
        border: `1px solid ${J_COLORS.cobaltLine}`,
        borderRadius: 6,
        padding: '10px 14px',
        boxShadow: '0 12px 40px -10px rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{
          fontFamily: J_FONTS.mono, fontSize: 10,
          letterSpacing: '0.24em', textTransform: 'uppercase',
          color: J_COLORS.text3, marginBottom: 4,
        }}>{label}</div>
        <div style={{
          fontFamily: J_FONTS.mono, fontSize: 15,
          color: J_COLORS.cobaltBr, fontWeight: 500,
          letterSpacing: '0.02em',
        }}>{value}</div>
      </div>
    </div>
  );
}

// ── Letterbox vignette (subtle edges) ───────────────────────────────────
function Vignette() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.4) 100%)',
      zIndex: 8000,
    }} />
  );
}

// ── Inline keyframes via style tag ──────────────────────────────────────
function FilmStyleTag() {
  return <style>{`
    @keyframes jpulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes jscan {
      0% { transform: scale(0.5); opacity: 0.6; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes jcursor-blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    @keyframes jbracket-flicker {
      0%, 100% { opacity: 1; }
      45%, 55% { opacity: 0.3; }
      48%, 52% { opacity: 1; }
    }
  `}</style>;
}

// ── Big serif italic line (cinematic) ───────────────────────────────────
function BigSerif({ x, y, text, size = 88, color = J_COLORS.text, italic = false, weight = 400, align = 'left', accent = null, delay = 0 }) {
  const { localTime } = useSprite();
  const local = localTime - delay;
  if (local < 0) return null;
  const fadeIn = 0.6;
  const opacity = Math.min(1, local / fadeIn);
  const ty = (1 - Math.min(1, local / fadeIn)) * 18;
  const transform = align === 'center'
    ? `translate(-50%, ${ty}px)`
    : `translate(0, ${ty}px)`;

  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      fontFamily: J_FONTS.serif,
      fontStyle: italic ? 'italic' : 'normal',
      fontWeight: weight,
      fontSize: size,
      lineHeight: 1.05,
      color,
      opacity,
      transform,
      letterSpacing: '-0.02em',
      zIndex: 100,
      whiteSpace: 'pre-line',
    }}>{text}</div>
  );
}

// ── Big sans display (cinematic) ────────────────────────────────────────
function BigSans({ x, y, text, size = 108, color = J_COLORS.text, weight = 600, align = 'left', delay = 0, letterSpacing = '-0.035em' }) {
  const { localTime } = useSprite();
  const local = localTime - delay;
  if (local < 0) return null;
  const fadeIn = 0.5;
  const opacity = Math.min(1, local / fadeIn);
  const ty = (1 - Math.min(1, local / fadeIn)) * 12;
  const transform = align === 'center'
    ? `translate(-50%, ${ty}px)`
    : `translate(0, ${ty}px)`;

  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      fontFamily: J_FONTS.sans, fontWeight: weight,
      fontSize: size, lineHeight: 1.0,
      color, opacity, transform,
      letterSpacing, zIndex: 100,
      whiteSpace: 'pre-line',
    }}>{text}</div>
  );
}

// ── Mono telemetry text ────────────────────────────────────────────────
function MonoText({ x, y, text, size = 14, color = J_COLORS.text3, weight = 400, ls = '0.18em', delay = 0, upper = true, opacity = null }) {
  const { localTime } = useSprite();
  const local = localTime - delay;
  if (local < 0) return null;
  const computedOp = opacity != null ? opacity : Math.min(1, local / 0.4);
  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      fontFamily: J_FONTS.mono, fontWeight: weight,
      fontSize: size, color,
      letterSpacing: ls,
      textTransform: upper ? 'uppercase' : 'none',
      opacity: computedOp,
      zIndex: 100,
    }}>{text}</div>
  );
}

// ── Counter (counts from->to over a window) ─────────────────────────────
function Counter({ x, y, from, to, start = 0, end = 1, prefix = '', suffix = '', size = 64, color = J_COLORS.text, font = J_FONTS.sans, weight = 600 }) {
  const { localTime } = useSprite();
  let val = from;
  if (localTime >= start && localTime <= end) {
    const t = Easing.easeOutCubic((localTime - start) / Math.max(0.001, end - start));
    val = from + (to - from) * t;
  } else if (localTime > end) {
    val = to;
  }
  const display = Math.round(val).toLocaleString();
  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      fontFamily: font, fontWeight: weight,
      fontSize: size, color,
      letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
      zIndex: 100,
    }}>{prefix}{display}{suffix}</div>
  );
}

// ── Beat number indicator (subtle, top-right under watermark) ──────────
function BeatChip({ id, time, visible = true }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', top: 80, right: 48,
      fontFamily: J_FONTS.mono, fontSize: 11,
      letterSpacing: '0.22em', textTransform: 'uppercase',
      color: J_COLORS.text4,
      zIndex: 200,
    }}>{id} · {time}</div>
  );
}

// ── Cross-fade scene wrapper ────────────────────────────────────────────
// Renders children during [start - fade, end + fade] with an opacity ramp.
// The inner SpriteContext's localTime is clamped to >= 0 so child animations
// don't run during pre-roll, but the visual fade-in still happens visibly.
function CrossfadeScene({ start, end, fade = 0.7, children }) {
  const { time, duration } = useTimeline();
  const visStart = start - fade;
  const visEnd = end + fade;
  if (time < visStart || time > visEnd) return null;

  let opacity = 1;
  if (time < start) opacity = Math.max(0, (time - visStart) / fade);
  else if (time > end) opacity = Math.max(0, 1 - (time - end) / fade);

  // Sprite-style local context
  const localTime = Math.max(0, time - start);
  const dur = end - start;
  const progress = dur > 0 ? Math.min(1, Math.max(0, localTime / dur)) : 0;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      opacity, willChange: 'opacity',
      transition: 'none',
    }}>
      <SpriteContext.Provider value={{ localTime, progress, duration: dur, visible: true }}>
        {children}
      </SpriteContext.Provider>
    </div>
  );
}

// ── Real-screenshot stage with Ken-Burns motion ─────────────────────────
// Used by walkthrough beats to render the actual site image as background.
// Optional dim, scale start/end (kenBurns), and focus origin.
function ScreenshotStage({ src, focus = '50% 50%', kbStart = 1.04, kbEnd = 1.10, dim = 0 }) {
  const { localTime, duration } = useSprite();
  const t = duration > 0 ? Math.min(1, localTime / duration) : 0;
  const scale = kbStart + (kbEnd - kbStart) * t;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <img src={src} alt=""
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          objectPosition: focus,
          transform: `scale(${scale})`,
          transformOrigin: focus,
          imageRendering: 'high-quality',
          filter: dim > 0 ? `brightness(${1 - dim})` : 'none',
        }}/>
      {/* Soft top + bottom gradient to anchor captions */}
      <div style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(6,7,12,0.35) 0%, transparent 18%, transparent 68%, rgba(6,7,12,0.55) 100%)',
      }}/>
    </div>
  );
}

// expose to window
Object.assign(window, {
  J_COLORS, J_FONTS,
  FilmBackdrop, FilmGrain, LiveBadge, Watermark, FilmStyleTag,
  Caption, Hairline, Reticle, BrowserFrame, AnimatedCursor, Callout, Vignette,
  BigSerif, BigSans, MonoText, Counter, BeatChip,
  CrossfadeScene, ScreenshotStage,
});
