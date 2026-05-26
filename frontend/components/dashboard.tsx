"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Send, Loader2, Globe, Smartphone, Cookie, ExternalLink,
  AlertTriangle, Network, ChevronDown, ChevronRight, BarChart3,
  DollarSign, Activity, Shield, Download,
} from "lucide-react";
import { useSession } from "next-auth/react";
import AuthButton from "./auth-button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

/* ─── Types ───────────────────────────────────────────────────────────── */

interface Gradient {
  variable_name: string; state_high: string; state_low: string;
  mean_price_high: number; mean_price_low: number; delta: number;
  delta_pct: number; pooled_std: number; t_statistic: number;
  significant: boolean; n_high: number; n_low: number;
}

interface Agent {
  agent_id: string; label: string; status: string; price: number | null;
  response_time_ms: number | null; bot_detected: boolean;
  detection_signal: string | null; error_message: string | null;
  variables: Record<string, string>;
}

interface TopologyReport {
  session_id: string; target_url: string; target_name: string;
  timestamp: string; status: string;
  total_agents: number; successful_agents: number;
  failed_agents: number; detected_agents: number;
  elapsed_seconds: number; control_stability: number;
  baseline_price: number | null; mean_price: number | null;
  all_prices: Record<string, number | null>;
  price_range: [number, number] | null; max_price_spread: number | null;
  max_price_spread_pct: number | null;
  gradients: Gradient[]; discrimination_index: number;
  topology_class: string; summary: string;
  max_discrimination_scenario: string; min_discrimination_scenario: string;
  agents: Agent[]; error: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  report?: TopologyReport;
  status?: "scanning" | "complete" | "error";
  error?: string;
}

/* ─── Embedded Demo Data ──────────────────────────────────────────────── */

