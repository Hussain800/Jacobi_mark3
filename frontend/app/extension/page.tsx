import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import MarketingShell from "../../components/marketing/MarketingShell";
import { PageHeader, SectionMarker, DocShell, DocSection } from "../../components/marketing/parts";

export const metadata: Metadata = {
  title: "Browser extension | JACOBI",
  description:
    "The status, intended workflow, and release safeguards for the JACOBI browser extension prototype.",
};

const toc = [
  { href: "#status", label: "Current status" },
  { href: "#workflow", label: "Intended workflow" },
  { href: "#release-bar", label: "Release bar" },
  { href: "#data", label: "Data and permissions" },
];

const FLOW: [string, string][] = [
  ["Identify a page", "From a product or offer page, the extension would let a user choose the URL they are already reviewing."],
  ["Hand off the URL", "The URL would open in Jacobi's audit workflow. The extension would not make an evidence claim on the page itself."],
  ["Run an explicit audit", "The user would still review the target and deliberately start the audit in Jacobi. No background live scan begins from passive browsing."],
  ["Review the evidence", "Results, coverage, exports, and any share controls remain in the authenticated Jacobi workspace."],
];

const RELEASE: [string, string][] = [
  ["Production handoff", "The prototype must point to the supported production app rather than a local development address."],
  ["Least privilege", "Every browser permission and host pattern must be reduced to the minimum needed for a specific user-facing feature."],
  ["Clear disclosure", "The store listing, permissions explanation, privacy notice, and in-product controls must describe the same behavior."],
  ["Independent review", "The extension needs functional, privacy, security, and Chrome Web Store policy review before release."],
];

export default function ExtensionPage() {
  return (
    <MarketingShell>
      <PageHeader
        eyebrow="Browser extension"
        title="A faster handoff from the page you are reviewing."
        lede="The Jacobi extension is a development prototype, not a published browser product. This page explains its intended workflow and the safeguards required before anyone should install it."
        meta={<><span>Prototype status</span><span>No public install or store listing</span></>}
      />

      <SectionMarker id="01" name="The extension" meta="roadmap, not a download" />
      <DocShell
        toc={toc}
        aside={<><span className="l">Availability</span><strong>Not shipped</strong><p>No installer. No store listing. No supported production configuration.</p></>}
      >
        <DocSection id="status" overline="Current status" title="There is no Jacobi extension for customers to install today." tone="intro">
          <div className="jx-splitcopy">
            <p>The repository includes a Chrome extension prototype with a popup, a context-menu action, local recent-item storage, and a lightweight on-page price cue. It is unfinished, uses development configuration, and is not published through the Chrome Web Store.</p>
            <p>That distinction matters. This is a roadmap page, not a download page. The web app remains the supported way to submit an audit URL today.</p>
          </div>
          <Link href="/chat" className="jx-doc__action">Open the supported audit workflow <span aria-hidden="true">→</span></Link>
        </DocSection>

        <DocSection id="workflow" overline="Intended workflow" title="Keep the decision in the web app, remove the copy-and-paste.">
          <div className="jx-steps">
            {FLOW.map(([h, p], i) => (
              <div className="jx-steps__item" key={h}>
                <span className="jx-steps__n">{String(i + 1).padStart(2, "0")}</span>
                <div><h3>{h}</h3><p>{p}</p></div>
              </div>
            ))}
          </div>
        </DocSection>

        <DocSection id="release-bar" overline="Release bar" title="What must be true before this can be a product.">
          <div className="jx-deftable">
            <div className="jx-deftable__head"><span>Requirement</span><span>What it means</span><span>&nbsp;</span></div>
            {RELEASE.map(([h, p]) => (
              <div className="jx-deftable__row" key={h} style={{ gridTemplateColumns: "1fr 2fr" }}>
                <strong>{h}</strong><span>{p}</span>
              </div>
            ))}
          </div>
        </DocSection>

        <DocSection id="data" overline="Data and permissions" title="Nothing should be implicit." tone="limits">
          <p>A released extension would explain each requested browser permission in plain language: what it enables, when it runs, what data it can reach, whether data leaves the browser, and how the user can remove access. That disclosure does not exist for a released Jacobi extension because there is no released Jacobi extension.</p>
          <div className="jx-callout">
            <ShieldCheck aria-hidden="true" />
            <p><strong>For now:</strong> use the web application for audits and see the <Link href="/privacy">Privacy Policy</Link> for the current service data-handling overview.</p>
          </div>
        </DocSection>
      </DocShell>
    </MarketingShell>
  );
}
