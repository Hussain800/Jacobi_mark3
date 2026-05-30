import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import DesignNav from "../../../components/design/DesignNav";
import DesignFooter from "../../../components/design/DesignFooter";
import "../../jacobi-design.css";

export const dynamic = "force-dynamic";

async function fetchProbe(sessionId: string) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${apiBase}/api/share/${sessionId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchProbe(id);
  if (!data) return { title: "Probe Not Found — JACOBI" };
  const target = data.target_name || data.target_url || "Probe";
  return {
    title: `${target} — JACOBI Probe`,
    description: `Topology: ${data.topology_class || "unknown"} | Baseline: $${data.baseline_price || "?"} | Spread: $${data.max_price_spread || "?"}`,
    openGraph: {
      title: `${target} — JACOBI Probe`,
      description: `Pricing topology: ${data.topology_class || "unknown"} with $${data.max_price_spread || "?"} spread`,
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchProbe(id);

  if (!data) {
    return (
      <div className="jacobi-design">
        <Script src="/jacobi-design/scene.js"   strategy="afterInteractive" />
        <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />
        <DesignNav />
        <main className="page">
          <section className="section page-top">
            <div className="wrap">
              <div
                style={{
                  padding: "80px 24px",
                  textAlign: "center",
                  border: "1px dashed var(--line-2)",
                  borderRadius: "var(--r)",
                  background: "linear-gradient(180deg, var(--surface), var(--ink-2))",
                  maxWidth: 520,
                  margin: "120px auto",
                }}
              >
                <div className="label-mono" style={{ marginBottom: 14, color: "var(--cobalt-bright)" }}>
                  404 · probe not found
                </div>
                <p style={{ fontSize: 14, color: "var(--text-2)", maxWidth: 380, margin: "0 auto 22px", lineHeight: 1.6 }}>
                  This share link has expired or the probe result is no longer
                  available.
                </p>
                <Link href="/" className="btn btn-primary">
                  Back to JACOBI →
                </Link>
              </div>
            </div>
          </section>
        </main>
        <DesignFooter />
      </div>
    );
  }

  return <ShareResult data={data} />;
}

import { ShareResultClient } from "./share-client";
import type { TopologyReport } from "@/components/dashboard";

interface ShareResultProps {
  data: TopologyReport;
}

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function ShareResult({ data }: ShareResultProps) {
  return (
    <div className="jacobi-design">
      <Script src="/jacobi-design/scene.js"   strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />

      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap">
            <div className="sec-head" data-reveal>
              <span className="eyebrow">
                <span className="dot">●</span> Shared probe · public report
              </span>
              <h1 className="display sec-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
                {data.target_name || data.target_url}
              </h1>
              <p className="sec-lede sec" style={{ marginTop: 6 }}>
                {formatDate(data.timestamp || "")}
              </p>
              <div style={{ marginTop: 18 }}>
                <Link href="/chat" className="btn btn-primary">
                  Run your own probe →
                </Link>
              </div>
            </div>

            <div data-reveal style={{ marginTop: 32 }}>
              <ShareResultClient data={data} />
            </div>
          </div>
        </section>
      </main>

      <DesignFooter />
    </div>
  );
}
