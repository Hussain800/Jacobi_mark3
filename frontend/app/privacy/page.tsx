import type { Metadata } from "next";
import Link from "next/link";
import { Database, KeyRound, Share2 } from "lucide-react";
import MarketingShell from "../../components/marketing/MarketingShell";
import { PageHeader, SectionMarker, DocShell, DocSection } from "../../components/marketing/parts";

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
    <MarketingShell>
      <PageHeader
        eyebrow="Privacy"
        title="Clear about the data that makes the service work."
        lede="Jacobi stores the account, workspace, target, and evidence information needed to run the audits you request and show the resulting record back to your workspace."
        meta={<><span>Privacy Policy v0.9</span><span>Last reviewed Jun 26, 2026</span></>}
      />

      <SectionMarker id="01" name="Privacy" meta="we do not sell submitted URLs" />
      <DocShell
        toc={toc}
        aside={<><span className="l">Short answer</span><strong>We do not sell submitted URLs or audit results.</strong></>}
      >
        <DocSection id="at-a-glance" overline="Privacy at a glance" title="We collect the operational data required for an audit workspace." tone="intro">
          <div className="jx-glance">
            <div className="jx-glance__cell"><KeyRound aria-hidden="true" /><h3>Account access</h3><p>Supabase authentication identifies the account that can access a workspace.</p></div>
            <div className="jx-glance__cell"><Database aria-hidden="true" /><h3>Workspace evidence</h3><p>Watchlists, URLs, observations, findings, exports, and audit records support the review workflow.</p></div>
            <div className="jx-glance__cell"><Share2 aria-hidden="true" /><h3>Controlled sharing</h3><p>External shares are optional, redacted when configured, time-limited, and revocable.</p></div>
          </div>
        </DocSection>

        <DocSection id="data-ledger" overline="Data ledger" title="What we handle and why.">
          <div className="jx-deftable">
            <div className="jx-deftable__head"><span>Data</span><span>Why it is used</span><span>Where it comes from</span></div>
            <div className="jx-deftable__row"><strong>Account and workspace identity</strong><span>Authenticate access, associate workspaces, and apply role-based controls.</span><span className="muted">Your sign-in through Supabase Auth.</span></div>
            <div className="jx-deftable__row"><strong>Submitted URLs and watchlist details</strong><span>Run requested audits and retain the monitored record.</span><span className="muted">Your workspace input.</span></div>
            <div className="jx-deftable__row"><strong>Audit observations and findings</strong><span>Show prices, coverage, extraction context, and policy results back to the workspace.</span><span className="muted">Responses to the target URLs you submit.</span></div>
            <div className="jx-deftable__row"><strong>Exports and share records</strong><span>Provide evidence packages and track controlled sharing or revocation.</span><span className="muted">Actions taken by authorized workspace members.</span></div>
          </div>
        </DocSection>

        <DocSection id="sharing" overline="Sharing and processors" title="Service providers operate the product — they do not resell your workspace.">
          <div className="jx-splitcopy">
            <p>Supabase provides authentication and Postgres-backed workspace storage. BrightData may be used for managed requests when a live audit is explicitly run. Stripe is configured in test mode; Jacobi does not store full card numbers.</p>
            <p>We do not sell submitted URLs or audit results. We do not use them to train a product for resale. We do not publish a workspace&apos;s data unless an authorized member creates a share link.</p>
          </div>
          <div className="jx-callout">
            <Share2 aria-hidden="true" />
            <p><strong>About public shares:</strong> a redacted share converts exact URLs to domains and removes internal workspace identifiers, probe session identifiers, and extraction metadata. The creator can revoke it.</p>
          </div>
        </DocSection>

        <DocSection id="controls" overline="Your controls" title="Access is designed around the workspace." tone="limits">
          <ul className="jx-checklist">
            <li>Private workspace operations require sign-in and are checked against workspace membership and role permissions.</li>
            <li>Production enterprise persistence fails closed when its database configuration is missing rather than silently serving an ephemeral workspace.</li>
            <li>For a privacy question or a request concerning your account data, contact <a href={`mailto:${CONTACT_EMAIL}?subject=JACOBI%20privacy%20request`}>{CONTACT_EMAIL}</a>.</li>
            <li>This pilot-era notice describes current service behavior. Jurisdiction-specific rights, retention periods, international-transfer terms, and any paid-service terms should be legally reviewed before a broader public launch.</li>
          </ul>
          <p>See <Link href="/terms">Terms of Service</Link> for acceptable use and service limitations.</p>
        </DocSection>
      </DocShell>
    </MarketingShell>
  );
}
