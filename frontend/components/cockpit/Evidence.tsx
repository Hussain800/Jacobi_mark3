"use client";

/**
 * Evidence — the dense forensic underbelly of a completed report.
 *
 * Contents (in order):
 *   1. PriceImpactBars   — quick visual ranking of variables
 *   2. ComparisonTable   — full variable breakdown (collapsible)
 *   3. NetworkChart      — Datacenter/Residential/Mobile band chart
 *   4. PriceHistogram    — distribution (collapsible)
 *   5. AgentRoster       — 24-cell technical grid (collapsible)
 *   6. ActionsFooter     — exports, share, bookmark
 *
 * All collapsible blocks default closed for a clean first-look that
 * answers "was I overcharged?" without scrolling through tables.
 */

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Area, AreaChart,
} from "recharts";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ChevronDown, ChevronRight, Download, Share2, Star, Globe,
  Smartphone, Cookie, ExternalLink,
} from "lucide-react";
import {
  TopologyReport,
  Gradient,
  fmtDelta,
  buildHistogram,
  buildNetworkData,
  exportJSON,
  exportCSV,
} from "./types";

const VAR_ICONS: Record<string, React.ReactNode> = {
  location:       <Globe       className="w-3 h-3" />,
  device:         <Smartphone  className="w-3 h-3" />,
  cookie_profile: <Cookie      className="w-3 h-3" />,
  referrer:       <ExternalLink className="w-3 h-3" />,
};

const VAR_PRETTY: Record<string, string> = {
  location:       "Location",
  device:         "Device",
  cookie_profile: "Cookie profile",
  referrer:       "Referrer",
};

interface Props {
  report: TopologyReport;
}

