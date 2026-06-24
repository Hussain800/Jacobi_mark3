"use client";

/**
 * Leaderboard / Board — Claude Design port.
 *
 * Decision note (per CEO question "do we even need this?"):
 *   YES. JACOBI's whole pitch is "expose hidden pricing discrimination."
 *   A public board makes the exposure shareable and journalism-friendly.
 *   It's also a free distribution / SEO surface (every probe is a
 *   shareable record). We do not show the user's URL unless they opted
 *   to publish (default is public per /api/leaderboard).
 *
 * Data flow:
 *   - Fetch `${apiBase}/api/leaderboard`
 *   - Show real rows when present
 *   - Show an honest empty state ("No probes have been published yet.
 *     Run one to be the first on the board.") when none
 *
 * The fake "demo" rows from the static Claude Design prototype are
 * NOT shipped here — we don't fabricate numbers.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import { useReveals } from "../../components/design/landing-interactions";
import { getClientApiBase } from "../../lib/api-base";
import "../jacobi-design.css";

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
  uniform:     "#3ad79f",
  selective:   "#d8b06a",
  progressive: "#ff9d52",
  aggressive:  "#ff5468",
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

  // Without this, [data-reveal] elements stay opacity:0 → page reads as blank.
  useReveals();

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
    <div className="jacobi-design">
      <Script src="/jacobi-design/scene.js"   strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />

      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap">
            <div className="sec-head" data-reveal>
              <span className="eyebrow">
                <span className="dot">●</span> Global board
              </span>
              <h1 className="display sec-title">
                The{" "}
                <span className="serif-i" style={{ color: "var(--cobalt-bright)" }}>
                  leaderboard
                </span>
              </h1>
              <p className="sec-lede sec">
                Every public audit, ranked by how strongly the target varies
                price by buyer context. Updated as the network reports&nbsp;in.
              </p>
            </div>

            {/* Stats — only shown when there is real data */}
            {!loading && rows.length > 0 && (
              <div className="board-stats" data-reveal>
                <div className="bstat">
                  <div className="bstat-num serif tnum">{stats.total.toLocaleString()}</div>
                  <div className="label-mono">audits logged</div>
                </div>
                <div className="bstat">
                  <div className="bstat-num serif tnum">
                    {stats.median > 0 ? `+$${stats.median}` : "—"}
                  </div>
                  <div className="label-mono">median spread</div>
                </div>
                <div className="bstat">
                  <div className="bstat-num serif tnum">{stats.aggressivePct}%</div>
                  <div className="label-mono">aggressive topology</div>
                </div>
                <div className="bstat">
                  <div
                    className="bstat-num serif"
                    style={{ color: stats.worst ? TOPO_COLOR[stats.worst] : "var(--text-3)" }}
                  >
                    {stats.worst ? stats.worst.charAt(0).toUpperCase() + stats.worst.slice(1) : "—"}
                  </div>
                  <div className="label-mono">worst topology</div>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
                Loading board…
              </div>
            )}

            {/* Empty state — honest */}
            {!loading && rows.length === 0 && (
              <div
                data-reveal
                style={{
                  padding: "80px 24px",
                  textAlign: "center",
                  border: "1px dashed var(--line-2)",
                  borderRadius: "var(--r)",
                  background: "linear-gradient(180deg, var(--surface), var(--ink-2))",
                }}
              >
                <div className="label-mono" style={{ marginBottom: 14, color: "var(--cobalt-bright)" }}>
                  No published probes yet
                </div>
                <p style={{ fontSize: 14, color: "var(--text-2)", maxWidth: 460, margin: "0 auto 22px", lineHeight: 1.6 }}>
                  {error
                    ? "The leaderboard service didn't respond. If you have backend access, check /api/leaderboard."
                    : "The board fills as people publish their audits. Run one to be the first on the board."}
                </p>
                <Link href="/chat" className="btn btn-primary">
                  Run an audit →
                </Link>
              </div>
            )}

            {/* Table */}
            {!loading && rows.length > 0 && (
              <div className="board-scroll" data-reveal>
                <div className="board-table">
                  <div className="bt-head">
                    <span>#</span>
                    <span>Target</span>
                    <span>Topology</span>
                    <span>Discrimination index</span>
                    <span>Spread</span>
                    <span>Agents</span>
                    <span>Probed</span>
                  </div>
                  {rows.map((r, i) => {
                    const c = TOPO_COLOR[r.topology] || "var(--text-3)";
                    return (
                      <div key={i} className="bt-row" data-reveal>
                        <span className="bt-rank">{String(i + 1).padStart(2, "0")}</span>
                        <span className="bt-target">
                          <span className="bt-name">{r.name}</span>
                          <span className="bt-host">{r.host}</span>
                        </span>
                        <span
                          className="topo-pill"
                          style={{ color: c, borderColor: `${c}55`, background: `${c}12` }}
                        >
                          <span className="d" style={{ background: c }} />
                          {r.topology}
                        </span>
                        <span className="bt-index">
                          <span className="bt-index-bar">
                            <span className="bt-index-fill" style={{ width: `${r.index}%` }} />
                          </span>
                          <span className="bt-index-val">{r.index}</span>
                        </span>
                        <span className={`bt-spread ${r.spread === 0 ? "zero" : ""}`}>
                          {r.spread === 0 ? "—" : `+$${r.spread}`}
                        </span>
                        <span className="bt-agents">{r.agents}</span>
                        <span className="bt-time">{r.time}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <DesignFooter />
    </div>
  );
}
