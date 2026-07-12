import type { Metadata } from "next";
import MarketingShell from "../../components/marketing/MarketingShell";
import { DocSection, DocShell, PageHeader, SectionMarker } from "../../components/marketing/parts";

export const metadata: Metadata = {
  title: "Developers | Jacobi Core",
  description: "Use Jacobi through REST, MCP, CLI, fixtures, or a replaceable provider plugin without a paid scraping account.",
};

const toc = [
  { href: "#quickstart", label: "Quickstart" },
  { href: "#surfaces", label: "Shared core" },
  { href: "#provider", label: "Add a provider" },
];

export default function DevelopersPage() {
  return (
    <MarketingShell>
      <PageHeader eyebrow="Jacobi Core" title="The same optimisation engine for humans and agents." lede="Call deterministic identity, equivalence, total-cost, ranking, and evidence services through REST, MCP, CLI, or the Chrome side panel. No surface owns separate ranking logic." meta={<><span>MIT core</span><span>Fixture mode needs no keys</span></>} />
      <SectionMarker id="01" name="Developer quickstart" meta="REST / MCP / CLI" />
      <DocShell toc={toc} aside={<><span className="l">Default collection cost</span><strong>USD 0.00</strong><p>Fixture, browser-submitted, direct HTTP, and local Playwright paths do not require Bright Data.</p></>}>
        <DocSection id="quickstart" overline="Local" title="Start the API and run one deterministic comparison." tone="intro">
          <pre className="jx-code"><code>{`cd backend\npython -m venv .venv\n# activate .venv\npip install -r requirements.txt\npython -m uvicorn main:app --reload --port 8000\n\npython -m jacobi compare --demo --json`}</code></pre>
        </DocSection>
        <DocSection id="surfaces" overline="One core" title="Contracts stay aligned across every surface.">
          <div className="jx-deftable">
            <div className="jx-deftable__head"><span>Surface</span><span>Use</span><span>Transport</span></div>
            <div className="jx-deftable__row"><strong>REST</strong><span>Apps and extensions</span><span>/api/v1</span></div>
            <div className="jx-deftable__row"><strong>MCP</strong><span>Shopping and procurement agents</span><span>stdio</span></div>
            <div className="jx-deftable__row"><strong>CLI</strong><span>Humans, scripts, CI</span><span>human or JSON</span></div>
            <div className="jx-deftable__row"><strong>Extension</strong><span>Active-page workflow</span><span>Manifest V3 side panel</span></div>
          </div>
        </DocSection>
        <DocSection id="provider" overline="Replaceable collection" title="Declare capability before implementation." tone="limits">
          <p>Every provider declares domains, extraction fields, evidence tier, cost, timeout, retries, rate limit, health, and limitations. Paid providers are never registered automatically.</p>
          <pre className="jx-code"><code>{`class MyProvider(MerchantAdapter):\n    descriptor = ProviderDescriptor(\n        kind="official_api",\n        paid=False,\n        explicit_invocation=True,\n        evidence_tier="official_api",\n    )`}</code></pre>
        </DocSection>
      </DocShell>
    </MarketingShell>
  );
}
