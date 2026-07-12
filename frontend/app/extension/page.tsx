import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../../components/marketing/MarketingShell";
import { DocSection, DocShell, PageHeader, SectionMarker } from "../../components/marketing/parts";

export const metadata: Metadata = {
  title: "Chrome extension | Jacobi",
  description: "Load Jacobi's open-source Manifest V3 side panel and compare the exact product already open in your browser.",
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
        eyebrow="Chrome side panel"
        title="Compare without leaving the product page."
        lede="Jacobi reads structured product fields from the active tab, previews the resolved identity, checks valid routes, and opens the cheaper offer in one click. The repository build is ready for unpacked development use; Chrome Web Store review remains external."
        meta={<><span>Manifest V3</span><span>Optional host permissions</span><span>Self-hostable backend</span></>}
      />
      <SectionMarker id="01" name="Development extension" meta="unpacked / repository build" />
      <DocShell toc={toc} aside={<><span className="l">Distribution</span><strong>Unpacked build</strong><p>Use the repository package today. Store submission and approval are separate external release steps.</p></>}>
        <DocSection id="status" overline="Current status" title="A working development surface, not a store listing." tone="intro">
          <p>The extension contains the active-tab extractor, side-panel workflow, self-hosted backend settings, evidence detail, trade-off and uncertainty states, and an explicit Deep Audit handoff. Retailer fixture catalogs remain visibly labelled demos.</p>
          <Link href="/compare" className="jx-doc__action">Inspect the deterministic result <span aria-hidden="true">-&gt;</span></Link>
        </DocSection>
        <DocSection id="install" overline="Install" title="Load the repository folder in Chrome.">
          <pre className="jx-code"><code>{`1. Start the backend on http://localhost:8000\n2. Open chrome://extensions\n3. Enable Developer mode\n4. Choose Load unpacked\n5. Select the repository's extension/ folder\n6. Open the local demo product and click Jacobi`}</code></pre>
          <p>For a remote or self-hosted backend, open extension settings and grant only that origin when prompted.</p>
        </DocSection>
        <DocSection id="privacy" overline="Privacy" title="The active product context is the boundary.">
          <div className="jx-steps">
            <div className="jx-steps__item"><span className="jx-steps__n">01</span><div><h3>Local first</h3><p>JSON-LD, Open Graph, and merchant selectors run in the active tab.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">02</span><div><h3>Structured fields only</h3><p>The normal request sends product and offer fields, not the complete page or browsing history.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">03</span><div><h3>User-invoked access</h3><p>Unsupported pages fail quietly. Additional comparison tabs and hosts require explicit access.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">04</span><div><h3>Clear controls</h3><p>Settings expose backend configuration, stored domains, recent comparisons, and clear-data actions.</p></div></div>
          </div>
        </DocSection>
        <DocSection id="states" overline="Honest outcomes" title="A cheaper number is not always a saving." tone="limits">
          <div className="jx-deftable">
            <div className="jx-deftable__head"><span>State</span><span>Meaning</span><span>Action</span></div>
            <div className="jx-deftable__row"><strong>Saving</strong><span>Exact eligible route with complete known total</span><span>Open route</span></div>
            <div className="jx-deftable__row"><strong>Already best</strong><span>No verified route beats the current total</span><span>Stay here</span></div>
            <div className="jx-deftable__row"><strong>Trade-off</strong><span>Cheaper with a disclosed material difference</span><span>Review details</span></div>
            <div className="jx-deftable__row"><strong>Uncertain</strong><span>Variant or cost cannot be verified</span><span>No headline saving</span></div>
            <div className="jx-deftable__row"><strong>Deep Audit</strong><span>Optional buyer-context investigation, 60-100 seconds</span><span>Explicit launch</span></div>
          </div>
        </DocSection>
      </DocShell>
    </MarketingShell>
  );
}
