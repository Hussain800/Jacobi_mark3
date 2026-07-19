import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../../components/marketing/MarketingShell";
import { DocSection, DocShell, PageHeader, SectionMarker } from "../../components/marketing/parts";

export const metadata: Metadata = {
  title: "Compare an exact product | Jacobi",
  description: "Run Jacobi's deterministic exact-product comparison demo and inspect every accepted, conditional, and rejected route.",
};

const toc = [
  { href: "#result", label: "Demo result" },
  { href: "#providers", label: "Provider truth" },
  { href: "#run", label: "Run locally" },
];

export default function ComparePage() {
  return (
    <MarketingShell>
      <PageHeader
        eyebrow="Jacobi Compare"
        title="One exact product. Every valid route."
        lede="The normal path starts with the page already open in your browser. Jacobi resolves its identity, separates mismatches and trade-offs, preserves unknown costs, and ranks only valid routes."
        meta={<><span>UAE electronics first</span><span>Paid providers disabled by default</span></>}
      />
      <SectionMarker id="01" name="Deterministic demonstration" meta="fixtures, clearly labelled" />
      <DocShell toc={toc} aside={<><span className="l">Current release</span><strong>Local and unpacked</strong><p>The repository demo is deterministic. Browser-submitted pages are real observations; retailer fixture catalogs are not live offers.</p></>}>
        <DocSection id="result" overline="Fixture result" title="Save AED 200 on the exact Sony model." tone="intro">
          <div className="jx-deftable">
            <div className="jx-deftable__head"><span>Route</span><span>Known total</span><span>Decision</span></div>
            <div className="jx-deftable__row"><strong>Amazon UAE</strong><span>AED 1,699</span><span>Current fixture</span></div>
            <div className="jx-deftable__row"><strong>Sony Store UAE</strong><span>AED 1,499</span><span>Exact / recommended</span></div>
            <div className="jx-deftable__row"><strong>Noon marketplace</strong><span>AED 1,450 + unknown shipping</span><span>Trade-off / incomplete</span></div>
            <div className="jx-deftable__row"><strong>Sharaf DG</strong><span>AED 1,399</span><span>Rejected / refurbished</span></div>
          </div>
          <p>The demo proves the contracts and safety rules. It does not claim current retailer inventory or prices.</p>
        </DocSection>
        <DocSection id="providers" overline="Capability truth" title="Live, browser-assisted, and fixture paths stay distinct.">
          <div className="jx-steps">
            <div className="jx-steps__item"><span className="jx-steps__n">01</span><div><h3>Current browser page</h3><p>Real zero-cost extraction from the active page or user-opened comparison tabs.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">02</span><div><h3>Direct public HTTP</h3><p>Explicit only, SSRF guarded, redirect validated, response bounded, and never a CAPTCHA bypass.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">03</span><div><h3>Retailer fixtures</h3><p>Amazon UAE, Noon, Sharaf DG, and Sony UAE catalogs used only for deterministic CI and demos.</p></div></div>
            <div className="jx-steps__item"><span className="jx-steps__n">04</span><div><h3>Managed providers</h3><p>Optional, deployer-configured, explicitly invoked, and disabled by default.</p></div></div>
          </div>
        </DocSection>
        <DocSection id="run" overline="Five-minute path" title="Open the fixture page, then let the side panel do the rest." tone="limits">
          <pre className="jx-code"><code>{`cd backend\npython -m uvicorn main:app --reload --port 8000\n\n# second terminal\npython -m http.server 4173 --directory examples/demo-store\n\n# Chrome: chrome://extensions -> Developer mode -> Load unpacked -> extension/`}</code></pre>
          <div className="jx-endcta">
            <p className="jx-endcta__copy">Need the API, MCP, CLI, or provider contract?</p>
            <Link href="/developers" className="jx-doc__action">Open developer quickstart <span aria-hidden="true">-&gt;</span></Link>
          </div>
        </DocSection>
      </DocShell>
    </MarketingShell>
  );
}