export default function Evidence({ report }: Props) {
  const reducedMotion = useReducedMotion();
  const [openComp, setOpenComp] = useState(false);
  const [openHist, setOpenHist] = useState(false);
  const [openRoster, setOpenRoster] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  const [bookmarked, setBookmarked] = useState(() => {
    try {
      const bm = JSON.parse(localStorage.getItem("jacobi-bookmarks") || "[]");
      return bm.includes(report.session_id);
    } catch {
      return false;
    }
  });

  const toggleBookmark = () => {
    const sid = report.session_id;
    if (!sid) return;
    try {
      const bm = JSON.parse(localStorage.getItem("jacobi-bookmarks") || "[]");
      const idx = bm.indexOf(sid);
      if (idx >= 0) {
        bm.splice(idx, 1);
        setBookmarked(false);
      } else {
        bm.push(sid);
        setBookmarked(true);
      }
      localStorage.setItem("jacobi-bookmarks", JSON.stringify(bm));
    } catch {}
  };

  const copyShareLink = () => {
    const sid = report.session_id;
    if (!sid) return;
    const url = `${window.location.origin}/share/${sid}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 2000);
      })
      .catch(() => {});
  };

  const histData = buildHistogram(report.all_prices);
  const base = report.baseline_price || 0;

  return (
    <div className="px-5 sm:px-8 py-8 space-y-10">
      {/* ─── 1. Price impact by variable ─────────────────────────── */}
      <Section eyebrow="Price impact by variable">
        <PriceImpactBars gradients={report.gradients} />
      </Section>

      {/* ─── 2. Variable comparison table ────────────────────────── */}
      <CollapsibleSection
        eyebrow="Variable comparison"
        sub="Mean prices high vs low for each axis"
        open={openComp}
        onToggle={() => setOpenComp(!openComp)}
      >
        <ComparisonTable gradients={report.gradients} />
      </CollapsibleSection>

      {/* ─── 3. Network fingerprint ──────────────────────────────── */}
      <Section eyebrow="Network fingerprint">
        <NetworkChart report={report} />
      </Section>

      {/* ─── 4. Price distribution ───────────────────────────────── */}
      <CollapsibleSection
        eyebrow="Price distribution"
        sub={`${histData.length} buckets · $10 increments`}
        open={openHist}
        onToggle={() => setOpenHist(!openHist)}
      >
        {histData.length > 0 ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histData} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(155,161,173,0.08)" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "#5b6270", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  tickFormatter={(v: number) => `$${v}`}
                  axisLine={{ stroke: "rgba(155,161,173,0.10)" }}
                />
                <YAxis
                  tick={{ fill: "#5b6270", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={{ stroke: "rgba(155,161,173,0.10)" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0c0e13",
                    border: "1px solid rgba(155,161,173,0.18)",
                    borderRadius: "6px",
                    fontSize: "10px",
                    fontFamily: "JetBrains Mono, monospace",
                    color: "#e8eaed",
                  }}
                  labelFormatter={(v: number) => `$${v}–$${v + 10}`}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {histData.map((e, i) => (
                    <Cell
                      key={i}
                      fill={
                        base && Math.abs(e.bucket - base) / base > 0.08
                          ? "rgba(0, 217, 122, 0.55)"
                          : "rgba(155, 161, 173, 0.25)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="font-mono text-[11px] text-muted py-4">
            Insufficient samples for histogram.
          </div>
        )}
      </CollapsibleSection>

      {/* ─── 5. Agent roster (technical view) ────────────────────── */}
      <CollapsibleSection
        eyebrow={`Agent roster · ${report.agents.length} agents`}
        sub="Per-agent prices, status, network tier"
        open={openRoster}
        onToggle={() => setOpenRoster(!openRoster)}
      >
        <AgentRoster report={report} />
      </CollapsibleSection>

      {/* ─── 6. Footer ribbon: export / share / bookmark ─────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-center gap-2 pt-6 border-t border-line"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mr-auto">
          {report.session_id ? `Session ${report.session_id.slice(0, 8)}` : "Session"}
        </span>
        <button
          onClick={() => exportJSON(report)}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-secondary hover:text-primary border border-line hover:border-secondary/50 rounded-md px-3 py-2 flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3 h-3" /> JSON
        </button>
        <button
          onClick={() => exportCSV(report)}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-secondary hover:text-primary border border-line hover:border-secondary/50 rounded-md px-3 py-2 flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3 h-3" /> CSV
        </button>
        <button
          onClick={toggleBookmark}
          className={`font-mono text-[10px] uppercase tracking-[0.16em] border rounded-md px-3 py-2 flex items-center gap-1.5 transition-colors ${
            bookmarked
              ? "text-warning border-warning/50 bg-warning/10"
              : "text-secondary hover:text-primary border-line hover:border-secondary/50"
          }`}
          aria-pressed={bookmarked}
        >
          <Star className={`w-3 h-3 ${bookmarked ? "fill-warning" : ""}`} />
          {bookmarked ? "Bookmarked" : "Bookmark"}
        </button>
        <div className="relative">
          <button
            onClick={copyShareLink}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-secondary hover:text-primary border border-line hover:border-secondary/50 rounded-md px-3 py-2 flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3 h-3" /> Share link
          </button>
          <AnimatePresence>
            {copyToast && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute -top-8 right-0 font-mono text-[10px] text-signal bg-raised border border-signal/40 rounded px-2 py-1 whitespace-nowrap"
              >
                Link copied
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="font-mono text-[10px] text-muted leading-relaxed pt-2">
        {report.summary}
      </div>
    </div>
  );
}

/* ─── Layout helpers ───────────────────────────────────────────────── */

function Section({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-4">
        {eyebrow}
      </div>
      {children}
    </div>
  );
}

function CollapsibleSection({
  eyebrow,
  sub,
  open,
  onToggle,
  children,
}: {
  eyebrow: string;
  sub?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 pb-3 border-b border-line text-left group"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-secondary" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted group-hover:text-secondary" />
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary group-hover:text-primary transition-colors">
          {eyebrow}
        </span>
        {sub && (
          <span className="font-mono text-[10px] text-muted ml-auto hidden sm:inline">
            {sub}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Subcomponents ────────────────────────────────────────────────── */

function PriceImpactBars({ gradients }: { gradients: Gradient[] }) {
  if (!gradients.length) {
    return (
      <div className="font-mono text-[11px] text-muted">
        No gradient data available.
      </div>
    );
  }
  const maxAbs = Math.max(
    1,
    ...gradients.map((g) => Math.abs(g.delta_pct)),
  );
  return (
    <div className="space-y-3">
      {gradients.map((g) => {
        const pct = Math.min((Math.abs(g.delta_pct) / maxAbs) * 100, 100);
        const tone = g.delta > 0 ? "bg-overcharge" : "bg-signal";
        return (
          <div
            key={g.variable_name}
            className="grid grid-cols-[110px_1fr_72px_56px] sm:grid-cols-[150px_1fr_96px_72px] gap-3 items-center"
          >
            <div className="flex items-center gap-2 font-mono text-[11px] text-secondary capitalize">
              {VAR_ICONS[g.variable_name]}
              {VAR_PRETTY[g.variable_name] || g.variable_name.replace("_", " ")}
            </div>
            <div className="h-1.5 rounded-full bg-raised overflow-hidden">
              {g.significant && (
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${Math.max(8, pct)}%` }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className={`h-full ${tone}`}
                />
              )}
            </div>
            <div className="font-mono text-[11px] tabular-nums text-right">
              {g.significant ? (
                <span
                  className={g.delta > 0 ? "text-overcharge" : "text-signal"}
                >
                  {fmtDelta(g.delta)}
                </span>
              ) : (
                <span className="text-muted">n/s</span>
              )}
            </div>
            <div className="font-mono text-[10px] text-muted text-right tabular-nums">
              {g.significant ? `${g.delta_pct.toFixed(1)}%` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComparisonTable({ gradients }: { gradients: Gradient[] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead>
          <tr className="text-muted uppercase tracking-[0.12em] text-[10px]">
            <th className="text-left py-2 px-2 whitespace-nowrap">Variable</th>
            <th className="text-center py-2 px-2 whitespace-nowrap">High state</th>
            <th className="text-center py-2 px-2 whitespace-nowrap">Low state</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Δ</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Δ%</th>
            <th className="text-center py-2 px-2 whitespace-nowrap">Sig</th>
          </tr>
        </thead>
        <tbody>
          {gradients.map((g) => (
            <tr key={g.variable_name} className="border-t border-line">
              <td className="py-3 px-2 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted">{VAR_ICONS[g.variable_name] || null}</span>
                  <span className="text-secondary capitalize">
                    {VAR_PRETTY[g.variable_name] || g.variable_name.replace(/_/g, " ")}
                  </span>
                </div>
              </td>
              <td className="py-3 px-2 text-center whitespace-nowrap">
                <div className="text-secondary">{g.state_high}</div>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className="text-overcharge tabular-nums">${g.mean_price_high.toFixed(0)}</span>
                  <span className="text-muted">n={g.n_high}</span>
                </div>
              </td>
              <td className="py-3 px-2 text-center whitespace-nowrap">
                <div className="text-secondary">{g.state_low}</div>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className="text-signal tabular-nums">${g.mean_price_low.toFixed(0)}</span>
                  <span className="text-muted">n={g.n_low}</span>
                </div>
              </td>
              <td className="py-3 px-2 text-right whitespace-nowrap tabular-nums">
                <span
                  className={
                    g.significant
                      ? g.delta > 0
                        ? "text-overcharge"
                        : "text-signal"
                      : "text-muted"
                  }
                >
                  {fmtDelta(g.delta)}
                </span>
              </td>
              <td className="py-3 px-2 text-right whitespace-nowrap tabular-nums">
                <span className={g.significant ? "text-secondary" : "text-muted"}>
                  {g.delta_pct.toFixed(1)}%
                </span>
              </td>
              <td className="py-3 px-2 text-center whitespace-nowrap">
                {g.significant ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-signal/15 text-signal text-[9px]">
                    ✓
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-raised text-muted text-[9px]">
                    —
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NetworkChart({ report }: { report: TopologyReport }) {
  const data = buildNetworkData(report);
  const base = report.baseline_price || 0;
  return (
    <div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
            <defs>
              <linearGradient id="net-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00d97a" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#00d97a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 2" stroke="rgba(155,161,173,0.08)" />
            <XAxis
              dataKey="name"
              tick={{ fill: "#5b6270", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
              axisLine={{ stroke: "rgba(155,161,173,0.10)" }}
            />
            <YAxis
              tick={{ fill: "#5b6270", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
              axisLine={{ stroke: "rgba(155,161,173,0.10)" }}
              domain={[0, "dataMax + 20"]}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                background: "#0c0e13",
                border: "1px solid rgba(155,161,173,0.18)",
                borderRadius: "6px",
                fontSize: "10px",
                fontFamily: "JetBrains Mono, monospace",
                color: "#e8eaed",
              }}
            />
            <Area
              type="monotone"
              dataKey="avg"
              stroke="#00d97a"
              strokeWidth={2}
              fill="url(#net-grad)"
              dot={{ fill: "#00d97a", r: 4, stroke: "#0c0e13", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "#00d97a", stroke: "#0c0e13", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {data.map((d) => {
          const delta = d.avg - base;
          const pct = base ? ((delta / base) * 100).toFixed(1) : "0";
          const tone =
            delta > 0 ? "text-overcharge" : delta < 0 ? "text-signal" : "text-muted";
          return (
            <div key={d.name} className="border border-line rounded-md p-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
                {d.name}
              </div>
              <div className="font-mono text-base text-primary tabular-nums">${d.avg}</div>
              <div className={`font-mono text-[10px] tabular-nums mt-1 ${tone}`}>
                {delta > 0 ? `+$${delta}` : `$${delta}`} · {pct}%
              </div>
              <div className="font-mono text-[9px] text-muted mt-0.5">
                {d.count} agents
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgentRoster({ report }: { report: TopologyReport }) {
  const rows = [report.agents.slice(0, 8), report.agents.slice(8, 16), report.agents.slice(16, 24)];
  return (
    <div className="space-y-2">
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="grid grid-cols-4 sm:grid-cols-8 gap-1.5"
        >
          {row.map((a) => {
            const tier = a.network_tier;
            const tone =
              a.status === "success"
                ? "border-line"
                : a.status === "detected" || a.status === "failed"
                  ? "border-overcharge/40 bg-overcharge/5"
                  : "border-line";
            return (
              <div
                key={a.agent_id}
                className={`border ${tone} rounded-md p-2 bg-raised`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[9px] text-muted">
                    {a.agent_id.replace("AGENT_", "A")}
                  </span>
                  {a.price !== null ? (
                    <span className="font-mono text-[10px] text-secondary tabular-nums">
                      ${a.price}
                    </span>
                  ) : (
                    <span className="font-mono text-[9px] text-overcharge">blkd</span>
                  )}
                </div>
                {tier != null && (
                  <div className="font-mono text-[8px] text-muted uppercase tracking-[0.12em]">
                    {["DC", "RES", "MOB"][tier]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
