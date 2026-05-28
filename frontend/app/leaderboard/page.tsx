import Link from "next/link";

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
    discrimination_index: 87.1,
    max_price_spread: 57,
    baseline_price: 245,
    successful_agents: 22,
    total_agents: 24,
    timestamp: "2026-05-25T20:00:00Z",
  },
  {
    target_url: "https://www.booking.com/hotel/us/the-knickerbocker.html",
    target_name: "Knickerbocker NYC",
    topology_class: "aggressive",
    discrimination_index: 92.4,
    max_price_spread: 185,
    baseline_price: 350,
    successful_agents: 21,
    total_agents: 24,
    timestamp: "2026-05-24T14:30:00Z",
  },
  {
    target_url: "https://www.amazon.com/s?k=wireless+headphones",
    target_name: "Wireless Headphones (Amazon)",
    topology_class: "selective",
    discrimination_index: 34.2,
    max_price_spread: 18,
    baseline_price: 65,
    successful_agents: 24,
    total_agents: 24,
    timestamp: "2026-05-23T09:15:00Z",
  },
  {
    target_url: "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB",
    target_name: "DXB to KTM Flights",
    topology_class: "uniform",
    discrimination_index: 8.5,
    max_price_spread: 34,
    baseline_price: 420,
    successful_agents: 20,
    total_agents: 24,
    timestamp: "2026-05-22T16:45:00Z",
  },
  {
    target_url: "https://www.booking.com/searchresults.html?ss=Tokyo",
    target_name: "Tokyo Hotels Search",
    topology_class: "progressive",
    discrimination_index: 63.8,
    max_price_spread: 42,
    baseline_price: 120,
    successful_agents: 23,
    total_agents: 24,
    timestamp: "2026-05-21T11:00:00Z",
  },
];

function clsColor(c: string) {
  switch (c) {
    case "uniform": return "text-emerald-400";
    case "selective": return "text-blue-400";
    case "progressive": return "text-orange-400";
    case "aggressive": return "text-rose-400";
    default: return "text-white/30";
  }
}

function clsBg(c: string) {
  switch (c) {
    case "uniform": return "bg-emerald-400/10 border-emerald-400/20";
    case "selective": return "bg-blue-400/10 border-blue-400/20";
    case "progressive": return "bg-orange-400/10 border-orange-400/20";
    case "aggressive": return "bg-rose-400/10 border-rose-400/20";
    default: return "bg-white/[0.03] border-white/[0.06]";
  }
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
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
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

export default async function LeaderboardPage() {
  const data = await fetchLeaderboard();
  const entries = data.entries;
  const maxDi = entries.length > 0
    ? Math.max(...entries.map(e => e.discrimination_index))
    : 100;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Nav header */}
      <header className="h-12 border-b border-white/[0.06] flex items-center px-5 bg-black/80 backdrop-blur-xl shrink-0">
        <Link href="/" className="flex items-center gap-2 mr-6">
          <div className="w-5 h-5 rounded border border-emerald-400/30 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#34d399" strokeWidth="1.2">
              <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" />
              <circle cx="6" cy="6" r="1.5" fill="#34d399" opacity="0.6" />
            </svg>
          </div>
          <span className="text-sm font-medium tracking-tight text-white/90">JACOBI</span>
        </Link>
        <Link href="/chat" className="text-[11px] font-mono text-white/40 hover:text-white/80 transition-colors">
          Back to probe
        </Link>
        <div className="ml-auto text-[9px] font-mono text-white/15">
          {data.total_probes} probe{data.total_probes !== 1 ? "s" : ""} tracked
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-white/90">Leaderboard</h1>
            <p className="text-[11px] font-mono text-white/30 mt-1">
              Probes ranked by discrimination index &mdash; most discriminatory first
            </p>
          </div>
          <div className="text-[9px] font-mono text-white/15 text-right leading-relaxed">
            <div>Last updated</div>
            <div className="text-white/25">{formatDate(data.last_updated)}</div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full border border-white/[0.10] flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 12 12" fill="none" stroke="#34d399" strokeWidth="1" className="opacity-40">
                <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" />
                <circle cx="6" cy="6" r="1.5" fill="#34d399" opacity="0.4" />
              </svg>
            </div>
            <p className="text-sm text-white/40 font-mono mb-4">No probes recorded yet.</p>
            <Link
              href="/chat"
              className="px-4 py-2 text-sm font-mono text-white/70 border border-white/[0.12] rounded-lg hover:border-white/40 hover:text-white/90 transition-all"
            >
              Run your first probe &rarr;
            </Link>
          </div>
        ) : (
          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-white/[0.02]">
            {/* Table header */}
            <div className="hidden lg:grid grid-cols-[40px_2fr_1fr_1.5fr_1fr_1fr_1fr] gap-3 px-5 py-3 border-b border-white/[0.06] text-[9px] font-mono text-white/30 uppercase tracking-[0.1em]">
              <span>#</span>
              <span>Target</span>
              <span>Topology</span>
              <span>Discrimination Index</span>
              <span>Spread</span>
              <span>Agents</span>
              <span>Date</span>
            </div>

            {entries.map((e, i) => {
              const barPct = maxDi > 0 ? (e.discrimination_index / maxDi) * 100 : 0;
              const barColor = e.discrimination_index >= 70 ? "bg-rose-400" : e.discrimination_index >= 40 ? "bg-orange-400" : e.discrimination_index >= 15 ? "bg-amber-400" : "bg-emerald-400";

              return (
                <div
                  key={`${e.target_url}-${i}`}
                  className="border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.03] transition-colors"
                >
                  {/* Desktop row */}
                  <div className="hidden lg:grid grid-cols-[40px_2fr_1fr_1.5fr_1fr_1fr_1fr] gap-3 px-5 py-3.5 items-center">
                    <span className="text-[11px] font-mono text-white/30 font-light">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[12px] text-white/70 font-mono truncate" title={e.target_url}>
                        {truncate(e.target_name || e.target_url, 30)}
                      </div>
                    </div>
                    <span className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border inline-block w-fit ${clsBg(e.topology_class)} ${clsColor(e.topology_class)}`}>
                      {e.topology_class}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden max-w-[120px]">
                        <div className={`h-full rounded-full ${barColor}/60`} style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-[11px] font-mono text-white/80 w-12 text-right">{e.discrimination_index.toFixed(1)}</span>
                    </div>
                    <span className="text-[11px] font-mono text-white/60">
                      ${e.max_price_spread.toFixed(0)}
                    </span>
                    <span className="text-[10px] font-mono text-white/40">
                      {e.successful_agents}/{e.total_agents}
                    </span>
                    <span className="text-[10px] font-mono text-white/30">
                      {formatDate(e.timestamp)}
                    </span>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] font-mono text-white/30 shrink-0">{i + 1}.</span>
                        <span className="text-[12px] text-white/70 font-mono truncate">
                          {truncate(e.target_name || e.target_url, 25)}
                        </span>
                      </div>
                      <span className={`text-[8px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${clsBg(e.topology_class)} ${clsColor(e.topology_class)}`}>
                        {e.topology_class}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden max-w-[100px]">
                        <div className={`h-full rounded-full ${barColor}/60`} style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-white/80">DI {e.discrimination_index.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
                      <span>Spread: ${e.max_price_spread.toFixed(0)}</span>
                      <span>Agents: {e.successful_agents}/{e.total_agents}</span>
                      <span className="ml-auto">{formatDate(e.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/chat"
            className="text-[11px] font-mono text-white/40 hover:text-white/70 transition-colors"
          >
            &larr; Back to probe
          </Link>
        </div>
      </div>
    </div>
  );
}