const DEMO: TopologyReport = {
  session_id: "demo", target_url: "", target_name: "UA123 JFK→SFO",
  timestamp: "2026-05-25T20:00:00Z", status: "completed",
  total_agents: 24, successful_agents: 22, failed_agents: 1, detected_agents: 1,
  elapsed_seconds: 8.7, control_stability: 0.994,
  baseline_price: 347, mean_price: 352.3,
  all_prices: {
    AGENT_00:347,AGENT_01:371,AGENT_02:323,AGENT_03:368,AGENT_04:365,AGENT_05:329,
    AGENT_06:375,AGENT_07:335,AGENT_08:372,AGENT_09:338,AGENT_10:369,AGENT_11:358,
    AGENT_12:347,AGENT_13:343,AGENT_14:361,AGENT_15:347,AGENT_16:359,AGENT_17:347,
    AGENT_18:380,AGENT_19:320,AGENT_20:374,AGENT_21:341,AGENT_22:348,AGENT_23:346,
  },
  price_range: [320, 380], max_price_spread: 60, max_price_spread_pct: 17.3,
  gradients: [
    {variable_name:"location",state_high:"High Income",state_low:"Low Income",mean_price_high:371,mean_price_low:324,delta:47,delta_pct:13.5,pooled_std:2.5,t_statistic:18.8,significant:true,n_high:3,n_low:3},
    {variable_name:"device",state_high:"Premium Device",state_low:"Budget Device",mean_price_high:372.5,mean_price_low:338,delta:34.5,delta_pct:9.9,pooled_std:3.1,t_statistic:11.13,significant:true,n_high:4,n_low:4},
    {variable_name:"cookie_profile",state_high:"Aged Profile",state_low:"Fresh Profile",mean_price_high:350.5,mean_price_low:347,delta:3.5,delta_pct:1,pooled_std:4.2,t_statistic:0.83,significant:false,n_high:2,n_low:2},
    {variable_name:"referrer",state_high:"Aggregator",state_low:"Direct",mean_price_high:360,mean_price_low:347,delta:13,delta_pct:3.7,pooled_std:3.8,t_statistic:3.42,significant:true,n_high:2,n_low:2},
  ],
  discrimination_index: 94.5, topology_class: "progressive",
  summary: "TOPOLOGY: PROGRESSIVE. Baseline: $347.00. Spread: $60.00. DI: $94.50.",
  max_discrimination_scenario: "Max: AGENT_18 DUBAI_$110K @ $380.00",
  min_discrimination_scenario: "Min: AGENT_19 RURAL_MISSISSIPPI_$35K @ $320.00",
  agents: [
    {agent_id:"AGENT_00",label:"AGENT_00  BASELINE  MACBOOK_MANHATTAN_FRESH_DIRECT",status:"success",price:347,response_time_ms:1120,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_01",label:"AGENT_01  LOCATION_HIGH  MANHATTAN_$150K",status:"success",price:371,response_time_ms:1350,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_02",label:"AGENT_02  LOCATION_LOW  RURAL_IOWA_$50K",status:"success",price:323,response_time_ms:1420,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_03",label:"AGENT_03  LOCATION_HIGH  SAN_FRANCISCO_$160K",status:"success",price:368,response_time_ms:1180,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_04",label:"AGENT_04  LOCATION_HIGH  LONDON_£85K",status:"success",price:365,response_time_ms:1310,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_05",label:"AGENT_05  LOCATION_LOW  MUMBAI_$15K",status:"success",price:329,response_time_ms:1450,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_06",label:"AGENT_06  DEVICE_HIGH  iPHONE_15_PRO",status:"success",price:375,response_time_ms:1080,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_07",label:"AGENT_07  DEVICE_LOW  ANDROID_BUDGET",status:"success",price:335,response_time_ms:1550,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_08",label:"AGENT_08  DEVICE_HIGH  MACBOOK_PRO_M3",status:"success",price:372,response_time_ms:1140,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_09",label:"AGENT_09  DEVICE_LOW  CHROMEBOOK",status:"success",price:338,response_time_ms:1280,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_10",label:"AGENT_10  DEVICE_HIGH  GALAXY_S24_ULTRA",status:"success",price:369,response_time_ms:1190,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_11",label:"AGENT_11  COOKIE_HIGH  30D_HIGH_INTENT",status:"success",price:358,response_time_ms:1310,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_12",label:"AGENT_12  COOKIE_LOW  FRESH_FIRST_VISIT",status:"success",price:347,response_time_ms:1120,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_13",label:"AGENT_13  COOKIE_HIGH  90D_PLATINUM",status:"success",price:343,response_time_ms:1250,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_14",label:"AGENT_14  REFERRER_HIGH  VIA_KAYAK",status:"success",price:361,response_time_ms:1480,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_15",label:"AGENT_15  REFERRER_LOW  DIRECT",status:"success",price:347,response_time_ms:1220,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_16",label:"AGENT_16  REFERRER_HIGH  SKYSCANNER",status:"success",price:359,response_time_ms:1350,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_17",label:"AGENT_17  REFERRER_LOW  DIRECT_BASELINE",status:"success",price:347,response_time_ms:1180,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_18",label:"AGENT_18  LOCATION_HIGH  DUBAI_$110K",status:"success",price:380,response_time_ms:1410,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_19",label:"AGENT_19  LOCATION_LOW  RURAL_MISSISSIPPI_$35K",status:"success",price:320,response_time_ms:1520,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_20",label:"AGENT_20  DEVICE_HIGH  iPAD_PRO_12.9",status:"success",price:374,response_time_ms:1160,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_21",label:"AGENT_21  DEVICE_LOW  iPHONE_SE_BUDGET",status:"detected",price:null,response_time_ms:341,bot_detected:true,detection_signal:"captcha",error_message:null,variables:{}},
    {agent_id:"AGENT_22",label:"AGENT_22  CONTROL  BASELINE_REPEAT_1",status:"success",price:348,response_time_ms:1190,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
    {agent_id:"AGENT_23",label:"AGENT_23  CONTROL  BASELINE_REPEAT_2",status:"success",price:346,response_time_ms:1300,bot_detected:false,detection_signal:null,error_message:null,variables:{}},
  ],
  error: null,
};

const SAMPLE_TARGETS = [
  { label: "United UA123 JFK→SFO", url: "https://www.united.com/en/us/flightdetails?flight=UA123&date=2026-06-01" },
  { label: "Delta DL402 JFK→LAX", url: "https://www.delta.com/flight-status/dl402" },
  { label: "Booking.com SFO Hotel", url: "https://www.booking.com/hotel/us/san-francisco.html" },
];

/* ─── Helpers ─────────────────────────────────────────────────────────── */

const VAR_ICONS: Record<string, React.ReactNode> = {
  location: <Globe className="w-3 h-3" />,
  device: <Smartphone className="w-3 h-3" />,
  cookie_profile: <Cookie className="w-3 h-3" />,
  referrer: <ExternalLink className="w-3 h-3" />,
};

function clsColor(cls: string): string {
  switch (cls) {
    case "uniform": return "text-blue-400";
    case "selective": return "text-yellow-400";
    case "progressive": return "text-orange-400";
    case "aggressive": return "text-red-400";
    default: return "text-gray-500";
  }
}

function fmtDelta(d: number): string {
  return d >= 0 ? `+$${d.toFixed(0)}` : `-$${Math.abs(d).toFixed(0)}`;
}

function buildHistogram(prices: Record<string, number | null>): { bucket: number; count: number }[] {
  const v = Object.values(prices).filter((p): p is number => p !== null);
  if (!v.length) return [];
  const mn = Math.floor(Math.min(...v) / 10) * 10;
  const mx = Math.ceil(Math.max(...v) / 10) * 10;
  const bins: Record<number, number> = {};
  for (let b = mn; b <= mx; b += 10) bins[b] = 0;
  for (const p of v) { const bin = Math.floor(p / 10) * 10; bins[bin] = (bins[bin] || 0) + 1; }
  return Object.entries(bins).map(([k, c]) => ({ bucket: Number(k), count: c })).sort((a, b) => a.bucket - b.bucket);
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/g);
  return m ? m[0] : null;
}

const GRADIENT_MAX = 50;

/* ─── Export Helpers ─────────────────────────────────────────────────── */

function exportJSON(report: TopologyReport, name: string) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  downloadBlob(blob, `jacobi-${name}-${Date.now()}.json`);
}

