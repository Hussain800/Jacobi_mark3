"use client";

/**
 * HeroScene — Phase 8: Claude Design forensic intelligence port.
 *
 * Two-column layout: editorial copy on the left, live agent visualization
 * on the right. Cobalt accent throughout. Probe instrument is an editorial
 * horizontal bar with mono "⌖ 24 agents" prefix.
 *
 *   left   → eyebrow chip, big sans headline with serif-italic accent,
 *            typed mono subhead, paragraph, probe instrument, proof line.
 *   right  → orbital agent stage with corner HUDs, status readout overlay,
 *            and a deploy sequence that runs once on mount.
 *
 * Routes to /chat?url=<encoded> on submit. Reduced motion skips the typed
 * effect + deploy animation.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/* ─── 24 agents (drives the right-side stage) ─────────────────────── */

type Role = "good" | "over" | "normal";

interface Agent {
  i: number;
  city: string;
  profile: string;
  price: number;
  role: Role;
}

const AGENTS: Agent[] = [
  { i: 0,  city: "Manhattan",   profile: "Safari · Manhattan · direct",   price: 642, role: "over" },
  { i: 1,  city: "New York",    profile: "iPhone 15 · NYC · direct",       price: 638, role: "over" },
  { i: 2,  city: "Dubai",       profile: "iPhone · Dubai · direct",        price: 631, role: "over" },
  { i: 3,  city: "Los Angeles", profile: "iPhone · LA · direct",           price: 627, role: "over" },
  { i: 4,  city: "Tokyo",       profile: "Safari · Tokyo · direct",        price: 612, role: "normal" },
  { i: 5,  city: "Chicago",     profile: "Chrome · Chicago · direct",      price: 612, role: "normal" },
  { i: 6,  city: "Hong Kong",   profile: "Safari · HKG · direct",          price: 608, role: "normal" },
  { i: 7,  city: "Paris",       profile: "Safari · Paris · direct",        price: 601, role: "normal" },
  { i: 8,  city: "London",      profile: "Edge · London · direct",         price: 596, role: "normal" },
  { i: 9,  city: "Seoul",       profile: "Chrome · Seoul · fiber",         price: 590, role: "normal" },
  { i: 10, city: "Singapore",   profile: "Chrome · SGP · fiber",           price: 588, role: "normal" },
  { i: 11, city: "Sydney",      profile: "Chrome · Sydney · fiber",        price: 583, role: "normal" },
  { i: 12, city: "Frankfurt",   profile: "Chrome · FRA · fiber",           price: 579, role: "normal" },
  { i: 13, city: "Toronto",     profile: "Edge · Toronto · direct",        price: 574, role: "normal" },
  { i: 14, city: "Amsterdam",   profile: "Edge · AMS · fiber",             price: 571, role: "normal" },
  { i: 15, city: "Berlin",      profile: "Firefox · Berlin · fiber",       price: 566, role: "normal" },
  { i: 16, city: "Madrid",      profile: "Chrome · Madrid · fiber",        price: 558, role: "normal" },
  { i: 17, city: "São Paulo",   profile: "Android · SAO · LTE",            price: 540, role: "normal" },
  { i: 18, city: "Lagos",       profile: "Android · Lagos · LTE",          price: 531, role: "normal" },
  { i: 19, city: "Mumbai",      profile: "Android · Mumbai · LTE",         price: 524, role: "normal" },
  { i: 20, city: "Bogotá",      profile: "Android · Bogotá · VPN",         price: 516, role: "normal" },
  { i: 21, city: "Bangalore",   profile: "Firefox · Bangalore · VPN",      price: 512, role: "normal" },
  { i: 22, city: "Mississippi", profile: "Android · MS · LTE",             price: 505, role: "good" },
  { i: 23, city: "Rural Iowa",  profile: "Chrome · Iowa · VPN",            price: 498, role: "good" },
];

const TYPED_LINE = "24 agents. One URL. The truth about what you pay.";

/* ─── Component ────────────────────────────────────────────────────── */

