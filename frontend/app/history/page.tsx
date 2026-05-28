"use client";

/**
 * History — the logbook of past probes.
 *
 * Aligned with the cockpit token system: bg-ink / bg-raised / border-line,
 * signal/overcharge/warning semantic colors. Reads as a forensic logbook,
 * not a generic SaaS card grid.
 *
 * localStorage key `probe-conversations` is preserved.
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Trash2, Clock, Globe, FileText } from "lucide-react";

interface ConversationSummary {
  id: string;
  session_id?: string;
  title: string;
  timestamp: number;
  targetUrl: string;
  targetName?: string;
  baselinePrice?: number | null;
  savings?: number | null;
  topologyClass?: string;
}

function topologyTone(cls?: string) {
  switch (cls) {
    case "uniform":     return { text: "text-signal",     bg: "bg-signal/10",     border: "border-signal/30" };
    case "selective":   return { text: "text-warning",    bg: "bg-warning/10",    border: "border-warning/30" };
    case "progressive": return { text: "text-warning",    bg: "bg-warning/10",    border: "border-warning/30" };
    case "aggressive":  return { text: "text-overcharge", bg: "bg-overcharge/10", border: "border-overcharge/30" };
    default:            return { text: "text-muted",      bg: "bg-raised",        border: "border-line" };
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

function truncate(s: string, max: number = 50): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function HistoryPage() {
  const reducedMotion = useReducedMotion();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [sortAsc, setSortAsc] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("probe-conversations");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) setConversations(data);
      } catch {
        setConversations([]);
      }
    }
  }, []);

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => (sortAsc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp)),
    [conversations, sortAsc],
  );

  // Discrimination intensity bar — relative to the max savings in the list
  const maxSavings = useMemo(
    () => Math.max(0, ...conversations.map((c) => c.savings ?? 0)),
    [conversations],
  );

  const clearHistory = () => {
    localStorage.removeItem("probe-conversations");
    setConversations([]);
    setConfirmClear(false);
  };

  return (
    <main className="min-h-screen bg-ink text-primary font-sans selection:bg-signal/20">
      {/* Page header — restrained, no SaaS chrome */}
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-12">
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-3">
            Logbook
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-primary">
            Probe history
          </h1>
          <p className="font-mono text-[11px] text-muted mt-3">
            {conversations.length} probe{conversations.length !== 1 ? "s" : ""} recorded · stored locally
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
        {/* Toolbar */}
        {conversations.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-secondary border border-line hover:border-secondary/50 hover:text-primary rounded-md transition-colors"
            >
              <Clock className="w-3 h-3" />
              {sortAsc ? "Oldest first" : "Newest first"}
            </button>

            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-overcharge border border-line hover:border-overcharge/40 rounded-md transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear all
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-overcharge">
                  Confirm?
                </span>
                <button
                  onClick={clearHistory}
                  className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink bg-overcharge hover:brightness-110 rounded-md transition-all"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-secondary border border-line hover:border-secondary/50 rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full border border-line flex items-center justify-center mb-6 bg-raised">
              <FileText className="w-5 h-5 text-muted" />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted mb-2">
              The logbook is empty
            </p>
            <p className="font-mono text-[11px] text-secondary mb-6 max-w-sm">
              Probe a URL to start building your evidence trail.
            </p>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink bg-signal hover:brightness-110 rounded-md transition-all"
            >
              Start a probe
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* Entries */}
        {conversations.length > 0 && (
          <div className="border border-line rounded-lg overflow-hidden bg-raised">
            {/* Desktop column headers */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1.2fr_1fr_auto] gap-4 px-5 py-3 border-b border-line font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
              <span>Target</span>
              <span>Date</span>
              <span>Spread</span>
              <span>Topology</span>
              <span>&nbsp;</span>
            </div>

            {sorted.map((entry, i) => {
              const tone = topologyTone(entry.topologyClass);
              const savings = entry.savings ?? 0;
              const intensityPct = maxSavings > 0 ? (savings / maxSavings) * 100 : 0;
              return (
                <motion.div
                  key={entry.id}
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{
                    duration: 0.5,
                    delay: Math.min(i * 0.04, 0.4),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="border-b border-line last:border-0 hover:bg-ink/40 transition-colors"
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1.2fr_1fr_auto] gap-4 px-5 py-4 items-center">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Globe className="w-3 h-3 text-muted shrink-0" />
                      <div className="min-w-0">
                        <div className="font-mono text-[12px] text-secondary truncate" title={entry.targetUrl}>
                          {entry.targetName || truncate(entry.targetUrl, 50)}
                        </div>
                        {entry.targetName && (
                          <div className="font-mono text-[10px] text-muted truncate mt-0.5">
                            {truncate(entry.targetUrl, 60)}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-muted tabular-nums">
                      {formatDate(entry.timestamp)}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-ink overflow-hidden">
                        {savings > 0 && (
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${Math.max(6, intensityPct)}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                            className="h-full bg-signal"
                          />
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-signal tabular-nums w-16 text-right">
                        {entry.savings != null ? `−$${entry.savings.toFixed(0)}` : "—"}
                      </span>
                    </div>
                    <span
                      className={`font-mono text-[9px] uppercase tracking-[0.18em] px-2 py-1 rounded-full border inline-block w-fit ${tone.bg} ${tone.text} ${tone.border}`}
                    >
                      {entry.topologyClass || "—"}
                    </span>
                    <Link
                      href={`/chat?url=${encodeURIComponent(entry.targetUrl)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-secondary border border-line hover:border-signal/50 hover:text-signal rounded-md transition-colors"
                    >
                      Rerun
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Globe className="w-3 h-3 text-muted shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-mono text-[12px] text-secondary truncate">
                            {entry.targetName || truncate(entry.targetUrl, 35)}
                          </div>
                          <div className="font-mono text-[10px] text-muted truncate mt-0.5">
                            {truncate(entry.targetUrl, 40)}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`font-mono text-[8px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border shrink-0 ${tone.bg} ${tone.text} ${tone.border}`}
                      >
                        {entry.topologyClass || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 rounded-full bg-ink overflow-hidden">
                        {savings > 0 && (
                          <div
                            className="h-full bg-signal"
                            style={{ width: `${Math.max(6, intensityPct)}%` }}
                          />
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-signal tabular-nums w-14 text-right">
                        {entry.savings != null ? `−$${entry.savings.toFixed(0)}` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted">
                        {formatDate(entry.timestamp)}
                      </span>
                      <Link
                        href={`/chat?url=${encodeURIComponent(entry.targetUrl)}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal border border-signal/40 rounded-md"
                      >
                        Rerun
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {conversations.length > 0 && (
          <div className="mt-8 text-center">
            <Link
              href="/chat"
              className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted hover:text-secondary transition-colors"
            >
              ← Back to probe cockpit
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
