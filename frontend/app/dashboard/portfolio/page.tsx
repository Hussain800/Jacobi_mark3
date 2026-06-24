import Link from "next/link";
import { PORTFOLIO, fmtDate } from "../demo-data";
import { SeverityBadge, PageHead } from "../ui";

const COLS = "minmax(0,2.2fr) minmax(0,1.6fr) 80px 90px 110px 130px";

function StatusCell({ status, severity, spreadPct, findingId }: {
  status: string; severity?: import("../demo-data").Severity; spreadPct?: number; findingId?: string;
}) {
  if (status === "clear") return <span className="mono" style={{ fontSize: 12, color: "var(--good)" }}>● Clear</span>;
  if (status === "auditing") return <span className="mono" style={{ fontSize: 12, color: "var(--cobalt-bright)" }}>● Auditing…</span>;
  if (status === "insufficient") return <span className="mono" style={{ fontSize: 12, color: "var(--gold)" }}>● Insufficient</span>;
  // finding
  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {severity && <SeverityBadge severity={severity} />}
      {spreadPct != null && <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{spreadPct}%</span>}
    </span>
  );
  return findingId ? <Link href={`/dashboard/evidence/${findingId}`} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

export default function PortfolioPage() {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <PageHead
          eyebrow="Portfolio"
          title="Monitored URLs"
          lede="Products, sellers, and pricing pages under continuous synthetic-buyer audit. Each row is scanned on its cadence; findings flow into the queue."
        />
        <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
          <button className="btn btn-ghost" title="Available in the full product" style={{ opacity: 0.6, cursor: "default" }}>Import CSV</button>
          <Link href="/dashboard/audits" className="btn btn-primary">+ Run an audit</Link>
        </div>
      </div>

      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "12px 18px", background: "var(--surface-2)" }}>
          {["Product / SKU", "Seller", "Market", "Cadence", "Last audit", "Status"].map((h) => (
            <span key={h} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{h}</span>
          ))}
        </div>
        {PORTFOLIO.map((p) => (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "14px 18px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.product}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{p.sku}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.seller}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{p.domain}</div>
            </div>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{p.market}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{p.cadence}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{fmtDate(p.lastAudit)}</span>
            <StatusCell status={p.lastStatus} severity={p.latestSeverity} spreadPct={p.latestSpreadPct} findingId={p.findingId} />
          </div>
        ))}
      </div>
    </div>
  );
}
