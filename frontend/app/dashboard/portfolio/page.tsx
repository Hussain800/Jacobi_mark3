"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Play, RefreshCw, Upload } from "lucide-react";
import { fmtDate } from "../demo-data";
import { SeverityBadge, PageHead } from "../ui";
import { useEnterpriseWorkspace } from "../use-enterprise-workspace";
import { createClient } from "@/lib/supabase/client";

const COLS = "minmax(0,2.2fr) minmax(0,1.6fr) 80px 90px 110px 130px";
const TABLE_MIN_WIDTH = 860;
const SAMPLE_CSV = [
  "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct",
  "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless,US,176,92",
].join("\n");

function StatusCell({ status, severity, spreadPct, findingId }: {
  status: string;
  severity?: import("../demo-data").Severity;
  spreadPct?: number;
  findingId?: string;
}) {
  if (status === "clear") return <span className="mono" style={{ fontSize: 12, color: "var(--good)" }}>Clear</span>;
  if (status === "auditing") return <span className="mono" style={{ fontSize: 12, color: "var(--cobalt-bright)" }}>Auditing</span>;
  if (status === "insufficient") return <span className="mono" style={{ fontSize: 12, color: "var(--gold)" }}>Insufficient</span>;

  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {severity && <SeverityBadge severity={severity} />}
      {spreadPct != null && <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{spreadPct}%</span>}
    </span>
  );
  return findingId ? <Link href={`/dashboard/evidence/${findingId}`} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

