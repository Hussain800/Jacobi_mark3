import type { Metadata } from "next";
import Link from "next/link";
import { Database, KeyRound, Share2 } from "lucide-react";
import DocumentShell, { DocumentArticle, DocumentToc } from "../../components/documents/DocumentShell";
import "../jacobi-design.css";

export const metadata: Metadata = {
  title: "Privacy Policy | JACOBI",
  description: "A plain-language overview of the data JACOBI handles to operate its pilot service.",
};

const CONTACT_EMAIL = "wearejacobi@outlook.com";
const toc = [
  { href: "#at-a-glance", label: "Privacy at a glance" },
  { href: "#data-ledger", label: "Data ledger" },
  { href: "#sharing", label: "Sharing and processors" },
  { href: "#controls", label: "Your controls" },
];

export default function PrivacyPage() {
  return (
    <DocumentShell
      section="Privacy"
      title="Clear about the data that makes the service work"
      summary="JACOBI stores the account, workspace, target, and evidence information needed to run the audits you request and show the resulting record back to your workspace."
      meta="Privacy Policy v0.9 · Last reviewed June 26, 2026"
      aside={<div className="doc-aside-note"><span>Short answer</span><strong>We do not sell submitted URLs or audit results.</strong></div>}
    >
      <DocumentToc items={toc} />
      <DocumentArticle>
        <section id="at-a-glance" className="doc-section doc-intro">
          <p className="doc-overline">Privacy at a glance</p>
          <h2>We collect the operational data required for an audit workspace.</h2>
          <div className="privacy-glance">
            <div><KeyRound aria-hidden="true" /><h3>Account access</h3><p>Supabase authentication identifies the account that can access a workspace.</p></div>
            <div><Database aria-hidden="true" /><h3>Workspace evidence</h3><p>Watchlists, URLs, observations, findings, exports, and audit records support the review workflow.</p></div>
            <div><Share2 aria-hidden="true" /><h3>Controlled sharing</h3><p>External shares are optional, redacted when configured, time-limited, and revocable.</p></div>
          </div>
        </section>

        <section id="data-ledger" className="doc-section">
          <p className="doc-overline">Data ledger</p>
          <h2>What we handle and why</h2>
          <div className="data-ledger" role="table" aria-label="JACOBI data handling overview">
            <div className="data-ledger-head" role="row"><span role="columnheader">Data</span><span role="columnheader">Why it is used</span><span role="columnheader">Where it comes from</span></div>
            <div role="row"><strong role="cell">Account and workspace identity</strong><span role="cell">Authenticate access, associate workspaces, and apply role-based controls.</span><span role="cell">Your sign-in through Supabase Auth.</span></div>
            <div role="row"><strong role="cell">Submitted URLs and watchlist details</strong><span role="cell">Run requested audits and retain the monitored record.</span><span role="cell">Your workspace input.</span></div>
            <div role="row"><strong role="cell">Audit observations and findings</strong><span role="cell">Show prices, coverage, extraction context, and policy results back to the workspace.</span><span role="cell">Responses to the target URLs you submit.</span></div>
            <div role="row"><strong role="cell">Exports and share records</strong><span role="cell">Provide evidence packages and track controlled sharing or revocation.</span><span role="cell">Actions taken by authorized workspace members.</span></div>
          </div>
        </section>

        <section id="sharing" className="doc-section">
          <p className="doc-overline">Sharing and processors</p>
          <h2>Service providers are used to operate the product, not to resell your workspace.</h2>
          <div className="doc-split-copy">
            <p>Supabase provides authentication and Postgres-backed workspace storage. BrightData may be used for managed requests when a live audit is explicitly run. Stripe is configured in test mode; Jacobi does not store full card numbers.</p>
            <p>We do not sell submitted URLs or audit results. We do not use them to train a product for resale. We do not publish a workspace&apos;s data unless an authorized member creates a share link.</p>
          </div>
          <div className="doc-callout"><Share2 aria-hidden="true" /><p><strong>About public shares:</strong> a redacted share converts exact URLs to domains and removes internal workspace identifiers, probe session identifiers, and extraction metadata. The creator can revoke it.</p></div>
        </section>

        <section id="controls" className="doc-section doc-limitations">
          <p className="doc-overline">Your controls</p>
          <h2>Access is designed around the workspace.</h2>
          <ul>
            <li>Private workspace operations require sign-in and are checked against workspace membership and role permissions.</li>
            <li>Production enterprise persistence fails closed when its database configuration is missing rather than silently serving an ephemeral workspace.</li>
            <li>For a privacy question or a request concerning your account data, contact <a href={`mailto:${CONTACT_EMAIL}?subject=JACOBI%20privacy%20request`}>{CONTACT_EMAIL}</a>.</li>
            <li>This pilot-era notice describes current service behavior. Jurisdiction-specific rights, retention periods, international-transfer terms, and any paid-service terms should be legally reviewed before a broader public launch.</li>
          </ul>
          <p className="doc-copy">See <Link href="/terms">Terms of Service</Link> for acceptable use and service limitations.</p>
        </section>
      </DocumentArticle>
    </DocumentShell>
  );
}
