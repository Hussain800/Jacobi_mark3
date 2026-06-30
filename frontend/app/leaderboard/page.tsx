"use client";

/**
 * Leaderboard / Board — rebuilt on the .jx forensic system.
 *
 * A public board makes pricing exposure shareable and journalism-friendly, and
 * is a free distribution / SEO surface. We never show a user's URL unless they
 * opted to publish (default is public per /api/leaderboard).
 *
 * Data flow is UNCHANGED: fetch `${apiBase}/api/leaderboard`, show real rows
 * when present, an honest empty state when none. No fabricated demo rows. Only
 * the presentation moves to the .jx table + stat strip.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MarketingShell from "../../components/marketing/MarketingShell";
import { PageHeader, SectionMarker } from "../../components/marketing/parts";
import { getClientApiBase } from "../../lib/api-base";

interface BoardEntry {
  target_url?: string;
  target_name?: string;
  topology_class?: string;
  discrimination_index?: number;
  max_price_spread?: number;
  baseline_price?: number | null;
  successful_agents?: number;
  total_agents?: number;
  timestamp?: string;
  // older response shape
  name?: string;
  savings?: number;
  url?: string;
}

interface BoardResponse {
  entries?: BoardEntry[];
  total_probes?: number;
  last_updated?: string;
}

const TOPO_COLOR: Record<string, string> = {
  uniform:     "#33d39b",
  selective:   "#92a6ff",
  progressive: "#ffb053",
  aggressive:  "#ff5d6b",
};

function host(url: string | undefined): string {
  if (!url) return "—";
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

function timeAgo(ts: string | undefined): string {
  if (!ts) return "—";
  const t = new Date(ts).getTime();
  if (!t) return "—";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60)        return `${Math.round(s)}s`;
  if (s < 3600)      return `${Math.round(s / 60)}m`;
  if (s < 86400)     return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function normalize(raw: BoardEntry): {
  name: string; host: string; topology: string;
  index: number; spread: number;
  agents: string; time: string;
} {
  const name = raw.target_name || raw.name || (raw.target_url ? host(raw.target_url) : "Probe");
  const hostname = host(raw.target_url || raw.url);
  const topology = (raw.topology_class || "uniform").toLowerCase();
  const index = Math.round(raw.discrimination_index ?? 0);
  const spread = Math.round(raw.max_price_spread ?? raw.savings ?? 0);
  const agents = `${raw.successful_agents ?? "—"}/${raw.total_agents ?? 24}`;
  const time = `${timeAgo(raw.timestamp)} ago`;
  return { name, host: hostname, topology, index, spread, agents, time };
}

export default function LeaderboardPage() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const apiBase = getClientApiBase();

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/api/leaderboard?limit=30`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        if (!active) return;
        const list: BoardEntry[] = Array.isArray(d) ? d : d.entries || [];
        setData({ entries: list, total_probes: d.total_probes, last_updated: d.last_updated });
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiBase]);

  const rows = useMemo(
    () => (data?.entries || []).map(normalize),
    [data?.entries],
  );

  /* Aggregate header stats — computed honestly from real rows */
  const stats = useMemo(() => {
    const total = data?.total_probes ?? rows.length;
    const spreads = rows.map(r => r.spread).filter(n => n > 0).sort((a, b) => a - b);
    const median = spreads.length
      ? spreads[Math.floor(spreads.length / 2)]
      : 0;
    const aggressive = rows.filter(r => r.topology === "aggressive").length;
    const aggressivePct = rows.length ? Math.round((aggressive / rows.length) * 100) : 0;
    const worst = rows.reduce<string>(
      (m, r) => (r.index > 0 && (TOPO_COLOR[r.topology] ? r.index : 0) > 0 && (m === "" || (TOPO_COLOR[r.topology] && r.topology === "aggressive")) ? r.topology : m),
      "",
    );
    return { total, median, aggressivePct, worst };
  }, [rows, data?.total_probes]);

  return (
    <MarketingShell>
      <PageHeader
        eyebrow="Global board"
        title={<>The <span className="jx-soft">leaderboard</span>.</>}
        lede="Every public audit, ranked by how strongly the target varies price by buyer context. Updated as the network reports in."
      />

      <SectionMarker id="01" name="The board" meta="ranked by discrimination index" />
      <section className="jx-section jx-section--tight">
        <div className="jx-wrap jx-wrap--wide">
          {/* Stats — only shown when there is real data */}
          {!loading && rows.length > 0 && (
            <div className="jx-stats" data-reveal>
              <div className="jx-stat">
                <div className="jx-stat__num jx-tnum">{stats.total.toLocaleString()}</div>
                <div className="jx-stat__label">Audits logged</div>
              </div>
              <div className="jx-stat">
                <div className="jx-stat__num jx-tnum">{stats.median > 0 ? `+$${stats.median}` : "—"}</div>
                <div className="jx-stat__label">Median spread</div>
              </div>
              <div className="jx-stat">
                <div className="jx-stat__num jx-tnum">{stats.aggressivePct}%</div>
                <div className="jx-stat__label">Aggressive topology</div>
              </div>
              <div className="jx-stat">
                <div className="jx-stat__num" style={{ color: stats.worst ? TOPO_COLOR[stats.worst] : "var(--jx-ink-3)" }}>
                  {stats.worst ? stats.worst.charAt(0).toUpperCase() + stats.worst.slice(1) : "—"}
                </div>
                <div className="jx-stat__label">Worst topology</div>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="jx-state jx-state--quiet" data-reveal>
              <div className="jx-state__label">Loading board…</div>
            </div>
          )}

          {/* Empty state — honest */}
          {!loading && rows.length === 0 && (
            <div className="jx-state" data-reveal>
              <div className="jx-state__label">No published probes yet</div>
              <p className="jx-state__body">
                {error
                  ? "The leaderboard service didn't respond. If you have backend access, check /api/leaderboard."
                  : "The board fills as people publish their audits. Run one to be the first on the board."}
              </p>
              <div className="jx-state__cta">
                <Link href="/chat" className="jx-btn jx-btn--primary">Run an audit →</Link>
              </div>
            </div>
          )}

          {/* Table */}
          {!loading && rows.length > 0 && (
            <div className="jx-table-stage" data-reveal>
              <div className="jx-table jx-table--board">
                <div className="jx-table__head">
                  <span>#</span><span>Target</span><span>Topology</span>
                  <span>Discrimination index</span><span className="r">Spread</span>
                  <span className="r">Agents</span><span className="r">Probed</span>
                </div>
                {rows.map((r, i) => {
                  const c = TOPO_COLOR[r.topology] || "var(--jx-ink-3)";
                  return (
                    <div key={i} className="jx-table__row">
                      <span className="jx-table__rank">{String(i + 1).padStart(2, "0")}</span>
                      <span className="jx-table__target">
                        <span className="jx-table__name">{r.name}</span>
                        <span className="jx-table__host">{r.host}</span>
                      </span>
                      <span className="jx-topo" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}>
                        <span className="d" style={{ background: c }} />{r.topology}
                      </span>
                      <span className="jx-table__index">
                        <span className="jx-table__index-bar"><span className="jx-table__index-fill" style={{ width: `${r.index}%` }} /></span>
                        <span className="jx-table__index-val">{r.index}</span>
                      </span>
                      <span className={`jx-table__spread r${r.spread === 0 ? " zero" : ""}`}>
                        {r.spread === 0 ? "—" : `+$${r.spread}`}
                      </span>
                      <span className="jx-table__agents r">{r.agents}</span>
                      <span className="jx-table__time r">{r.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
