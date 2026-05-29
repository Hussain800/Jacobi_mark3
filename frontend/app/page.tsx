"use client";

/**
 * Landing page — Phase B faithful Claude Design integration.
 *
 * Same DOM/CSS as /design-preview, but:
 *   - chrome.js + landing.js are no longer loaded; their nav/footer/reveal/
 *     counter/typed behaviors are owned by React components / hooks here.
 *   - Hero form + CTA form submit to /chat?url=<encoded URL>.
 *   - Nav links route to real Next.js paths (/chat, /history, /leaderboard,
 *     /pricing) and reflect active route via usePathname.
 *   - Sign-in is wired to Supabase OAuth via DesignNavAuth.
 *   - scene.js (WebGL bg) + globe.js (Three.js earth) + Three.js CDN
 *     still load verbatim from /public.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import "./jacobi-design.css";
import DesignNav from "../components/design/DesignNav";
import DesignFooter from "../components/design/DesignFooter";
import {
  useCounters,
  useEvidenceBars,
  useEvidenceIndexFill,
  useGlobe,
  useMechScroll,
  useReveals,
  useTyped,
} from "../components/design/landing-interactions";

/* ─── Phase card icons (ported from landing.js's ICONS map) ───────── */

const PhaseIcons = {
  target: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="16" cy="16" r="11" />
      <circle cx="16" cy="16" r="6" />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" stroke="none" />
      <path d="M16 1v6M16 25v6M1 16h6M25 16h6" strokeLinecap="round" />
    </svg>
  ),
  swarm: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="16" cy="16" r="3" />
      <circle cx="6" cy="7" r="2" />
      <circle cx="26" cy="7" r="2" />
      <circle cx="6" cy="25" r="2" />
      <circle cx="26" cy="25" r="2" />
      <path d="M8 8.5 13.5 14M24 8.5 18.5 14M8 23.5 13.5 18M24 23.5 18.5 18" strokeLinecap="round" />
    </svg>
  ),
  patterns: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 24 11 15l5 4 8-11" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="15" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="19" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="24" cy="8" r="1.8" fill="currentColor" stroke="none" />
      <path d="M4 28h24" strokeLinecap="round" opacity=".4" />
    </svg>
  ),
  verdict: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M16 3 27 8v8c0 7-4.6 11-11 13C9.6 27 5 23 5 16V8z" strokeLinejoin="round" />
      <path d="M11 16l3.5 3.5L21 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/* ─── Evidence sample (verbatim from landing.js evidence()) ───────── */

const EVIDENCE_SAMPLE: Array<{
  profile: string;
  price: number;
  state: "over" | "good" | "normal";
  tag?: "top" | "baseline";
}> = [
  { profile: "iPhone · Manhattan · direct", price: 642, state: "over",   tag: "top" },
  { profile: "Safari · Tokyo · direct",     price: 612, state: "normal" },
  { profile: "Edge · London · direct",      price: 596, state: "normal" },
  { profile: "Firefox · Bangalore · VPN",   price: 512, state: "normal" },
  { profile: "Chrome · rural Iowa · VPN",   price: 498, state: "good",   tag: "baseline" },
];

const EV_LO = Math.min(...EVIDENCE_SAMPLE.map((s) => s.price));
const EV_HI = Math.max(...EVIDENCE_SAMPLE.map((s) => s.price));
const evColorFor = (s: "over" | "good" | "normal") =>
  s === "over" ? "var(--over)" : s === "good" ? "var(--good)" : "rgba(151,160,177,0.55)";
const evPriceColorFor = (s: "over" | "good" | "normal") =>
  s === "over" ? "var(--over)" : s === "good" ? "var(--good)" : "var(--text-2)";

