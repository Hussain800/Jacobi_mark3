/**
 * Leaderboard — aligned with the cockpit token system.
 *
 * Server-rendered. Fetches from /api/leaderboard, falls back to a small
 * static set if the backend is unreachable. No behavior changes from the
 * pre-Phase-4 page; only visual chrome migrated to the new tokens.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface LeaderboardEntry {
  target_url: string;
  target_name: string;
  topology_class: string;
  discrimination_index: number;
  max_price_spread: number;
  baseline_price: number;
  successful_agents: number;
  total_agents: number;
  timestamp: string;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total_probes: number;
  last_updated: string;
}

const FALLBACK_ENTRIES: LeaderboardEntry[] = [
  {
    target_url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html",
    target_name: "Leela Palace Bangalore",
    topology_class: "progressive",
    discrimination_index: 87.1, max_price_spread: 57, baseline_price: 245,
    successful_agents: 22, total_agents: 24,
    timestamp: "2026-05-25T20:00:00Z",
  },
  {
    target_url: "https://www.booking.com/hotel/us/the-knickerbocker.html",
    target_name: "Knickerbocker NYC",
    topology_class: "aggressive",
    discrimination_index: 92.4, max_price_spread: 185, baseline_price: 350,
    successful_agents: 21, total_agents: 24,
    timestamp: "2026-05-24T14:30:00Z",
  },
  {
    target_url: "https://www.amazon.com/s?k=wireless+headphones",
    target_name: "Wireless Headphones (Amazon)",
    topology_class: "selective",
    discrimination_index: 34.2, max_price_spread: 18, baseline_price: 65,
    successful_agents: 24, total_agents: 24,
    timestamp: "2026-05-23T09:15:00Z",
  },
  {
    target_url: "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB",
    target_name: "DXB to KTM Flights",
    topology_class: "uniform",
    discrimination_index: 8.5, max_price_spread: 34, baseline_price: 420,
    successful_agents: 20, total_agents: 24,
    timestamp: "2026-05-22T16:45:00Z",
  },
  {
    target_url: "https://www.booking.com/searchresults.html?ss=Tokyo",
    target_name: "Tokyo Hotels Search",
    topology_class: "progressive",
    discrimination_index: 63.8, max_price_spread: 42, baseline_price: 120,
    successful_agents: 23, total_agents: 24,
    timestamp: "2026-05-21T11:00:00Z",
  },
];

function topologyTone(c: string) {
  switch (c) {
    case "uniform":     return { text: "text-signal",     bg: "bg-signal/10",     border: "border-signal/30" };
    case "selective":   return { text: "text-warning",    bg: "bg-warning/10",    border: "border-warning/30" };
    case "progressive": return { text: "text-warning",    bg: "bg-warning/10",    border: "border-warning/30" };
    case "aggressive":  return { text: "text-overcharge", bg: "bg-overcharge/10", border: "border-overcharge/30" };
    default:            return { text: "text-muted",      bg: "bg-raised",        border: "border-line" };
  }
}

function intensityColor(di: number) {
  if (di >= 70) return "bg-overcharge";
  if (di >= 40) return "bg-warning";
  if (di >= 15) return "bg-warning/70";
  return "bg-signal";
}

function formatDate(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function truncate(s: string, max = 30) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${apiBase}/api/leaderboard?limit=20&min_agents=5`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return {
      entries: FALLBACK_ENTRIES,
      total_probes: FALLBACK_ENTRIES.length,
      last_updated: new Date().toISOString(),
    };
  }
}

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const data = await fetchLeaderboard();
  const entries = data.entries;
  const maxDi = entries.length > 0
    ? Math.max(...entries.map(e => e.discrimination_index))
    : 100;

  return (
    <main className="min-h-screen bg-ink text-primary font-sans selection:bg-signal/20">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-12 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-3">
              Public board
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-primary">
              Leaderboard
            </h1>
            <p className="font-mono text-[11px] text-muted mt-3">
              Probes ranked by discrimination index — highest first
            </p>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted leading-relaxed text-left sm:text-right">
            <div>{data.total_probes} probe{data.total_probes !== 1 ? "s" : ""} tracked</div>
            <div className="text-secondary mt-1">Updated {formatDate(data.last_updated)}</div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full border border-line flex items-center justify-center mb-6 bg-raised" />
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted mb-2">
              No probes recorded yet
            </p>
            <Link
              href="/chat"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink bg-signal hover:brightness-110 rounded-md transition-all"
            >
              Run your first probe
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="border border-line rounded-lg overflow-hidden bg-raised">
            <div className="hidden lg:grid grid-cols-[40px_2fr_1fr_1.5fr_1fr_1fr_1fr] gap-3 px-5 py-3 border-b border-line font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
              <span>#</span>
              <span>Target</span>
              <span>Topology</span>
              <span>Discrimination index</span>
              <span>Spread</span>
              <span>Agents</span>
              <span>Date</span>
            </div>

            {entries.map((e, i) => {
              const tone = topologyTone(e.topology_class);
              const barPct = maxDi > 0 ? (e.discrimination_index / maxDi) * 100 : 0;
              const barCls = intensityColor(e.discrimination_index);

              return (
                <div
                  key={`${e.target_url}-${i}`}
                  className="border-b border-line last:border-0 hover:bg-ink/40 transition-colors"
                >
                  {/* Desktop row */}
                  <div className="hidden lg:grid grid-cols-[40px_2fr_1fr_1.5fr_1fr_1fr_1fr] gap-3 px-5 py-4 items-center">
                    <span className="font-mono text-[12px] text-muted tabular-nums">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-mono text-[12px] text-secondary truncate" title={e.target_url}>
                        {truncate(e.target_name || e.target_url, 32)}
                      </div>
                    </div>
                    <span className={`font-mono text-[9px] uppercase tracking-[0.18em] px-2 py-1 rounded-full border inline-block w-fit ${tone.bg} ${tone.text} ${tone.border}`}>
                      {e.topology_class}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 max-w-[140px] rounded-full bg-ink overflow-hidden">
                        <div className={`h-full ${barCls}`} style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="font-mono text-[12px] text-secondary tabular-nums w-12 text-right">
                        {e.discrimination_index.toFixed(1)}
                      </span>
                    </div>
                    <span className="font-mono text-[12px] text-signal tabular-nums">
                      ${e.max_price_spread.toFixed(0)}
                    </span>
                    <span className="font-mono text-[11px] text-muted tabular-nums">
                      {e.successful_agents}/{e.total_agents}
                    </span>
                    <span className="font-mono text-[10px] text-muted tabular-nums">
                      {formatDate(e.timestamp)}
                    </span>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-[11px] text-muted tabular-nums shrink-0">{i + 1}.</span>
                        <span className="font-mono text-[12px] text-secondary truncate">
                          {truncate(e.target_name || e.target_url, 28)}
                        </span>
                      </div>
                      <span className={`font-mono text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border shrink-0 ${tone.bg} ${tone.text} ${tone.border}`}>
                        {e.topology_class}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-ink overflow-hidden">
                        <div className={`h-full ${barCls}`} style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="font-mono text-[11px] text-secondary tabular-nums w-12 text-right">
                        DI {e.discrimination_index.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[10px] text-muted">
                      <span className="text-signal">Spread ${e.max_price_spread.toFixed(0)}</span>
                      <span>·</span>
                      <span>{e.successful_agents}/{e.total_agents} agents</span>
                      <span className="ml-auto">{formatDate(e.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/chat"
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted hover:text-secondary transition-colors"
          >
            ← Back to probe cockpit
          </Link>
        </div>
      </div>
    </main>
  );
}
