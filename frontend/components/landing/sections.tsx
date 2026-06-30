"use client";

/**
 * Landing sections.
 * Phase 3: hero + the bespoke globe (GlobeStage) + forensic instrument chrome
 * (measurement-gridline section markers + the hero instrument ticker). The
 * remaining artifacts (matrix / receipt / audit) are still placeholders until
 * Phase 4.
 */

import GlobeStage from "./GlobeStage";
import ProbeInput from "./ProbeInput";
import { SAMPLE } from "./data";
import {
  EvidenceReceipt as ReceiptDoc,
  BuyerContextMatrix,
  PriceDelta,
  AuditReadout as AuditReadoutArtifact,
} from "./artifacts";

/* forensic measurement-gridline section header (the anti-generic structural signal) */
function SectionMarker({ id, name, meta }: { id: string; name: string; meta: string }) {
  return (
    <div className="jx-marker">
      <div className="jx-wrap jx-marker__row">
        <span className="jx-marker__id">[&nbsp;<b>{id}</b>&nbsp;]</span>
        <span className="jx-marker__name">{name}</span>
        <span className="jx-marker__meta">{meta}</span>
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="jx-head" data-reveal>
      <span className="jx-eyebrow"><span className="jx-tick" />{eyebrow}</span>
      <h2 className="jx-display jx-h2 jx-head__title">{title}</h2>
      {lede ? <p className="jx-lede jx-head__lede">{lede}</p> : null}
    </div>
  );
}