export default function HeroScene() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [url, setUrl] = useState("");
  const [typed, setTyped] = useState(reducedMotion ? TYPED_LINE : "");
  const [count, setCount] = useState(0);
  const [deployStatus, setDeployStatus] = useState<"deploying" | "mapped">("deploying");
  const inputRef = useRef<HTMLInputElement>(null);

  /* Typed effect */
  useEffect(() => {
    if (reducedMotion) {
      setTyped(TYPED_LINE);
      return;
    }
    let i = 0;
    let alive = true;
    const start = setTimeout(function step() {
      if (!alive) return;
      setTyped(TYPED_LINE.slice(0, i));
      const ch = TYPED_LINE[i - 1];
      i++;
      if (i <= TYPED_LINE.length) {
        const delay = ch === "." ? 320 : 34 + Math.random() * 26;
        setTimeout(step, delay);
      }
    }, 600);
    return () => { alive = false; clearTimeout(start); };
  }, [reducedMotion]);

  /* Deploy counter — runs once over 4.2s */
  useEffect(() => {
    if (reducedMotion) {
      setCount(24);
      setDeployStatus("mapped");
      return;
    }
    let raf = 0;
    let alive = true;
    const start = setTimeout(() => {
      const t0 = performance.now();
      const dur = 4200;
      function tick(now: number) {
        if (!alive) return;
        const p = Math.min(1, (now - t0) / dur);
        const cur = Math.round(p * 24);
        setCount(cur);
        if (p < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          setDeployStatus("mapped");
        }
      }
      raf = requestAnimationFrame(tick);
    }, 900);
    return () => { alive = false; clearTimeout(start); cancelAnimationFrame(raf); };
  }, [reducedMotion]);

  const submit = useCallback(() => {
    let raw = url.trim();
    if (!raw) { inputRef.current?.focus(); return; }
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    router.push(`/chat?url=${encodeURIComponent(raw)}`);
  }, [url, router]);

  return (
    <header
      id="jacobi-hero"
      className="relative min-h-[100vh] flex flex-col justify-center pt-16 overflow-hidden"
    >
      {/* Soft cobalt halo top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(46% 52% at 77% 44%, rgba(61,107,255,0.07), transparent 70%)",
        }}
      />

      <div className="relative z-[2] w-full mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-12 py-12 lg:py-0">
        <div className="grid gap-9 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] items-center">
          {/* ─── Left column: copy + probe instrument ───────────── */}
          <div className="max-w-[600px] lg:order-1 order-1">
            {/* Eyebrow chip */}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-2 mb-7 px-3.5 py-1.5 rounded-full border border-line-2 text-secondary bg-white/[0.018]"
              style={{ fontFamily: "var(--mono)" }}
            >
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-cobalt pulse-ring" />
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] tabular-nums">
                {count.toString().padStart(2, "0")} / 24 live · probing now
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={reducedMotion ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="text-primary"
              style={{
                fontFamily: "var(--sans)",
                fontWeight: 600,
                fontSize: "clamp(44px, 6.3vw, 90px)",
                lineHeight: 0.97,
                letterSpacing: "-0.042em",
              }}
            >
              Your browser is a{" "}
              <span
                className="text-cobalt-bright"
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: "1.01em",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                }}
              >
                bargaining&nbsp;tool
              </span>
              <span
                aria-hidden
                className="block w-[62px] h-[2px] mt-6"
                style={{
                  background:
                    "linear-gradient(90deg, var(--cobalt), transparent)",
                }}
              />
            </motion.h1>

            {/* Typed mono line */}
            <motion.p
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-6 text-primary"
              style={{
                fontFamily: "var(--mono)",
                fontSize: "clamp(14px, 1.55vw, 17px)",
                minHeight: "1.5em",
                letterSpacing: "0.005em",
              }}
            >
              {typed}
              <span className="text-cobalt-bright ml-px blink-caret">▌</span>
            </motion.p>

            {/* Paragraph */}
            <motion.p
              initial={reducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 text-secondary max-w-[460px]"
              style={{
                fontSize: "15.5px",
                lineHeight: 1.62,
              }}
            >
              JACOBI deploys 24 shopper profiles against your URL and surfaces the
              pricing&nbsp;discrimination algorithms hide behind your digital&nbsp;fingerprint.
            </motion.p>

            {/* Probe instrument */}
            <motion.form
              initial={reducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={(e) => { e.preventDefault(); submit(); }}
              className="mt-8 w-full max-w-[560px]"
            >
              <div className="flex items-baseline gap-6 px-0.5 py-3.5 pb-4">
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 text-muted whitespace-nowrap shrink-0"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "10.5px",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                  }}
                >
                  <span
                    className="text-cobalt-bright"
                    style={{ fontSize: "14px", lineHeight: 0.8, transform: "translateY(1px)" }}
                  >
                    ⌖
                  </span>
                  24 agents
                </span>
                <input
                  id="jacobi-probe-input"
                  ref={inputRef}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="paste a flight, hotel or product URL"
                  aria-label="Paste a URL to probe"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-primary py-0.5 italic placeholder:italic placeholder:text-muted placeholder:opacity-90 font-light"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "15px",
                    letterSpacing: "0.005em",
                  }}
                />
                <button
                  type="submit"
                  className="shrink-0 inline-flex items-baseline gap-1.5 text-primary hover:text-cobalt-bright transition-colors group"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "13px",
                    letterSpacing: "0.05em",
                    fontWeight: 500,
                  }}
                >
                  Inspect
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
              <span
                aria-hidden
                className="block h-px w-full"
                style={{
                  background:
                    "linear-gradient(90deg, var(--line-2) 0%, var(--line-2) 65%, transparent 100%)",
                }}
              />
            </motion.form>

            {/* Hero proof */}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-5 text-muted"
              style={{
                fontFamily: "var(--mono)",
                fontSize: "10.5px",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
              }}
            >
              4 discrimination vectors{" "}
              <span className="text-muted-2 mx-1.5">·</span>
              verdict in seconds{" "}
              <span className="text-muted-2 mx-1.5">·</span>
              no login required
            </motion.div>
          </div>

          {/* ─── Right column: agent stage with HUD ────────────── */}
          <AgentStage
            count={count}
            deployStatus={deployStatus}
            reducedMotion={!!reducedMotion}
          />
        </div>
      </div>

      {/* Scroll cue */}
      <div
        aria-hidden
        className="hidden lg:flex absolute bottom-6 left-1/2 -translate-x-1/2 z-[2] flex-col items-center gap-2.5 text-muted-2"
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: "10.5px",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
          }}
        >
          scroll
        </span>
        <span
          className="block w-px h-[34px] cue-line"
          style={{ background: "linear-gradient(var(--text-3), transparent)" }}
        />
      </div>
    </header>
  );
}

