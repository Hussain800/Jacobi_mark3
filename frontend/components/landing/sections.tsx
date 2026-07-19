"use client";

import Link from "next/link";
import { AuditReadout as AuditReadoutArtifact } from "./artifacts";

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
              <span className="jx-eyebrow jx-hero__eyebrow"><span className="jx-tick" />Travel Price Guardian</span>
              <h1 className="jx-display jx-h1 jx-hero__title">Stop overpaying for trips you already chose<span className="jx-hero__dot">.</span></h1>
              <p className="jx-lede jx-hero__lede">
                Open the flight or hotel page you chose. Jacobi’s extension detects it, checks
                equivalent offers, preserves every mandatory-cost unknown, and asks for fresh revalidation before you book.
              </p>
              <div className="jx-hero__cta">
                <div className="jx-pivot-actions">
                  <Link href="/travel" className="jx-pivot-primary">Open Travel Guardian</Link>
                  <Link href="#how-it-works" className="jx-pivot-secondary">See how it decides</Link>
                </div>
                <p className="jx-probe__note">No itinerary re-entry / no second search form / provider coverage always disclosed</p>
              </div>
            </div>
            <div className="jx-hero__stage">
              <div className="jx-travel-preview" aria-label="Sanitized travel result walkthrough">
                <div className="jx-travel-preview__head"><span>Price check / DXB → LHR</span><b>fixture</b></div>
                <div className="jx-travel-preview__route"><strong>Same route.<br />Same cabin.<br />Bags included.</strong><span>01 FEB 2027</span></div>
                <div className="jx-travel-preview__prices"><div><span>Selected price</span><b>AED 1,500</b></div><div className="is-returned"><span>Returned comparable</span><b>AED 1,210</b></div></div>
                <div className="jx-travel-preview__foot"><span>conditional difference · AED 290</span><b>revalidate required</b></div>
                <p>Sanitized fixture walkthrough. Not live inventory or a lowest-price claim.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="jx-ticker">
        <div className="jx-wrap jx-wrap--wide jx-ticker__row">
          <span className="jx-ticker__dot" aria-hidden />
          <span><span className="jx-ticker__k">fixture walkthrough</span>&nbsp;&nbsp;<span className="jx-ticker__v">DXB → LHR</span></span>
          <span><span className="jx-ticker__k">selected</span>&nbsp;&nbsp;<span className="jx-ticker__v is-dev">AED 1,500</span></span>
          <span><span className="jx-ticker__k">returned comparable</span>&nbsp;&nbsp;<span className="jx-ticker__v is-base">AED 1,210</span></span>
          <span><span className="jx-ticker__k">claim</span>&nbsp;&nbsp;<span className="jx-ticker__v">conditional / revalidate</span></span>
          <span><span className="jx-ticker__k">coverage</span>&nbsp;&nbsp;<span className="jx-ticker__v">configured providers only</span></span>
        </div>
      </div>
    </header>
  );
}

