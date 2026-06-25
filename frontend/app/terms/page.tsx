import type { Metadata } from "next";
import Link from "next/link";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import "../jacobi-design.css";

export const metadata: Metadata = {
  title: "Terms of Service — JACOBI",
  description:
    "Acceptable use, no warranty on third-party site availability or scrape success, evidence is best-effort, and billing terms for JACOBI.",
};

const CONTACT_EMAIL = "wearejacobi@outlook.com";

export default function TermsPage() {
  return (
    <div className="jacobi-design">
      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <div className="sec-head">
              <span className="eyebrow">
                <span className="dot">●</span> Terms
              </span>
              <h1 className="display sec-title">Terms of Service</h1>
              <p className="sec-lede sec">
                The terms under which JACOBI is provided. By using the service
                you agree to the points below.
              </p>
            </div>

            <div
              className="card"
              style={{ padding: "clamp(24px, 4vw, 40px)" }}
            >
              <article
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 28,
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: "var(--text-2)",
                }}
              >
                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    Acceptable use
                  </h2>
                  <p>
                    Only submit URLs that you are authorized to monitor — for
                    example, your own listings, your brand&apos;s products, or
                    pages you have a legitimate basis to audit. You are
                    responsible for ensuring your use of JACOBI complies with the
                    terms of the sites you target and with applicable law. Do not
                    use the service to harass, overload, or attack any third
                    party.
                  </p>
                </section>

                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    No warranty on third-party sites
                  </h2>
                  <p>
                    JACOBI probes sites it does not control. We do not warrant
                    that any target site will be reachable, that a scrape will
                    succeed, or that a given price will be captured. Sites change,
                    go down, and may block automated access at any time. The
                    service is provided &quot;as is&quot;, without warranties of
                    availability, accuracy, or fitness for a particular purpose.
                  </p>
                </section>

                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    Evidence is best-effort
                  </h2>
                  <p>
                    Audit results, snapshots, and findings are best-effort
                    evidence of what a probe observed at a point in time. They are
                    not a guarantee of a site&apos;s behavior and are not legal
                    advice or a legal determination. See the{" "}
                    <Link href="/method" className="nav-link" style={{ display: "inline" }}>
                      Method
                    </Link>{" "}
                    page for how results are produced and their limitations.
                  </p>
                </section>

                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    Billing
                  </h2>
                  <p>
                    Plans, prices, and what each plan includes are described on
                    the{" "}
                    <Link href="/pricing" className="nav-link" style={{ display: "inline" }}>
                      Pricing
                    </Link>{" "}
                    page. Paid plans are billed through Stripe. Prices are in USD.
                  </p>
                </section>

                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    Contact
                  </h2>
                  <p>
                    Questions about these terms can be sent to{" "}
                    <a
                      className="nav-link"
                      style={{ display: "inline" }}
                      href={`mailto:${CONTACT_EMAIL}?subject=JACOBI%20terms%20question`}
                    >
                      {CONTACT_EMAIL}
                    </a>
                    .
                  </p>
                </section>
              </article>
            </div>

            <p className="label-mono" style={{ marginTop: 24 }}>
              Last updated 2026 · JACOBI
            </p>
          </div>
        </section>
      </main>

      <DesignFooter />
    </div>
  );
}
