"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { fmtDate } from "../demo-data";
import { PageHead } from "../ui";
import { useEnterpriseWorkspace, type EvidenceItem } from "../use-enterprise-workspace";

const COLS = "minmax(0,2fr) minmax(0,1.5fr) 120px 120px 130px 120px";
const TABLE_MIN_WIDTH = 920;

function money(value?: number | null, currency?: string | null) {
  if (value == null) return "n/a";
  return `${currency || "USD"} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function sourceLabel(source: string) {
  return source === "live_probe" ? "Live probe" : source === "csv_import" ? "CSV import" : source;
}

function evidenceHaystack(item: EvidenceItem) {
  return [
    item.buyer_context,
    item.target_url,
    item.product?.name,
    item.product?.sku,
    item.seller?.name,
    item.seller?.domain,
    item.source,
    item.extraction_method,
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function EvidenceLockerPage() {
  const { data, loading, mode, reload } = useEnterpriseWorkspace();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const evidence = useMemo(() => {
    const rows = data.evidenceItems;
    if (!normalizedQuery) return rows;
    return rows.filter((item) => evidenceHaystack(item).includes(normalizedQuery));
  }, [data.evidenceItems, normalizedQuery]);

  const liveRows = data.evidenceItems.filter((item) => item.source === "live_probe").length;
  const linkedFindings = new Set(data.evidenceItems.map((item) => item.finding_id).filter(Boolean)).size;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <PageHead
          eyebrow="Evidence locker"
          title="Captured observations"
          lede={
            mode === "live"
              ? "Live and imported proof rows linked to scan jobs, probe sessions, and MAP findings."
              : "Evidence rows appear here after a signed-in workspace imports a watchlist or runs a live scan."
          }
        />
        <button className="btn btn-ghost" onClick={reload} style={{ marginBottom: 28 }}>
          Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden", background: "var(--line)", marginBottom: 18 }}>
        {[
          ["Evidence rows", data.evidenceItems.length],
          ["Live probe rows", liveRows],
          ["Linked findings", linkedFindings],
        ].map(([label, value]) => (
          <div key={label} style={{ background: "var(--surface)", padding: 16 }}>
            <div className="mono tnum" style={{ color: "var(--text)", fontSize: 24, lineHeight: 1 }}>{value}</div>
            <div className="label-mono" style={{ color: "var(--text-2)", marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: "10px 12px", marginBottom: 18 }}>
        <Search size={15} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search product, seller, buyer context, URL, or extraction method"
          style={{ width: "100%", border: 0, outline: "none", background: "transparent", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12 }}
        />
      </label>

      {loading && (
        <div className="mono" style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 14 }}>
          Loading evidence...
        </div>
      )}

      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ minWidth: TABLE_MIN_WIDTH }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "12px 16px", background: "var(--surface-2)" }}>
            {["Product / context", "Seller / URL", "Observed", "Source", "Captured", "Review"].map((h) => (
              <span key={h} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{h}</span>
            ))}
          </div>
          {evidence.map((item) => (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "14px 16px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--text)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.product?.name || "Unlinked observation"}
                </div>
                <div className="mono" style={{ color: "var(--text-2)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.buyer_context || item.product?.sku || item.id}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ color: "var(--text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.seller?.name || item.seller?.domain || "Unknown seller"}
                </div>
                <a href={item.target_url} className="mono" style={{ display: "block", color: "var(--cobalt-bright)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>
                  {item.target_url}
                </a>
              </div>
              <span className="mono tnum" style={{ color: "var(--text)", fontSize: 12 }}>
                {money(item.observed_price, item.currency)}
              </span>
              <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: item.source === "live_probe" ? "var(--good)" : "var(--text-2)", fontSize: 11 }}>
                {item.source === "live_probe" && <ShieldCheck size={13} aria-hidden="true" />}
                {sourceLabel(item.source)}
              </span>
              <span className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>
                {item.captured_at ? fmtDate(item.captured_at) : "Pending"}
              </span>
              {item.finding_id ? (
                <Link href={`/dashboard/evidence/${item.finding_id}`} className="nav-link" style={{ fontSize: 12 }}>
                  Open finding
                </Link>
              ) : (
                <span className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>No finding</span>
              )}
            </div>
          ))}
          {evidence.length === 0 && (
            <div className="mono" style={{ padding: "28px 16px", borderTop: "1px solid var(--line)", color: "var(--text-2)", fontSize: 12 }}>
              No evidence rows match the current workspace and filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
