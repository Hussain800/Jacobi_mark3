import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../../components/marketing/MarketingShell";
import { PageHeader, SectionMarker, DocShell, DocSection } from "../../components/marketing/parts";

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

const PIPELINE: [string, string][] = [
  ["Profiles", "A configured set of request contexts — country, device, session, network tier."],
  ["Requests", "The same URL is asked through every profile inside one short audit window."],
  ["Extraction", "Usable prices are pulled from each response with its source context kept."],
  ["Comparison", "Observations are placed side by side; coverage gaps stay visible."],
  ["Evidence", "A coverage-aware finding or MAP result, timestamped and reviewable."],
];

const LIFECYCLE: [string, string][] = [
  ["Watchlist", "Product, seller, MAP floor, and target URL."],
  ["Scan job", "Role, target limit, budget, rate, and status controls."],
  ["Evidence rows", "Observed prices with source and extraction context."],
  ["Finding", "Coverage-aware comparison or MAP policy result."],
  ["Export or share", "Server-generated PDF or JSON, checksum, and controlled access."],
];

const RULES: [string, string][] = [
  ["Coverage before confidence", "Blocked, missing, and unusable responses stay visible. Thin coverage limits a comparison's confidence instead of being rounded into a clean answer."],
  ["MAP is a separate policy check", "A MAP finding needs a configured floor, a recorded observed low price below that floor, and enough usable coverage for the rule to run."],
  ["No automatic legal conclusion", "Findings describe what was observed at a point in time. They support your review; they are not an adjudication, guarantee, or legal advice."],
];

export default function MethodPage() {
  return (
    <MarketingShell>
      <PageHeader
        eyebrow="Method"
        title="How Jacobi turns price checks into reviewable evidence."
        lede="Jacobi compares the prices returned to configured request profiles during one audit window — and keeps the observations, the extraction context, and the limits of the result together so your team can judge what happened."
        meta={<><span>Method v0.9</span><span>Last reviewed Jun 26, 2026</span></>}
      />

      <SectionMarker id="01" name="The method" meta="evidence, not a story" />
      <DocShell
        toc={toc}
        aside={<><span className="l">Designed for review</span><strong>Observed prices, coverage, provenance, and limits travel together.</strong></>}
      >
        <DocSection id="overview" overline="The short version" title="Compare what a page returns, not a story about what it might do." tone="intro">
          <div className="jx-splitcopy">
            <p>A Jacobi audit starts with a public URL that an authenticated workspace is allowed to submit. The service asks for that URL through a configured set of request profiles within a short window, extracts usable prices, and shows the observations side by side.</p>
            <p>The result is evidence for review. It can show a price spread, a MAP-floor undercut, a partial response set, or a blocked target. It does not turn one set of requests into a legal conclusion about a seller&apos;s intent or a site&apos;s pricing policy.</p>
          </div>
        </DocSection>

        <DocSection id="evidence-path" overline="The pipeline" title="How an audit becomes evidence.">
          <div className="jx-chain">
            {PIPELINE.map(([k, v]) => (
              <div className="jx-chain__cell" key={k}><span>{k}</span><p>{v}</p></div>
            ))}
          </div>
        </DocSection>

        <DocSection id="request-profiles" overline="Configured profiles" title="What changes between observations.">
          <p>A profile is a configured request context, not a real person. Depending on the audit mode, Jacobi can compare selected country, device headers, session and referrer state, network labels, and a controlled language pair. The exact context that is available is retained with the evidence.</p>
          <div className="jx-deftable">
            <div className="jx-deftable__head"><span>Dimension</span><span>What Jacobi compares</span><span>Important boundary</span></div>
            <div className="jx-deftable__row"><strong>Request locale</strong><span>A selected country and a controlled language pair where supported.</span><span className="muted">Not a promise of city, income, or personal targeting.</span></div>
            <div className="jx-deftable__row"><strong>Device presentation</strong><span>Configured desktop or mobile-style request headers.</span><span className="muted">A request profile, not a physical device measurement.</span></div>
            <div className="jx-deftable__row"><strong>Session context</strong><span>Fresh or returning session labels and referral context.</span><span className="muted">Only configured factors are compared; the rest stays unknown.</span></div>
          </div>
          <div className="jx-callout">
            <p><strong>Why this matters.</strong> Jacobi treats price variation, attributable variation, and a MAP-floor comparison as different outputs. A difference is recorded; it is not automatically assigned a cause.</p>
          </div>
        </DocSection>

        <DocSection id="findings" overline="Decision rules" title="How Jacobi stays restrained.">
          <div className="jx-steps">
            {RULES.map(([h, p], i) => (
              <div className="jx-steps__item" key={h}>
                <span className="jx-steps__n">{String(i + 1).padStart(2, "0")}</span>
                <div><h3>{h}</h3><p>{p}</p></div>
              </div>
            ))}
          </div>
        </DocSection>

        <DocSection id="review" overline="Evidence lifecycle" title="What a reviewer can trace.">
          <div className="jx-steps">
            {LIFECYCLE.map(([h, p], i) => (
              <div className="jx-steps__item" key={h}>
                <span className="jx-steps__n">{String(i + 1).padStart(2, "0")}</span>
                <div><h3>{h}</h3><p>{p}</p></div>
              </div>
            ))}
          </div>
          <p>Workspace exports are generated on the server and recorded. A public share can be redacted, time-limited, and revoked; redacted packets remove internal workspace identifiers, probe session identifiers, extraction metadata, and URL paths while keeping the useful evidence context.</p>
        </DocSection>

        <DocSection id="limits" overline="Limits and safeguards" title="A clear result is never more certain than its inputs." tone="limits">
          <ul className="jx-checklist">
            <li>Third-party sites can rate limit, block, change, or require a login. Jacobi shows the resulting limitation rather than promising a complete read.</li>
            <li>Managed provider access can improve reach. Guarded direct requests can be a fallback, but they do not carry the same configured proxy context.</li>
            <li>Smart-24 names a configured profile matrix. Matching scout observations can be inferred to avoid needless identical external requests.</li>
            <li>A captured price is a timestamped observation, not continuous monitoring and not a guarantee of a future offer.</li>
            <li>Demo results are clearly cached samples. They are never represented as a live capture.</li>
          </ul>
          <p>For access, data handling, and acceptable use, see the <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.</p>
        </DocSection>
      </DocShell>
    </MarketingShell>
  );
}
