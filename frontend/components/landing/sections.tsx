"use client";

import Link from "next/link";
import GlobeStage from "./GlobeStage";
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
              <span className="jx-eyebrow jx-hero__eyebrow"><span className="jx-tick" />Exact-product price optimisation</span>
              <h1 className="jx-display jx-h1 jx-hero__title">Find the exact same product for less<span className="jx-hero__dot">.</span></h1>
              <p className="jx-lede jx-hero__lede">
                Jacobi recognises the product already open in your browser, verifies equivalent
                offers, calculates the known all-in total, and shows the cheapest legitimate route.
              </p>
              <div className="jx-hero__cta">
                <div className="jx-pivot-actions">
                  <Link href="/extension" className="jx-pivot-primary">Load the extension</Link>
                  <Link href="/compare" className="jx-pivot-secondary">Try the local demo</Link>
                </div>
                <p className="jx-probe__note">Open source / UAE electronics first / no paid provider required</p>
              </div>
            </div>
            <div className="jx-hero__stage"><GlobeStage /></div>
          </div>
        </div>
      </div>
      <div className="jx-ticker">
        <div className="jx-wrap jx-wrap--wide jx-ticker__row">
          <span className="jx-ticker__dot" aria-hidden />
          <span><span className="jx-ticker__k">deterministic demo</span>&nbsp;&nbsp;<span className="jx-ticker__v">Sony WH-1000XM6</span></span>
          <span><span className="jx-ticker__k">current</span>&nbsp;&nbsp;<span className="jx-ticker__v is-dev">AED 1,699</span></span>
          <span><span className="jx-ticker__k">verified route</span>&nbsp;&nbsp;<span className="jx-ticker__v is-base">AED 1,499</span></span>
          <span><span className="jx-ticker__k">saving</span>&nbsp;&nbsp;<span className="jx-ticker__v">AED 200 / 11.8%</span></span>
          <span><span className="jx-ticker__k">identity</span>&nbsp;&nbsp;<span className="jx-ticker__v">exact / evidence retained</span></span>
        </div>
      </div>
    </header>
  );
}

export function Problem() {
  return (
    <>
      <SectionMarker id="01" name="The problem" meta="cheap is not always equivalent" />
      <section className="jx-section">
        <div className="jx-wrap">
          <div className="jx-problem__grid" data-reveal>
            <p className="jx-problem__statement">Same title.<br />Wrong variant.<br /><span className="jx-soft">False</span> saving.</p>
            <div className="jx-problem__body">
              <p className="jx-lede">
                A lower listing can hide different storage, an imported warranty, a marketplace
                seller, missing shipping, or refurbished condition. Jacobi rejects material mismatches first.
              </p>
              <div className="jx-route-proof">
                <div><span>Current route</span><strong>AED 1,699</strong><small>new / UAE warranty</small></div>
                <div className="is-best"><span>Verified route</span><strong>AED 1,499</strong><small>exact model / delivered</small></div>
                <div className="is-rejected"><span>Rejected listing</span><strong>AED 1,399</strong><small>refurbished / 90-day warranty</small></div>
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
    ["01", "Read the active page", "JSON-LD and structured fields stay local by default."],
    ["02", "Resolve exact identity", "Conflicts and unknowns remain visible."],
    ["03", "Discover valid routes", "Browser-assisted, public, local, and official providers."],
    ["04", "Calculate and rank", "Known all-in totals first; trade-offs stay separate."],
  ];
  return (
    <div className="jx-sec jx-sec--raised">
      <SectionMarker id="02" name="The mechanism" meta="identity -> total -> evidence" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead eyebrow="Filter first" title="Verify the product before ranking the price." lede="Deterministic identifiers lead. Unknown shipping never becomes zero. Every excluded offer carries a field-level reason." />
          <div className="jx-feature" data-reveal>
            <div className="jx-feature__copy">
              <p className="jx-body">Jacobi resolves GTIN, MPN, model, storage, memory, generation, processor, region, condition, bundle, seller, and warranty before calculating a saving.</p>
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
    ["Product", "Sony WH-1000XM6/B / GTIN 4548736158801"],
    ["Current", "Amazon UAE / AED 1,699 / observed 12:04:18"],
    ["Best", "Sony Store UAE / AED 1,499 delivered"],
    ["Match", "EXACT_EQUIVALENT / 0.99"],
    ["Limits", "Fixture demonstration - not a live retailer claim"],
  ];
  return (
    <div className="jx-invert">
      <SectionMarker id="03" name="The evidence" meta="offer observations / hash-sealed" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead eyebrow="Inspectable by design" title="A saving you can verify." lede="Every result retains the source URL, timestamp, extraction method, identifiers, seller, availability, raw price, confidence, limitations, and immutable hashes." />
          <div className="jx-receipt-stage" data-reveal>
            <div className="jx-evidence-demo">
              <div className="jx-evidence-demo__head"><span>Evidence manifest</span><code>man_7f4c...9a21</code></div>
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
      <SectionMarker id="04" name="Deep Audit" meta="optional / 60-100 seconds" />
      <section className="jx-section">
        <div className="jx-wrap jx-wrap--wide">
          <SectionHead eyebrow="Original Jacobi, preserved" title="Investigate buyer-context pricing when you choose." lede="The synthetic shopper matrix, Welch tests, Jacobian sensitivity matrix, PEI attribution gate, and evidence report remain available as a voluntary advanced workflow - never on the normal comparison path." />
          <div data-reveal><AuditReadoutArtifact /></div>
        </div>
      </section>
    </div>
  );
}

