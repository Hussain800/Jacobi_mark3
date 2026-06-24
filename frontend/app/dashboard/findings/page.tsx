"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FINDINGS, type Severity, type FindingType } from "../demo-data";
import { SeverityBadge, ConfidenceBadge, TypePill, StatusPill, PageHead } from "../ui";

const SEV: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const COLS = "120px minmax(0,2fr) minmax(0,1.3fr) 110px 150px";

type SevFilter = "all" | Severity;
type TypeFilter = "all" | FindingType;

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 999, cursor: "pointer",
        fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
        background: active ? "var(--cobalt)" : "transparent",
        color: active ? "#fff" : "var(--text-2)",
        border: `1px solid ${active ? "var(--cobalt)" : "var(--line)"}`,
      }}
    >
      {children}
    </button>
  );
}

export default function FindingsPage() {
  const [sev, setSev] = useState<SevFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");

  const rows = useMemo(
    () =>
      [...FINDINGS]
        .filter((f) => (sev === "all" ? true : f.severity === sev))
        .filter((f) => (type === "all" ? true : f.type === type))
        .sort((a, b) => SEV[a.severity] - SEV[b.severity]),
    [sev, type],
  );

  return (
    <div>
      <PageHead
        eyebrow="Findings"
        title="Violation & exposure queue"
        lede="Pricing-variation findings awaiting review. Surveillance-pricing exposure and MAP undercutting are triaged together; weak-coverage cases are labeled insufficient, never inflated."
      />

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="label-mono" style={{ color: "var(--text-2)", marginRight: 4 }}>Severity</span>
          {(["all", "critical", "high", "medium", "low"] as SevFilter[]).map((s) => (
            <FilterChip key={s} active={sev === s} onClick={() => setSev(s)}>{s}</FilterChip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="label-mono" style={{ color: "var(--text-2)", marginRight: 4 }}>Type</span>
          {(["all", "surveillance", "map"] as TypeFilter[]).map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
              {t === "surveillance" ? "Surveillance" : t === "map" ? "MAP" : "all"}
            </FilterChip>
          ))}
        </div>
      </div>

      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "12px 18px", background: "var(--surface-2)" }}>
          {["Severity", "Finding", "Observed", "Confidence", "Status"].map((h) => (
            <span key={h} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{h}</span>
          ))}
        </div>
        {rows.map((f) => (
          <Link
            key={f.id}
            href={`/dashboard/evidence/${f.id}`}
            style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "16px 18px", borderTop: "1px solid var(--line)", alignItems: "center", textDecoration: "none", color: "var(--text)" }}
          >
            <div><SeverityBadge severity={f.severity} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.product}</span>
                <TypePill type={f.type} />
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{f.seller} · {f.market} · {f.id}</div>
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>
              {f.type === "map"
                ? <><span style={{ color: "var(--over)" }}>${f.observedLow}</span> vs floor ${f.mapFloor} <span style={{ color: "var(--over)" }}>(−{f.spreadPct}%)</span></>
                : <>${f.observedLow}–${f.observedHigh} <span style={{ color: "var(--over)" }}>({f.spreadPct}%)</span></>}
            </div>
            <div><ConfidenceBadge confidence={f.confidence} /></div>
            <div><StatusPill status={f.status} /></div>
          </Link>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: "28px 18px", textAlign: "center" }} className="mono">
            <span style={{ color: "var(--text-2)" }}>No findings match these filters.</span>
          </div>
        )}
      </div>
    </div>
  );
}