export function Problem() {
  return (
    <>
      <SectionMarker id="01" name="The problem" meta="the cheapest tile can describe a different trip" />
      <section className="jx-section">
        <div className="jx-wrap">
          <div className="jx-problem__grid" data-reveal>
            <p className="jx-problem__statement">Same route.<br />Wrong terms.<br /><span className="jx-soft">False</span> saving.</p>
            <div className="jx-problem__body">
              <p className="jx-lede">
                A cheaper flight can hide a self-transfer, missing baggage, a weaker fare, or an
                incomplete fee basis. A hotel result can be the wrong property, room, meal plan,
                cancellation policy, or tax treatment. Jacobi classifies the mismatch before ranking the price.
              </p>
              <div className="jx-route-proof">
                <div><span>Chosen itinerary</span><strong>AED 1,500</strong><small>economy / 1 checked bag</small></div>
                <div className="is-best"><span>Returned comparable</span><strong>AED 1,210</strong><small>same route / bag basis disclosed</small></div>
                <div className="is-rejected"><span>Rejected route</span><strong>AED 980</strong><small>self-transfer / baggage unknown</small></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function Mechanism() {
  const steps = [
    ["01", "Detect the supported page", "The extension reads bounded route or property, dates, occupancy, cabin, bags, and selected price."],
    ["02", "Query configured supply", "Each provider declares fixture, sandbox API, or live official API inventory."],
    ["03", "Classify equivalence", "Material conflicts, trade-offs, and insufficient evidence stay explicit."],
    ["04", "Rank and revalidate", "Comparable known totals first, followed by a fresh availability and price check."],
  ];
  return (
    <div className="jx-sec jx-sec--raised" id="how-it-works">
      <SectionMarker id="02" name="The mechanism" meta="intent -> equivalence -> total -> evidence" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead eyebrow="Compare the trip, not the tile" title="Equivalence before price. Revalidation before action." lede="Unknown baggage, taxes, resort fees, ticketing structure, room facts, or cancellation terms never silently become a match or a zero-cost assumption." />
          <div className="jx-feature" data-reveal>
            <div className="jx-feature__copy">
              <p className="jx-body">Jacobi evaluates the material facts for the chosen flight or hotel, then ranks only eligible offers returned by configured providers. It does not claim exhaustive coverage of the market.</p>
            </div>
            <div className="jx-feature__art">
              <div className="jx-pivot-steps">
                {steps.map(([n, h, p]) => <div key={n}><b>{n}</b><span><strong>{h}</strong><small>{p}</small></span></div>)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function EvidenceReceipt() {
  const rows = [
    ["Intent", "DXB → LHR / 01 FEB 2027 / economy / 1 checked bag"],
    ["Baseline", "Browser-entered / AED 1,500 / mandatory extras may be unknown"],
    ["Offer", "Configured provider / AED 1,210 / conditional difference"],
    ["Match", "EXACT / material flight facts compared"],
    ["Supply", "FIXTURE / sanitized walkthrough / not live inventory"],
  ];
  return (
    <div className="jx-invert">
      <SectionMarker id="03" name="The evidence" meta="provider environment / cost state / observed time" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead eyebrow="Inspectable by design" title="A result with its limits attached." lede="Every returned offer carries its provider environment, observation method and time, cost completeness, equivalence reasoning, limitations, evidence manifest reference, and revalidation state." />
          <div className="jx-receipt-stage" data-reveal>
            <div className="jx-evidence-demo">
              <div className="jx-evidence-demo__head"><span>Evidence manifest</span><code>fixture_travel_walkthrough / not live</code></div>
              {rows.map(([k, v]) => <div className="jx-evidence-demo__row" key={k}><span>{k}</span><strong>{v}</strong></div>)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function AuditReadout() {
  return (
    <div className="jx-sec jx-sec--deep">
      <SectionMarker id="04" name="Deep Audit" meta="secondary / optional / 60-100 seconds" />
      <section className="jx-section">
        <div className="jx-wrap jx-wrap--wide">
          <SectionHead eyebrow="Advanced workflow, preserved" title="Investigate buyer-context pricing when the ordinary check is not enough." lede="The synthetic shopper matrix, Welch tests, Jacobian sensitivity matrix, PEI attribution gate, and evidence report remain available as a voluntary advanced workflow—separate from the normal Travel Guardian path." />
          <div data-reveal><AuditReadoutArtifact /></div>
        </div>
      </section>
    </div>
  );
}

export function Defensibility() {
  const items: [string, string][] = [
    ["Trip-specific equivalence", "Flights compare route, cabin, baggage, ticketing, and fare facts. Hotels compare property, room, occupancy, meal, payment, and cancellation facts."],
    ["Honest mandatory costs", "Known, estimated, unknown, and not-applicable costs stay distinct. An incomplete subtotal is never presented as a complete total."],
    ["Truthful supply labels", "Fixture, sandbox API, and live official API environments remain visible. Configured coverage is never called the whole market."],
    ["Fresh revalidation", "A ranked observation is not a booking promise. Jacobi checks the selected provider again before any route can be acted on."],
    ["Privacy by default", "No passenger names, passport details, payment credentials, full browsing history, or raw page HTML."],
    ["Secondary tools preserved", "Retail exact-product compare and the original Deep Audit remain available without obscuring the travel-first path."],
  ];
  return (
    <>
      <SectionMarker id="05" name="Why it holds up" meta="open core / honest uncertainty" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead eyebrow="Trust architecture" title="Specific claims, visible uncertainty, replaceable providers." />
          <div className="jx-ledger" data-reveal>
            {items.map(([h, p], i) => <div className="jx-ledger__item" key={h}><span className="jx-ledger__n">{String(i + 1).padStart(2, "0")}</span><div><h3>{h}</h3><p>{p}</p></div></div>)}
          </div>
          <div className="jx-audience"><span className="jx-label">Built for</span>{["Travellers", "Households", "Developers", "Researchers"].map((a, i, arr) => <span className="jx-audience__tag" key={a}>{a}{i < arr.length - 1 ? <span className="jx-audience__sep">{"  /  "}</span> : null}</span>)}</div>
        </div>
      </section>
    </>
  );
}

export function FinalCTA() {
  return (
    <div className="jx-sec jx-sec--raised">
      <SectionMarker id="06" name="Run Jacobi" meta="one page / evidence attached / revalidation required" />
      <section className="jx-section jx-cta">
        <div className="jx-wrap jx-cta__inner" data-reveal>
          <h2 className="jx-display jx-cta__title">Give the trip one more honest check.</h2>
          <p className="jx-cta__sub">equivalence / mandatory costs / provider evidence / fresh revalidation</p>
          <div className="jx-pivot-actions jx-pivot-actions--center">
            <Link href="/travel" className="jx-pivot-primary">Open Travel Guardian</Link>
            <Link href="/extension" className="jx-pivot-secondary">Extension setup</Link>
            <Link href="/chat" className="jx-pivot-tertiary">Open Deep Audit</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