export default function LandingPage() {
  const router = useRouter();
  const heroInputRef = useRef<HTMLInputElement>(null);
  const ctaInputRef  = useRef<HTMLInputElement>(null);
  const [heroUrl, setHeroUrl] = useState("");
  const [ctaUrl,  setCtaUrl]  = useState("");

  /* Mount the design-prototype interactions on this page.
     Each hook respects prefers-reduced-motion. */
  useReveals();
  useCounters();
  useTyped();
  useGlobe();
  useMechScroll();
  useEvidenceBars();
  useEvidenceIndexFill();

  const launch = useCallback(
    (raw: string) => {
      let v = raw.trim();
      if (!v) return false;
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
      router.push(`/chat?url=${encodeURIComponent(v)}`);
      return true;
    },
    [router],
  );

  return (
    <div className="jacobi-design">
      {/* Three.js global — must load before globe.js */}
      <Script
        src="https://unpkg.com/three@0.150.1/build/three.min.js"
        strategy="afterInteractive"
      />
      {/* scene.js paints the WebGL background; globe.js exposes
          window.JacobiGlobe used by useGlobe(); effects.js adds the
          dual-element cursor, magnetic primary CTAs, hero parallax,
          and [data-tilt] tilt. */}
      <Script src="/jacobi-design/scene.js"    strategy="afterInteractive" />
      <Script src="/jacobi-design/globe-v2.js" strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js"  strategy="afterInteractive" />

      <DesignNav />

      {/* ════════════ HERO ════════════ */}
      <header className="hero" id="hero">
        <div className="hero-grid wrap">
          <div className="hero-copy">
            <div className="chip" data-reveal>
              <span className="pulse" />{" "}
              24 identities · 4 vectors · evidence-grade
            </div>

            <h1 className="hero-h1" data-reveal>
              Your browser is a{" "}
              <span className="serif-i hero-accent">bargaining&nbsp;tool</span>
              <span className="hero-sub-rule" />
            </h1>

            <p className="hero-typed mono" data-reveal>
              <span id="typed" />
              <span className="caret">▌</span>
            </p>

            <p className="hero-para sec" data-reveal>
              JACOBI deploys 24 shopper profiles against your URL and
              surfaces the pricing&nbsp;discrimination algorithms hide behind
              your digital&nbsp;fingerprint.
            </p>

            <form
              className="probe-instrument"
              data-reveal
              id="probe-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!launch(heroUrl)) heroInputRef.current?.focus();
              }}
            >
              <div className="pi-row">
                <span className="pi-meta">
                  <span className="pi-glyph">⌖</span> 24 agents
                </span>
                <input
                  ref={heroInputRef}
                  id="probe-input"
                  className="pi-input"
                  type="text"
                  inputMode="url"
                  value={heroUrl}
                  onChange={(e) => setHeroUrl(e.target.value)}
                  placeholder="paste a flight, hotel or product URL"
                  spellCheck="false"
                  autoComplete="off"
                  aria-label="Paste a URL to probe"
                />
                <button className="pi-submit" type="submit">
                  Inspect <span className="pi-arrow">→</span>
                </button>
              </div>
              <span className="pi-rule" />
            </form>

            <div className="hero-proof label-mono" data-reveal>
              4 discrimination vectors <span className="sep">·</span>{" "}
              verdict in seconds <span className="sep">·</span>{" "}
              no login required
            </div>
          </div>

          {/* globe */}
          <div className="globe-stage" id="globe-stage" aria-hidden="true">
            <canvas id="globe" className="globe-canvas" />
            <div className="globe-readout mono">
              <div className="gr-row">
                <span className="gr-led" />
                <span id="gr-status">deploying identities</span>
              </div>
              <div className="gr-row gr-count">
                <span id="gr-count">00</span>
                <span className="gr-of">/ 24 live</span>
              </div>
              <div className="gr-meta">JFK → LHR · UA182 · residential mesh</div>
            </div>
          </div>
        </div>

        <div className="hero-scrollcue label-mono">
          <span>scroll</span>
          <span className="cue-line" />
        </div>
      </header>

      {/* ════════════ STAT BAND — honest, no fake aggregate numbers ═════════════ */}
      <section className="statband divider-top">
        <div className="wrap statband-grid">
          <div className="stat" data-reveal>
            <div className="stat-num tnum">
              <span data-count="24">0</span>
            </div>
            <div className="label-mono">Identities per probe</div>
          </div>
          <div className="stat" data-reveal>
            <div className="stat-num tnum">
              <span data-count="4">0</span>
            </div>
            <div className="label-mono">Discrimination vectors</div>
          </div>
          <div className="stat" data-reveal>
            <div className="stat-num tnum">
              <span data-count="3">0</span>
            </div>
            <div className="label-mono">Network tiers</div>
          </div>
          <div className="stat" data-reveal>
            <div className="stat-num serif" style={{ color: "var(--cobalt-bright)" }}>
              ~60s
            </div>
            <div className="label-mono">Typical probe time</div>
          </div>
        </div>
      </section>

      {/* ════════════ MECHANISM ════════════ */}
      <section className="section divider-top" id="mechanism">
        <div className="wrap">
          <div className="sec-head" data-reveal>
            <span className="eyebrow">
              <span className="dot">●</span> The mechanism
            </span>
            <h2 className="display sec-title">
              The anatomy of a{" "}
              <span className="serif-i" style={{ color: "var(--cobalt-bright)" }}>
                probe
              </span>
            </h2>
            <p className="sec-lede sec">
              Watch the price disassemble. Each axis of your digital identity
              peels away to reveal what was actually driving the&nbsp;markup.
            </p>
          </div>

          <div className="mech-scene" id="mech-scene">
            <div className="mech-pin">
              <div className="mech-stack" id="mech-stack">
                <div className="mech-layer l1">
                  <div className="ml-head">
                    <span className="ml-tag">surface</span>
                    <span className="ml-name">what you see</span>
                  </div>
                  <div className="ml-body">
                    <div className="ml-axis">$640</div>
                    <div className="ml-detail">
                      UA182 · JFK → LHR · the price on your screen
                    </div>
                  </div>
                </div>
                <div className="mech-layer l2">
                  <div className="ml-head">
                    <span className="ml-tag">layer 01 · location</span>
                    <span className="ml-name">IP geolocation</span>
                  </div>
                  <div className="ml-body">
                    <div className="ml-axis serif-i">Manhattan</div>
                    <div className="ml-detail">
                      high-income · low elasticity →{" "}
                      <span className="ml-delta-up">+41% premium</span>
                    </div>
                  </div>
                  <div className="ml-price">
                    $640 <span className="muted">← $454 baseline</span>
                  </div>
                </div>
                <div className="mech-layer l3">
                  <div className="ml-head">
                    <span className="ml-tag">layer 02 · device</span>
                    <span className="ml-name">user-agent · canvas</span>
                  </div>
                  <div className="ml-body">
                    <div className="ml-axis serif-i">iPhone 15 Pro</div>
                    <div className="ml-detail">
                      premium device →{" "}
                      <span className="ml-delta-up">+13% premium</span>
                    </div>
                  </div>
                  <div className="ml-price">– $24 on Android</div>
                </div>
                <div className="mech-layer l4">
                  <div className="ml-head">
                    <span className="ml-tag">layer 03 · cookies</span>
                    <span className="ml-name">visit history</span>
                  </div>
                  <div className="ml-body">
                    <div className="ml-axis serif-i">Aged · 90-day</div>
                    <div className="ml-detail">
                      loyalty cohort →{" "}
                      <span className="ml-delta-up">+4% loyalty tax</span>
                    </div>
                  </div>
                  <div className="ml-price">– $11 on a fresh session</div>
                </div>
                <div className="mech-layer l5">
                  <div className="ml-head">
                    <span className="ml-tag">layer 04 · referrer</span>
                    <span className="ml-name">traffic source</span>
                  </div>
                  <div className="ml-body">
                    <div className="ml-axis serif-i">Direct</div>
                    <div className="ml-detail">
                      no comparison signal →{" "}
                      <span className="ml-delta-up">+5% direct premium</span>
                    </div>
                  </div>
                  <div className="ml-price">– $17 from Kayak</div>
                </div>
              </div>

              <div className="mech-progress" aria-hidden="true">
                <span data-step="0">surface</span>
                <span data-step="1">location</span>
                <span data-step="2">device</span>
                <span data-step="3">cookies</span>
                <span data-step="4">referrer</span>
              </div>

              <div className="mech-caption" aria-hidden="true">
                <strong>Scroll.</strong> The price you see is five decisions
                deep. JACOBI peels them&nbsp;back.
              </div>
            </div>
          </div>

          <div className="phases" style={{ marginTop: "40px" }}>
            <div className="phase card card-hairtop" data-reveal>
              <div className="phase-n mono">01</div>
              <div className="phase-ico" data-ico="target">{PhaseIcons.target}</div>
              <h3 className="phase-title">Submit your target</h3>
              <p className="phase-body sec">
                Drop any product, flight, or booking URL into the scanner. If
                it carries a price tag, JACOBI can find its real range.
              </p>
            </div>
            <div className="phase card card-hairtop" data-reveal>
              <div className="phase-n mono">02</div>
              <div className="phase-ico" data-ico="swarm">{PhaseIcons.swarm}</div>
              <h3 className="phase-title">The swarm launches</h3>
              <p className="phase-body sec">
                24 identities disperse across four discrimination axes —
                location, device, cookies, referrer — striking the URL in
                coordinated waves.
              </p>
            </div>
            <div className="phase card card-hairtop" data-reveal>
              <div className="phase-n mono">03</div>
              <div className="phase-ico" data-ico="patterns">{PhaseIcons.patterns}</div>
              <h3 className="phase-title">Patterns emerge</h3>
              <p className="phase-body sec">
                Every response is cross-referenced. Statistical outliers
                become evidence. Pricing bias becomes readable data.
              </p>
            </div>
            <div className="phase card card-hairtop" data-reveal>
              <div className="phase-n mono">04</div>
              <div className="phase-ico" data-ico="verdict">{PhaseIcons.verdict}</div>
              <h3 className="phase-title">Read the verdict</h3>
              <p className="phase-body sec">
                A plain-English breakdown of what you'd save with a different
                profile — and exactly which vector was used to overcharge&nbsp;you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ EVIDENCE ════════════ */}
      <section className="section divider-top" id="evidence">
        <div className="wrap">
          <div className="sec-head" data-reveal>
            <span className="eyebrow">
              <span className="dot">●</span> Evidence · full readout
            </span>
            <h2 className="display sec-title">
              UA182 &nbsp;
              <span className="muted" style={{ fontWeight: 500 }}>
                JFK → LHR
              </span>
            </h2>
            <p className="sec-lede sec">
              Five identities, five prices. The same seat on the same flight —
              and the gap between them.
            </p>
          </div>

          <div className="evidence-grid">
            <div className="evidence-rows" id="evidence-rows" data-reveal>
              {EVIDENCE_SAMPLE.map((s, i) => {
                const w = Math.max(6, ((s.price - EV_LO) / (EV_HI - EV_LO)) * 100);
                return (
                  <div key={i} className="ev-row">
                    <div>
                      <div className="ev-row-head">
                        <span className="ev-profile">{s.profile}</span>
                        {s.tag && (
                          <span className={`ev-tag ${s.tag}`}>{s.tag}</span>
                        )}
                      </div>
                      <div className="ev-bar">
                        <div
                          className="ev-bar-fill"
                          data-w={w}
                          style={{
                            background: evColorFor(s.state),
                            transform: "scaleX(0)",
                          }}
                        />
                      </div>
                    </div>
                    <div
                      className="ev-price"
                      style={{ color: evPriceColorFor(s.state) }}
                    >
                      ${s.price}
                    </div>
                  </div>
                );
              })}
            </div>

            <aside className="evidence-verdict card" data-reveal>
              <div className="topology-badge">
                <span className="tb-dot" /> Progressive
              </div>
              <div className="ev-spread-label label-mono">Hidden premium</div>
              <div className="ev-spread serif tnum">
                +$<span data-count="144" data-evidence>0</span>
              </div>
              <div className="ev-spread-sub mono">29% over baseline · per ticket</div>

              <div className="ev-index">
                <div className="evi-top">
                  <span className="label-mono">Discrimination index</span>
                  <span className="evi-val mono">
                    71<span className="muted">/100</span>
                  </span>
                </div>
                <div className="evi-track">
                  <div
                    className="evi-fill"
                    style={{ ["--w" as string]: "71%" } as React.CSSProperties}
                  />
                </div>
              </div>

              <p className="ev-note sec">
                An <span style={{ color: "var(--over)" }}>iPhone in Manhattan</span> paid{" "}
                <span style={{ color: "var(--over)" }}>$144 more</span> than an{" "}
                <span className="good">Android in rural Iowa</span> — same cabin, same date.
                The driver was <strong style={{ color: "var(--text)" }}>location</strong>.
              </p>
              <a className="btn btn-ghost ev-cta" href="/chat">
                See the full topology →
              </a>
            </aside>
          </div>
        </div>
      </section>

      {/* ════════════ WHY / NORM ════════════ */}
      <section className="section grid-bg divider-top" id="why">
        <div className="wrap why-wrap">
          <div className="why-head" data-reveal>
            <span className="eyebrow">
              <span className="dot">●</span> Why it matters
            </span>
            <h2 className="display why-title">
              Pricing discrimination
              <br />
              is the{" "}
              <span className="serif-i" style={{ color: "var(--cobalt-bright)" }}>
                norm
              </span>
              .
            </h2>
            <p className="why-lede sec">
              Companies build algorithms to read your willingness to pay from your browser.
              JACOBI makes those algorithms&nbsp;visible.
            </p>
          </div>

          <figure className="callout card" data-reveal>
            <blockquote className="callout-quote serif">
              &ldquo;Two people, same booking, same seats — separated by $60
              and a browser&nbsp;setting.&rdquo;
            </blockquote>
            <figcaption className="callout-cite label-mono">
              — observed across independent academic studies
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ════════════ CTA ════════════ */}
      <section className="section cta-section divider-top" id="pricing">
        <div className="wrap cta-wrap">
          <div className="cta-aura" aria-hidden="true" />
          <h2 className="display cta-title" data-reveal>
            Stop being <span style={{ color: "var(--over)" }}>priced</span>.
            Start{" "}
            <span className="serif-i" style={{ color: "var(--cobalt-bright)" }}>
              probing
            </span>
            .
          </h2>
          <p className="cta-sub sec mono" data-reveal>
            24 identities. Four vectors. One URL. Paste your first target.
          </p>
          <form
            className="probe-instrument cta-bar"
            data-reveal
            id="cta-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!launch(ctaUrl)) ctaInputRef.current?.focus();
            }}
          >
            <div className="pi-row">
              <span className="pi-meta">
                <span className="pi-glyph">⌖</span> 24 agents
              </span>
              <input
                ref={ctaInputRef}
                className="pi-input"
                type="text"
                inputMode="url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="paste a URL to launch the probe"
                spellCheck="false"
                autoComplete="off"
                aria-label="Paste a URL to launch the probe"
              />
              <button className="pi-submit" type="submit">
                Launch probe <span className="pi-arrow">→</span>
              </button>
            </div>
            <span className="pi-rule" />
          </form>
        </div>
      </section>

      <DesignFooter />
    </div>
  );
}
