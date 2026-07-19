import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../../components/marketing/MarketingShell";
import { DocSection, DocShell, PageHeader, SectionMarker } from "../../components/marketing/parts";

export const metadata: Metadata = {
  title: "Chrome extension | Jacobi",
  description: "Load Jacobi's Manifest V3 side panel and automatically check the supported flight or hotel page already open in your browser.",
};

const toc = [
  { href: "#status", label: "Release status" },
  { href: "#install", label: "Load unpacked" },
  { href: "#privacy", label: "Data and permissions" },
  { href: "#states", label: "Result states" },
];

export default function ExtensionPage() {
  return (
    <MarketingShell>
      <PageHeader
        eyebrow="Travel Guardian side panel"
        title="Open one trip page. Jacobi does the rest."
        lede="After one-time Automatic Savings consent, Jacobi detects a supported flight or hotel page, extracts bounded trip facts, checks configured providers, and keeps equivalence, mandatory costs, evidence, and revalidation beside the page. No itinerary re-entry. The repository build is ready for unpacked development use; Chrome Web Store review remains external."
        meta={<><span>Flights + hotels</span><span>Manifest V3</span><span>Optional host permissions</span></>}
      />
      <SectionMarker id="01" name="Development extension" meta="unpacked / repository build" />
      <DocShell toc={toc} aside={<><span className="l">Distribution</span><strong>Unpacked build</strong><p>Use the repository package today. Store submission and approval are separate external release steps.</p></>}>
        <DocSection id="status" overline="Current status" title="A working development surface, not a store listing." tone="intro">
          <p>The extension contains flight and hotel context extraction, the Travel Guardian side-panel workflow, self-hosted backend settings, provider environment labels, evidence detail, trade-off and uncertainty states, and an explicit Deep Audit handoff. Fixture walkthroughs remain visibly labelled demos.</p>
          <Link href="/travel#status" className="jx-doc__action">Inspect the Travel Guardian flow <span aria-hidden="true">-&gt;</span></Link>
        </DocSection>
        <DocSection id="install" overline="Install" title="Load the repository folder in Chrome.">
          <pre className="jx-code"><code>{`1. Start the backend on http://localhost:8000\n2. Open chrome://extensions\n3. Enable Developer mode\n4. Choose Load unpacked\n5. Select the repository's extension/ folder\n6. Grant Automatic Savings consent for supported origins\n7. Open a supported flight or hotel page\n8. Open the Jacobi side panel to review the automatic check`}</code></pre>
          <p>For a remote or self-hosted backend, open extension settings and grant only that origin when prompted.</p>
        </DocSection>
        <DocSection id="privacy" overline="Privacy" title="The active trip context is the boundary.">
          <div className="jx-steps">
            <div className="jx-steps__item"><span className="jx-steps__n">01</span><div><h3>Local first</h3><p>Supported flight and hotel facts are read in the active tab.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">02</span><div><h3>Bounded fields only</h3><p>The request sends trip and offer facts, not passenger identity, payment credentials, raw page HTML, or browsing history.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">03</span><div><h3>Explicit mode consent</h3><p>Automatic Savings Mode requires onboarding consent and exact supported-origin access. Privacy Mode keeps the intent local until your click.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">04</span><div><h3>Clear controls</h3><p>Settings expose backend configuration, provider status, device-local history, preferences, and clear-data actions.</p></div></div>
          </div>
        </DocSection>
        <DocSection id="states" overline="Honest outcomes" title="A cheaper number is not always a saving." tone="limits">
          <div className="jx-deftable">
            <div className="jx-deftable__head"><span>State</span><span>Meaning</span><span>Action</span></div>
            <div className="jx-deftable__row"><strong>Comparable</strong><span>Eligible itinerary or rate returned by configured providers</span><span>Revalidate</span></div>
            <div className="jx-deftable__row"><strong>No improvement</strong><span>No returned comparable beats the observed page basis</span><span>Stay here</span></div>
            <div className="jx-deftable__row"><strong>Trade-off</strong><span>Different baggage, ticketing, room, meal, payment, or policy fact</span><span>Review details</span></div>
            <div className="jx-deftable__row"><strong>Uncertain</strong><span>Equivalence or mandatory cost cannot be verified</span><span>No headline saving</span></div>
            <div className="jx-deftable__row"><strong>Deep Audit</strong><span>Optional buyer-context investigation, 60-100 seconds</span><span>Explicit launch</span></div>
          </div>
        </DocSection>
      </DocShell>
    </MarketingShell>
  );
}
