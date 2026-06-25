import type { Metadata } from "next";
import Link from "next/link";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import "../jacobi-design.css";

export const metadata: Metadata = {
  title: "Browser extension — JACOBI",
  description:
    "A JACOBI browser extension is in development and not yet shipped. This page describes what it is intended to do.",
};

export default function ExtensionPage() {
  return (
    <div className="jacobi-design">
      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <div className="sec-head">
              <span className="eyebrow">
                <span className="dot">●</span> Extension
              </span>
              <h1 className="display sec-title">
                Browser extension —{" "}
                <span className="serif-i" style={{ color: "var(--cobalt-bright)" }}>
                  in development
                </span>
              </h1>
              <p className="sec-lede sec">
                A JACOBI browser extension exists as a work-in-progress in the
                codebase. It is not published and not available to install. This
                page is here so the link is not dead — not to suggest it ships
                today.
              </p>
            </div>

            <div className="card" style={{ padding: "clamp(24px, 4vw, 40px)" }}>
              <article
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: "var(--text-2)",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 9,
                    alignSelf: "flex-start",
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--line-2)",
                    color: "var(--text-3)",
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Status: not shipped
                </div>

                <section>
                  <h2 className="label-mono" style={{ marginBottom: 10, color: "var(--text)" }}>
                    What it is
                  </h2>
                  <p>
                    A Chrome extension prototype lives in the repository&apos;s{" "}
                    <code style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>
                      extension/
                    </code>{" "}
                    directory. It is unreleased and unfinished. It is not in the
                    Chrome Web Store, and there is no supported install path for
                    it yet.
                  </p>
                </section>

                <section>
                  <h2 className="label-mono" style={{ marginBottom: 10, color: "var(--text)" }}>
                    What it is intended to do
                  </h2>
                  <p>
                    The intent is to let you start an audit from the page
                    you&apos;re on — for example, a right-click or shortcut that
                    sends the current product URL to JACOBI to probe — rather than
                    copying the URL into the web app by hand. This is a
                    convenience layer over the same probe described on the{" "}
                    <Link href="/method" className="nav-link" style={{ display: "inline" }}>
                      Method
                    </Link>{" "}
                    page; it does not change how audits work.
                  </p>
                </section>

                <section>
                  <h2 className="label-mono" style={{ marginBottom: 10, color: "var(--text)" }}>
                    Until then
                  </h2>
                  <p>
                    Audits run in the web app today. You can start one from the{" "}
                    <Link href="/chat" className="nav-link" style={{ display: "inline" }}>
                      audit page
                    </Link>{" "}
                    by submitting a URL directly.
                  </p>
                </section>
              </article>
            </div>
          </div>
        </section>
      </main>

      <DesignFooter />
    </div>
  );
}
