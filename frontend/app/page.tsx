"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Globe,
  Smartphone,
  Cookie,
  ExternalLink,
  Wifi,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────
   Static data — preserved from product logic, no API calls here.
   The 24-agent fingerprint counts mirror the real backend mix.
   ───────────────────────────────────────────────────────────────────── */

const SAMPLE_URL =
  "https://www.united.com/en/us/flightdetails?flight=UA182";

type Axis = "loc" | "dev" | "cookie" | "ref" | "ctrl";
type Tier = "DC" | "RES" | "MOB";

interface Fingerprint {
  axis: Axis;
  tier: Tier;
  label: string;
  note: string;
}

const SWARM: Fingerprint[] = [
  // Wave 1 · datacenter
  { axis: "ctrl", tier: "DC", label: "BASE",  note: "Control · Manhattan macbook" },
  { axis: "loc",  tier: "DC", label: "NYC",   note: "Manhattan · high-income" },
  { axis: "loc",  tier: "DC", label: "IOWA",  note: "Rural Iowa · low-income" },
  { axis: "loc",  tier: "DC", label: "SFO",   note: "San Francisco · tech" },
  { axis: "loc",  tier: "DC", label: "LDN",   note: "London · GBP" },
  { axis: "loc",  tier: "DC", label: "MUM",   note: "Mumbai · INR" },
  { axis: "dev",  tier: "DC", label: "iPhn",  note: "iPhone 15 Pro Safari" },
  { axis: "dev",  tier: "DC", label: "Andr",  note: "Budget Android Chrome" },
  // Wave 2 · residential
  { axis: "dev",  tier: "RES", label: "M3",    note: "MacBook Pro M3" },
  { axis: "dev",  tier: "RES", label: "Cbk",   note: "Chromebook (budget)" },
  { axis: "dev",  tier: "RES", label: "Glx",   note: "Galaxy S24 Ultra" },
  { axis: "cookie", tier: "RES", label: "Aged", note: "30-day high-intent profile" },
  { axis: "cookie", tier: "RES", label: "Fresh",note: "First-visit, no history" },
  { axis: "cookie", tier: "RES", label: "Plat", note: "90-day platinum loyalty" },
  { axis: "ref",  tier: "RES", label: "Kayak", note: "Referred from Kayak" },
  { axis: "ref",  tier: "RES", label: "Dir",   note: "Direct URL entry" },
  // Wave 3 · mobile
  { axis: "ref",  tier: "MOB", label: "Sky",   note: "Referred from Skyscanner" },
  { axis: "ref",  tier: "MOB", label: "Dir·M", note: "Direct · mobile network" },
  { axis: "loc",  tier: "MOB", label: "DXB",   note: "Dubai · AED" },
  { axis: "loc",  tier: "MOB", label: "MS",    note: "Rural Mississippi" },
  { axis: "dev",  tier: "MOB", label: "iPad",  note: "iPad Pro 12.9" },
  { axis: "dev",  tier: "MOB", label: "SE",    note: "iPhone SE (budget)" },
  { axis: "ctrl", tier: "MOB", label: "CTR·1", note: "Control replicate 1" },
  { axis: "ctrl", tier: "MOB", label: "CTR·2", note: "Control replicate 2" },
];

const AXIS_COUNT = SWARM.reduce<Record<Axis, number>>(
  (acc, a) => ({ ...acc, [a.axis]: (acc[a.axis] || 0) + 1 }),
  { loc: 0, dev: 0, cookie: 0, ref: 0, ctrl: 0 },
);