/* ─── Right-side agent stage ───────────────────────────────────────── */

function AgentStage({
  count,
  deployStatus,
  reducedMotion,
}: {
  count: number;
  deployStatus: "deploying" | "mapped";
  reducedMotion: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 520, h: 520 });

  useLayoutEffect(() => {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setStage({ w: r.width, h: r.height });
  }, []);

  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setStage({ w: width, h: height });
    });
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  /* 24 agents arranged in concentric rings — outer ring = over, middle = normal, inner = good */
  const positions = useMemo(() => {
    const cx = stage.w / 2;
    const cy = stage.h / 2;
    const R = Math.min(stage.w, stage.h) * 0.42;
    return AGENTS.map((a, i) => {
      // Place by index around a clock, with role-based radius modulation
      const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
      const ringR =
        a.role === "over"   ? R * 1.00 :
        a.role === "good"   ? R * 0.55 :
                              R * 0.78;
      return {
        agent: a,
        x: cx + Math.cos(angle) * ringR,
        y: cy + Math.sin(angle) * ringR,
        delayMs: 80 + i * 150, // staggered reveal matching the counter
      };
    });
  }, [stage]);

  return (
    <div className="lg:order-2 order-2 w-full max-w-[660px] ml-auto relative aspect-square">
      {/* Outer halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1"
        style={{
          background:
            "radial-gradient(circle at 50% 49%, rgba(61,107,255,0.13), rgba(61,107,255,0.04) 40%, transparent 66%)",
          filter: "blur(6px)",
        }}
      />

      <div ref={stageRef} className="relative w-full h-full">
        {/* Corner HUD ticks — 4 corners */}
        {[
          "top-0 left-0",
          "top-0 right-0",
          "bottom-0 left-0",
          "bottom-0 right-0",
        ].map((cls, i) => (
          <span
            key={i}
            aria-hidden
            className={`absolute w-4 h-4 ${cls} pointer-events-none`}
          >
            <span
              className="absolute"
              style={{
                background: "var(--text-3)",
                width: i % 2 === 0 ? "100%" : "1px",
                height: i % 2 === 0 ? "1px" : "100%",
                top: i < 2 ? 0 : "auto",
                bottom: i >= 2 ? 0 : "auto",
                left: i % 2 === 0 ? 0 : "auto",
                right: i % 2 === 1 ? 0 : "auto",
                opacity: 0.4,
              }}
            />
            <span
              className="absolute"
              style={{
                background: "var(--text-3)",
                width: i % 2 === 0 ? "1px" : "100%",
                height: i % 2 === 0 ? "100%" : "1px",
                top: i < 2 ? 0 : "auto",
                bottom: i >= 2 ? 0 : "auto",
                left: i % 2 === 0 ? 0 : "auto",
                right: i % 2 === 1 ? 0 : "auto",
                opacity: 0.4,
              }}
            />
          </span>
        ))}

        {/* Concentric ring guides */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          viewBox={`-${stage.w / 2} -${stage.h / 2} ${stage.w} ${stage.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {[1.00, 0.78, 0.55].map((r, i) => (
            <circle
              key={i}
              cx={0}
              cy={0}
              r={Math.min(stage.w, stage.h) * 0.42 * r}
              fill="none"
              stroke="var(--line)"
              strokeWidth={0.7}
              strokeDasharray={i === 0 ? "none" : "2 4"}
              opacity={0.6}
            />
          ))}
          {/* Strands from center to each node, drawn over deploy phase */}
          {positions.map((p, i) => {
            const role = p.agent.role;
            const stroke =
              role === "over"   ? "rgba(255, 84, 104, 0.45)" :
              role === "good"   ? "rgba(52, 211, 155, 0.55)" :
                                  "rgba(232, 234, 237, 0.10)";
            return (
              <motion.line
                key={i}
                x1={0}
                y1={0}
                x2={p.x - stage.w / 2}
                y2={p.y - stage.h / 2}
                stroke={stroke}
                strokeWidth={role === "normal" ? 0.6 : 1.1}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={count > i
                  ? { pathLength: 1, opacity: role === "normal" ? 0.55 : 1 }
                  : { pathLength: 0, opacity: 0 }}
                transition={{
                  pathLength: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: 0.4 },
                }}
              />
            );
          })}
        </svg>

        {/* Center anchor */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cobalt-bright"
          style={{ boxShadow: "0 0 14px var(--cobalt-glow)" }}
        />

        {/* Nodes */}
        {positions.map((p, i) => {
          const role = p.agent.role;
          const color =
            role === "over" ? "var(--over)" :
            role === "good" ? "var(--good)" :
                              "var(--text-3)";
          const visible = count > i;
          return (
            <motion.div
              key={i}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.4 }}
              animate={visible
                ? { opacity: role === "normal" ? 0.65 : 1, scale: 1 }
                : { opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
              }}
              className="pointer-events-auto"
              title={p.agent.profile}
            >
              <span
                className={`block rounded-full ${
                  role === "normal" ? "w-1.5 h-1.5" : "w-2 h-2"
                }`}
                style={{
                  background: color,
                  boxShadow:
                    role === "over"
                      ? "0 0 10px rgba(255,84,104,0.65)"
                      : role === "good"
                        ? "0 0 10px rgba(52,211,155,0.65)"
                        : undefined,
                }}
              />
            </motion.div>
          );
        })}

        {/* Status readout overlay */}
        <div
          className="absolute left-[4%] bottom-[5%] z-[3] pointer-events-none"
          style={{ fontFamily: "var(--mono)" }}
        >
          <div className="flex items-baseline gap-2">
            <span
              className="self-center w-[7px] h-[7px] rounded-full bg-cobalt -translate-y-px"
              style={{ boxShadow: "0 0 10px var(--cobalt-glow)" }}
            />
            <span
              className="text-secondary uppercase"
              style={{ fontSize: "11px", letterSpacing: "0.1em" }}
            >
              {deployStatus === "deploying" ? "deploying identities" : "topology mapped"}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span
              className="text-primary tabular-nums"
              style={{ fontSize: "28px", fontWeight: 500, letterSpacing: "-0.02em" }}
            >
              {count.toString().padStart(2, "0")}
            </span>
            <span className="text-muted" style={{ fontSize: "12px" }}>
              / 24 live
            </span>
          </div>
          <div
            className="mt-1.5 text-muted-2 uppercase"
            style={{ fontSize: "10px", letterSpacing: "0.08em" }}
          >
            JFK → LHR · UA182 · residential mesh
          </div>
        </div>
      </div>
    </div>
  );
}
