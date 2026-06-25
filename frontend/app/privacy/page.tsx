import type { Metadata } from "next";
import Link from "next/link";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import "../jacobi-design.css";

export const metadata: Metadata = {
  title: "Privacy Policy — JACOBI",
  description:
    "What JACOBI collects, how it is used, and how it is stored. Account email, the audit URLs you submit, and probe results. Data is not sold.",
};

const CONTACT_EMAIL = "wearejacobi@outlook.com";

export default function PrivacyPage() {
  return (
    <div className="jacobi-design">
      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <div className="sec-head">
              <span className="eyebrow">
                <span className="dot">●</span> Privacy
              </span>
              <h1 className="display sec-title">Privacy Policy</h1>
              <p className="sec-lede sec">
                What JACOBI collects, why, and how it is handled. Plain and
                specific — no boilerplate beyond what applies to this service.
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
                    What we collect
                  </h2>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 18 }}>
                    <li>
                      <strong style={{ color: "var(--text)" }}>Account email.</strong>{" "}
                      When you sign in, authentication is handled by Supabase. We
                      store the email address associated with your account so we
                      can identify your workspace and your saved audits.
                    </li>
                    <li>
                      <strong style={{ color: "var(--text)" }}>Audit URLs you submit.</strong>{" "}
                      The product URLs and watchlist entries you enter for
                      monitoring are stored so audits can run and results can be
                      shown back to you over time.
                    </li>
                    <li>
                      <strong style={{ color: "var(--text)" }}>Scan and probe results.</strong>{" "}
                      The prices, page snapshots, and evidence captured by a
                      synthetic-buyer probe are stored against your account as the
                      record of each audit.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    How it is used
                  </h2>
                  <p>
                    Collected data is used to operate the service: to run the
                    audits you request, to display results and history back to
                    you, and to maintain your account. We do not sell your data
                    to third parties, and we do not use submitted URLs or audit
                    results to build a product for resale.
                  </p>
                </section>

                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    Payments
                  </h2>
                  <p>
                    Paid plans are processed by Stripe. Stripe handles card
                    details directly — we do not receive or store full card
                    numbers. Billing is currently operated in Stripe test /
                    sandbox mode; see the{" "}
                    <Link href="/pricing" className="nav-link" style={{ display: "inline" }}>
                      Pricing
                    </Link>{" "}
                    page for current plan details.
                  </p>
                </section>

                <section>
                  <h2
                    className="label-mono"
                    style={{ marginBottom: 10, color: "var(--text)" }}
                  >
                    Storage
                  </h2>
                  <p>
                    Account data, submitted URLs, and audit results are stored in
                    a Supabase Postgres database with row-level access controls so
                    that one workspace cannot read another workspace&apos;s data.
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
                    Questions about your data, or a request to delete it, can be
                    sent to{" "}
                    <a
                      className="nav-link"
                      style={{ display: "inline" }}
                      href={`mailto:${CONTACT_EMAIL}?subject=JACOBI%20privacy%20request`}
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
