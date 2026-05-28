"use client";

/**
 * EmptyState — Phase 6 premium cockpit landing surface.
 *
 * Visual language matches the landing HeroScene:
 *   • Decorative orbital backdrop — 24 glowy color-tinted nodes in 5
 *     axis clusters, slowly rotating, never interactive. Establishes
 *     "this is the same product."
 *   • Premium input with animated gradient halo border + corner ticks
 *   • Sample cards styled as forensic case files with hover glow tinted
 *     by topology category.
 *   • Quiet leaderboard below for social proof.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Globe } from "lucide-react";
import { SAMPLES, INDEX_TO_AXIS, Axis } from "./types";
import { AXIS_COLOR, CLUSTER_ANGLE, Pt, strandPath, depthFactor } from "./orbital";
import Leaderboard from "./Leaderboard";

interface Props {
  input: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
  onPick: (url: string) => void;
  running: boolean;
  urlError?: string;
}

/* Position math for the decorative backdrop */
function bgPos(idx: number, axis: Axis, w: number, h: number, rot: number): Pt {
  const angle = CLUSTER_ANGLE[axis] + rot;
  const anchorR = Math.min(w * 0.36, h * 0.46);
  const ax = Math.cos(angle) * anchorR;
  const ay = Math.sin(angle) * anchorR * 0.82;
  const peers: number[] = [];
  for (let i = 0; i < 24; i++) if (INDEX_TO_AXIS[i] === axis) peers.push(i);
  const idxInCluster = peers.indexOf(idx);
  const n = peers.length;
  const tangent = angle + Math.PI / 2;
  const spread = n === 1 ? 0
    : ((idxInCluster - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) *
      Math.min(w * 0.12, 90);
  return {
    x: ax + Math.cos(tangent) * spread,
    y: ay + Math.sin(tangent) * spread * 0.85,
  };
}

export default function EmptyState({
  input,
  onInput,
  onSubmit,
  onPick,
  running,
  urlError,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Backdrop — separate ref, fills the page background quietly */
  const bgRef = useRef<HTMLDivElement>(null);
  const [bg, setBg] = useState({ w: 1200, h: 900 });
  const [rotation, setRotation] = useState(0);

  useLayoutEffect(() => {
    if (!bgRef.current) return;
    const r = bgRef.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setBg({ w: r.width, h: r.height });
  }, []);

  useEffect(() => {
    if (!bgRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setBg({ w: width, h: height });
    });
    ro.observe(bgRef.current);
    return () => ro.disconnect();
  }, []);

  /* Slow perpetual rotation on the backdrop */
  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => {
      setRotation((prev) => (prev + 0.0004) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(id);
  }, [reducedMotion]);

  /* Cursor halo for the input area only — subtle */
  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  const cursorXS = useSpring(cursorX, { stiffness: 130, damping: 22 });
  const cursorYS = useSpring(cursorY, { stiffness: 130, damping: 22 });
  const [cursorInBg, setCursorInBg] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    const el = bgRef.current;
    if (!el) return;
    const handle = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      cursorX.set(e.clientX - rect.left);
      cursorY.set(e.clientY - rect.top);
    };
    const enter = () => setCursorInBg(true);
    const leave = () => setCursorInBg(false);
    el.addEventListener("mousemove", handle);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", handle);
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    };
  }, [cursorX, cursorY, reducedMotion]);

  const positions = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => bgPos(i, INDEX_TO_AXIS[i], bg.w, bg.h, rotation));
  }, [bg, rotation]);

  const bgCx = bg.w / 2;
  const bgCy = bg.h / 2;

  return (
    <div ref={bgRef} className="relative min-h-[calc(100vh-3rem)] overflow-hidden">
      {/* ─── Orbital backdrop ────────────────────────────────────────── */}
      <BackdropOrbital
        positions={positions}
        bgCx={bgCx}
        bgCy={bgCy}
        bg={bg}
        reducedMotion={!!reducedMotion}
      />

      {/* Cursor halo */}
      {!reducedMotion && cursorInBg && (
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            left: cursorXS,
            top:  cursorYS,
            width: 360,
            height: 360,
            marginLeft: -180,
            marginTop:  -180,
            pointerEvents: "none",
            willChange: "transform",
            background:
              "radial-gradient(circle, rgba(0,217,122,0.18) 0%, rgba(0,217,122,0.06) 30%, transparent 70%)",
            borderRadius: "50%",
            filter: "blur(12px)",
          }}
          className="z-[3]"
        />
      )}

      {/* ─── Foreground content ──────────────────────────────────────── */}
      <div className="relative z-10 px-5 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-6 flex items-center justify-center gap-3"
          >
            <span className="text-secondary">JACOBI</span>
            <span aria-hidden className="h-2.5 w-px bg-line" />
            <span>probe cockpit</span>
          </motion.div>

          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-[30px] sm:text-[44px] leading-[1.05] tracking-tight text-primary mb-8"
          >
            Paste a URL.{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-signal">Twenty-four shoppers</span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-1 h-[0.14em] bg-signal/15 rounded-sm -z-0"
              />
            </span>{" "}
            go to work.
          </motion.h1>

          {/* Premium input */}
          <motion.form
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="relative max-w-xl mx-auto"
          >
            {/* Animated gradient halo behind input */}
            <motion.div
              aria-hidden
              animate={{
                opacity: focused ? 1 : 0.55,
                scale:   focused ? 1.015 : 1,
              }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{
                background:
                  "linear-gradient(110deg, rgba(0,217,122,0.45) 0%, rgba(34,211,238,0.25) 35%, rgba(167,139,250,0.25) 65%, rgba(255,93,108,0.45) 100%)",
                filter: "blur(12px)",
                transform: "translate3d(0,0,0)",
              }}
            />

            {/* Surface */}
            <div className="relative bg-ink/95 backdrop-blur-md rounded-xl border border-line">
              {/* Corner tick marks on focus */}
              {[
                "top-0 left-0",
                "top-0 right-0 rotate-90",
                "bottom-0 right-0 rotate-180",
                "bottom-0 left-0 -rotate-90",
              ].map((cls, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  initial={false}
                  animate={{ opacity: focused ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                  className={`pointer-events-none absolute w-3 h-3 ${cls}`}
                  style={{
                    borderTop:  "1px solid rgba(0, 217, 122, 0.65)",
                    borderLeft: "1px solid rgba(0, 217, 122, 0.65)",
                    margin: 2,
                  }}
                />
              ))}

              <div className="flex items-stretch">
                <span className="flex items-center pl-5 pr-3 text-signal/70 shrink-0">
                  <Globe className="w-4 h-4" />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={input}
                  onChange={(e) => onInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={()  => setFocused(false)}
                  placeholder="Paste a flight, hotel, or product URL"
                  aria-label="Paste a URL to probe"
                  disabled={running}
                  autoFocus
                  className="flex-1 bg-transparent py-5 sm:py-6 pr-2 text-primary placeholder-muted/70 outline-none text-base sm:text-[17px] font-mono caret-signal min-w-0 tracking-tight disabled:opacity-50"
                />
                <motion.button
                  type="submit"
                  whileHover={reducedMotion ? undefined : { scale: 1.03 }}
                  whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                  disabled={running || !input.trim()}
                  className="relative m-2 inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg bg-signal text-ink font-mono text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.18em] hover:brightness-110 active:scale-[0.98] transition-[transform,filter] shrink-0 shadow-[0_0_24px_rgba(0,217,122,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Probe</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>

            {urlError && (
              <p className="text-[10px] font-mono text-overcharge text-center mt-2">{urlError}</p>
            )}
          </motion.form>

          {/* Sample case files */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-12 sm:mt-14"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-5 flex items-center justify-center gap-3">
              <span aria-hidden className="h-px w-12 bg-line" />
              <span>Or open a case</span>
              <span aria-hidden className="h-px w-12 bg-line" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
              {SAMPLES.map((s, i) => {
                // Pick a tint by index — wraps the 5-color palette
                const axes: Axis[] = ["loc", "dev", "cookie", "ref", "ctrl"];
                const ax = axes[i % axes.length];
                const c = AXIS_COLOR[ax];
                return (
                  <motion.button
                    key={s.label}
                    onClick={() => onPick(s.url)}
                    disabled={running}
                    whileHover={reducedMotion ? undefined : { y: -2 }}
                    className="group text-left rounded-md bg-raised border border-line hover:border-secondary/50 disabled:opacity-50 transition-all px-4 py-3 flex items-center justify-between gap-3"
                    style={{
                      // Tinted hover handled via group-hover utility wouldn't
                      // reach inline styles — use a subtle data-attr
                      // approach instead: borderColor changes on hover via
                      // CSS, but inline overrides class. Keep it simple
                      // with a static neutral border.
                    }}
                  >
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: c.core, boxShadow: `0 0 6px ${c.glow}` }}
                        />
                        <span className="font-mono text-[11px] text-secondary group-hover:text-primary transition-colors truncate">
                          {s.label}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-muted truncate pl-3.5">
                        {s.url.split("/")[2] || s.url.slice(0, 32)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[11px] tabular-nums" style={{ color: c.core }}>
                        {s.price}
                      </span>
                      <ArrowRight
                        className="w-3 h-3 text-muted group-hover:translate-x-0.5 transition-all"
                        style={{
                          color: undefined,
                        }}
                      />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Leaderboard */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="mt-12 sm:mt-16"
          >
            <Leaderboard />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ─── Backdrop orbital — decorative, non-interactive ──────────────── */

function BackdropOrbital({
  positions,
  bgCx,
  bgCy,
  bg,
  reducedMotion,
}: {
  positions: Pt[];
  bgCx: number;
  bgCy: number;
  bg: { w: number; h: number };
  reducedMotion: boolean;
}) {
  return (
    <>
      {/* Strand layer — bone-white to cluster-tinted gradient */}
      <svg
        className="absolute inset-0 pointer-events-none z-[1]"
        width="100%"
        height="100%"
        viewBox={`-${bgCx} -${bgCy} ${bg.w} ${bg.h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          {(Object.keys(AXIS_COLOR) as Axis[]).map((axis) => (
            <linearGradient key={axis} id={`bg-web-${axis}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="rgba(225, 232, 245, 0.25)" />
              <stop offset="100%" stopColor={AXIS_COLOR[axis].core} stopOpacity="0.18" />
            </linearGradient>
          ))}
        </defs>
        {positions.map((p, i) => {
          const axis = INDEX_TO_AXIS[i];
          return (
            <motion.path
              key={i}
              d={strandPath({ x: 0, y: 0 }, p)}
              fill="none"
              stroke={`url(#bg-web-${axis})`}
              strokeWidth={0.7}
              strokeLinecap="round"
              initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.5 }}
              transition={{ duration: 1.5, delay: 0.2 + (i % 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </svg>

      {/* Node layer */}
      <div className="absolute inset-0 z-[2] pointer-events-none">
        {positions.map((p, i) => {
          const axis = INDEX_TO_AXIS[i];
          const c = AXIS_COLOR[axis];
          const depth = depthFactor(p);
          return (
            <motion.div
              key={i}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.5 }}
              animate={{
                x: bgCx + p.x,
                y: bgCy + p.y,
                opacity: Math.max(0.35, depth * 0.7),
                scale: 1,
              }}
              transition={{
                x: { duration: 0, ease: "linear" },
                y: { duration: 0, ease: "linear" },
                opacity: { duration: 0.6 },
                scale:   { duration: 0.6, delay: 0.3 + (i % 8) * 0.04 },
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
              }}
            >
              <motion.div
                animate={{ scale: [1, 1.10, 1] }}
                transition={{
                  duration: 3.0 + (i % 6) * 0.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: (i % 9) * 0.18,
                }}
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full"
                style={{
                  backgroundColor: c.soft,
                  border: `1px solid ${c.core}50`,
                  boxShadow: `0 0 10px ${c.glow}`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            </motion.div>
          );
        })}

        {/* Center anchor */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-signal/60"
          style={{ boxShadow: "0 0 24px rgba(0, 217, 122, 0.5)" }}
        />
      </div>
    </>
  );
}
