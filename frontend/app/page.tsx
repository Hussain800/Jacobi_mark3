"use client";

/**
 * Landing page composition — Phase 8 Claude Design port.
 *
 * Section flow:
 *   1. Hero (HeroScene)
 *   2. Stat band — 4 animated counter stats
 *   3. Mechanism — eyebrow + display title + 4-phase card grid
 *   4. Evidence — UA182 sample probe, 5-row breakdown + verdict aside
 *   5. Why — quote callout, "pricing discrimination is the norm"
 *   6. CTA — cobalt aura, full probe instrument
 *
 * The /chat?url=<encoded> routing contract is preserved end-to-end.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, useInView } from "framer-motion";
import { ArrowRight, Target, Radio, Sparkles, Gavel } from "lucide-react";
import HeroScene from "../components/landing/HeroScene";

/* ─── Static evidence sample (UA182) ──────────────────────────────── */

const DEMO_PROFILES = [
  { profile: "iPhone · Manhattan · direct",        price: 642, tag: "top" as const },
  { profile: "Safari · Tokyo · direct",            price: 612 },
  { profile: "Edge · London · direct",             price: 596 },
  { profile: "Firefox · Bangalore · VPN",          price: 512 },
  { profile: "Chrome · Rural Iowa · VPN",          price: 498, tag: "baseline" as const },
];

/* ─── Stat counter hook ───────────────────────────────────────────── */

