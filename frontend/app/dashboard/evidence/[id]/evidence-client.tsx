"use client";

import Link from "next/link";
import { fmtDate } from "../../demo-data";
import { SeverityBadge, ConfidenceBadge, TypePill, StatusPill, EvidenceActions } from "../../ui";
import { useEnterpriseWorkspace } from "../../use-enterprise-workspace";

const AGENT_COLS = "minmax(0,2.4fr) 90px 90px 90px 70px";
const TABLE_MIN_WIDTH = 760;

export default function EvidenceClient({ id }: { id: string }) {
  const { data, loading } = useEnterpriseWorkspace();
  const f = data.findings.find((finding) => finding.id === id);

  const card: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: "var(--r-sm)",
    background: "var(--surface)",
    padding: 22,
  };

  if (loading) {
    return (
      <div className="mono" style={{ color: "var(--text-2)", fontSize: 12 }}>
        Loading evidence...
      </div>
    );
  }

  if (!f) {
    return (
      <div style={card}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Evidence</span>
        <h1 className="display sec-title" style={{ fontSize: 30, marginTop: 12 }}>Finding not found</h1>
        <p className="mono" style={{ fontSize: 12, color: "var(--text-2)", marginTop: 10 }}>
          This finding is not available in the current workspace or demo data.
        </p>
        <Link href="/dashboard/findings" className="btn btn-primary" style={{ marginTop: 18 }}>
          Back to findings
        </Link>
      </div>
    );
  }

  const valid = f.agents.filter((a) => a.price !== null);
  const prices = valid.map((a) => a.price as number);
  const hi = prices.length ? Math.max(...prices) : null;
  const lo = prices.length ? Math.min(...prices) : null;
  const isMap = f.type === "map";

  return (
    <div>
      <Link href="/dashboard/findings" className="nav-link" style={{ fontSize: 12 }}>Back to findings</Link>

      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <SeverityBadge severity={f.severity} />
          <TypePill type={f.type} />
          <StatusPill status={f.status} />
          <ConfidenceBadge confidence={f.confidence} />
          <span className="mono" style={{ fontSize: 11, color: "var(--text-2)", marginLeft: "auto" }}>
            {f.id} | detected {fmtDate(f.detectedAt)}
          </span>
        </div>
        <h1 className="display sec-title" style={{ fontSize: 32 }}>{f.product}</h1>
        <p className="mono" style={{ fontSize: 13, color: "var(--text-2)", marginTop: 8 }}>
          {f.seller} | {f.market} | <a href={f.url} style={{ color: "var(--cobalt-bright)" }}>{f.domain}</a>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        <div style={card}>
          <span className="label-mono" style={{ color: "var(--text-2)" }}>Summary</span>
          <p style={{ marginTop: 12, color: "var(--text)", lineHeight: 1.65, fontSize: 14 }}>{f.excerpt}</p>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 18 }}>
            <Stat label="Topology" value={f.topology} />
            <Stat label="Variation index" value={`${f.variationIndex}/100`} accent="var(--cobalt-bright)" />
            <Stat label="Dominant driver" value={f.driver} small />
          </div>
        </div>

        <div style={{ ...card, borderColor: "color-mix(in srgb, var(--over) 35%, var(--line))" }}>
          <span className="label-mono" style={{ color: "var(--text-2)" }}>
            {isMap ? "Policy comparison" : "Variation"}
          </span>
          {isMap ? (
            <div style={{ marginTop: 14 }}>
              <Row k="MAP floor" v={`$${f.mapFloor}`} />
              <Row k="Lowest effective price" v={`$${f.observedLow}`} vc="var(--over)" />
              <Row k="Below floor" v={`${f.spreadPct}%`} vc="var(--over)" big />
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <Row k="Highest observed" v={`$${f.observedHigh}`} vc="var(--over)" />
              <Row k="Lowest observed" v={`$${f.observedLow}`} vc="var(--good)" />
              <Row k="Reference median" v={`$${f.baseline}`} />
              <Row k="Spread" v={`$${f.observedHigh - f.observedLow} (${f.spreadPct}%)`} vc="var(--over)" big />
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, marginTop: 20, borderColor: "color-mix(in srgb, var(--cobalt) 30%, var(--line))" }}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Coverage gate</span>
        <p style={{ marginTop: 10, color: "var(--text)", fontSize: 13, lineHeight: 1.6 }}>
          {valid.length} of {f.agents.length} synthetic buyers returned a usable price
          ({Math.round((valid.length / Math.max(1, f.agents.length)) * 100)}% coverage).{" "}
          {f.confidence === "insufficient"
            ? "Coverage is below the confidence gate. This is reported as insufficient evidence, not a violation."
            : `Finding made at ${f.confidence} confidence with repeated variation across buyer contexts.`}
        </p>
      </div>

      <div style={{ marginTop: 28 }}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Buyer-context observations | all {f.agents.length}</span>
        <p className="mono" style={{ fontSize: 12, color: "var(--text-2)", margin: "8px 0 14px" }}>
          Every buyer context and the price it was shown. Blocked or missing observations stay visible.
        </p>
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ minWidth: TABLE_MIN_WIDTH }}>
            <div style={{ display: "grid", gridTemplateColumns: AGENT_COLS, gap: 12, padding: "10px 16px", background: "var(--surface-2)" }}>
              {["Buyer context", "Network", "Referrer", "Status", "Price"].map((h) => (
                <span key={h} className="label-mono" style={{ fontSize: 10, color: "var(--text-2)" }}>{h}</span>
              ))}
            </div>
            {f.agents.map((a) => {
              const isHi = hi !== null && a.price === hi;
              const isLo = lo !== null && a.price === lo;
              const priceColor = a.price === null ? "var(--text-2)" : isHi ? "var(--over)" : isLo ? "var(--good)" : "var(--text)";
              return (
                <div key={a.id} style={{ display: "grid", gridTemplateColumns: AGENT_COLS, gap: 12, padding: "10px 16px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.context}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{a.network}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{a.referrer}</span>
                  <span className="mono" style={{ fontSize: 11, color: a.status === "blocked" ? "var(--gold)" : "var(--text-2)" }}>{a.status === "blocked" ? "blocked" : "ok"}</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: priceColor, textAlign: "right" }}>{a.price === null ? "n/a" : `$${a.price}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ ...card, marginTop: 28 }}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Evidence packet</span>
        <p style={{ marginTop: 10, color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          Export a timestamped, source-linked packet for internal review, compliance, or channel enforcement.
        </p>
        <EvidenceActions findingId={f.id} />
        <p className="mono" style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 16, lineHeight: 1.55, maxWidth: 640 }}>
          Findings indicate observed price variation and policy-risk candidates for professional review. They are not legal conclusions and are not represented as court-admissible.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent?: string; small?: boolean }) {
  return (
    <div>
      <div className={small ? "mono" : "serif"} style={{ fontSize: small ? 13 : 22, color: accent || "var(--text)", lineHeight: 1.2, textTransform: small ? "none" : "capitalize" }}>{value}</div>
      <div className="label-mono" style={{ color: "var(--text-2)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Row({ k, v, vc, big }: { k: string; v: string; vc?: string; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{k}</span>
      <span className={big ? "serif" : "mono"} style={{ fontSize: big ? 22 : 13, fontWeight: 600, color: vc || "var(--text)", textAlign: "right" }}>{v}</span>
    </div>
  );
}
