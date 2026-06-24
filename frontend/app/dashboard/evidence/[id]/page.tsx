import { notFound } from "next/navigation";
import Link from "next/link";
import { getFinding, fmtDate } from "../../demo-data";
import { SeverityBadge, ConfidenceBadge, TypePill, StatusPill, EvidenceActions } from "../../ui";

const AGENT_COLS = "minmax(0,2.4fr) 90px 90px 90px 70px";

export default function EvidencePage({ params }: { params: { id: string } }) {
  const f = getFinding(params.id);
  if (!f) notFound();

  const valid = f.agents.filter((a) => a.price !== null);
  const prices = valid.map((a) => a.price as number);
  const hi = Math.max(...prices);
  const lo = Math.min(...prices);

  const card: React.CSSProperties = {
    border: "1px solid var(--line)", borderRadius: "var(--r-sm)",
    background: "var(--surface)", padding: 22,
  };
  const isMap = f.type === "map";

  return (
    <div>
      <Link href="/dashboard/findings" className="nav-link" style={{ fontSize: 12 }}>← Back to findings</Link>

      {/* Header */}
      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <SeverityBadge severity={f.severity} />
          <TypePill type={f.type} />
          <StatusPill status={f.status} />
          <ConfidenceBadge confidence={f.confidence} />
          <span className="mono" style={{ fontSize: 11, color: "var(--text-2)", marginLeft: "auto" }}>
            {f.id} · detected {fmtDate(f.detectedAt)}
          </span>
        </div>
        <h1 className="display sec-title" style={{ fontSize: 32 }}>{f.product}</h1>
        <p className="mono" style={{ fontSize: 13, color: "var(--text-2)", marginTop: 8 }}>
          {f.seller} · {f.market} · <a href={f.url} style={{ color: "var(--cobalt-bright)" }}>{f.domain}</a>
        </p>
      </div>

      {/* Summary + policy comparison */}
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
              <Row k="Below floor" v={`−${f.spreadPct}%`} vc="var(--over)" big />
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <Row k="Highest observed" v={`$${f.observedHigh}`} vc="var(--over)" />
              <Row k="Lowest observed" v={`$${f.observedLow}`} vc="var(--good)" />
              <Row k="Reference (median)" v={`$${f.baseline}`} />
              <Row k="Spread" v={`$${f.observedHigh - f.observedLow} (${f.spreadPct}%)`} vc="var(--over)" big />
            </div>
          )}
        </div>
      </div>

      {/* Coverage statement */}
      <div style={{ ...card, marginTop: 20, borderColor: "color-mix(in srgb, var(--cobalt) 30%, var(--line))" }}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Coverage gate</span>
        <p style={{ marginTop: 10, color: "var(--text)", fontSize: 13, lineHeight: 1.6 }}>
          {valid.length} of {f.agents.length} synthetic buyers returned a usable price
          ({Math.round((valid.length / f.agents.length) * 100)}% coverage).{" "}
          {f.confidence === "insufficient"
            ? "Coverage is below the confidence gate — this is reported as insufficient evidence, not a violation."
            : `Finding made at ${f.confidence} confidence with significant, repeated variation across buyer contexts.`}
        </p>
      </div>

      {/* Agent table */}
      <div style={{ marginTop: 28 }}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Buyer-context observations · all {f.agents.length}</span>
        <p className="mono" style={{ fontSize: 12, color: "var(--text-2)", margin: "8px 0 14px" }}>
          Every synthetic buyer, its context, and the price it was shown. Highest in red, lowest in green; blocked/challenged buyers are shown honestly.
        </p>
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: AGENT_COLS, gap: 12, padding: "10px 16px", background: "var(--surface-2)" }}>
            {["Buyer context", "Network", "Referrer", "Status", "Price"].map((h) => (
              <span key={h} className="label-mono" style={{ fontSize: 10, color: "var(--text-2)" }}>{h}</span>
            ))}
          </div>
          {f.agents.map((a) => {
            const isHi = a.price === hi;
            const isLo = a.price === lo;
            const priceColor = a.price === null ? "var(--text-2)" : isHi ? "var(--over)" : isLo ? "var(--good)" : "var(--text)";
            return (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: AGENT_COLS, gap: 12, padding: "10px 16px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.context}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{a.network}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{a.referrer}</span>
                <span className="mono" style={{ fontSize: 11, color: a.status === "blocked" ? "var(--gold)" : "var(--text-2)" }}>{a.status === "blocked" ? "blocked" : "ok"}</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: priceColor, textAlign: "right" }}>{a.price === null ? "—" : `$${a.price}`}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export + disclaimer */}
      <div style={{ ...card, marginTop: 28 }}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Evidence packet</span>
        <p style={{ marginTop: 10, color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          Export a timestamped, source-linked packet — summary, policy comparison, methodology, the full buyer-context table, and the coverage statement — for internal review, compliance, or channel enforcement.
        </p>
        <EvidenceActions />
        <p className="mono" style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 16, lineHeight: 1.55, maxWidth: 640 }}>
          Evidence-grade audit package from public-web collection. Findings indicate observed price variation and policy-risk candidates for professional review; they are not legal conclusions and are not represented as court-admissible. Review with qualified counsel before enforcement.
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{k}</span>
      <span className={big ? "serif" : "mono"} style={{ fontSize: big ? 22 : 13, fontWeight: 600, color: vc || "var(--text)" }}>{v}</span>
    </div>
  );
}