function useCountUp(target: number, duration = 1600, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    function tick(now: number) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

function Stat({ value, prefix, suffix, label }: { value: number; prefix?: string; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const v = useCountUp(value, 1800, inView);
  return (
    <div ref={ref} data-reveal>
      <div className="text-primary font-serif leading-none tabular-nums tracking-[-0.02em]"
        style={{ fontSize: "clamp(30px, 4vw, 52px)" }}
      >
        {prefix && <span className="text-muted">{prefix}</span>}
        {v.toLocaleString()}
        {suffix && <span className="text-muted">{suffix}</span>}
      </div>
      <div className="mt-2.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [ctaUrl, setCtaUrl] = useState("");

  const handleCta = useCallback(() => {
    let raw = ctaUrl.trim();
    if (!raw) {
      document.getElementById("jacobi-probe-input")?.focus();
      document.getElementById("jacobi-hero")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    router.push(`/chat?url=${encodeURIComponent(raw)}`);
  }, [ctaUrl, router]);

  const reveal = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <main className="bg-[#06070c] text-primary">
      {/* ═════════════ HERO ═════════════ */}
      <HeroScene />

      {/* ═════════════ STAT BAND ═════════════ */}
      <section className="border-t border-line py-11">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12 grid grid-cols-2 sm:grid-cols-4 gap-7 sm:gap-7">
          <Stat value={1247892} label="URLs investigated" />
          <Stat value={4823450} prefix="$" label="Overcharges exposed" />
          <Stat value={73} suffix="%" label="Sites pricing by device" />
          <Stat value={24} label="Identities per probe" />
        </div>
      </section>

      {/* ═════════════ MECHANISM ═════════════ */}
      <section className="border-t border-line" style={{ padding: "clamp(72px, 11vw, 150px) 0" }} id="mechanism">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12">
          <motion.div {...reveal} className="max-w-[660px] mb-14">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
              <span className="text-cobalt">●</span> The mechanism
            </span>
            <h2
              className="mt-4 text-primary"
              style={{
                fontFamily: "var(--sans)",
                fontWeight: 600,
                fontSize: "clamp(32px, 4.6vw, 60px)",
                letterSpacing: "-0.03em",
                lineHeight: 0.98,
              }}
            >
              The anatomy of a{" "}
              <span
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--cobalt-bright)",
                  fontWeight: 400,
                }}
              >
                probe
              </span>
            </h2>
            <p className="mt-4 text-secondary max-w-[520px]" style={{ fontSize: "16px" }}>
              Watch the price disassemble. Each axis of your digital identity peels
              away to reveal what was actually driving the&nbsp;markup.
            </p>
          </motion.div>

          {/* 4-phase card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { n: "01", icon: Target,   title: "Submit your target",  body: "Drop any product, flight, or booking URL into the scanner. If it carries a price tag, JACOBI can find its real range." },
              { n: "02", icon: Radio,    title: "The swarm launches",  body: "24 identities disperse across four discrimination axes — location, device, cookies, referrer — striking the URL in coordinated waves." },
              { n: "03", icon: Sparkles, title: "Patterns emerge",     body: "Every response is cross-referenced. Statistical outliers become evidence. Pricing bias becomes readable data." },
              { n: "04", icon: Gavel,    title: "Read the verdict",    body: "A plain-English breakdown of what you'd save with a different profile — and exactly which vector was used to overcharge you." },
            ].map((p, i) => (
              <motion.article
                key={p.n}
                initial={reducedMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.85, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-[11px] border border-line hover:border-cobalt-line p-7 pb-8 min-h-[296px] flex flex-col transition-[border-color,transform] duration-500 hover:-translate-y-1"
                style={{
                  background: "linear-gradient(180deg, var(--surface), var(--ink-2))",
                }}
              >
                {/* hairline top accent */}
                <span
                  aria-hidden
                  className="absolute top-0 left-[18px] right-[18px] h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, #36405230, transparent)",
                  }}
                />
                <div
                  className="font-mono text-cobalt-bright"
                  style={{ fontSize: "12px", letterSpacing: "0.2em" }}
                >
                  {p.n}
                </div>
                <div className="my-5 text-cobalt-bright">
                  <p.icon className="w-9 h-9" strokeWidth={1.4} />
                </div>
                <h3 className="text-primary" style={{ fontSize: "19px", fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {p.title}
                </h3>
                <p className="mt-2.5 text-secondary" style={{ fontSize: "14px", lineHeight: 1.6 }}>
                  {p.body}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ═════════════ EVIDENCE ═════════════ */}
      <section className="border-t border-line" style={{ padding: "clamp(72px, 11vw, 150px) 0" }} id="evidence">
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12">
          <motion.div {...reveal} className="max-w-[660px] mb-14">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
              <span className="text-cobalt">●</span> Evidence · full readout
            </span>
            <h2
              className="mt-4 text-primary"
              style={{
                fontFamily: "var(--sans)",
                fontWeight: 600,
                fontSize: "clamp(32px, 4.6vw, 60px)",
                letterSpacing: "-0.03em",
                lineHeight: 0.98,
              }}
            >
              UA182{" "}
              <span style={{ color: "var(--text-3)", fontWeight: 500 }}>
                JFK&nbsp;→&nbsp;LHR
              </span>
            </h2>
            <p className="mt-4 text-secondary max-w-[520px]" style={{ fontSize: "16px" }}>
              Five identities, five prices. The same seat on the same flight — and the gap between them.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_366px] gap-12 items-start">
            {/* Breakdown rows */}
            <div className="flex flex-col gap-[19px]">
              {DEMO_PROFILES.map((p, i) => {
                const cheapest = Math.min(...DEMO_PROFILES.map((d) => d.price));
                const dearest = Math.max(...DEMO_PROFILES.map((d) => d.price));
                const fillPct = ((p.price - cheapest) / (dearest - cheapest)) * 100;
                const fillColor =
                  p.tag === "baseline" ? "var(--good)" :
                  p.tag === "top"      ? "var(--over)" :
                                         "var(--text-3)";
                return (
                  <motion.div
                    key={i}
                    initial={reducedMotion ? false : { opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    className="grid grid-cols-[1fr_auto] gap-5 items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-[12.5px] text-secondary">
                          {p.profile}
                        </span>
                        {p.tag === "baseline" && (
                          <span
                            className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full border text-signal"
                            style={{ borderColor: "rgba(52, 211, 155, 0.40)" }}
                          >
                            baseline
                          </span>
                        )}
                        {p.tag === "top" && (
                          <span
                            className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full border text-overcharge"
                            style={{ borderColor: "rgba(255, 84, 104, 0.32)" }}
                          >
                            top
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <motion.div
                          initial={reducedMotion ? { width: `${Math.max(6, fillPct)}%` } : { width: 0 }}
                          whileInView={{ width: `${Math.max(6, fillPct)}%` }}
                          viewport={{ once: true, margin: "-100px" }}
                          transition={{ duration: 1.0, delay: 0.25 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                          className="h-full rounded-full"
                          style={{ background: fillColor }}
                        />
                      </div>
                    </div>
                    <div
                      className="font-mono tabular-nums text-[17px]"
                      style={{
                        color: p.tag === "baseline" ? "var(--good)" : p.tag === "top" ? "var(--over)" : "var(--text-2)",
                      }}
                    >
                      ${p.price}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Verdict aside */}
            <motion.aside
              initial={reducedMotion ? false : { opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[11px] border border-line p-8"
              style={{ background: "linear-gradient(180deg, var(--surface), var(--ink-2))" }}
            >
              <span
                className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] px-3.5 py-1.5 rounded-full mb-7"
                style={{
                  color: "#ff9d52",
                  border: "1px solid rgba(255,157,82,0.34)",
                  background: "rgba(255,157,82,0.08)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "#ff9d52", boxShadow: "0 0 8px rgba(255,157,82,0.6)" }}
                />
                Progressive
              </span>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted mb-1">
                Hidden premium
              </div>
              <div
                className="font-serif text-primary leading-none tabular-nums"
                style={{ fontSize: "clamp(44px, 6vw, 66px)" }}
              >
                +$144
              </div>
              <div className="font-mono text-[12px] text-muted mt-2">
                29% over baseline · per ticket
              </div>

              <div className="mt-7">
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
                    Discrimination index
                  </span>
                  <span className="font-mono text-[14px] text-primary tabular-nums">
                    71<span className="text-muted">/100</span>
                  </span>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full mt-3 overflow-hidden">
                  <motion.div
                    initial={reducedMotion ? { width: "71%" } : { width: 0 }}
                    whileInView={{ width: "71%" }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 1.3, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full"
                    style={{
                      background: "linear-gradient(90deg, var(--cobalt), #ff9d52, var(--over))",
                    }}
                  />
                </div>
              </div>

              <p className="mt-7 text-secondary" style={{ fontSize: "14px", lineHeight: 1.66 }}>
                An <span className="text-overcharge">iPhone in Manhattan</span> paid{" "}
                <span className="text-overcharge">$144 more</span> than an{" "}
                <span className="text-signal">Android in rural Iowa</span> — same
                cabin, same date. The driver was{" "}
                <strong className="text-primary font-semibold">location</strong>.
              </p>
            </motion.aside>
          </div>
        </div>
      </section>

      {/* ═════════════ WHY ═════════════ */}
      <section
        className="border-t border-line relative"
        style={{ padding: "clamp(72px, 11vw, 150px) 0" }}
        id="why"
      >
        {/* faint grid backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, #000 0%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, #000 0%, transparent 78%)",
          }}
        />
        <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div {...reveal}>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
              <span className="text-cobalt">●</span> Why it matters
            </span>
            <h2
              className="mt-4 text-primary"
              style={{
                fontFamily: "var(--sans)",
                fontWeight: 600,
                fontSize: "clamp(34px, 5vw, 62px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              Pricing discrimination
              <br />
              is the{" "}
              <span
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--cobalt-bright)",
                  fontWeight: 400,
                }}
              >
                norm
              </span>
              .
            </h2>
            <p className="mt-5 text-secondary max-w-[460px]" style={{ fontSize: "16px" }}>
              Companies build algorithms to read your willingness to pay from your browser.
              JACOBI makes those algorithms&nbsp;visible.
            </p>
          </motion.div>

          <motion.figure
            initial={reducedMotion ? false : { opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-[11px] border border-line p-10"
            style={{ background: "linear-gradient(180deg, var(--surface), var(--ink-2))" }}
          >
            <blockquote
              className="text-primary italic"
              style={{
                fontFamily: "var(--serif)",
                fontSize: "clamp(22px, 2.7vw, 31px)",
                lineHeight: 1.4,
                fontWeight: 400,
              }}
            >
              &ldquo;Two people, same booking, same seats — separated by $60 and a browser&nbsp;setting.&rdquo;
            </blockquote>
            <figcaption className="mt-7 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
              — verified across 12,000+ probes
            </figcaption>
          </motion.figure>
        </div>
      </section>

      {/* ═════════════ CTA ═════════════ */}
      <section
        className="border-t border-line text-center relative overflow-hidden"
        style={{ padding: "clamp(72px, 11vw, 150px) 0" }}
        id="cta"
      >
        <div
          aria-hidden
          className="absolute left-1/2 z-0 pointer-events-none"
          style={{
            top: "30%",
            width: "700px",
            height: "360px",
            transform: "translate(-50%, -30%)",
            background:
              "radial-gradient(ellipse, rgba(61,107,255,0.16), transparent 65%)",
            filter: "blur(20px)",
          }}
        />
        <div className="relative z-[1] max-w-[780px] mx-auto px-5 sm:px-8">
          <motion.h2
            {...reveal}
            className="text-primary"
            style={{
              fontFamily: "var(--sans)",
              fontWeight: 600,
              fontSize: "clamp(34px, 5.5vw, 68px)",
              letterSpacing: "-0.035em",
              lineHeight: 0.98,
            }}
          >
            Stop being{" "}
            <span className="text-overcharge">priced</span>. Start{" "}
            <span
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                color: "var(--cobalt-bright)",
                fontWeight: 400,
              }}
            >
              probing
            </span>
            .
          </motion.h2>
          <motion.p
            {...reveal}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 mb-9 text-secondary"
            style={{ fontFamily: "var(--mono)", fontSize: "14px" }}
          >
            Two million URLs investigated. Zero cost to you. Paste your first target.
          </motion.p>

          <motion.form
            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              handleCta();
            }}
            className="mx-auto w-full max-w-[560px] text-left"
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
                  style={{ fontSize: "14px", lineHeight: 0.8 }}
                >
                  ⌖
                </span>
                24 agents
              </span>
              <input
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="paste a URL to launch the probe"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-primary italic placeholder:italic placeholder:text-muted placeholder:opacity-90 font-light"
                style={{ fontFamily: "var(--mono)", fontSize: "15px" }}
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
                Launch probe
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
        </div>
      </section>

      {/* ═════════════ FOOTER ═════════════ */}
      <footer className="border-t border-line" style={{ padding: "64px 0 40px" }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-primary"
                style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.18em" }}
              >
                JACOBI
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
                pricing forensics
              </span>
            </div>
            <p
              className="mt-4 max-w-[340px] text-secondary"
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: "clamp(18px, 2vw, 22px)",
                lineHeight: 1.4,
              }}
            >
              Twenty-four shoppers. One URL. The truth about what you pay.
            </p>
          </div>
          <div className="flex items-center gap-8 font-mono text-[13px]">
            <Link href="/chat"        className="text-secondary hover:text-primary transition-colors">Probe</Link>
            <Link href="/history"     className="text-secondary hover:text-primary transition-colors">History</Link>
            <Link href="/leaderboard" className="text-secondary hover:text-primary transition-colors">Board</Link>
            <Link href="/pricing"     className="text-secondary hover:text-primary transition-colors">Pricing</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
