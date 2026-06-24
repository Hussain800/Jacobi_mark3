"use client";

import Link from "next/link";
import { fmtDate, type Severity } from "../demo-data";
import { KpiStrip, SeverityBadge, TypePill, PageHead } from "../ui";
import { useEnterpriseWorkspace } from "../use-enterprise-workspace";

const SEV: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function OverviewPage() {
  const { data, loading, mode } = useEnterpriseWorkspace();
  const k = data.kpis;
  const priority = [...data.findings].sort((a, b) => SEV[a.severity] - SEV[b.severity]).slice(0, 4);

  const offenders = Object.values(
    data.findings.reduce<Record<string, { domain: string; seller: string; count: number; worst: Severity }>>(
      (acc, f) => {
        const cur = acc[f.domain] || { domain: f.domain, seller: f.seller, count: 0, worst: "low" as Severity };
        cur.count += 1;
        if (SEV[f.severity] < SEV[cur.worst]) cur.worst = f.severity;
        acc[f.domain] = cur;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => SEV[a.worst] - SEV[b.worst] || b.count - a.count);

  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: "var(--r-sm)",
    background: "var(--surface)",
    padding: 22,
  };

  return (
    <div>
      <PageHead
        eyebrow="Overview"
        title="Price integrity posture"
        lede={
          mode === "live"
            ? "Live workspace view across imported watchlists, MAP findings, scan jobs, and evidence records."
            : "A sample view of pricing-variation findings across monitored URLs, surveillance-pricing exposure, and MAP undercutting, ranked by severity and evidence quality."
        }
      />

      {loading && (
        <div className="mono" style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 14 }}>
          Loading workspace...
        </div>
      )}

      <KpiStrip
        items={[
          { label: "Open findings", value: String(k.openFindings), accent: "var(--cobalt-bright)" },
          { label: "Critical", value: String(k.critical), accent: "var(--over)" },
          { label: "Monitored URLs", value: String(k.monitoredUrls) },
          { label: "High-confidence", value: `${k.highConfidencePct}%`, accent: "var(--good)" },
          { label: "Audits this month", value: k.auditsThisMonth.toLocaleString() },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 20, marginTop: 28, alignItems: "start" }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <span className="label-mono" style={{ color: "var(--text-2)" }}>Priority findings</span>
            <Link href="/dashboard/findings" className="nav-link" style={{ fontSize: 12 }}>View all</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {priority.length > 0 ? priority.map((f) => (
              <Link
                key={f.id}
                href={`/dashboard/evidence/${f.id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-sm)",
                  padding: "14px 16px",
                  color: "var(--text)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <SeverityBadge severity={f.severity} />
                    <TypePill type={f.type} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{f.id}</span>
                </div>
                <div style={{ marginTop: 10, fontWeight: 600 }}>{f.product}</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>
                  {f.seller} | {f.market} | driver: {f.driver}
                </div>
                <div className="mono" style={{ fontSize: 12, marginTop: 8, color: "var(--text-2)" }}>
                  {f.type === "map"
                    ? <>Effective <span style={{ color: "var(--over)" }}>${f.observedLow}</span> vs MAP floor ${f.mapFloor} | {f.spreadPct}% below</>
                    : <>Spread <span style={{ color: "var(--over)" }}>${f.observedHigh - f.observedLow}</span> ({f.spreadPct}%) | ${f.observedLow}-${f.observedHigh}</>}
                </div>
              </Link>
            )) : (
              <div className="mono" style={{ color: "var(--text-2)", fontSize: 12, padding: "12px 0" }}>
                No findings yet. Import a MAP watchlist and launch a scan job to populate this queue.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={cardStyle}>
            <span className="label-mono" style={{ color: "var(--text-2)" }}>Top offenders</span>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {offenders.length > 0 ? offenders.map((o) => (
                <div key={o.domain} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.domain}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-3, var(--text-2))" }}>{o.count} finding{o.count !== 1 ? "s" : ""}</div>
                  </div>
                  <SeverityBadge severity={o.worst} />
                </div>
              )) : (
                <div className="mono" style={{ color: "var(--text-2)", fontSize: 12 }}>
                  No seller risk yet.
                </div>
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <span className="label-mono" style={{ color: "var(--text-2)" }}>Scan health</span>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { l: "Extraction success rate", v: mode === "live" ? "Pending" : "86%", c: "var(--good)" },
                { l: "Insufficient-evidence rate", v: mode === "live" ? "Pending" : "9%", c: "var(--gold)" },
                { l: "Blocked / challenged", v: mode === "live" ? "Pending" : "5%", c: "var(--text-2)" },
                { l: "Median audit time", v: mode === "live" ? "Pending" : "68s", c: "var(--text)" },
              ].map((r) => (
                <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{r.l}</span>
                  <span className="mono" style={{ fontSize: 13, color: r.c, fontWeight: 600 }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span className="label-mono" style={{ color: "var(--text-2)" }}>Recent activity | monitored portfolio</span>
          <Link href="/dashboard/portfolio" className="nav-link" style={{ fontSize: 12 }}>Manage portfolio</Link>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.portfolio.length > 0 ? data.portfolio.slice(0, 5).map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.product}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                {fmtDate(p.lastAudit)} |{" "}
                {p.lastStatus === "clear" ? <span style={{ color: "var(--good)" }}>clear</span>
                  : p.lastStatus === "insufficient" ? <span style={{ color: "var(--gold)" }}>insufficient</span>
                  : <span style={{ color: "var(--over)" }}>finding</span>}
              </span>
            </div>
          )) : (
            <div className="mono" style={{ fontSize: 12, color: "var(--text-2)", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              No monitored URLs yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
