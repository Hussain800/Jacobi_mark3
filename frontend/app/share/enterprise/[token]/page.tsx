import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import DesignNav from "../../../../components/design/DesignNav";
import DesignFooter from "../../../../components/design/DesignFooter";
import "../../../jacobi-design.css";

export const dynamic = "force-dynamic";

type SharedPacket = {
  redacted: boolean;
  share_token: { id: string; expires_at: string; revoked_at?: string | null };
  packet: {
    organization?: { name?: string };
    finding?: Record<string, unknown>;
    product?: { name?: string; sku?: string; map_floor?: number; currency?: string } | null;
    seller?: { name?: string; domain?: string } | null;
    watchlist_item?: { target_url?: string; market?: string } | null;
    evidence_items?: Array<Record<string, unknown>>;
  };
};

async function fetchSharedFinding(token: string): Promise<SharedPacket | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${apiBase}/api/enterprise/shared-findings/${token}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function text(value: unknown, fallback = "n/a") {
  return value == null || value === "" ? fallback : String(value);
}

function money(value: unknown, currency: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "n/a";
  return `${text(currency, "USD")} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchSharedFinding(token);
  if (!data) return { title: "Shared Finding Not Found - JACOBI" };
  return {
    title: `${data.packet.product?.name || "Shared MAP Finding"} - JACOBI`,
    description: "Redacted Jacobi MAP evidence packet for external review.",
  };
}

export default async function EnterpriseSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchSharedFinding(token);

  if (!data) {
    return (
      <div className="jacobi-design">
        <Script src="/jacobi-design/scene.js" strategy="afterInteractive" />
        <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />
        <DesignNav />
        <main className="page">
          <section className="section page-top">
            <div className="wrap">
              <div style={{ padding: "72px 24px", textAlign: "center", border: "1px dashed var(--line-2)", borderRadius: "var(--r-sm)", background: "var(--surface)", maxWidth: 560, margin: "120px auto" }}>
                <div className="label-mono" style={{ color: "var(--gold)", marginBottom: 12 }}>Share unavailable</div>
                <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                  This evidence link has expired, was revoked, or no longer exists.
                </p>
                <Link href="/" className="btn btn-primary">Back to JACOBI</Link>
              </div>
            </div>
          </section>
        </main>
        <DesignFooter />
      </div>
    );
  }

  const packet = data.packet;
  const finding = packet.finding || {};
  const evidence = packet.evidence_items || [];
  const currency = finding.currency || packet.product?.currency || "USD";

  return (
    <div className="jacobi-design">
      <Script src="/jacobi-design/scene.js" strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />
      <DesignNav />
      <main className="page">
        <section className="section page-top">
          <div className="wrap">
            <div className="sec-head" data-reveal>
              <span className="eyebrow"><span className="dot">*</span> Redacted MAP evidence</span>
              <h1 className="display sec-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
                {packet.product?.name || "Shared MAP finding"}
              </h1>
              <p className="sec-lede sec" style={{ marginTop: 8 }}>
                {packet.seller?.name || packet.seller?.domain || "Seller"} | {packet.watchlist_item?.market || "Market"}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, alignItems: "start", marginTop: 30 }}>
              <section style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: 22 }}>
                <span className="label-mono" style={{ color: "var(--text-2)" }}>Finding summary</span>
                <p style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
                  {text(finding.evidence_summary, "A price-integrity finding was shared for external review.")}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14, marginTop: 18 }}>
                  <Stat label="Severity" value={text(finding.severity)} />
                  <Stat label="Confidence" value={text(finding.confidence)} />
                  <Stat label="Observed" value={money(finding.observed_price, currency)} />
                  <Stat label="MAP floor" value={money(finding.map_floor, currency)} />
                </div>
              </section>

              <section style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: 22 }}>
                <span className="label-mono" style={{ color: "var(--text-2)" }}>Share controls</span>
                <div className="mono" style={{ color: "var(--text)", fontSize: 12, lineHeight: 1.7, marginTop: 12 }}>
                  Redacted: {data.redacted ? "yes" : "no"}<br />
                  Expires: {new Date(data.share_token.expires_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC<br />
                  Workspace: {packet.organization?.name || "Shared workspace"}
                </div>
              </section>
            </div>

            <section style={{ marginTop: 24 }}>
              <span className="label-mono" style={{ color: "var(--text-2)" }}>Evidence rows</span>
              <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflowX: "auto", marginTop: 12 }}>
                <div style={{ minWidth: 760 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 110px 130px 140px", gap: 12, background: "var(--surface-2)", padding: "12px 16px" }}>
                    {["Buyer context", "Price", "Source", "Captured"].map((h) => (
                      <span key={h} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{h}</span>
                    ))}
                  </div>
                  {evidence.map((row) => (
                    <div key={text(row.id)} style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 110px 130px 140px", gap: 12, borderTop: "1px solid var(--line)", padding: "12px 16px", alignItems: "center" }}>
                      <span className="mono" style={{ color: "var(--text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text(row.buyer_context)}</span>
                      <span className="mono" style={{ color: "var(--text)", fontSize: 12 }}>{money(row.observed_price, row.currency || currency)}</span>
                      <span className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>{text(row.source)}</span>
                      <span className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>{text(row.captured_at).slice(0, 10)}</span>
                    </div>
                  ))}
                  {evidence.length === 0 && (
                    <div className="mono" style={{ borderTop: "1px solid var(--line)", padding: 18, color: "var(--text-2)", fontSize: 12 }}>
                      No evidence rows are attached to this shared finding.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
      <DesignFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono" style={{ color: "var(--text)", fontSize: 14 }}>{value}</div>
      <div className="label-mono" style={{ color: "var(--text-2)", marginTop: 5 }}>{label}</div>
    </div>
  );
}
