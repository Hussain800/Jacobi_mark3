"use client";

import { useId, useState } from "react";
import { ArrowRight, CheckCircle2, Database, FileCheck2, ShieldCheck, SlidersHorizontal } from "lucide-react";

type Stage = {
  label: string;
  short: string;
  description: string;
  evidence: string;
  icon: typeof ShieldCheck;
};

const STAGES: Stage[] = [
  {
    label: "Validate the target",
    short: "Input guard",
    description:
      "A signed-in user submits a public product URL. Jacobi rejects non-public and internal destinations before a worker can request them.",
    evidence: "The audit begins with an authorized target and a durable job record, not an anonymous browser scrape.",
    icon: ShieldCheck,
  },
  {
    label: "Compare configured profiles",
    short: "Request matrix",
    description:
      "The engine compares the response returned to configured request profiles within a short audit window. Profiles can vary labels such as country, device headers, session/referrer state, and a controlled language pair.",
    evidence: "A Smart-24 audit is a configured 24-profile matrix. It may infer matching profiles after a smaller scout set rather than issuing 24 identical external requests.",
    icon: SlidersHorizontal,
  },
  {
    label: "Record usable observations",
    short: "Extraction",
    description:
      "For every usable response, Jacobi records the observed price with source and extraction provenance. Blocks, missing prices, and partial coverage remain visible instead of becoming a fabricated result.",
    evidence: "Coverage is part of the result. A thin or blocked response set reduces what Jacobi can responsibly say.",
    icon: Database,
  },
  {
    label: "Apply restrained rules",
    short: "Assessment",
    description:
      "Jacobi separates raw variation, attribution checks, and MAP-floor comparison. A MAP finding requires a price below the configured floor and sufficient usable coverage.",
    evidence: "Variation is an observation, not an automatic claim about why a site priced an offer differently.",
    icon: CheckCircle2,
  },
  {
    label: "Preserve the evidence chain",
    short: "Review",
    description:
      "Workspaces retain the scan job, evidence rows, finding context, and an audit record. Server-generated exports are checksummed; public shares can be redacted, expiring, and revoked.",
    evidence: "The output is built for review: timestamp, target domain, observations, coverage, and the limitations that shaped the result.",
    icon: FileCheck2,
  },
];

const QUALITY = [
  ["Usable coverage", "More observed prices support a clearer comparison."],
  ["Extraction provenance", "Jacobi records how a price was obtained or why it could not be."],
  ["Configured context", "Only the factors represented in the request matrix are compared."],
  ["Human review", "Findings are evidence for review, not legal conclusions."],
];

export default function MethodSystemMap() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabId = useId();
  const stage = STAGES[activeIndex];
  const Icon = stage.icon;

  return (
    <section className="method-map" aria-labelledby="method-map-title">
      <div className="method-map-head">
        <div>
          <p className="doc-kicker">Interactive walkthrough</p>
          <h2 id="method-map-title">From a submitted URL to reviewable evidence</h2>
        </div>
        <p>
          Select a stage to see what Jacobi records, what it checks, and where the method deliberately stops short.
        </p>
      </div>

      <div className="method-map-flow" role="tablist" aria-label="Jacobi evidence path">
        {STAGES.map((item, index) => {
          const StageIcon = item.icon;
          const selected = index === activeIndex;
          return (
            <div className="method-map-step" key={item.label}>
              <button
                type="button"
                id={`${tabId}-tab-${index}`}
                className={selected ? "is-active" : ""}
                onClick={() => setActiveIndex(index)}
                role="tab"
                aria-selected={selected}
                aria-controls={`${tabId}-panel-${index}`}
              >
                <span className="method-map-number">0{index + 1}</span>
                <StageIcon aria-hidden="true" />
                <span>{item.short}</span>
              </button>
              {index < STAGES.length - 1 ? <ArrowRight aria-hidden="true" className="method-map-arrow" /> : null}
            </div>
          );
        })}
      </div>

      <div
        className="method-map-detail"
        id={`${tabId}-panel-${activeIndex}`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-${activeIndex}`}
      >
        <div className="method-map-icon"><Icon aria-hidden="true" /></div>
        <div>
          <p className="method-map-stage">Stage {activeIndex + 1} of {STAGES.length}</p>
          <h3>{stage.label}</h3>
          <p>{stage.description}</p>
        </div>
        <aside>
          <span>What this adds</span>
          <p>{stage.evidence}</p>
        </aside>
      </div>

      <div className="method-quality" aria-label="Evidence quality checks">
        {QUALITY.map(([label, detail], index) => (
          <div className="method-quality-row" key={label}>
            <span>{label}</span>
            <div aria-hidden="true"><i style={{ width: `${92 - index * 14}%` }} /></div>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <p className="method-figure-note">
        This is an audit anatomy, not a performance benchmark. A target can block requests, change its response, or return too little usable evidence for a confident assessment.
      </p>
    </section>
  );
}
