"use client";

/**
 * Landing page composition.
 *
 * The hero is owned by <HeroScene/> — a self-driving cinematic that auto-plays
 * a sample probe (idle → focus → deploy → result) and routes user input to
 * /chat?url=<encoded>. The rest of this file holds the lower-fold sections:
 * mechanism (3 steps), evidence (UA182 sample probe table), CTA, footer.
 *
 * The standalone "agent swarm" section was removed in Phase 1.5 — the swarm
 * now lives inside the hero where it tells a story instead of decorating.
 */

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import HeroScene from "../components/landing/HeroScene";

/* ─── Static evidence sample (unchanged from Phase 1) ──────────────── */

const DEMO_PROFILES = [
  { profile: "iPhone · Manhattan · direct",     price: 640 },
  { profile: "Safari · Tokyo · direct",          price: 625 },
  { profile: "Edge · London · direct",           price: 590 },
  { profile: "Firefox · Bangalore · VPN",        price: 512 },
  { profile: "Chrome · Rural Iowa · VPN",        price: 498 },
];

/* ─── Page ─────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const reducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);

  const fadeIn = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
      };

  const cheapest = Math.min(...DEMO_PROFILES.map((p) => p.price));
  const dearest = Math.max(...DEMO_PROFILES.map((p) => p.price));
  const spread = dearest - cheapest;
  const spreadPct = Math.round((spread / cheapest) * 100);

  return (
    <main className="min-h-screen bg-ink text-primary font-sans selection:bg-signal/20">
      {/* ═════════════ HERO (cinematic scene) ═════════════ */}
      <div ref={heroRef}>
        <HeroScene />
      </div>

      {/* ═════════════ MECHANISM ═════════════ */}
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

      {/* ═════════════ EVIDENCE / sample probe ═════════════ */}
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

      {/* ═════════════ CTA ═════════════ */}
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
              heroRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            className="inline-flex items-center gap-3 px-7 py-4 rounded-md bg-signal text-ink font-mono text-[12px] font-semibold uppercase tracking-[0.14em] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Probe a URL
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </section>

      {/* ═════════════ FOOTER ═════════════ */}
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