const DEMO_PROFILES = [
  { profile: "iPhone · Manhattan · direct",     price: 640 },
  { profile: "Safari · Tokyo · direct",          price: 625 },
  { profile: "Edge · London · direct",           price: 590 },
  { profile: "Firefox · Bangalore · VPN",        price: 512 },
  { profile: "Chrome · Rural Iowa · VPN",        price: 498 },
];

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Soft focus on mount so the URL field is the obvious next move
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function probe(target?: string) {
    let raw = (target ?? url).trim();
    if (!raw) {
      inputRef.current?.focus();
      return;
    }
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    router.push(`/chat?url=${encodeURIComponent(raw)}`);
  }

  const fadeIn = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
      };

  /* demo math — drives bar widths + verdict */
  const cheapest = Math.min(...DEMO_PROFILES.map((p) => p.price));
  const dearest = Math.max(...DEMO_PROFILES.map((p) => p.price));
  const spread = dearest - cheapest;
  const spreadPct = Math.round((spread / cheapest) * 100);

  return (
    <main className="min-h-screen bg-ink text-primary font-sans selection:bg-signal/20">
      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section className="relative px-5 sm:px-8 pt-16 sm:pt-24 pb-24 sm:pb-32">
        {/* single subtle top light — replaces the old gradient blur soup */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] [background:radial-gradient(ellipse_at_top,rgba(0,217,122,0.045),transparent_65%)]"
        />

        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-secondary mb-10">
              <span className="relative flex items-center justify-center w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-signal animate-ping opacity-50" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-signal" />
              </span>
              <span>JACOBI &middot; Adversarial pricing probe</span>
            </span>
          </motion.div>

          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-5xl sm:text-7xl lg:text-[88px] leading-[0.95] tracking-tight text-primary mb-7"
          >
            Find your{" "}
            <em className="not-italic relative inline-block">
              <span className="relative z-10 text-signal">hidden</span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-1 sm:bottom-2 h-[0.18em] bg-signal/15 rounded-sm -z-0"
              />
            </em>{" "}
            premium.
          </motion.h1>

          <motion.p
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-secondary text-base sm:text-lg max-w-xl mx-auto mb-12 leading-relaxed"
          >
            The internet charges different shoppers different prices for the same
            product. JACOBI deploys 24 synthetic identities to reveal exactly what
            the algorithm is charging{" "}
            <span className="text-primary">you</span> that it isn&rsquo;t
            charging someone else.
          </motion.p>

          {/* Hero — the URL input is the whole product surface */}
          <motion.form
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            onSubmit={(e) => {
              e.preventDefault();
              probe();
            }}
            className="max-w-2xl mx-auto"
          >
            <div className="group relative flex items-stretch bg-raised border border-line rounded-md focus-within:border-signal/45 transition-colors">
              <span className="flex items-center pl-4 sm:pl-5 pr-2 sm:pr-3 text-muted shrink-0">
                <Globe className="w-4 h-4" />
              </span>
              <input
                ref={inputRef}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste a URL — flight, hotel, or product page"
                aria-label="Paste a URL to probe"
                className="flex-1 bg-transparent py-4 sm:py-5 pr-2 text-primary placeholder-muted/80 outline-none text-sm sm:text-base font-mono caret-signal min-w-0"
              />
              <button
                type="submit"
                className="m-1.5 sm:m-2 inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md bg-signal text-ink font-mono text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.12em] hover:brightness-110 active:scale-[0.98] transition-all shrink-0"
              >
                Probe
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] font-mono text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-signal animate-pulse" />
                <span className="uppercase tracking-[0.16em] text-secondary">
                  Ready
                </span>
              </span>
              <span className="text-muted/60">&middot;</span>
              <span>24 agents on standby</span>
              <span className="text-muted/60">&middot;</span>
              <button
                type="button"
                onClick={() => probe(SAMPLE_URL)}
                className="text-secondary hover:text-signal transition-colors underline-offset-4 decoration-dotted hover:underline"
              >
                Try a sample probe &rarr;
              </button>
            </div>
          </motion.form>
        </div>

        {/* Trust strip — three claims, hairline-divided, no card chrome */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="max-w-4xl mx-auto mt-20 sm:mt-24 grid grid-cols-1 sm:grid-cols-3 border-y border-line"
        >
          <TrustItem
            primary="Bright Data"
            secondary="Live web infrastructure"
          />
          <TrustItem
            primary="24"
            secondary="Profile probes per URL"
            divider
          />
          <TrustItem
            primary="Evidence"
            secondary="Per-axis backed verdict"
            divider
          />
        </motion.div>
      </section>

      {/* ═══════════════════════ MECHANISM ═══════════════════════ */}
      <section className="px-5 sm:px-8 py-24 sm:py-32 border-t border-line">
        <div className="max-w-5xl mx-auto">
          <motion.span
            {...fadeIn}
            className="block font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-12"
          >
            The mechanism
          </motion.span>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-0">
            {[
              {
                n: "01",
                title: "One URL",
                body:
                  "You paste a flight, hotel, or product page. No login on the target site. No cookies on your side.",
              },
              {
                n: "02",
                title: "24 synthetic shoppers",
                body:
                  "JACOBI deploys 24 identities — different locations, devices, cookie profiles, referrers, network tiers — through Bright Data's residential infrastructure.",
              },
              {
                n: "03",
                title: "Hidden premium, exposed",
                body:
                  "We compute the spread, isolate which axis is driving the markup, and surface the verdict with evidence — not vibes.",
              },
            ].map((step, i) => (
              <motion.div
                key={step.n}
                initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{
                  duration: 0.6,
                  delay: i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`md:px-8 ${
                  i > 0 ? "md:border-l md:border-line" : ""
                }`}
              >
                <div className="font-mono text-[11px] text-signal mb-3 tracking-[0.18em]">
                  {step.n}
                </div>
                <h3 className="font-serif text-2xl sm:text-3xl text-primary mb-3 leading-tight">
                  {step.title}
                </h3>
                <p className="text-secondary text-sm leading-relaxed">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ AGENT SWARM ═══════════════════════ */}
      <section className="px-5 sm:px-8 py-24 sm:py-32 border-t border-line">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-10 sm:mb-12">
            <motion.div {...fadeIn}>
              <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-3">
                The swarm
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl text-primary leading-tight">
                Twenty-four shoppers. One URL.
              </h2>
            </motion.div>
            <motion.span
              {...fadeIn}
              transition={{
                duration: 0.5,
                delay: 0.08,
                ease: [0.22, 1, 0.36, 1] as const,
              }}
              className="text-[11px] font-mono text-muted tracking-[0.12em]"
            >
              4 axes &middot; 3 network tiers
            </motion.span>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-120px" }}
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: reducedMotion ? 0 : 0.028,
                  delayChildren: 0.1,
                },
              },
            }}
            className="grid grid-cols-6 gap-1.5 sm:gap-2 mb-10"
            role="group"
            aria-label="Agent swarm — 24 synthetic shopper fingerprints"
          >
            {SWARM.map((a, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, scale: 0.85 },
                  visible: {
                    opacity: 1,
                    scale: 1,
                    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                  },
                }}
                title={`${a.tier} · ${a.label} — ${a.note}`}
                className="aspect-square flex flex-col items-center justify-center rounded-sm bg-raised border border-line p-1 hover:border-signal/35 transition-colors"
              >
                <span className="font-mono text-[7px] sm:text-[8px] text-muted leading-none mb-1">
                  {a.tier}
                </span>
                <span className="font-mono text-[9px] sm:text-[11px] text-secondary leading-none truncate w-full text-center">
                  {a.label}
                </span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            {...fadeIn}
            transition={{
              duration: 0.5,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
            className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-3 text-[12px] font-mono"
          >
            <AxisLegend
              icon={<Globe className="w-3.5 h-3.5" />}
              label="Location"
              count={AXIS_COUNT.loc}
            />
            <AxisLegend
              icon={<Smartphone className="w-3.5 h-3.5" />}
              label="Device"
              count={AXIS_COUNT.dev}
            />
            <AxisLegend
              icon={<Cookie className="w-3.5 h-3.5" />}
              label="Cookies"
              count={AXIS_COUNT.cookie}
            />
            <AxisLegend
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              label="Referrer"
              count={AXIS_COUNT.ref}
            />
            <AxisLegend
              icon={<Wifi className="w-3.5 h-3.5" />}
              label="Controls"
              count={AXIS_COUNT.ctrl}
            />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════ EVIDENCE / SAMPLE PROBE ═══════════════════════ */}
      <section className="px-5 sm:px-8 py-24 sm:py-32 border-t border-line">
        <div className="max-w-5xl mx-auto">
          <motion.span
            {...fadeIn}
            className="block font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-3"
          >
            Evidence &middot; sample probe
          </motion.span>
          <motion.h2
            {...fadeIn}
            transition={{
              duration: 0.5,
              delay: 0.05,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
            className="font-serif text-3xl sm:text-4xl text-primary mb-2 leading-tight"
          >
            UA182 / JFK &rarr; LHR
          </motion.h2>
          <motion.p
            {...fadeIn}
            transition={{
              duration: 0.5,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
            className="text-[12px] font-mono text-muted mb-12 tracking-wide"
          >
            Same flight. Same seat. Same date. Five different identities.
          </motion.p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-center">
            <div className="space-y-5">
              {DEMO_PROFILES.map((p, i) => {
                const isCheapest = p.price === cheapest;
                const isDearest = p.price === dearest;
                const widthPct =
                  ((p.price - cheapest) / (dearest - cheapest)) * 100;
                const barColor = isCheapest
                  ? "bg-signal"
                  : isDearest
                  ? "bg-overcharge"
                  : "bg-secondary/40";
                const priceColor = isCheapest
                  ? "text-signal"
                  : isDearest
                  ? "text-overcharge"
                  : "text-secondary";

                return (
                  <motion.div
                    key={i}
                    initial={
                      reducedMotion ? false : { opacity: 0, x: -10 }
                    }
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{
                      duration: 0.5,
                      delay: i * 0.07,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="grid grid-cols-[1fr_auto] gap-4 sm:gap-6 items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-mono text-[11px] sm:text-[12px] text-secondary mb-2">
                        <span>{p.profile}</span>
                        {isCheapest && (
                          <span className="text-[9px] text-signal uppercase tracking-[0.18em]">
                            baseline
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                        <motion.div
                          initial={
                            reducedMotion
                              ? { width: `${Math.max(6, widthPct)}%` }
                              : { width: 0 }
                          }
                          whileInView={{
                            width: `${Math.max(6, widthPct)}%`,
                          }}
                          viewport={{ once: true, margin: "-100px" }}
                          transition={{
                            duration: 0.9,
                            delay: 0.25 + i * 0.07,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className={`h-full ${barColor}`}
                        />
                      </div>
                    </div>
                    <div
                      className={`font-mono text-base sm:text-lg tabular-nums ${priceColor}`}
                    >
                      ${p.price}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <motion.aside
              {...fadeIn}
              transition={{
                duration: 0.6,
                delay: 0.3,
                ease: [0.22, 1, 0.36, 1] as const,
              }}
              className="lg:border-l lg:border-line lg:pl-12 text-center lg:text-left"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-overcharge mb-3">
                Hidden premium
              </div>
              <div className="font-serif text-7xl sm:text-8xl text-primary leading-none mb-3 tabular-nums">
                +${spread}
              </div>
              <div className="font-mono text-[11px] text-muted tracking-wide mb-6">
                {spreadPct}% over baseline &middot; per ticket
              </div>
              <p className="text-sm text-secondary leading-relaxed max-w-xs mx-auto lg:mx-0">
                iPhone users in Manhattan paid{" "}
                <span className="text-overcharge font-medium">$142 more</span>{" "}
                than Android users in rural Iowa for the same seat on the same
                flight.
              </p>
            </motion.aside>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ CTA ═══════════════════════ */}
      <section className="px-5 sm:px-8 py-24 sm:py-32 border-t border-line">
        <div className="max-w-2xl mx-auto text-center">
          <motion.h2
            {...fadeIn}
            className="font-serif text-4xl sm:text-5xl text-primary mb-4 leading-tight"
          >
            Find what you&rsquo;re overpaying.
          </motion.h2>
          <motion.p
            {...fadeIn}
            transition={{
              duration: 0.5,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1] as const,
            }}
            className="text-secondary mb-10"
          >
            One URL. 24 shoppers. The truth in under a minute.
          </motion.p>
          <motion.button
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.5,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            onClick={() => {
              inputRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
              setTimeout(() => inputRef.current?.focus(), 350);
            }}
            className="inline-flex items-center gap-3 px-7 py-4 rounded-md bg-signal text-ink font-mono text-[12px] font-semibold uppercase tracking-[0.14em] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Probe a URL
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </section>

      {/* ═══════════════════════ FOOTER ═══════════════════════ */}
      <footer className="px-5 sm:px-8 py-10 border-t border-line">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-primary tracking-wider">
              JACOBI
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              pricing transparency
            </span>
          </div>
          <div className="flex items-center gap-6 text-[11px] font-mono">
            <Link
              href="/chat"
              className="text-secondary hover:text-primary transition-colors"
            >
              Probe
            </Link>
            <Link
              href="/history"
              className="text-secondary hover:text-primary transition-colors"
            >
              History
            </Link>
            <Link
              href="/pricing"
              className="text-secondary hover:text-primary transition-colors"
            >
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ─── Small presentational helpers (file-local) ─────────────────────── */

function TrustItem({
  primary,
  secondary,
  divider = false,
}: {
  primary: string;
  secondary: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`px-6 py-7 text-center ${
        divider ? "sm:border-l sm:border-line" : ""
      }`}
    >
      <div className="font-serif text-2xl text-primary leading-none mb-2">
        {primary}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        {secondary}
      </div>
    </div>
  );
}

function AxisLegend({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-signal/70 shrink-0">{icon}</span>
      <span className="text-secondary">{label}</span>
      <span className="text-muted/60">&middot;</span>
      <span className="text-primary tabular-nums">{count}</span>
    </div>
  );
}
