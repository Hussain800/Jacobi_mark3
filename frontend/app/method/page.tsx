import type { Metadata } from "next";
import Link from "next/link";
import DocumentShell, { DocumentArticle, DocumentToc } from "../../components/documents/DocumentShell";
import MethodSystemMap from "../../components/documents/MethodSystemMap";
import "../jacobi-design.css";

export const metadata: Metadata = {
  title: "Method | How JACOBI builds evidence",
  description:
    "A plain-language explanation of JACOBI's controlled pricing audits, evidence chain, quality controls, and limitations.",
};

const toc = [
  { href: "#overview", label: "The short version" },
  { href: "#evidence-path", label: "Evidence path" },
  { href: "#request-profiles", label: "Request profiles" },
  { href: "#findings", label: "How findings work" },
  { href: "#review", label: "Review and sharing" },
  { href: "#limits", label: "Limits and safeguards" },
];

export default function MethodPage() {
  return (
    <DocumentShell
      section="Method"
      title="How Jacobi turns price checks into reviewable evidence"
      summary="Jacobi compares the prices returned to configured request profiles during one audit window. It keeps the observations, the extraction context, and the limits of the result together so your team can judge what happened."
      meta="Method v0.9 · Last reviewed June 26, 2026"
      aside={
        <div className="doc-aside-note">
          <span>Designed for review</span>
          <strong>Observed prices, coverage, provenance, and limits travel together.</strong>
        </div>
      }
    >
      <DocumentToc items={toc} />
      <DocumentArticle>
        <section id="overview" className="doc-section doc-intro">
          <p className="doc-overline">The short version</p>
          <h2>Compare what a page returns, not a story about what it might do.</h2>
          <div className="doc-split-copy">
            <p>
              A Jacobi audit starts with a public URL that an authenticated workspace is allowed to submit. The service asks for that URL through a configured set of request profiles within a short window, extracts usable prices, and shows the observations side by side.
            </p>
            <p>
              The result is evidence for review. It can show a price spread, a MAP-floor undercut, a partial response set, or a blocked target. It does not turn one set of requests into a legal conclusion about a seller&apos;s intent or a site&apos;s pricing policy.
            </p>
          </div>
        </section>

        <section id="evidence-path" className="doc-section">
          <MethodSystemMap />
        </section>

        <section id="request-profiles" className="doc-section">
          <p className="doc-overline">Configured profiles</p>
          <h2>What changes between observations</h2>
          <p className="doc-copy">
            A profile is a configured request context, not a real person. Depending on the audit mode, Jacobi can compare selected country, device headers, session and referrer state, network labels, and a controlled language pair. The exact context that is available is retained with the evidence.
          </p>
          <div className="profile-matrix" role="table" aria-label="Configured request profile dimensions">
            <div className="profile-head" role="row">
              <span role="columnheader">Dimension</span>
              <span role="columnheader">What Jacobi compares</span>
              <span role="columnheader">Important boundary</span>
            </div>
            <div role="row">
              <strong role="cell">Request locale</strong>
              <span role="cell">A selected country and a controlled language pair where supported.</span>
              <span role="cell">This is not a promise of city, income, or personal targeting.</span>
            </div>
            <div role="row">
              <strong role="cell">Device presentation</strong>
              <span role="cell">Configured desktop or mobile-style request headers.</span>
              <span role="cell">It is a request profile, not a physical device measurement.</span>
            </div>
            <div role="row">
              <strong role="cell">Session context</strong>
              <span role="cell">Fresh or returning session labels and referral context.</span>
              <span role="cell">Only the configured factors are compared; unrepresented factors stay unknown.</span>
            </div>
          </div>
          <div className="doc-callout">
            <strong>Why this matters.</strong> Jacobi treats price variation, attributable variation, and a MAP-floor comparison as different outputs. A difference is recorded; it is not automatically assigned a cause.
          </div>
        </section>

        <section id="findings" className="doc-section">
          <p className="doc-overline">Decision rules</p>
          <h2>How Jacobi stays restrained</h2>
          <div className="method-rules">
            <article>
              <span>01</span>
              <h3>Coverage before confidence</h3>
              <p>Blocked, missing, and unusable responses remain visible. Thin coverage limits the confidence of a comparison instead of being rounded into a clean answer.</p>
            </article>
            <article>
              <span>02</span>
              <h3>MAP is a separate policy check</h3>
              <p>A MAP finding needs a configured floor, a recorded observed low price below that floor, and enough usable coverage for the rule to run.</p>
            </article>
            <article>
              <span>03</span>
              <h3>No automatic legal conclusion</h3>
              <p>Findings describe what was observed at a point in time. They support your review; they are not an adjudication, guarantee, or legal advice.</p>
            </article>
          </div>
        </section>

        <section id="review" className="doc-section">
          <p className="doc-overline">Evidence lifecycle</p>
          <h2>What a reviewer can trace</h2>
          <div className="evidence-chain">
            <div><span>Watchlist</span><p>Product, seller, MAP floor, and target URL.</p></div>
            <div><span>Scan job</span><p>Role, target limit, budget, rate, and status controls.</p></div>
            <div><span>Evidence rows</span><p>Observed prices with source and extraction context.</p></div>
            <div><span>Finding</span><p>Coverage-aware comparison or MAP policy result.</p></div>
            <div><span>Export or share</span><p>Server-generated PDF or JSON, checksum, and controlled access.</p></div>
          </div>
          <p className="doc-copy">
            Workspace exports are generated on the server and recorded. A public share can be redacted, time-limited, and revoked; redacted packets remove internal workspace identifiers, probe session identifiers, extraction metadata, and URL paths while keeping the useful evidence context.
          </p>
        </section>

        <section id="limits" className="doc-section doc-limitations">
          <p className="doc-overline">Limits and safeguards</p>
          <h2>A clear result is never more certain than its inputs.</h2>
          <ul>
            <li>Third-party sites can rate limit, block, change, or require a login. Jacobi shows the resulting limitation rather than promising a complete read.</li>
            <li>Managed provider access can improve reach. Guarded direct requests can be used as a fallback, but they do not carry the same configured proxy context.</li>
            <li>Smart-24 names a configured profile matrix. Matching scout observations can be inferred to avoid needless identical external requests.</li>
            <li>A captured price is a timestamped observation, not continuous monitoring and not a guarantee of a future offer.</li>
            <li>Demo results are clearly cached samples. They are never represented as a live capture.</li>
          </ul>
          <p className="doc-copy">
            For access, data handling, and acceptable use, see the <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.
          </p>
        </section>
      </DocumentArticle>
    </DocumentShell>
  );
}