export function Defensibility() {
  const items: [string, string][] = [
    ["Open comparison core", "Schemas, matching, cost calculation, ranking, fixtures, REST, MCP, CLI, and extension are inspectable."],
    ["Identifier-first matching", "GTIN, MPN, model, configuration, region, condition, bundle, and warranty conflicts cannot be scored away."],
    ["Honest total cost", "Known, estimated, unknown, and not-applicable costs stay distinct. Cashback never becomes an instant saving."],
    ["Replaceable providers", "Browser context, direct HTTP, local Playwright, official APIs, and optional managed providers share one contract."],
    ["Privacy by default", "No full browsing history, payment credentials, unrelated page collection, or default self-hosted telemetry."],
    ["Deep Audit continuity", "The original mathematical engine remains tested and separate for researchers and advanced users."],
  ];
  return (
    <>
      <SectionMarker id="05" name="Why it holds up" meta="open core / honest uncertainty" />
      <section className="jx-section">
        <div className="jx-wrap">
          <SectionHead eyebrow="Trust architecture" title="Built to be checked, changed, and self-hosted." />
          <div className="jx-ledger" data-reveal>
            {items.map(([h, p], i) => <div className="jx-ledger__item" key={h}><span className="jx-ledger__n">{String(i + 1).padStart(2, "0")}</span><div><h3>{h}</h3><p>{p}</p></div></div>)}
          </div>
          <div className="jx-audience"><span className="jx-label">Built for</span>{["UAE shoppers", "Developers", "Shopping agents", "Researchers"].map((a, i, arr) => <span className="jx-audience__tag" key={a}>{a}{i < arr.length - 1 ? <span className="jx-audience__sep">{"  /  "}</span> : null}</span>)}</div>
        </div>
      </section>
    </>
  );
}

export function FinalCTA() {
  return (
    <div className="jx-sec jx-sec--raised">
      <SectionMarker id="06" name="Run Jacobi" meta="local / deterministic / open source" />
      <section className="jx-section jx-cta">
        <div className="jx-wrap jx-cta__inner" data-reveal>
          <h2 className="jx-display jx-cta__title">See the exact saving before you buy.</h2>
          <p className="jx-cta__sub">active page / verified identity / known all-in total</p>
          <div className="jx-pivot-actions jx-pivot-actions--center">
            <Link href="/extension" className="jx-pivot-primary">Extension setup</Link>
            <Link href="/developers" className="jx-pivot-secondary">Developer quickstart</Link>
            <Link href="/chat" className="jx-pivot-tertiary">Open Deep Audit</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
