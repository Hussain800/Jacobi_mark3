"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Terminal, Activity, DollarSign, TrendingUp,
  Shield, Globe, Smartphone, Cookie, ExternalLink, Loader2,
  AlertTriangle, BarChart3, Network, X,
  ChevronRight, Zap, Disc, Code, AlertOctagon,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

/* ─── Types & Data ────────────────────────────────────────────────────── */

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

const DEMO: TopologyReport = {
  session_id: "demo", target_url: "", target_name: "UA123 JFK→SFO",
  timestamp: "2026-05-25T20:00:00Z", status: "completed",
  total_agents: 24, successful_agents: 22, failed_agents: 1, detected_agents: 1,
  elapsed_seconds: 8.7, control_stability: 0.994,
  baseline_price: 347, mean_price: 352.3,
  all_prices: {"AGENT_00":347,"AGENT_01":371,"AGENT_02":323,"AGENT_03":368,"AGENT_04":365,"AGENT_05":329,"AGENT_06":375,"AGENT_07":335,"AGENT_08":372,"AGENT_09":338,"AGENT_10":369,"AGENT_11":358,"AGENT_12":347,"AGENT_13":343,"AGENT_14":361,"AGENT_15":347,"AGENT_16":359,"AGENT_17":347,"AGENT_18":380,"AGENT_19":320,"AGENT_20":374,"AGENT_21":341,"AGENT_22":348,"AGENT_23":346},
  price_range: [320, 380], max_price_spread: 60, max_price_spread_pct: 17.3,
  gradients: [
    {variable_name:"location",state_high:"High Income",state_low:"Low Income",mean_price_high:371,mean_price_low:324,delta:47,delta_pct:13.5,pooled_std:2.5,t_statistic:18.8,significant:true,n_high:3,n_low:3},
    {variable_name:"device",state_high:"Premium Device",state_low:"Budget Device",mean_price_high:372.5,mean_price_low:338,delta:34.5,delta_pct:9.9,pooled_std:3.1,t_statistic:11.13,significant:true,n_high:4,n_low:4},
    {variable_name:"cookie_profile",state_high:"Aged Profile",state_low:"Fresh Profile",mean_price_high:350.5,mean_price_low:347,delta:3.5,delta_pct:1,pooled_std:4.2,t_statistic:0.83,significant:false,n_high:2,n_low:2},
    {variable_name:"referrer",state_high:"Aggregator",state_low:"Direct",mean_price_high:360,mean_price_low:347,delta:13,delta_pct:3.7,pooled_std:3.8,t_statistic:3.42,significant:true,n_high:2,n_low:2},
  ],
  discrimination_index: 94.5, topology_class: "progressive",
  summary: "TOPOLOGY: PROGRESSIVE. Baseline: $347.00. Spread: $60.00. DI: $94.50. Significant: 3 vars. location: +$47.00; device: +$34.50; referrer: +$13.00.",
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

const VAR_ICONS: Record<string, React.ReactNode> = {
  location: <Globe className="w-3 h-3" />, device: <Smartphone className="w-3 h-3" />,
  cookie_profile: <Cookie className="w-3 h-3" />, referrer: <ExternalLink className="w-3 h-3" />,
};

function clsColor(cls: string): string {
  switch (cls) { case "uniform": return "text-blue-400"; case "selective": return "text-yellow-400"; case "progressive": return "text-orange-400"; case "aggressive": return "text-red-400"; default: return "text-white/40"; }
}

function fmtDelta(d: number): string { return d >= 0 ? `+$${d.toFixed(0)}` : `-$${Math.abs(d).toFixed(0)}`; }

function buildHistogram(prices: Record<string, number | null>): { bucket: number; count: number }[] {
  const v = Object.values(prices).filter((p): p is number => p !== null);
  if (!v.length) return [];
  const mn = Math.floor(Math.min(...v) / 10) * 10; const mx = Math.ceil(Math.max(...v) / 10) * 10;
  const bins: Record<number, number> = {};
  for (let b = mn; b <= mx; b += 10) bins[b] = 0;
  for (const p of v) { const bin = Math.floor(p / 10) * 10; bins[bin]++; }
  return Object.entries(bins).map(([k, c]) => ({ bucket: Number(k), count: c })).sort((a, b) => a.bucket - b.bucket);
}

function parseCombo(label: string): string {
  const p = label.split("  ").filter(Boolean); return p.length >= 3 ? p.slice(1).join(" | ").replace(/_/g, " ") : label;
}

const MOCK_DOM: Record<string, { text: string; price: string; node: string }> = {
  "AGENT_00": { text: "UA123 JFK→SFO  Economy  $347.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class K  Fully refundable  Includes 1 carry-on  Includes 1 checked bag  Seat selection available  Change fee $0", price: "$347.00", node: "  <span class=\"fare-amount\">$347.00</span>" },
  "AGENT_01": { text: "UA123 JFK→SFO  Economy  $371.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class L  Fully refundable  Includes 1 carry-on  Includes 1 checked bag  Seat selection $15  Change fee $50", price: "$371.00", node: "  <span class=\"fare-amount\">$371.00</span>" },
  "AGENT_06": { text: "UA123 JFK→SFO  Economy  $375.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class L  Fully refundable  Includes 1 carry-on  Includes 1 checked bag  Seat selection $15  Change fee $50", price: "$375.00", node: "  <span class=\"fare-amount\">$375.00</span>" },
  "AGENT_14": { text: "UA123 JFK→SFO  Economy  $361.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class L  Fully refundable  Includes 1 carry-on  Includes 1 checked bag  Seat selection $15  Change fee $50", price: "$361.00", node: "  <span class=\"fare-amount\">$361.00</span>" },
  "AGENT_18": { text: "UA123 JFK→SFO  Economy  $380.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class M  Fully refundable  Includes 1 carry-on  Includes 1 checked bag  Seat selection $25  Change fee $75", price: "$380.00", node: "  <span class=\"fare-amount\">$380.00</span>" },
  "AGENT_19": { text: "UA123 JFK→SFO  Economy  $320.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class K  Fully refundable  Includes 1 carry-on  Includes 1 checked bag  Seat selection free  Change fee $0", price: "$320.00", node: "  <span class=\"fare-amount\">$320.00</span>" },
};

const MCP_LOGS = [
  (id: string) => `Initializing Scraping Browser session for ${id}...`,
  (id: string) => `${id}: Proxy routed via Zone [RESIDENTIAL-${["US-NY","US-IA","US-CA","GB","AE","IN","US-MS"][Math.floor(Math.random()*7)]}]`,
  (id: string) => `${id}: TLS/JA3 fingerprint generated natively`,
  (id: string) => `${id}: HTTP/2 session negotiated with ALPN`,
  (id: string) => `${id}: Browser context isolated — canvas/WebGL/fonts spoofed`,
  (id: string) => `${id}: Target page resolving — DNS via BrightData resolver`,
  (id: string) => `${id}: Cloudflare challenge detected — Web Unlocker engaged`,
  (id: string) => `${id}: Challenge solved — challenge_clearance cookie planted`,
  (id: string) => `${id}: Page DOM fully hydrated — waiting for fare element`,
  (id: string) => `${id}: Fare element located — extracting pricing node`,
  (id: string) => `${id}: Price extracted via DOM query — parsing currency string`,
  (id: string) => `${id}: Session closed — agent complete [${(800+Math.random()*700).toFixed(0)}ms]`,
];

export default function JacobiLanding() {
  const [url, setUrl] = useState("https://www.united.com/en/us/flightdetails?flight=UA123&date=2026-06-01");
  const [name, setName] = useState("UA123 JFK→SFO");
  const [useCache, setUseCache] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TopologyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showStream, setShowStream] = useState(false);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const [probeProgress, setProbeProgress] = useState(0);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { [pollRef, streamRef, progressRef].forEach(r => { if (r.current) clearInterval(r.current); }); }, []);
  useEffect(() => { streamEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [streamLogs]);
  useEffect(() => { if (report) { setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200); }}, [report]);

  const histData = report ? buildHistogram(report.all_prices) : [];

  const run = useCallback(async () => {
    setRunning(true); setError(null); setStreamLogs([]); setProbeProgress(0);
    if (!url.trim()) { setError("Enter a target URL"); setRunning(false); return; }
    setShowStream(true);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 300);

    let logCount = 0, agentIdx = 0;
    streamRef.current = setInterval(() => {
      const aid = `AGENT_${String(Math.floor(agentIdx / 4) % 24).padStart(2, "0")}`;
      const tpl = MCP_LOGS[Math.floor(Math.random() * MCP_LOGS.length)];
      const ts = new Date().toISOString().slice(11, 23).replace("Z", "");
      setStreamLogs(prev => [...prev.slice(-60), `[${ts}] ${tpl(aid)}`]);
      logCount++; agentIdx++;
    }, 100);

    progressRef.current = setInterval(() => { setProbeProgress(p => Math.min(p + (Math.random() * 5 + 3), 95)); }, 400);

    if (useCache) {
      setTimeout(() => {
        if (streamRef.current) clearInterval(streamRef.current);
        if (progressRef.current) clearInterval(progressRef.current);
        setProbeProgress(100);
        const ts = new Date().toISOString().slice(11, 23).replace("Z", "");
        setStreamLogs(prev => [...prev, `[${ts}] Pipeline complete — 22/24 agents succeeded`, `[${ts}] Jacobian computed — topology: progressive`]);
        setTimeout(() => { setReport(DEMO); setRunning(false); }, 400);
      }, 2800);
      return;
    }
    try {
      const r1 = await fetch("http://localhost:8000/api/probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_url: url, target_name: name }) });
      if (!r1.ok) throw new Error(`Server error: ${r1.status}`);
      const b1 = await r1.json();
      pollRef.current = setInterval(async () => {
        try {
          const r2 = await fetch(`http://localhost:8000/api/result/${b1.session_id}`);
          if (!r2.ok) throw new Error(`Poll error: ${r2.status}`);
          const data: TopologyReport = await r2.json();
          setReport(data);
          if (data.status === "completed" || data.status === "failed") { if (pollRef.current) clearInterval(pollRef.current); if (streamRef.current) clearInterval(streamRef.current); if (progressRef.current) clearInterval(progressRef.current); setProbeProgress(100); setRunning(false); }
        } catch (e: any) { setError(e.message); [pollRef, streamRef, progressRef].forEach(r => { if (r.current) clearInterval(r.current); }); setRunning(false); }
      }, 1000);
      setTimeout(() => { if (pollRef.current) { clearInterval(pollRef.current); if (streamRef.current) clearInterval(streamRef.current); if (progressRef.current) clearInterval(progressRef.current); setRunning(false); setError("Probe timed out"); } }, 60000);
    } catch (e: any) { setError(e.message); setRunning(false); }
  }, [url, name, useCache]);

  const selectSample = (s: typeof SAMPLE_TARGETS[0]) => { setUrl(s.url); setName(s.label); };

  const agentDOM = selectedAgent ? (MOCK_DOM[selectedAgent.agent_id] || MOCK_DOM["AGENT_00"]) : null;
  const baseDOM = MOCK_DOM["AGENT_00"];

  const resultsSection = report ? (
    <div ref={resultsRef} className="pt-8 space-y-8 pb-20">
      <div className="grid grid-cols-4 gap-px bg-neutral-900 rounded overflow-hidden relative">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20 z-10" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20 z-10" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/20 z-10" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20 z-10" />
        {[
          { label: "Baseline Price", value: `$${report.baseline_price?.toFixed(0) ?? "—"}`, sub: `${report.successful_agents} agents`, icon: DollarSign, cls: "" },
          { label: "Max Spread", value: `$${report.max_price_spread?.toFixed(0) ?? "—"}`, sub: `${report.max_price_spread_pct?.toFixed(1)}% of baseline`, icon: TrendingUp, cls: "" },
          { label: "Discrimination Index", value: `$${report.discrimination_index.toFixed(0)}`, sub: "cumulative delta", icon: Activity, cls: "" },
          { label: "Algorithm Class", value: report.topology_class.toUpperCase(), sub: report.topology_class === "progressive" ? "3 vars active" : "", icon: Shield, cls: clsColor(report.topology_class) },
        ].map((m, mi) => (
          <div key={m.label} className="bg-black p-5 relative">
            <div className="absolute top-2 left-2 text-[8px] text-white/15 font-mono">+{mi},{0}</div>
            <div className="absolute bottom-2 right-2 text-[8px] text-white/15 font-mono">{mi+1},{1}</div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-white/30 mb-3 uppercase tracking-[0.1em]"><m.icon className="w-3 h-3" />{m.label}</div>
            <div className={`text-2xl font-mono tracking-tight ${m.cls || "text-white"}`}>{m.value}</div>
            <div className="text-[10px] font-mono text-white/20 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">Agent Swarm &mdash; click for DOM diff</h3>
          <span className="text-[10px] font-mono text-white/20">{report.elapsed_seconds.toFixed(1)}s &sigma;={report.control_stability.toFixed(3)}</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-[1px] bg-neutral-900">
          {report.agents.map((a) => {
            const blocked = a.bot_detected; const sel = selectedAgent?.agent_id === a.agent_id;
            return (
              <button key={a.agent_id} onClick={() => setSelectedAgent(sel ? null : a)}
                className={`bg-black p-2.5 text-left transition-all ${blocked ? "bg-red-950/20 animate-blockPulse" : sel ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[9px] font-mono ${blocked ? "text-red-400/60" : "text-white/20"}`}>{a.agent_id.replace("AGENT_", "A")}</span>
                  {a.status === "success" && a.price !== null ? <span className="text-[11px] font-mono text-white/80">${a.price}</span> : blocked ? <AlertOctagon className="w-3 h-3 text-red-400/60" /> : <span className="text-[9px] text-white/20 font-mono">FAIL</span>}
                </div>
                <p className="text-[8px] font-mono text-white/20 leading-tight truncate">{parseCombo(a.label)}</p>
                {a.response_time_ms && <p className="text-[8px] font-mono text-white/10 mt-1">{a.response_time_ms}ms</p>}
              </button>
            );
          })}
        </div>
      </section>

      {selectedAgent && agentDOM && (
        <section className="border border-neutral-900 rounded overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-900 bg-black/60">
            <div className="flex items-center gap-2"><Code className="w-3.5 h-3.5 text-white/30" /><span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">Differential DOM Explorer</span></div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="text-white/20">Base: <span className="text-white/50">$347</span></span>
              <span className="text-white/20">vs</span>
              <span className={selectedAgent.price ? "text-white/80" : "text-red-400/60"}>{selectedAgent.agent_id}{selectedAgent.price !== null ? ` $${selectedAgent.price}` : " BLOCKED"}</span>
              <button onClick={() => setSelectedAgent(null)} className="text-white/20 hover:text-white/60"><X className="w-3 h-3" /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-neutral-900">
            <div className="bg-black p-4">
              <div className="text-[9px] font-mono text-white/15 mb-2 uppercase">Baseline DOM (AGENT_00)</div>
              <div className="font-mono text-[10px] text-white/40 leading-relaxed whitespace-pre-wrap break-all">{baseDOM.text}</div>
              <div className="mt-3 pt-3 border-t border-neutral-900"><div className="text-[9px] font-mono text-white/15 mb-1">Price node:</div><code className="text-[10px] text-emerald-400/80 bg-emerald-950/20 px-2 py-1 rounded block">{baseDOM.node}</code></div>
            </div>
            <div className="bg-black p-4">
              <div className="text-[9px] font-mono text-white/15 mb-2 uppercase">Selected ({selectedAgent.agent_id})</div>
              <div className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all">
                {agentDOM.text.split(" ").map((w, i) => /^\$\d/.test(w) && w !== "$347.00" ? <span key={i} className="text-amber-300/90 bg-amber-300/10 px-0.5 rounded">{w} </span> : <span key={i} className="text-white/40">{w} </span>)}
              </div>
              <div className="mt-3 pt-3 border-t border-neutral-900"><div className="text-[9px] font-mono text-white/15 mb-1">Price node:</div><code className={`text-[10px] ${selectedAgent.price && selectedAgent.price !== 347 ? "text-amber-300/80 bg-amber-950/20" : "text-white/40 bg-white/5"} px-2 py-1 rounded block`}>{agentDOM.node}</code></div>
              {selectedAgent.price && selectedAgent.price !== 347 && <div className="mt-2 flex items-center gap-2 text-[10px] font-mono"><span className="text-white/20">Delta:</span><span className={selectedAgent.price > 347 ? "text-red-400/80" : "text-emerald-400/80"}>{selectedAgent.price > 347 ? "+" : ""}${(selectedAgent.price - 347).toFixed(0)}</span></div>}
              {selectedAgent.bot_detected && <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-red-400/60"><AlertOctagon className="w-3 h-3" />BLOCKED — {selectedAgent.detection_signal}</div>}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h3 className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em] mb-3">Gradient Sensitivity Matrix</h3>
          <div className="space-y-[1px]">
            {report.gradients.map((g) => {
              const high = g.delta > 0; const sig = g.significant;
              return (
                <div key={g.variable_name} className="flex items-center bg-white/[0.02] px-4 py-3">
                  <div className="w-32 flex items-center gap-2 text-[11px] font-mono text-white/50">{VAR_ICONS[g.variable_name]}{g.variable_name.replace("_", " ")}</div>
                  <div className="flex-1 grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <span className="text-white/20">{g.state_high}</span>
                    <span className={`text-center ${sig ? (high ? "text-white" : "text-white/60") : "text-white/20"}`}>{sig ? fmtDelta(g.delta) : "—"}</span>
                    <span className="text-right text-white/20">{g.state_low}</span>
                  </div>
                  {sig && <div className={`ml-3 px-2 py-0.5 rounded text-[9px] font-mono ${high ? "bg-white/10 text-white/80" : "bg-white/5 text-white/40"}`}>{g.delta_pct.toFixed(1)}%</div>}
                </div>
              );
            })}
          </div>
        </section>
        <section>
          <h3 className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em] mb-3">Price Distribution</h3>
          <div className="h-52 relative">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/15 z-10" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/15 z-10" />
            {histData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histData} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "JetBrains Mono, SF Mono, monospace" }} tickFormatter={(v: number) => `$${v}`} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "JetBrains Mono, SF Mono, monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "11px", fontFamily: "JetBrains Mono, SF Mono, monospace", color: "#fff" }} labelFormatter={(v: number) => `$${v}–$${v + 10}`} />
                  <Bar dataKey="count" radius={[1, 1, 0, 0]}>
                    {histData.map((e, i) => {
                      const pct = report.baseline_price ? Math.abs(e.bucket - report.baseline_price) / report.baseline_price : 0;
                      return <Cell key={i} fill={pct > 0.08 ? (e.bucket < (report.baseline_price ?? 0) ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)") : "rgba(255,255,255,0.15)"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-white/10 font-mono text-[11px]">No data</div>}
          </div>
          <div className="flex justify-between text-[9px] font-mono text-white/20 mt-2">
            <span>Min ${report.price_range?.[0].toFixed(0)}</span>
            <span>Base ${report.baseline_price?.toFixed(0)}</span>
            <span>Max ${report.price_range?.[1].toFixed(0)}</span>
          </div>
        </section>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-3"><Terminal className="w-3 h-3 text-white/30" /><h3 className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">Audit Terminal</h3></div>
        <div className="bg-white/[0.02] border border-neutral-900 rounded p-4 font-mono text-[11px] leading-relaxed space-y-2">
          <p className="text-emerald-400/60">// jacobi topology scan complete &mdash; {report.elapsed_seconds.toFixed(1)}s</p>
          <p className="text-white/70">{report.summary}</p>
          <p className="text-white/40">&gt; {report.max_discrimination_scenario}</p>
          <p className="text-emerald-400/40">&gt; {report.min_discrimination_scenario}</p>
          {report.gradients.filter(g => g.significant).map(g => <p key={g.variable_name} className="text-white/30">&nbsp;&nbsp;&#x251C;&#x2500; {g.variable_name}: &Delta;={fmtDelta(g.delta)} ({g.delta_pct.toFixed(1)}%) &middot; t={g.t_statistic.toFixed(2)}</p>)}
          {report.gradients.filter(g => !g.significant).map(g => <p key={g.variable_name} className="text-white/10">&nbsp;&nbsp;&#x2514;&#x2500; {g.variable_name}: &Delta;={fmtDelta(g.delta)} &middot; not significant</p>)}
          <p className="text-white/20 pt-1">// {report.successful_agents}/{report.total_agents} agents &middot; DI=${report.discrimination_index.toFixed(0)} &middot; class={report.topology_class}</p>
        </div>
      </section>

      <div className="text-[9px] font-mono text-white/10 text-center pb-4">session: {report.session_id} &middot; {new Date(report.timestamp).toLocaleString()}</div>
    </div>
  ) : null;

  const scanningView = running && !report ? (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="flex items-center gap-2 text-white/40 font-mono text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Deploying 24 probe agents across 3 staggered waves</span>
      </div>
      <div className="grid grid-cols-6 gap-2 max-w-sm">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="aspect-square rounded border border-neutral-800 bg-black flex items-center justify-center" style={{ animation: `rp 2.5s ease-in-out ${i*80}ms infinite` }}>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[7px] font-mono text-white/20">A{String(i).padStart(2,"0")}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-white/30" style={{ animation: `pulse 1.5s ease-in-out ${i*80}ms infinite` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-black text-white font-sans antialiased selection:bg-white/10">
      <style>{`@keyframes rp{0%,100%{border-color:rgba(255,255,255,0.06)}30%{border-color:rgba(255,255,255,0.2)}60%{border-color:rgba(255,255,255,0.08)}}@keyframes blockPulse{0%,100%{border-color:rgba(220,38,38,0.1)}50%{border-color:rgba(220,38,38,0.3)}}.animate-blockPulse{animation:blockPulse 2s ease-in-out infinite;border:1px solid rgba(220,38,38,0.1)}`}</style>

      <header className="h-12 border-b border-neutral-900 flex items-center px-5 bg-black/80 backdrop-blur-md fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded border border-neutral-800 flex items-center justify-center"><Network className="w-3.5 h-3.5 text-white/70" /></div>
          <span className="text-sm font-medium tracking-tight">JACOBI</span>
          <span className="text-[10px] text-white/20 font-mono hidden sm:inline">/ adversarial pricing probe</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[10px] font-mono text-white/20">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-7 h-3.5 rounded-full border transition-colors relative ${useCache ? "bg-white/20 border-white/20" : "bg-transparent border-neutral-700"}`}>
              <div className={`w-2.5 h-2.5 rounded-full bg-white/40 absolute top-0.5 transition-transform ${useCache ? "translate-x-[11px]" : "translate-x-[2px]"}`} />
            </div>
            <span className="text-white/25 group-hover:text-white/40">demo</span>
          </label>
          <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-white animate-pulse" : report ? "bg-emerald-400" : "bg-white/20"}`} />
        </div>
      </header>

      <div className="pt-12">
        <div className="max-w-3xl mx-auto w-full px-4 py-6">

          {!report && !running && (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
              <div className="w-14 h-14 rounded-full border border-neutral-800 flex items-center justify-center mb-5">
                <Network className="w-6 h-6 text-white/40" />
              </div>
              <h1 className="text-xl font-medium tracking-tight mb-1">JACOBI</h1>
              <p className="text-sm text-white/30 font-mono mb-10">Adversarial Pricing Topology Probe</p>

              <div className="w-full max-w-xl space-y-4">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/15 font-mono text-[11px] pointer-events-none">$</div>
                  <input value={url} onChange={e => setUrl(e.target.value)} disabled={running} placeholder="Paste target URL or select a sample below..."
                    className="w-full pl-8 pr-4 py-3 bg-transparent border border-neutral-800 rounded text-sm font-mono text-white/80 placeholder-white/15 outline-none focus:border-white/30 transition-colors disabled:opacity-40" />
                </div>
                <button onClick={run} disabled={running}
                  className="w-full py-3 border border-white/20 hover:bg-white/[0.04] text-sm font-mono tracking-wider text-white/80 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3">
                  {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> // SCANNING...</> : <><Zap className="w-3.5 h-3.5" /> RUN MATRIX TOPOLOGY PROBE</>}
                </button>
                <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-white/20">
                  <span className="text-white/15">Quick select:</span>
                  {SAMPLE_TARGETS.map(s => (
                    <button key={s.label} onClick={() => selectSample(s)} disabled={running}
                      className="px-2 py-1 rounded border border-neutral-800 hover:border-neutral-700 text-white/30 hover:text-white/60 transition-colors disabled:opacity-40">{s.label.split(" ").slice(0,3).join(" ")}</button>
                  ))}
                </div>
                {error && <div className="flex items-start gap-2 text-[11px] text-red-400/80 font-mono p-3 border border-red-900/30 bg-red-950/20 rounded"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{error}</div>}
              </div>
            </div>
          )}

          {scanningView}

          {(running || report) && (
            <div className="space-y-3 mb-4">
              {running && (
                <div className="w-full bg-neutral-900 h-0.5 rounded overflow-hidden">
                  <div className="h-full bg-white/30 transition-all duration-300" style={{ width: `${probeProgress}%` }} />
                </div>
              )}
              <div className="border border-neutral-900 rounded overflow-hidden">
                <button onClick={() => setShowStream(!showStream)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-mono text-white/25 uppercase tracking-[0.15em] hover:text-white/40 transition-colors bg-black/40">
                  <span className="flex items-center gap-2"><Terminal className="w-3 h-3" />BRIGHTDATA NETWORK STREAM</span>
                  {showStream ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                </button>
                {showStream && (
                  <div className="h-32 overflow-y-auto px-4 pb-3 font-mono text-[10px] leading-relaxed bg-black/60">
                    {streamLogs.length === 0 && <p className="text-white/10 italic pt-2">Awaiting probe execution...</p>}
                    {streamLogs.map((line, i) => (
                      <p key={i} className={
                        line.includes("CAPTCHA") || line.includes("Cloudflare") ? "text-amber-400/70" :
                        line.includes("succeeded") || line.includes("complete") ? "text-emerald-400/60" :
                        line.includes("Proxy routed") ? "text-cyan-400/50" :
                        line.includes("TLS") ? "text-purple-400/50" :
                        line.includes("Price extracted") ? "text-white/80" : "text-white/30"
                      }>{line}</p>
                    ))}
                    {running && <p className="text-white/10 animate-pulse">_</p>}
                    <div ref={streamEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}

          {resultsSection}

          {!report && !running && (
            <div className="text-center text-[10px] font-mono text-white/10 pb-8 mt-8">
              Built for BrightData × MIT Hackathon &middot; 24-Agent Parallel Matrix
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
