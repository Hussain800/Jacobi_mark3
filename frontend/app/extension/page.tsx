import type { Metadata } from "next";
import Link from "next/link";
import { Check, MonitorSmartphone, ShieldCheck, Store } from "lucide-react";
import DocumentShell, { DocumentArticle, DocumentToc } from "../../components/documents/DocumentShell";
import "../jacobi-design.css";

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

export default function ExtensionPage() {
  return (
    <DocumentShell
      section="Browser extension"
      title="A faster handoff from the page you are reviewing"
      summary="The JACOBI extension is a development prototype, not a published browser product. This page explains its intended workflow and the safeguards required before anyone should install it."
      meta="Prototype status · No public install or Chrome Web Store listing"
      aside={
        <div className="extension-status-card">
          <Store aria-hidden="true" />
          <div><span>Availability</span><strong>Not shipped</strong></div>
          <p>No installer. No store listing. No supported production configuration.</p>
        </div>
      }
    >
      <DocumentToc items={toc} />
      <DocumentArticle>
        <section id="status" className="doc-section doc-intro">
          <p className="doc-overline">Current status</p>
          <h2>There is no JACOBI extension for customers to install today.</h2>
          <div className="doc-split-copy">
            <p>
              The repository includes a Chrome extension prototype with a popup, a context-menu action, local recent-item storage, and a lightweight on-page price cue. It is unfinished, uses development configuration, and is not published through the Chrome Web Store.
            </p>
            <p>
              That distinction matters. This is a roadmap page, not a download page. The web app remains the supported way to submit an audit URL today.
            </p>
          </div>
          <Link href="/chat" className="doc-action">Open the supported audit workflow <span aria-hidden="true">→</span></Link>
        </section>

        <section id="workflow" className="doc-section">
          <p className="doc-overline">Intended workflow</p>
          <h2>Keep the decision in the web app, remove the copy-and-paste.</h2>
          <div className="extension-flow">
            <div><MonitorSmartphone aria-hidden="true" /><span>01</span><h3>Identify a page</h3><p>From a product or offer page, the extension would let a user choose the URL they are already reviewing.</p></div>
            <div><span>02</span><h3>Hand off the URL</h3><p>The URL would open in Jacobi&apos;s audit workflow. The extension would not make an evidence claim on the page itself.</p></div>
            <div><span>03</span><h3>Run an explicit audit</h3><p>The user would still review the target and deliberately start the audit in Jacobi. No background live scan should begin from passive browsing.</p></div>
            <div><span>04</span><h3>Review the evidence</h3><p>Results, coverage, exports, and any share controls remain in the authenticated Jacobi workspace.</p></div>
          </div>
        </section>

        <section id="release-bar" className="doc-section">
          <p className="doc-overline">Release bar</p>
          <h2>What must be true before this can be a product</h2>
          <div className="release-grid">
            {[
              ["Production handoff", "The prototype must point to the supported production app rather than a local development address."],
              ["Least privilege", "Every browser permission and host pattern must be reduced to the minimum needed for a specific user-facing feature."],
              ["Clear disclosure", "The store listing, permissions explanation, privacy notice, and in-product controls must describe the same behavior."],
              ["Independent review", "The extension needs functional, privacy, security, and Chrome Web Store policy review before release."],
            ].map(([title, detail]) => <div key={title}><Check aria-hidden="true" /><h3>{title}</h3><p>{detail}</p></div>)}
          </div>
        </section>

        <section id="data" className="doc-section doc-limitations">
          <p className="doc-overline">Data and permissions</p>
          <h2>Nothing should be implicit.</h2>
          <p className="doc-copy">
            A released extension would explain each requested browser permission in plain language: what it enables, when it runs, what data it can reach, whether data leaves the browser, and how the user can remove access. That disclosure does not exist for a released JACOBI extension because there is no released JACOBI extension.
          </p>
          <div className="doc-callout">
            <ShieldCheck aria-hidden="true" />
            <p><strong>For now:</strong> use the web application for audits and see the <Link href="/privacy">Privacy Policy</Link> for the current service data-handling overview.</p>
          </div>
        </section>
      </DocumentArticle>
    </DocumentShell>
  );
}