/* ───────────────────────── HERO ───────────────────────── */
export function Hero() {
  return (
    <header className="jx-hero">
      <div className="jx-hero__main">
        <div className="jx-wrap jx-wrap--wide jx-hero__wrap">
          <div className="jx-hero__chrome" aria-hidden>
            <span className="jx-hero__corner tl" /><span className="jx-hero__corner tr" />
            <span className="jx-hero__corner bl" /><span className="jx-hero__corner br" />
          </div>
          <div className="jx-hero__grid">
            <div className="jx-hero__copy" data-reveal>
              <span className="jx-eyebrow jx-hero__eyebrow"><span className="jx-tick" />Controlled synthetic-buyer audits</span>
              <h1 className="jx-display jx-h1 jx-hero__title">See the price you were never meant to compare<span className="jx-hero__dot">.</span></h1>
              <p className="jx-lede jx-hero__lede">
                Paste a URL. Twenty-four synthetic buyers check it from every angle — geography,
                device, cookies, referrer, language — and return evidence, with statistics and receipts.
              </p>
              <div className="jx-hero__cta">
                <ProbeInput cta="Run an audit" />
                <p className="jx-probe__note">Public-web only · Sample audit completes in ~60 seconds</p>
              </div>
            </div>
            <div className="jx-hero__stage"><GlobeStage /></div>
          </div>
        </div>
      </div>

      {/* instrument ticker — fills the hero base with signal, not decoration */}
      <div className="jx-ticker">
        <div className="jx-wrap jx-wrap--wide jx-ticker__row">
          <span className="jx-ticker__dot" aria-hidden />
          <span><span className="jx-ticker__k">sample audit</span>&nbsp;&nbsp;<span className="jx-ticker__v">{SAMPLE.target}</span></span>
          <span><span className="jx-ticker__k">baseline</span>&nbsp;&nbsp;<span className="jx-ticker__v is-base">${SAMPLE.baseline}</span></span>
          <span><span className="jx-ticker__k">highest</span>&nbsp;&nbsp;<span className="jx-ticker__v is-dev">${SAMPLE.highest}</span></span>
          <span><span className="jx-ticker__k">spread</span>&nbsp;&nbsp;<span className="jx-ticker__v">+${SAMPLE.delta} · +{SAMPLE.deltaPct}%</span></span>
          <span><span className="jx-ticker__k">driver</span>&nbsp;&nbsp;<span className="jx-ticker__v">location · 62%</span></span>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────── PROBLEM ───────────────────────── */
export function Problem() {
  return (
    <>
      <SectionMarker id="01" name="The problem" meta="same url · different price" />
      <section className="jx-section">
        <div className="jx-wrap">
          <div className="jx-problem__grid" data-reveal>
            <p className="jx-problem__statement">
              Same URL.<br />Different buyer.<br /><span className="jx-soft">Different</span> price.
            </p>
            <div className="jx-problem__body">
              <p className="jx-lede">
                Location, device, language, cookies, referrer, and session quietly
                change what a server decides to charge. It is real, widespread, and —
                done by hand — almost impossible to prove.
              </p>
              <div style={{ marginTop: 28 }}>
                <PriceDelta />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── MECHANISM ───────────────────────── */
export function Mechanism() {
  return (
    <div className="jx-sec jx-sec--raised">
      <SectionMarker id="02" name="The mechanism" meta="∂price / ∂vector" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead
            eyebrow="Controlled experiment"
            title="Vary one vector. Hold the rest constant."
            lede="Jacobi changes a single buyer-context dimension at a time against a fixed baseline, so any price movement can be attributed — not guessed. The Jacobian isolates the driver."
          />
          <div className="jx-feature" data-reveal>
            <div className="jx-feature__copy">
              <p className="jx-body">
                Six vectors — geography, device, browser language, cookies, referrer,
                and session — are tested in controlled waves. Only differences that
                clear a Welch t-test are reported as evidence.
              </p>
            </div>
            <div className="jx-feature__art">
              <BuyerContextMatrix />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── EVIDENCE RECEIPT ───────────────────────── */
export function EvidenceReceipt() {
  return (
    <div className="jx-invert">
      <SectionMarker id="03" name="The evidence" meta="receipts · hash-sealed" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead
            eyebrow="Raw evidence"
            title="Receipts a regulator can read."
            lede="Every probe stores the on-page price, native currency, request context, and timestamp — hash-sealed into one reproducible audit trail."
          />
          <div className="jx-receipt-stage" data-reveal>
            <ReceiptDoc />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── AUDIT READOUT ───────────────────────── */
export function AuditReadout() {
  return (
    <div className="jx-sec jx-sec--deep">
      <SectionMarker id="04" name="The verdict" meta="baseline → exposed" />
      <section className="jx-section">
        <div className="jx-wrap jx-wrap--wide">
          <SectionHead
            eyebrow="At a glance"
            title="The whole audit, in one readout."
            lede="Baseline, highest observed, the delta, statistical confidence, and the dominant driver — resolved into a single readout you can hand off or export as an audit-ready report."
          />
          <div data-reveal><AuditReadoutArtifact /></div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── DEFENSIBILITY ───────────────────────── */
export function Defensibility() {
  const items: [string, string][] = [
    ["Native-currency capture", "Prices recorded in the real on-page currency first, with a USD-normalized comparison alongside."],
    ["Timestamped evidence", "Each observation is time-stamped and ordered, so any result can be reproduced and defended later."],
    ["Real vs inferred, separated", "Directly observed agents are never mixed with inferred ones. Inferred values never appear as raw evidence."],
    ["Controlled probe accounting", "Agent counts, network tiers, and blocked requests are reported in full — no silent gaps in the sample."],
    ["Public-web only", "Jacobi reads exactly what any buyer could see. No logins, no private data, nothing behind a wall."],
    ["Audit-ready export", "Summary, figures, and a complete evidence appendix, sealed into a research-grade PDF."],
  ];
  return (
    <>
      <SectionMarker id="05" name="Why it holds up" meta="public-web only" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead eyebrow="Defensibility" title="Built to be defended." />
          <div className="jx-ledger" data-reveal>
            {items.map(([h, p], i) => (
              <div className="jx-ledger__item" key={h}>
                <span className="jx-ledger__n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="jx-audience">
            <span className="jx-label">Built for</span>
            {["Compliance", "Pricing", "MAP & brand protection", "Market intelligence"].map((a, i, arr) => (
              <span className="jx-audience__tag" key={a}>
                {a}{i < arr.length - 1 ? <span className="jx-audience__sep">{"  /  "}</span> : null}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── FINAL CTA ───────────────────────── */
export function FinalCTA() {
  return (
    <div className="jx-sec jx-sec--raised">
      <SectionMarker id="06" name="Run an audit" meta="one url · ~60s" />
      <section className="jx-section jx-cta">
        <div className="jx-wrap jx-cta__inner" data-reveal>
          <h2 className="jx-display jx-cta__title">Stop guessing. Start auditing.</h2>
          <p className="jx-cta__sub">24 synthetic buyers · 6 context vectors · one URL</p>
          <div className="jx-cta__form">
            <ProbeInput cta="Run an audit" placeholder="paste a URL to run a pricing audit" />
          </div>
        </div>
      </section>
    </div>
  );
}