export default function PortfolioPage() {
  const { data, loading, mode, reload } = useEnterpriseWorkspace();
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [busy, setBusy] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const latestScan = data.scanJobs[0];
  const liveWatchlist = data.watchlists[0];
  const canRunLiveScan = mode === "live" && Boolean(liveWatchlist?.id) && data.portfolio.length > 0;
  const latestScanDate = latestScan?.queued_at ?? latestScan?.started_at ?? latestScan?.completed_at ?? null;

  async function runImportFlow() {
    setBusy(true);
    setMessage(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      if (!token) {
        setMessage("Sign in to import a live pilot watchlist.");
        return;
      }

      const authHeaders = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const createResponse = await fetch("/api/watchlists", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Pilot MAP Watchlist", workflow_type: "map", cadence: "daily" }),
      });
      if (!createResponse.ok) throw new Error(`Create watchlist failed (${createResponse.status})`);
      const created = await createResponse.json();
      const watchlistId = created.created_watchlist?.id || created.watchlists?.[0]?.id;
      if (!watchlistId) throw new Error("Watchlist response did not include an id");

      const importResponse = await fetch(`/api/watchlists/${watchlistId}/items/import`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ csv_text: csvText }),
      });
      if (!importResponse.ok) throw new Error(`CSV import failed (${importResponse.status})`);
      const imported = await importResponse.json();

      const scanResponse = await fetch("/api/scan-jobs", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ watchlist_id: watchlistId, audit_depth: "smart24", limit: 50, run_mode: "imported" }),
      });
      if (!scanResponse.ok) throw new Error(`Scan job failed (${scanResponse.status})`);
      const scan = await scanResponse.json();
      const errorCount = imported.errors?.length ?? 0;
      setMessage(`Imported ${imported.imported ?? 0} row(s), created ${scan.findings?.length ?? 0} finding(s), ${errorCount} row error(s).`);
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import flow failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runLiveWatchlistScan() {
    setLiveBusy(true);
    setLiveMessage(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      if (!token) {
        setLiveMessage("Sign in to run a live watchlist scan.");
        return;
      }
      if (!liveWatchlist?.id) {
        setLiveMessage("Import a watchlist before running a live scan.");
        return;
      }

      const scanResponse = await fetch("/api/scan-jobs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ watchlist_id: liveWatchlist.id, audit_depth: "smart24", limit: 50, run_mode: "live" }),
      });
      if (!scanResponse.ok) throw new Error(`Live scan failed (${scanResponse.status})`);
      const scan = await scanResponse.json();
      const job = scan.scan_job;
      setLiveMessage(`Scan ${job?.status ?? "queued"} for ${job?.target_count ?? 0} target(s).`);
      reload();
    } catch (error) {
      setLiveMessage(error instanceof Error ? error.message : "Live scan failed.");
    } finally {
      setLiveBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <PageHead
          eyebrow="Portfolio"
          title="Monitored URLs"
          lede={
            mode === "live"
              ? "Live products, sellers, and targets imported into the pilot watchlist workflow."
              : "Products, sellers, and pricing pages under continuous synthetic-buyer audit. Each row is scanned on its cadence; findings flow into the queue."
          }
        />
        <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setShowImport((value) => !value)} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Upload size={15} aria-hidden="true" /> Import CSV
          </button>
          <Link href="/dashboard/audits" className="btn btn-primary">Run an audit</Link>
        </div>
      </div>

      {loading && (
        <div className="mono" style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 14 }}>
          Loading workspace...
        </div>
      )}

      {showImport && (
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: 18, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <span className="label-mono" style={{ color: "var(--text-2)" }}>Pilot CSV import</span>
              <p className="mono" style={{ color: "var(--text-2)", fontSize: 12, marginTop: 6 }}>
                Creates a watchlist, imports rows, then runs the MAP evaluator. Live account required.
              </p>
            </div>
            <button className="btn btn-primary" onClick={runImportFlow} disabled={busy} style={{ opacity: busy ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Upload size={15} aria-hidden="true" />
              {busy ? "Running..." : "Import and scan"}
            </button>
          </div>
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 132,
              resize: "vertical",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              background: "var(--ink-2)",
              color: "var(--text)",
              padding: 12,
              fontFamily: "var(--mono)",
              fontSize: 11,
              lineHeight: 1.55,
              outline: "none",
            }}
          />
          {message && (
            <p className="mono" style={{ color: message.includes("failed") || message.includes("Sign in") ? "var(--gold)" : "var(--good)", fontSize: 12, marginTop: 10 }}>
              {message}
            </p>
          )}
        </div>
      )}

      {mode === "live" && (
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: 18, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 220, flex: "1 1 280px" }}>
              <span className="label-mono" style={{ color: "var(--text-2)" }}>Live scan job</span>
              <div className="mono" style={{ color: "var(--text)", fontSize: 13, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {latestScan ? `${latestScan.status.toUpperCase()} | ${latestScan.audit_depth ?? "smart24"} | ${latestScanDate ? fmtDate(latestScanDate) : "No timestamp"}` : "No live scan jobs yet"}
              </div>
              {liveMessage && (
                <div className="mono" style={{ color: liveMessage.includes("failed") || liveMessage.includes("Sign in") ? "var(--gold)" : "var(--good)", fontSize: 12, marginTop: 8 }}>
                  {liveMessage}
                </div>
              )}
            </div>
            {[
              ["Targets", latestScan?.target_count ?? data.portfolio.length],
              ["Completed", latestScan?.completed_count ?? 0],
              ["Failed", latestScan?.failed_count ?? 0],
            ].map(([label, value]) => (
              <div key={label} style={{ minWidth: 92, flex: "0 1 110px" }}>
                <div className="mono tnum" style={{ color: "var(--text)", fontSize: 20, lineHeight: 1 }}>{value}</div>
                <div className="label-mono" style={{ color: "var(--text-2)", fontSize: 10, marginTop: 5 }}>{label}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", flex: "1 1 240px" }}>
              <button
                className="btn btn-primary"
                onClick={runLiveWatchlistScan}
                disabled={!canRunLiveScan || liveBusy}
                style={{ opacity: !canRunLiveScan || liveBusy ? 0.65 : 1, display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Play size={15} aria-hidden="true" /> {liveBusy ? "Queueing..." : "Run live"}
              </button>
              <button className="btn btn-ghost" onClick={reload} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <RefreshCw size={15} aria-hidden="true" /> Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ minWidth: TABLE_MIN_WIDTH }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "12px 18px", background: "var(--surface-2)" }}>
            {["Product / SKU", "Seller", "Market", "Cadence", "Last audit", "Status"].map((h) => (
              <span key={h} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{h}</span>
            ))}
          </div>
          {data.portfolio.map((p) => (
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
          {data.portfolio.length === 0 && (
            <div className="mono" style={{ padding: "28px 18px", borderTop: "1px solid var(--line)", color: "var(--text-2)", fontSize: 12 }}>
              No monitored URLs yet. Create a watchlist through the API, import CSV rows, then launch a scan job.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
