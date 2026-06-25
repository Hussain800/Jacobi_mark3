import type { Metadata } from "next";
import Link from "next/link";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import "../jacobi-design.css";

export const metadata: Metadata = {
  title: "Method — How JACOBI works",
  description:
    "How JACOBI runs a controlled synthetic-buyer probe, its provider modes, capability labels, and the limits of the evidence it produces.",
};

export default function MethodPage() {
  return (
    <div className="jacobi-design">
      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap" style={{ maxWidth: 820 }}>
            <div className="sec-head">
              <span className="eyebrow">
                <span className="dot">●</span> Method
              </span>
              <h1 className="display sec-title">How JACOBI works</h1>
              <p className="sec-lede sec">
                JACOBI runs controlled synthetic-buyer probes against the URLs
                you submit and records what each observation saw. This page
                explains the mechanism honestly, including where it does not
                work.
              </p>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: 18 }}
            >
              {/* ── The probe ─────────────────────────────────── */}
              <div className="card" style={{ padding: "clamp(22px, 3.5vw, 36px)" }}>
                <h2 className="label-mono" style={{ marginBottom: 12, color: "var(--text)" }}>
                  The controlled synthetic-buyer probe
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "var(--text-2)",
                  }}
                >
                  <p>
                    For each target URL, JACOBI sends multiple observation
                    agents. Each agent carries a different controlled identity —
                    varying along axes such as location, device profile, session
                    state, referral source, and network tier — and requests the
                    same page within a short window. The goal is to capture the
                    price and offer each identity is shown, so they can be
                    compared side by side.
                  </p>
                  <p>
                    The output is a set of observations: what was requested, what
                    the page returned, and the price extracted from it. A
                    difference between identities is recorded as evidence of
                    variation; it is not, by itself, a legal conclusion about the
                    target&apos;s pricing practices.
                  </p>
                </div>
              </div>

              {/* ── Provider modes ────────────────────────────── */}
              <div className="card" style={{ padding: "clamp(22px, 3.5vw, 36px)" }}>
                <h2 className="label-mono" style={{ marginBottom: 12, color: "var(--text)" }}>
                  Provider modes
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "var(--text-2)",
                  }}
                >
                  <p>
                    Probes run through one of two fetch providers, depending on
                    how the deployment is configured:
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 18 }}>
                    <li>
                      <strong style={{ color: "var(--text)" }}>Managed provider.</strong>{" "}
                      A managed BrightData Web Unlocker provider handles requests
                      with rotating residential network access and bot-mitigation
                      handling. This mode reaches more sites but consumes metered
                      external capacity per request.
                    </li>
                    <li>
                      <strong style={{ color: "var(--text)" }}>Local / dev mode.</strong>{" "}
                      A local fetch path used for development and demos. It does
                      not use the managed provider, has a much narrower reach, and
                      is the mode under which cached, clearly labeled sample data
                      may be returned.
                    </li>
                  </ul>
                </div>
              </div>

              {/* ── Capability labels ─────────────────────────── */}
              <div className="card" style={{ padding: "clamp(22px, 3.5vw, 36px)" }}>
                <h2 className="label-mono" style={{ marginBottom: 12, color: "var(--text)" }}>
                  Capability labels
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "var(--text-2)",
                  }}
                >
                  <p>
                    Not every site can be probed. Some sites block automated
                    access, require logins, or serve content that cannot be
                    reliably parsed. Results are labeled by capability so you can
                    tell a real observation from a partial or failed one, rather
                    than presenting every site as if it succeeded.
                  </p>
                  <p>
                    Treat results as{" "}
                    <strong style={{ color: "var(--text)" }}>best-effort evidence</strong>{" "}
                    of what was observed — not a guarantee that a site prices a
                    certain way, and not a promise that any given site can be
                    audited at all.
                  </p>
                </div>
              </div>

              {/* ── Limitations ───────────────────────────────── */}
              <div className="card" style={{ padding: "clamp(22px, 3.5vw, 36px)" }}>
                <h2 className="label-mono" style={{ marginBottom: 12, color: "var(--text)" }}>
                  Evidence limitations
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "var(--text-2)",
                  }}
                >
                  <ul style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 18 }}>
                    <li>
                      Hard targets — sites with strong bot defenses, aggressive
                      rate limiting, or login walls — can block probes, and those
                      runs will not produce a clean price.
                    </li>
                    <li>
                      Demo and sample results shown in local / dev mode are cached
                      and labeled as such; they are not live captures.
                    </li>
                    <li>
                      A price reflects one observation at one moment. Sites change
                      prices over time, so a single probe is a snapshot, not a
                      continuous measurement.
                    </li>
                    <li>
                      Findings describe what was observed. They are evidence for
                      your own review and are not a legal determination.
                    </li>
                  </ul>
                  <p>
                    Plans and what each run includes are on the{" "}
                    <Link href="/pricing" className="nav-link" style={{ display: "inline" }}>
                      Pricing
                    </Link>{" "}
                    page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <DesignFooter />
    </div>
  );
}
