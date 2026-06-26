import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Scale, UserCheck } from "lucide-react";
import DocumentShell, { DocumentArticle, DocumentToc } from "../../components/documents/DocumentShell";
import "../jacobi-design.css";

export const metadata: Metadata = {
  title: "Terms of Service | JACOBI",
  description: "Pilot terms for using the JACOBI pricing-audit service.",
};

const CONTACT_EMAIL = "wearejacobi@outlook.com";
const toc = [
  { href: "#summary", label: "Plain-language summary" },
  { href: "#accounts", label: "Accounts and workspaces" },
  { href: "#use", label: "Acceptable use" },
  { href: "#service", label: "Service limits" },
  { href: "#third-parties", label: "Third-party services" },
  { href: "#changes", label: "Changes and contact" },
];

export default function TermsPage() {
  return (
    <DocumentShell
      section="Terms"
      title="Pilot terms for using JACOBI responsibly"
      summary="These terms describe the current pilot service: who may use it, what the evidence does and does not establish, and the obligations that come with probing third-party sites."
      meta="Terms v0.9 · Effective June 26, 2026"
      aside={<div className="doc-aside-note"><span>Service posture</span><strong>Evidence for review, never a promise about a third-party site.</strong></div>}
    >
      <DocumentToc items={toc} />
      <DocumentArticle>
        <section id="summary" className="doc-section doc-intro">
          <p className="doc-overline">Plain-language summary</p>
          <h2>Use JACOBI to investigate pages you have a legitimate reason to monitor.</h2>
          <div className="terms-summary">
            <div><UserCheck aria-hidden="true" /><p>You are responsible for the URLs you submit and for making sure your use complies with applicable law and the target site&apos;s terms.</p></div>
            <div><Scale aria-hidden="true" /><p>Jacobi provides timestamped observations and policy checks for your review. It does not decide a legal dispute or prove a seller&apos;s intent.</p></div>
            <div><AlertTriangle aria-hidden="true" /><p>Third-party sites can block or change. An incomplete audit is an honest outcome, not a breach of a guaranteed service level.</p></div>
          </div>
        </section>

        <section id="accounts" className="doc-section">
          <p className="doc-overline">Accounts and workspaces</p>
          <h2>Keep workspace access deliberate.</h2>
          <p className="doc-copy">
            You are responsible for activity taken through your account and for assigning appropriate roles to workspace members. Owners, administrators, analysts, and viewers have different permitted actions. Do not share credentials or use another person&apos;s account without authorization.
          </p>
          <p className="doc-copy">
            Workspace data includes the URLs, watchlists, observations, findings, exports, and sharing records created in that workspace. Use the role and sharing controls to keep that information with the people who need it.
          </p>
        </section>

        <section id="use" className="doc-section">
          <p className="doc-overline">Acceptable use</p>
          <h2>Do not turn a price audit into an attack.</h2>
          <div className="acceptable-use">
            <div><span>Allowed</span><ul><li>Monitor your own listings, authorized brand products, or pages you otherwise have a legitimate basis to assess.</li><li>Use findings as an input to compliance, pricing, or commercial review.</li><li>Share a redacted evidence packet only with intended recipients.</li></ul></div>
            <div><span>Not allowed</span><ul><li>Submit private, internal, or non-public network targets.</li><li>Use the service to harass, overload, evade access controls, or attack a third party.</li><li>Represent a Jacobi finding as a guaranteed fact, legal determination, or court-ready conclusion.</li></ul></div>
          </div>
        </section>

        <section id="service" className="doc-section">
          <p className="doc-overline">Service limits</p>
          <h2>Third-party pages are outside our control.</h2>
          <div className="doc-split-copy">
            <p>Target sites can change prices, challenge automated requests, require login, rate limit, or return incomplete data. Jacobi does not warrant that every audit will run, that every price will be extracted, or that a result will remain true after its timestamp.</p>
            <p>The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis during this pilot. Coverage, confidence, and limitations belong in the reviewer&apos;s decision; see <Link href="/method">How JACOBI works</Link> for the method behind those labels.</p>
          </div>
        </section>

        <section id="third-parties" className="doc-section">
          <p className="doc-overline">Third-party services and billing</p>
          <h2>We use providers to operate the pilot.</h2>
          <p className="doc-copy">
            Authentication and workspace storage rely on Supabase. Managed live requests may use BrightData when explicitly initiated. Stripe remains in test mode and is not a live paid-service offering. Provider availability can affect a run, but it does not change the limits described above.
          </p>
          <p className="doc-copy">More on data handling is available in the <Link href="/privacy">Privacy Policy</Link>.</p>
        </section>

        <section id="changes" className="doc-section doc-limitations">
          <p className="doc-overline">Changes and contact</p>
          <h2>We will date material changes to these pilot terms.</h2>
          <p className="doc-copy">
            This version applies to the current pilot service. Before a paid public launch, Jacobi&apos;s enforceable commercial terms, governing law, dispute process, liability provisions, and customer-specific commitments should be completed with legal review. We will post a revised effective date when these terms materially change.
          </p>
          <p className="doc-copy">Questions can be sent to <a href={`mailto:${CONTACT_EMAIL}?subject=JACOBI%20terms%20question`}>{CONTACT_EMAIL}</a>.</p>
        </section>
      </DocumentArticle>
    </DocumentShell>
  );
}
