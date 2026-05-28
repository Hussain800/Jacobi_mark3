"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Trash2, Clock, DollarSign, Globe, Shield } from "lucide-react";

interface ConversationSummary {
  id: string;
  title: string;
  timestamp: number;
  targetUrl: string;
  baselinePrice?: number | null;
  savings?: number | null;
  topologyClass?: string;
}

function clsColor(cls: string): string {
  switch (cls) {
    case "uniform": return "text-blue-400";
    case "selective": return "text-yellow-400";
    case "progressive": return "text-orange-400";
    case "aggressive": return "text-red-400";
    default: return "text-gray-500";
  }
}

function clsBg(cls: string): string {
  switch (cls) {
    case "uniform": return "bg-blue-400/10 border-blue-400/20";
    case "selective": return "bg-yellow-400/10 border-yellow-400/20";
    case "progressive": return "bg-orange-400/10 border-orange-400/20";
    case "aggressive": return "bg-red-400/10 border-red-400/20";
    default: return "bg-white/[0.03] border-white/[0.06]";
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateUrl(url: string, max: number = 50): string {
  return url.length > max ? url.slice(0, max) + "..." : url;
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("probe-conversations");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setConversations(data);
      } catch {
        setConversations([]);
      }
    }
  }, []);

  const sorted = [...conversations].sort((a, b) =>
    sortAsc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
  );

  const clearHistory = () => {
    localStorage.removeItem("probe-conversations");
    setConversations([]);
    setConfirmClear(false);
  };

  return (
    <div className="min-h-screen text-white bg-[#0e0f14]">
      {/* Page header */}
      <div className="border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-medium tracking-tight text-white/90">Probe History</h1>
          <p className="text-sm text-white/50 font-mono mt-1">
            {conversations.length} probe{conversations.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-white/50 border border-white/[0.10] rounded hover:border-white/30 hover:text-white/70 transition-all"
          >
            <Clock className="w-3 h-3" />
            {sortAsc ? "Oldest first" : "Newest first"}
          </button>

          {conversations.length > 0 && (
            !confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-red-400/60 border border-red-400/20 rounded hover:border-red-400/50 hover:text-red-400/90 hover:bg-red-400/5 transition-all"
              >
                <Trash2 className="w-3 h-3" />
                Clear all history
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-red-400/60">Are you sure?</span>
                <button
                  onClick={clearHistory}
                  className="px-3 py-1.5 text-[11px] font-mono text-white bg-red-500/80 rounded hover:bg-red-500 transition-all"
                >
                  Yes, delete all
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 text-[11px] font-mono text-white/40 border border-white/[0.10] rounded hover:border-white/30 transition-all"
                >
                  Cancel
                </button>
              </div>
            )
          )}
        </div>

        {/* Empty state */}
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full border border-white/[0.10] flex items-center justify-center mb-5">
              <Shield className="w-5 h-5 text-white/30" />
            </div>
            <p className="text-sm text-white/40 font-mono mb-4">No probes recorded yet.</p>
            <Link
              href="/chat"
              className="px-4 py-2 text-sm font-mono text-white/70 border border-white/[0.12] rounded-lg hover:border-white/40 hover:text-white/90 transition-all"
            >
              Start a probe →
            </Link>
          </div>
        )}

        {/* Table */}
        {conversations.length > 0 && (
          <div className="border border-white/[0.08] rounded-lg overflow-hidden bg-white/[0.02]">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/[0.08] text-[10px] font-mono text-white/40 uppercase tracking-wider">
              <span>Target</span>
              <span>Date</span>
              <span>Baseline</span>
              <span>Savings</span>
              <span>Topology</span>
              <span>&nbsp;</span>
            </div>

            {sorted.map((entry) => (
              <div
                key={entry.id}
                className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.04] transition-colors"
              >
                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-3 h-3 text-white/30 shrink-0" />
                    <span className="text-sm text-white/70 truncate font-mono" title={entry.targetUrl}>
                      {truncateUrl(entry.targetUrl, 45)}
                    </span>
                  </div>
                  <span className="text-[11px] text-white/40 font-mono">{formatDate(entry.timestamp)}</span>
                  <span className="text-[11px] text-white/60 font-mono">
                    {entry.baselinePrice != null ? `$${entry.baselinePrice.toFixed(0)}` : "—"}
                  </span>
                  <span className="text-[11px] text-emerald-400/80 font-mono">
                    {entry.savings != null ? `$${entry.savings.toFixed(0)}` : "—"}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border inline-block w-fit ${clsBg(entry.topologyClass || "")} ${clsColor(entry.topologyClass || "")}`}
                  >
                    {entry.topologyClass || "—"}
                  </span>
                  <Link
                    href="/chat"
                    className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-mono text-white/50 border border-white/[0.10] rounded hover:border-white/30 hover:text-white/80 transition-all"
                  >
                    Load <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Mobile card */}
                <div className="md:hidden px-5 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Globe className="w-3 h-3 text-white/30 shrink-0 mt-0.5" />
                      <span className="text-sm text-white/70 truncate font-mono">{truncateUrl(entry.targetUrl, 35)}</span>
                    </div>
                    <span
                      className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${clsBg(entry.topologyClass || "")} ${clsColor(entry.topologyClass || "")}`}
                    >
                      {entry.topologyClass || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono text-white/40">
                    <span>{formatDate(entry.timestamp)}</span>
                    {entry.baselinePrice != null && <span>Base: ${entry.baselinePrice.toFixed(0)}</span>}
                    {entry.savings != null && <span className="text-emerald-400/80">Save: ${entry.savings.toFixed(0)}</span>}
                  </div>
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-mono text-white/50 border border-white/[0.10] rounded hover:border-white/30 hover:text-white/80 transition-all"
                  >
                    Load in chat <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {conversations.length > 0 && (
          <div className="mt-6 text-center">
            <Link
              href="/chat"
              className="text-[11px] font-mono text-white/40 hover:text-white/70 transition-colors"
            >
              ← Back to probe
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