function exportCSV(report: TopologyReport, name: string) {
  const headers = ["agent_id", "label", "status", "price", "location", "device", "cookie", "referrer", "response_time_ms"];
  const rows = report.agents.map((a) => {
    const v = a.variables || {};
    return [a.agent_id, a.label, a.status, a.price ?? "", v.location || "", v.device || "", v.cookie || "", v.referrer || "", a.response_time_ms ?? ""];
  });
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  downloadBlob(blob, `jacobi-${name}-${Date.now()}.csv`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ─── Components ──────────────────────────────────────────────────────── */

function ExportButtons({ report }: { report: TopologyReport }) {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    setExporting(true);
    try {
      let blob: Blob;
      let filename: string;

      if (format === "json") {
        const data = JSON.stringify(report, null, 2);
        blob = new Blob([data], { type: "application/json" });
        filename = `jacobi-report-${report.session_id || "unknown"}.json`;
      } else {
        const headers = [
          "agent_id", "label", "status", "price", "response_time_ms",
          "bot_detected", "detection_signal", "error_message",
          "location", "device", "cookie", "referrer",
          "delta_variable", "delta_direction", "is_control",
        ];
        const rows = report.agents.map((a) => [
          a.agent_id, `"${a.label.replace(/"/g, '""')}"`, a.status,
          a.price ?? "", a.response_time_ms ?? "",
          a.bot_detected, a.detection_signal ?? "", a.error_message ?? "",
          a.variables?.location ?? "", a.variables?.device ?? "",
          a.variables?.cookie ?? "", a.variables?.referrer ?? "",
          (a as any).delta_variable ?? "", (a as any).delta_direction ?? "",
          (a as any).is_control ?? "",
        ].join(","));
        const csv = [headers.join(","), ...rows].join("\n");
        blob = new Blob([csv], { type: "text/csv" });
        filename = `jacobi-agents-${report.session_id || "unknown"}.csv`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as "json" | "csv")}
        className="bg-transparent text-[10px] font-mono text-white/60 border border-white/[0.10] rounded px-1.5 py-1 outline-none"
      >
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
      </select>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-2 py-1 text-[10px] font-mono text-white/40 border border-white/[0.06] rounded hover:border-white/20 hover:text-white/60 transition-all disabled:opacity-40"
      >
        {exporting ? "..." : "export"}
      </button>
    </div>
  );
}

/* ─── Agent Probe Grid (6×4) ─────────────────────────────────────────── */

function AgentGrid({
  agents,
  totalAgents,
  successfulAgents,
  failedAgents,
  detectedAgents,
}: {
  agents: { agent_id: string; status: string; price: number | null }[];
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  detectedAgents: number;
}) {
  const responded = successfulAgents + failedAgents + detectedAgents;

  const cells = Array.from({ length: 24 }, (_, i) => {
    const agentId = `AGENT_${String(i).padStart(2, "0")}`;
    const agent = agents.find((a) => a.agent_id === agentId);
    const status = agent ? agent.status : "pending";

    const colorMap: Record<string, string> = {
      pending: "bg-white/[0.04]",
      in_flight: "bg-white/40 agent-pulse",
      success: "bg-emerald-400/80",
      failed: "bg-red-400/50",
      detected: "bg-orange-400/60",
    };

    return { id: agentId, index: i, status, color: colorMap[status] || "bg-white/[0.04]" };
  });

  return (
    <div className="border border-white/[0.08] rounded-lg p-3 bg-white/[0.02]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">Probe Network</span>
        <span className="text-[10px] font-mono text-white/60">
          {responded}/{totalAgents} responded
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {cells.map(cell => (
          <div key={cell.id} className={`aspect-square rounded-sm ${cell.color} transition-all duration-500`} title={`${cell.id}: ${cell.status}`} />
        ))}
      </div>
      <div className="flex gap-3 mt-2 text-[9px] font-mono">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400/80" /> {successfulAgents} success</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400/60" /> {failedAgents} failed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400/60" /> {detectedAgents} blocked</span>
      </div>
    </div>
  );
}

/* ─── Leaderboard ───────────────────────────────────────────────────── */

function Leaderboard() {
  const [entries, setEntries] = useState<{name: string; savings: number; url: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    fetch(`${apiBase}/api/leaderboard`)
      .then(r => r.json())
      .then(data => setEntries((data || []).slice(0, 10)))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [apiBase]);

  if (loading) return <div className="text-[10px] font-mono text-white/30 text-center py-4">Loading leaderboard...</div>;
  if (!entries.length) return null;

  return (
    <div className="border border-white/[0.08] rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-white/[0.08] text-[10px] font-mono text-white/50 uppercase tracking-wider">
        🏆 Savings Leaderboard
      </div>
      {entries.map((e, i) => (
        <div key={i} className="px-4 py-1.5 border-b border-white/[0.04] flex items-center justify-between text-[11px]">
          <span className="text-white/60">{i + 1}. {e.name}</span>
          <span className="text-emerald-400 font-mono">-${e.savings.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Result Card ────────────────────────────────────────────────────── */

function ResultCard({ report }: { report: TopologyReport }) {
  const [showAgents, setShowAgents] = useState(false);
  const [showHistogram, setShowHistogram] = useState(false);
  const histData = buildHistogram(report.all_prices);
  const cls = clsColor(report.topology_class);
  const targetLabel = report.target_name?.replace(/[^a-z0-9]/gi, "_") || "probe";

  const analysis = (report as any)._analysis;
  const gemini = analysis?.gemini_report;
  const savings = analysis?.savings_verdict;

  return (
    <div className="border border-white/[0.10] rounded-lg bg-white/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <Shield className={`w-4 h-4 ${cls}`} />
          <span className={`text-sm font-mono font-medium ${cls}`}>{report.topology_class.toUpperCase()}</span>
          <span className="text-xs text-white/60 font-mono">${report.baseline_price?.toFixed(0)} baseline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/50 font-mono hidden sm:inline">{report.elapsed_seconds.toFixed(1)}s &middot; {report.successful_agents}/{report.total_agents} agents</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => exportJSON(report, targetLabel)}
              className="p-1.5 rounded hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-colors"
              title="Export JSON"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              onClick={() => exportCSV(report, targetLabel)}
              className="p-1.5 rounded hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-colors text-[9px] font-mono"
              title="Export CSV"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Demo mode warning banner */}
      {(report as any)._demo && (
        <div className="border-b border-yellow-800/40 px-4 py-2 bg-yellow-500/10 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-yellow-400/70 shrink-0" />
          <span className="text-[10px] font-mono text-yellow-300/80">
            SIMULATED DATA — the demo toggle is on. Toggle it off and start the backend for live probes.
          </span>
        </div>
      )}

      {/* Gemini verdict banner */}
      {gemini && (
        <div className="border-b border-white/[0.08] px-4 py-3 bg-white/[0.03]">
          <p className="text-[10px] font-mono text-white/50 uppercase tracking-[0.1em] mb-1">AI Analysis</p>
          <p className="text-sm text-white/85 leading-relaxed">{gemini.plain_english_summary}</p>
          {gemini.action_items && gemini.action_items.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gemini.action_items.map((item: string, i: number) => (
                <span key={i} className="text-[10px] font-mono bg-white/[0.06] text-white/60 px-2 py-0.5 rounded-full border border-white/[0.08]">
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Savings verdict — moved to top */}
      {report.gradients.some((g) => g.significant) && (
        <div className="border-b border-white/[0.08] px-4 py-3 bg-white/[0.03]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-emerald-400/70 uppercase tracking-[0.1em] mb-1">Potential savings</p>
              <p className="text-2xl font-light text-emerald-400">
                -${(savings?.total_potential_savings ?? (() => {
                  const base = report.baseline_price || 0;
                  const sigs = report.gradients.filter((g) => g.significant && g.delta > 0);
                  return sigs.reduce((s, g) => s + g.delta, 0);
                })()).toFixed(0)}
              </p>
              <p className="text-[11px] font-mono text-white/40 mt-0.5">
                Cheapest achievable: ${(savings?.cheapest_achievable_price ?? 0).toFixed(0)}
              </p>
            </div>
            <div className="hidden sm:block text-right">
              {report.gradients.filter((g) => g.significant && g.delta > 0).slice(0, 3).map((g) => (
                  <p key={g.variable_name} className="text-[10px] font-mono text-white/50">
                    {g.variable_name}: -${g.delta.toFixed(0)}
                </p>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.gradients.filter((g) => g.significant && g.delta > 0).map((g) => (
              <span key={g.variable_name} className="px-2 py-0.5 text-[10px] font-mono bg-emerald-950/30 text-emerald-400/70 rounded-full border border-emerald-900/20">
                {g.variable_name === "location" ? "📍 VPN" : g.variable_name === "device" ? "📱 Switch device" : g.variable_name === "cookie_profile" ? "🍪 Clear cookies" : g.variable_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Share Your Savings */}
      {report.gradients.some((g) => g.significant) && (
        <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2">
          <button onClick={() => {
            const savingsVal = report.gradients.filter((g) => g.significant).reduce((s, g) => s + g.delta, 0).toFixed(0)
            const text = `I used @Jacobi to find $${savingsVal} in hidden pricing discrimination 🕵️`
            navigator.clipboard.writeText(text + " Try it → jacobi.app")
          }} className="px-3 py-1.5 text-[10px] font-mono border border-white/10 rounded hover:border-white/30 text-white/40 hover:text-white/70 transition-all">
            📋 Share savings
          </button>
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("I used @Jacobi to find hidden pricing discrimination 🕵️")}`} target="_blank" className="px-3 py-1.5 text-[10px] font-mono border border-white/10 rounded hover:border-white/30 text-white/40 hover:text-white/70 transition-all">
            𝕏 Share
          </a>
          <a href={`https://linkedin.com/sharing/share-offscreen/?url=${encodeURIComponent("https://jacobi.app")}`} target="_blank" className="px-3 py-1.5 text-[10px] font-mono border border-white/10 rounded hover:border-white/30 text-white/40 hover:text-white/70 transition-all">
            in Share
          </a>
        </div>
      )}

      {/* Gradients */}
      <div className="px-4 py-3 space-y-2">
        {report.gradients.map((g) => {
          const pct = Math.min(Math.abs(g.delta_pct) / 20 * 100, 100);
          const sig = g.significant;
          return (
            <div key={g.variable_name} className="flex items-center gap-3">
              <div className="w-28 flex items-center gap-1.5 text-[11px] font-mono text-white/50 shrink-0">
                {VAR_ICONS[g.variable_name]}
                {g.variable_name.replace("_", " ")}
              </div>
              <div className="flex-1 h-4 bg-white/[0.06] rounded-full overflow-hidden relative">
                {sig && (
                  <div
                    className="h-full bg-white/10 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <div className="w-20 text-right">
                {sig ? (
                  <span className="text-[11px] font-mono text-white/70">{fmtDelta(g.delta)}</span>
                ) : (
                  <span className="text-[11px] font-mono text-white/20">n/s</span>
                )}
              </div>
              {sig && (
                <span className="text-[10px] font-mono text-white/30 w-10 text-right">{g.delta_pct.toFixed(1)}%</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Meta row */}
      <div className="px-4 py-2 border-t border-white/[0.08] flex items-center justify-between text-[10px] font-mono text-white/40">
        <span>DI: ${report.discrimination_index.toFixed(0)}</span>
        <span>Spread: ${report.max_price_spread?.toFixed(0)} ({report.max_price_spread_pct?.toFixed(1)}%)</span>
        <span>σ: {report.control_stability.toFixed(3)}</span>
      </div>

      {/* Toggle sections */}
      <div className="border-t border-white/[0.08]">
        <button onClick={() => setShowAgents(!showAgents)} className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-mono text-white/50 hover:text-white/70 hover:bg-white/[0.03] transition-colors">
          <span>Agent swarm ({report.agents.length} probes)</span>
          {showAgents ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {showAgents && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-px bg-white/[0.04] rounded overflow-hidden">
              {report.agents.map((a) => (
                <div key={a.agent_id} className="bg-black p-1.5" title={`${a.agent_id}: ${a.status}${a.price !== null ? ` $${a.price}` : ""}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[7px] font-mono text-white/20">{a.agent_id.replace("AGENT_", "A")}</span>
                    {a.status === "success" && a.price !== null ? (
                      <span className="text-[9px] font-mono text-white/70">${a.price}</span>
                    ) : a.status === "detected" ? (
                      <span className="text-[7px] text-red-400/60 font-mono">BLKD</span>
                    ) : (
                      <span className="text-[7px] text-white/20 font-mono">FAIL</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setShowHistogram(!showHistogram)} className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-mono text-white/50 hover:text-white/70 hover:bg-white/[0.03] transition-colors border-t border-white/[0.08]">
          <span>Price distribution</span>
          {showHistogram ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {showHistogram && (
          <div className="px-4 pb-3 pt-2">
            <div className="h-40">
              {histData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histData} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "JetBrains Mono, SF Mono, monospace" }} tickFormatter={(v: number) => `$${v}`} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "JetBrains Mono, SF Mono, monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "11px", fontFamily: "JetBrains Mono, SF Mono, monospace", color: "#fff" }} labelFormatter={(v: number) => `$${v}–$${v + 10}`} />
                    <Bar dataKey="count" radius={[1, 1, 0, 0]}>
                      {histData.map((e, i) => {
                        const extreme = report.baseline_price ? Math.abs(e.bucket - report.baseline_price) / report.baseline_price > 0.08 : false;
                        return <Cell key={i} fill={extreme ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)"} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-white/10 font-mono text-[11px]">No data</div>
              )}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-white/20 mt-1">
              <span>Min ${report.price_range?.[0].toFixed(0)}</span>
              <span>Max ${report.price_range?.[1].toFixed(0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Scenario footer */}
      <div className="px-4 py-2 border-t border-white/[0.08] text-[10px] font-mono text-white/35 space-y-0.5 bg-black/30">
        <p>{report.max_discrimination_scenario}</p>
        <p>{report.min_discrimination_scenario}</p>
      </div>

    </div>
  );
}

/* ─── Main Chat Component ──────────────────────────────────────────── */

export default function JacobiTerminal() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [useCache, setUseCache] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const updateLastAssistant = useCallback((update: Partial<Message>) => {
    setMessages(prev => {
      const i = prev.length - 1;
      if (i < 0 || prev[i].role !== "assistant") return prev;
      const next = [...prev];
      next[i] = { ...next[i], ...update };
      return next;
    });
  }, []);

  const runProbe = useCallback(async (targetUrl: string, targetName: string) => {
    setRunning(true);

    const msgId = Date.now().toString();
    addMessage({
      id: msgId,
      role: "assistant",
      content: "▸ Deploying 24 probe agents across 3 staggered waves...",
      status: "scanning",
    });

    if (useCache) {
      await new Promise(r => setTimeout(r, 500));
      updateLastAssistant({
        content: "▸ Wave 1/3 — 8 agents deployed (location, device profiles)",
        report: {
          total_agents: 24,
          successful_agents: 8,
          failed_agents: 0,
          detected_agents: 0,
          agents: DEMO.agents.slice(0, 8),
        } as any,
      });
      await new Promise(r => setTimeout(r, 600));
      updateLastAssistant({
        content: "▸ Wave 2/3 — 16 agents active (cookie, referrer profiles)",
        report: {
          total_agents: 24,
          successful_agents: 16,
          failed_agents: 0,
          detected_agents: 0,
          agents: DEMO.agents.slice(0, 16),
        } as any,
      });
      await new Promise(r => setTimeout(r, 600));
      updateLastAssistant({
        content: "▸ Wave 3/3 — all 24 agents reporting\n▸ Computing topology gradients...",
        report: {
          total_agents: 24,
          successful_agents: 22,
          failed_agents: 1,
          detected_agents: 1,
          agents: DEMO.agents,
        } as any,
      });
      await new Promise(r => setTimeout(r, 500));
      // Try to fetch Gemini analysis + verdict from local backend
      try {
        const ar = await fetch(`${apiBase}/api/analyze-demo`);
        if (ar.ok) {
          const analysis = await ar.json();
          updateLastAssistant({
            content: "Scan complete.",
            report: { ...DEMO, _demo: true, _analysis: analysis } as any,
            status: "complete",
          });
        } else {
          updateLastAssistant({ content: "Scan complete.", report: { ...DEMO, _demo: true } as any, status: "complete" });
        }
      } catch {
        updateLastAssistant({ content: "Scan complete.", report: { ...DEMO, _demo: true } as any, status: "complete" });
      }
      setRunning(false);
      return;
    }

    try {
      const r1 = await fetch(`${apiBase}/api/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_url: targetUrl, target_name: targetName }),
      });
      if (!r1.ok) throw new Error(`Server error: ${r1.status}`);
      const b1 = await r1.json();

      pollRef.current = setInterval(async () => {
        try {
          const r2 = await fetch(`${apiBase}/api/result/${b1.session_id}`);
          if (!r2.ok) throw new Error(`Poll error: ${r2.status}`);
          const data: TopologyReport = await r2.json();

          if (data.status === "completed" || data.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (data.status === "completed") {
              // Fetch Gemini analysis for live probe results
              try {
                const ar = await fetch(`${apiBase}/api/analyze`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ target_url: data.target_url || "", target_name: data.target_name || "", use_data_dir: data.session_id }),
                });
                if (ar.ok) {
                  const analysis = await ar.json();
                  updateLastAssistant({
                    status: "complete",
                    report: { ...data, _analysis: analysis } as any,
                    content: "Scan complete.",
                  });
                } else {
                  updateLastAssistant({ status: "complete", report: data, content: "Scan complete." });
                }
              } catch {
                updateLastAssistant({ status: "complete", report: data, content: "Scan complete." });
              }
            } else {
              updateLastAssistant({ status: "error", report: data, error: data.error ?? undefined, content: data.error || "Scan failed." });
            }
            setRunning(false);
          } else {
            updateLastAssistant({
              content: `▸ Scanning... (${data.successful_agents}/${data.total_agents} agents responded)`,
              report: data,
            });
          }
        } catch (e: any) {
          if (pollRef.current) clearInterval(pollRef.current);
          updateLastAssistant({ status: "error", error: e.message, content: `Error: ${e.message}` });
          setRunning(false);
        }
      }, 1000);

      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          updateLastAssistant({ status: "error", error: "Probe timed out", content: "Probe timed out after 60s." });
          setRunning(false);
        }
      }, 60000);
    } catch (e: any) {
      updateLastAssistant({ status: "error", error: e.message, content: `Error: ${e.message}` });
      setRunning(false);
    }
  }, [apiBase, useCache, addMessage, updateLastAssistant]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || running) return;

    const url = extractUrl(text);
    const label = url
      ? SAMPLE_TARGETS.find(t => t.url === url)?.label || url
      : text;

    addMessage({ id: Date.now().toString(), role: "user", content: text });
    setInput("");
    runProbe(url || "demo", label);
  }, [input, running, addMessage, runProbe]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectSample = (target: typeof SAMPLE_TARGETS[0]) => {
    setInput(target.url);
    inputRef.current?.focus();
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="h-screen flex flex-col bg-[#0e0f14] text-white">
      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <header className="h-12 border-b border-white/[0.08] flex items-center px-5 bg-[#0e0f14]/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded border border-white/10 flex items-center justify-center">
            <Network className="w-3.5 h-3.5 text-white/70" />
          </div>
          <span className="text-sm font-medium tracking-tight">JACOBI</span>
          <span className="text-[10px] text-white/50 font-mono hidden sm:inline">/ adversarial pricing probe</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] text-white/40 font-mono hidden sm:inline">{session?.user?.email?.split("@")[0] || "guest"}</span>
          <AuthButton />
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-7 h-3.5 rounded-full border transition-colors relative ${useCache ? "bg-white/20 border-white/20" : "bg-transparent border-white/10"}`}>
              <div className={`w-2.5 h-2.5 rounded-full bg-white/40 absolute top-0.5 transition-transform ${useCache ? "translate-x-[11px]" : "translate-x-[2px]"}`} />
            </div>
            <span className="text-[10px] font-mono text-white/40 group-hover:text-white/60">{useCache ? "demo on" : "demo off"}</span>
          </label>
          <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-white animate-pulse" : hasMessages ? "bg-emerald-400/80" : "bg-white/20"}`} />
        </div>
      </header>

      {/* ─── Messages ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-5">
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="w-12 h-12 rounded-full border border-white/[0.10] flex items-center justify-center mb-5">
                <Network className="w-5 h-5 text-white/50" />
              </div>
              <h1 className="text-xl font-medium tracking-tight mb-2 text-white/90">JACOBI</h1>
              <p className="text-sm text-white/60 mb-8 max-w-md">
                Paste a product URL or describe a target to probe for pricing discrimination.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SAMPLE_TARGETS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => selectSample(s)}
                    className="px-3 py-1.5 rounded-full border border-white/[0.12] text-[11px] font-mono text-white/60 hover:text-white/90 hover:border-white/40 transition-all"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {/* User message */}
              {msg.role === "user" && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-white/[0.08] rounded-2xl rounded-br-md px-4 py-2.5">
                    <p className="text-sm text-white/90 whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              )}

              {/* Assistant message */}
              {msg.role === "assistant" && (
                <div className="max-w-[92%] space-y-2">
                  {/* Scanning status */}
                  {msg.status === "scanning" && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Loader2 className="w-3.5 h-3.5 mt-1 text-white/60 animate-spin shrink-0" />
                        <p className="text-sm text-white/70 font-mono whitespace-pre-line">{msg.content}</p>
                      </div>
                      {msg.report && (
                        <AgentGrid
                          agents={msg.report.agents || []}
                          totalAgents={msg.report.total_agents || 24}
                          successfulAgents={msg.report.successful_agents || 0}
                          failedAgents={msg.report.failed_agents || 0}
                          detectedAgents={msg.report.detected_agents || 0}
                        />
                      )}
                      {!msg.report && (
                        <AgentGrid
                          agents={[]}
                          totalAgents={24}
                          successfulAgents={0}
                          failedAgents={0}
                          detectedAgents={0}
                        />
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {msg.status === "error" && (
                    <div className="flex items-start gap-3 p-4 border border-red-800/40 bg-red-950/15 rounded-lg">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400/80 shrink-0" />
                      <div>
                        <p className="text-sm text-red-300/90 font-mono">{msg.error || msg.content}</p>
                      </div>
                    </div>
                  )}

                  {/* Complete with report */}
                  {msg.status === "complete" && msg.report && (
                    <div className="space-y-2">
                      {msg.report.error ? (
                        <div className="flex items-start gap-3 p-4 border border-orange-900/30 bg-orange-950/10 rounded-lg">
                          <AlertTriangle className="w-4 h-4 mt-0.5 text-orange-400/60 shrink-0" />
                          <p className="text-sm text-orange-400/70 font-mono">{msg.report.error}</p>
                        </div>
                      ) : (
                        <ResultCard report={msg.report} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Suggested chips after last message */}
          {hasMessages && !running && (
            <div className="flex flex-wrap gap-2 pt-2">
              {SAMPLE_TARGETS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => selectSample(s)}
                    className="px-3 py-1.5 rounded-full border border-white/[0.08] text-[10px] font-mono text-white/50 hover:text-white/80 hover:border-white/30 transition-all"
                  >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Leaderboard — always visible when not scanning */}
          {!running && (
            <div className="pt-3">
              <Leaderboard />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ─── Input bar ───────────────────────────────────────────── */}
      <div className="border-t border-white/[0.08] bg-[#0e0f14]/95 backdrop-blur-md shrink-0">
        <div className="max-w-3xl mx-auto w-full px-4 py-3">
          <div className="flex items-end gap-2 border border-white/[0.15] rounded-2xl bg-white/[0.05] focus-within:border-white/30 transition-colors px-4 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste a URL or describe a target..."
              disabled={running}
              rows={1}
              className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/30 outline-none resize-none font-mono max-h-32 py-1 disabled:opacity-40"
              style={{ minHeight: "24px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || running}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/15 hover:bg-white/25 disabled:opacity-20 disabled:cursor-not-allowed transition-all shrink-0"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 text-white/70 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 text-white/70" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-white/30 font-mono text-center mt-2">
            Agents probe pricing algorithms across location, device, cookies, and referrer dimensions
          </p>
        </div>
      </div>
    </div>
  );
}
