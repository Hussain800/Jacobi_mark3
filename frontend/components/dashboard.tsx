"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Send, Loader2, Globe, Smartphone, Cookie, ExternalLink,
  AlertTriangle, Network, ChevronDown, ChevronRight,
  Shield, Download, Signal, Zap, X, Radio, Info, Share2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import AuthButton from "./auth-button";
import JacobiLogo from "./jacobi-logo";
import DotMatrix from "./dot-matrix";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Area, AreaChart,
} from "recharts";

function cx(base: string, extra = "") {
  return `bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl ${base} ${extra}`.trim();
}

/* ─── Types ──────────────────────────────────────────────────────────── */

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
  variables: Record<string, string>; network_tier?: number; proxy_type?: string;
}

export interface TopologyReport {
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
  discrimination_score?: number;
}

interface Message {
  id: string; role: "user" | "assistant"; content: string;
  report?: TopologyReport; status?: "scanning" | "complete" | "error"; error?: string;
  startedAt?: number;
}

/* ─── Demo Data ──────────────────────────────────────────────────────── */

const DEMO_AGENTS: Agent[] = Array.from({ length: 24 }, (_, i) => {
  const tier = i < 8 ? 0 : i < 16 ? 1 : 2;
  const ptype = tier === 0 ? "datacenter" : tier === 1 ? "residential" : "mobile";
  const labels = [
    "BASELINE MACBOOK MANHATTAN DIRECT","LOCATION HIGH MANHATTAN","LOCATION LOW RURAL IOWA",
    "LOCATION HIGH SAN FRANCISCO","LOCATION HIGH LONDON","LOCATION LOW MUMBAI",
    "DEVICE HIGH IPHONE 15 PRO","DEVICE LOW ANDROID BUDGET","DEVICE HIGH MACBOOK PRO M3",
    "DEVICE LOW CHROMEBOOK","DEVICE HIGH GALAXY S24","COOKIE HIGH 30D INTENT",
    "COOKIE LOW FRESH","COOKIE HIGH 90D PLATINUM","REFERRER HIGH VIA KAYAK",
    "REFERRER LOW DIRECT","REFERRER HIGH SKYSCANNER","REFERRER LOW DIRECT",
    "LOCATION HIGH DUBAI","LOCATION LOW RURAL MISSISSIPPI","DEVICE HIGH IPAD PRO",
    "DEVICE LOW IPHONE SE","CONTROL REPEAT 1","CONTROL REPEAT 2",
  ];
  const basePrices = [245,268,228,265,262,231,272,234,269,236,266,254,245,241,258,245,256,245,278,221,271,238,246,244];
  return {
    agent_id: `AGENT_${String(i).padStart(2,"0")}`,
    label: `AGENT_${String(i).padStart(2,"0")}  ${labels[i]}`,
    status: i === 21 ? "detected" : "success",
    price: i === 21 ? null : basePrices[i],
    response_time_ms: 800 + Math.floor(Math.random() * 800),
    bot_detected: i === 21, detection_signal: i === 21 ? "captcha" : null,
    error_message: null, variables: {}, network_tier: tier, proxy_type: ptype,
  };
});

const DEMO: TopologyReport = {
  session_id: "demo", target_url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html",
  target_name: "Leela Palace Bangalore", timestamp: "2026-05-25T20:00:00Z", status: "completed",
  total_agents: 24, successful_agents: 22, failed_agents: 1, detected_agents: 1,
  elapsed_seconds: 8.7, control_stability: 0.994, baseline_price: 245, mean_price: 252,
  all_prices: Object.fromEntries(DEMO_AGENTS.filter(a => a.price !== null).map(a => [a.agent_id, a.price])),
  price_range: [221, 278], max_price_spread: 57, max_price_spread_pct: 23.3,
  gradients: [
    {variable_name:"location",state_high:"High Income",state_low:"Low Income",mean_price_high:268.3,mean_price_low:226.7,delta:41.6,delta_pct:17,pooled_std:2.5,t_statistic:16.6,significant:true,n_high:3,n_low:3},
    {variable_name:"device",state_high:"Premium Device",state_low:"Budget Device",mean_price_high:269.5,mean_price_low:236,delta:33.5,delta_pct:13.7,pooled_std:3.1,t_statistic:10.8,significant:true,n_high:4,n_low:4},
    {variable_name:"cookie_profile",state_high:"Aged Profile",state_low:"Fresh Profile",mean_price_high:247.5,mean_price_low:245,delta:2.5,delta_pct:1,pooled_std:4.2,t_statistic:0.6,significant:false,n_high:2,n_low:2},
    {variable_name:"referrer",state_high:"Aggregator",state_low:"Direct",mean_price_high:257,mean_price_low:245,delta:12,delta_pct:4.9,pooled_std:3.8,t_statistic:3.16,significant:true,n_high:2,n_low:2},
  ],
  discrimination_index: 87.1, topology_class: "progressive", discrimination_score: 84.2,
  summary: "TOPOLOGY: PROGRESSIVE. Baseline: $245/night. Spread: $57. DI: $87.10. Significant: 3 vars.",
  max_discrimination_scenario: "Max: AGENT_18 DUBAI @ $278",
  min_discrimination_scenario: "Min: AGENT_19 RURAL MISSISSIPPI @ $221",
  agents: DEMO_AGENTS, error: null,
};

const SAMPLES = [
  { label: "Leela Palace Bangalore", url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html" },
  { label: "Tokyo Hotels Search", url: "https://www.booking.com/searchresults.html?ss=Tokyo" },
  { label: "Knickerbocker NYC", url: "https://www.booking.com/hotel/us/the-knickerbocker.html" },
  { label: "DXB to KTM Flights", url: "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB" },
  { label: "Wireless Headphones", url: "https://www.amazon.com/s?k=wireless+headphones" },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */

const VAR_ICONS: Record<string, React.ReactNode> = {
  location: <Globe className="w-3 h-3" />, device: <Smartphone className="w-3 h-3" />,
  cookie_profile: <Cookie className="w-3 h-3" />, referrer: <ExternalLink className="w-3 h-3" />,
};

function clsColor(c: string) {
  switch(c) {
    case "uniform": return "text-neon"; case "selective": return "text-amber-400";
    case "progressive": return "text-orange-400"; case "aggressive": return "text-rose-400";
    default: return "text-white/30";
  }
}

function fmtDelta(d: number) { return d >= 0 ? `+$${d.toFixed(0)}` : `-$${Math.abs(d).toFixed(0)}`; }

function buildHistogram(prices: Record<string, number | null>) {
  const v = Object.values(prices).filter(p => p !== null) as number[];
  if (!v.length) return [];
  const mn = Math.floor(Math.min(...v) / 10) * 10, mx = Math.ceil(Math.max(...v) / 10) * 10;
  const bins: Record<number, number> = {};
  for (let b = mn; b <= mx; b += 10) bins[b] = 0;
  for (const p of v) { const bin = Math.floor(p / 10) * 10; bins[bin] = (bins[bin] || 0) + 1; }
  return Object.entries(bins).map(([k, c]) => ({ bucket: Number(k), count: c })).sort((a, b) => a.bucket - b.bucket);
}

function extractUrl(text: string) { const m = text.match(/https?:\/\/[^\s]+/g); return m ? m[0] : null; }

function buildNetworkData(report: TopologyReport) {
  const agents = report.agents.filter(a => a.status === "success" && a.price != null);
  return [{k:0,l:"Datacenter"},{k:1,l:"Residential"},{k:2,l:"Mobile 5G"}].map(t => {
    const prices = agents.filter(a => a.network_tier === t.k).map(a => a.price!);
    const avg = prices.length ? Math.round(prices.reduce((a,b) => a+b, 0) / prices.length) : 0;
    return { name: t.l, avg, min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0, count: prices.length };
  });
}

function dl(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function exportJSON(r: TopologyReport) { dl(new Blob([JSON.stringify(r,null,2)],{type:"application/json"}), `probe-${r.session_id||"report"}.json`); }
function exportCSV(r: TopologyReport) { dl(new Blob([["agent_id,label,status,price,network_tier,proxy_type,response_time_ms",...r.agents.map(a=>[a.agent_id,`"${a.label}"`,a.status,a.price??"",a.network_tier??"",a.proxy_type??"",a.response_time_ms??""].join(","))].join("\n")],{type:"text/csv"}), `probe-agents-${r.session_id||"report"}.csv`); }

/* ─── Network Fingerprint ────────────────────────────────────────────── */

function NetworkFingerprint({ report }: { report: TopologyReport }) {
  const data = buildNetworkData(report), baseline = report.baseline_price || 0;
  return (
    <div className={cx("p-5")}>
      <div className="flex items-center gap-2 mb-4">
        <Signal className="w-4 h-4 text-neon/70" />
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.1em] font-light">Network Fingerprint</span>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{top:8,right:8,left:-16,bottom:4}}>
            <defs><linearGradient id="ng" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00ff41" stopOpacity={0.12}/><stop offset="100%" stopColor="#00ff41" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.03)"/>
            <XAxis dataKey="name" tick={{fill:"rgba(255,255,255,0.2)",fontSize:9,fontFamily:"JetBrains Mono, monospace"}} axisLine={{stroke:"rgba(255,255,255,0.04)"}}/>
            <YAxis tick={{fill:"rgba(255,255,255,0.2)",fontSize:9,fontFamily:"JetBrains Mono, monospace"}} axisLine={{stroke:"rgba(255,255,255,0.04)"}} domain={[0,"dataMax + 20"]} tickFormatter={(v:number)=>`$${v}`}/>
            <Tooltip contentStyle={{background:"#0a0a0a",border:"1px solid rgba(0,255,65,0.15)",borderRadius:"12px",fontSize:"10px",fontFamily:"JetBrains Mono, monospace",color:"#fff"}}/>
            <Area type="monotone" dataKey="avg" stroke="#00ff41" strokeWidth={2} fill="url(#ng)" dot={{fill:"#00ff41",r:4,stroke:"#080808",strokeWidth:2}} activeDot={{r:5,fill:"#00ff41",stroke:"#080808",strokeWidth:2}}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {data.map(d => {
          const delta = d.avg - baseline, pct = baseline ? ((delta/baseline)*100).toFixed(1) : "0";
          return (
            <div key={d.name} className="bg-white/[0.03] rounded-xl p-3 text-center">
              <div className="text-[8px] font-mono text-white/20 mb-1">{d.name}</div>
              <div className="text-base font-light text-white/80 font-mono">${d.avg}</div>
              <div className={`text-[8px] font-mono mt-0.5 ${delta>0?"text-rose-400/70":delta<0?"text-neon/70":"text-white/15"}`}>{delta>0?`+$${delta}`:`$${delta}`} ({pct}%)</div>
              <div className="text-[6px] font-mono text-white/10 mt-0.5">{d.count} agents</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Agent Detail Modal ─────────────────────────────────────────────── */

function AgentDetailModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const tl = agent.network_tier != null ? ["Datacenter","Residential","Mobile 5G"][agent.network_tier] : "-";
  const tc = agent.network_tier === 0 ? "bg-neon/60" : agent.network_tier === 1 ? "bg-neon/40" : "bg-neon/25";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={cx("max-w-md w-full p-0 overflow-hidden shadow-2xl")} onClick={e => e.stopPropagation()} style={{animation:"fadeUp 0.25s ease-out"}}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${tc}`} />
            <div>
              <div className="text-sm font-mono text-white/80 font-light">{agent.agent_id}</div>
              <div className="text-[8px] font-mono text-white/20 mt-0.5 font-light">{tl} / {agent.proxy_type || "-"}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/30 hover:text-white/60"><X className="w-3 h-3"/></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.1em] mb-1 font-light">Price Quoted</div>
              <div className="text-3xl font-thin text-white tracking-tight">{agent.price !== null ? `$${agent.price}` : <span className="text-rose-400">BLOCKED</span>}</div>
            </div>
            <div className="text-right">
              <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.1em] mb-1 font-light">Status</div>
              <div className={`text-sm font-mono font-light ${agent.status==="success"?"text-neon":agent.status==="detected"?"text-rose-400":"text-white/50"}`}>{agent.status.toUpperCase()}</div>
              {agent.bot_detected && agent.detection_signal && <div className="text-[8px] font-mono text-rose-400/60 mt-0.5">{agent.detection_signal}</div>}
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-4">
            <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.1em] mb-3 font-light">Agent Profile</div>
            <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
              {[
                {l:"Network",v:tl},{l:"Proxy",v:agent.proxy_type||"-"},
                {l:"Response",v:agent.response_time_ms?`${agent.response_time_ms}ms`:"-"},
                {l:"Bot",v:agent.bot_detected?"Yes":"No"},{l:"Control",v:(agent as any).is_control?"Yes":"No"},
              ].map(d => (
                <div key={d.l}><div className="text-[7px] font-mono text-white/12 uppercase tracking-wider mb-0.5 font-light">{d.l}</div><div className="text-white/60 text-[10px]">{d.v}</div></div>
              ))}
            </div>
          </div>
          {agent.label && (
            <div className="border-t border-white/[0.06] pt-4">
              <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.1em] mb-2 font-light">Label</div>
              <div className="text-[10px] font-mono text-white/35 leading-relaxed break-all font-light">{agent.label}</div>
            </div>
          )}
          {Object.keys(agent.variables||{}).length > 0 && (
            <div className="border-t border-white/[0.06] pt-4">
              <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.1em] mb-2 font-light">Variables</div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(agent.variables).map(([k,v]) => <span key={k} className="text-[8px] font-mono bg-white/[0.04] text-white/35 px-2 py-0.5 rounded-full border border-white/[0.06] font-light">{k}: {v}</span>)}</div>
            </div>
          )}
          {agent.error_message && (
            <div className="border-t border-white/[0.06] pt-4">
              <div className="text-[8px] font-mono text-rose-400/50 uppercase tracking-[0.1em] mb-1 font-light">Error</div>
              <div className="text-[10px] font-mono text-rose-400/60 font-light">{agent.error_message}</div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes cellReveal{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

/* ─── Agent Grid ─────────────────────────────────────────────────────── */

const AGENT_LABELS = [
  "BASE","LOC\u2191","LOC\u2193","LOC\u2191","LOC\u2191","LOC\u2193",
  "DEV\u2191","DEV\u2193","DEV\u2191","DEV\u2193","DEV\u2191","COOK\u2191",
  "COOK\u2193","COOK\u2191","REF\u2191","REF\u2193","REF\u2191","REF\u2193",
  "LOC\u2191","LOC\u2193","DEV\u2191","DEV\u2193","CTRL","CTRL",
];

function AgentCell({ idx, report, scanStarted, onSelect }: { idx: number; report: TopologyReport; scanStarted: number; onSelect: (a: Agent) => void }) {
  const id = `AGENT_${String(idx).padStart(2,"0")}`;
  const agent = report.agents.find(a => a.agent_id === id);
  const tier = agent?.network_tier ?? (idx < 8 ? 0 : idx < 16 ? 1 : 2);
  const wave = idx < 8 ? 0 : idx < 16 ? 1 : 2;

  // three-tier status: real agent data > animated estimate > pending
  let status = "pending";
  if (agent) {
    status = agent.status;
  } else if (scanStarted > 0) {
    const ms = Date.now() - scanStarted;
    const waveDelay = wave * 2000 + (idx % 8) * 400;
    status = ms > waveDelay ? "in_flight" : "pending";
  }

  const tierColors: Record<number, string> = { 0: "bg-neon/50", 1: "bg-neon/35", 2: "bg-neon/20" };
  const statusStyles: Record<string, string> = {
    pending: "bg-white/[0.03] border-white/[0.03]",
    in_flight: `border border-neon/20 ${tierColors[tier]} animate-pulse`,
    success: `border border-neon/10 ${tierColors[tier]}`,
    failed: "bg-rose-400/20 border border-rose-400/20",
    detected: "bg-rose-400/40 border border-rose-400/40",
  };
  const label = AGENT_LABELS[idx];
  const hasPrice = agent?.price != null;
  const clickable = agent && (agent.status === "success" || agent.status === "detected" || agent.status === "failed");

  return (
    <button
      key={id}
      onClick={() => clickable && onSelect(agent!)}
      className={`relative rounded-xl aspect-square flex flex-col items-center justify-center overflow-hidden transition-all duration-500 ${statusStyles[status]} ${clickable ? "hover:ring-1 hover:ring-neon/40 hover:scale-110 cursor-pointer" : "cursor-default"}`}
      style={{ animation: scanStarted > 0 ? `cellReveal 0.4s ease-out ${wave * 0.15 + (idx % 8) * 0.06}s both` : "none" }}
      title={`${id}: ${status}${hasPrice ? ` $${agent.price}` : ""}`}
    >
      <span className={`font-mono font-light leading-none ${hasPrice ? "text-[7px] text-white/70" : status === "in_flight" ? "text-[6px] text-neon/60" : "text-[6px] text-white/12"}`}>
        {hasPrice ? `$${agent!.price}` : label}
      </span>
      {hasPrice && <span className="text-[5px] font-mono text-white/20 mt-[1px]">{id.replace("AGENT_","")}</span>}
    </button>
  );
}

function AgentGrid({ report, scanStarted }: { report: TopologyReport; scanStarted?: number }) {
  const [selected, setSelected] = useState<Agent | null>(null);
  const started = scanStarted || 0;
  return (
    <>
      <div className={cx("p-4")}>
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-[10px] font-mono text-white/30 uppercase tracking-[0.1em] font-light">
            <Radio className="w-3 h-3 text-neon/60"/>Agent Swarm
          </span>
          <span className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-neon/70">{report.successful_agents}/{report.total_agents}</span>
            {started > 0 && <span className="text-white/20">{(Date.now() - started) / 1000 < 120 ? `${Math.floor((Date.now() - started) / 10) / 100}s` : ""}</span>}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({length: 24}, (_, i) => (
            <AgentCell key={i} idx={i} report={report} scanStarted={started} onSelect={setSelected} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[8px] font-mono">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neon/50"/>{report.successful_agents} success</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400/30"/>{report.failed_agents} failed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400/50"/>{report.detected_agents} blocked</span>
          <span className="text-white/10 ml-auto">{report.total_agents - report.successful_agents - report.failed_agents - report.detected_agents} pending</span>
          <span className="text-white/[0.04] ml-auto flex items-center gap-1"><Info className="w-2 h-2"/>click</span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[7px] font-mono text-white/10">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-neon/50"/>DC</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-neon/35"/>RES</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-neon/20"/>MOB</span>
        </div>
      </div>
      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)}/>}
    </>
  );
}

/* ─── Leaderboard ────────────────────────────────────────────────────── */

function Leaderboard() {
  const [entries, setEntries] = useState<{name:string;savings:number;url:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  useEffect(() => { fetch(`${apiBase}/api/leaderboard`).then(r=>r.json()).then(d=>setEntries((d||[]).slice(0,10))).catch(()=>setEntries([])).finally(()=>setLoading(false)); }, [apiBase]);
  if (loading) return <div className="text-[10px] font-mono text-white/15 text-center py-4 font-light">Loading...</div>;
  if (!entries.length) return null;
  return (
    <div className={cx("overflow-hidden")}>
      <div className="px-5 py-3 border-b border-white/[0.06] text-[9px] font-mono text-neon/50 uppercase tracking-[0.1em] font-light">Highest Savings</div>
      {entries.map((e,i) => (
        <div key={i} className="px-5 py-2 border-b border-white/[0.03] flex items-center justify-between text-[11px] font-mono">
          <span className="text-white/50 font-light">{i+1}. {e.name}</span>
          <span className="text-neon font-light">-${e.savings.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Result Card ──────────────────────────────────────────────────────── */

export function ResultCard({ report, onClose }: { report: TopologyReport; onClose?: () => void }) {
  const [showAgents, setShowAgents] = useState(false);
  const [showHistogram, setShowHistogram] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  const copyShareLink = () => {
    const sid = report.session_id;
    if (!sid) return;
    const url = `${window.location.origin}/share/${sid}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    }).catch(() => {});
  };
  const [showComparison, setShowComparison] = useState(false);
  const histData = buildHistogram(report.all_prices);
  const cls = clsColor(report.topology_class);
  const analysis = (report as any)._analysis;
  const gemini = analysis?.gemini_report;
  const base = report.baseline_price || 0;
  const sigs = report.gradients.filter(g => g.significant && g.delta > 0);
  const totalSavings = sigs.reduce((s,g) => s+g.delta, 0);
  const agentRows = [report.agents.slice(0,8), report.agents.slice(8,16), report.agents.slice(16,24)];

  const borderCls = report.topology_class === "aggressive" ? "border-rose-400/20" : report.topology_class === "progressive" ? "border-orange-400/20" : "border-neon/10";

  return (
    <div className={cx(`overflow-hidden ${borderCls}`)} style={{animation:"fadeUp 0.4s ease-out"}}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Shield className={`w-4 h-4 ${cls}`}/>
          <span className={`text-sm font-mono font-medium ${cls}`}>{report.topology_class.toUpperCase()}</span>
          <span className="text-xs text-white/35 font-mono font-light">${base.toFixed(0)} base</span>
          {report.discrimination_score != null && <span className="text-[9px] font-mono text-white/15 font-light">DI {report.discrimination_score.toFixed(0)}%</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={()=>exportJSON(report)} className="p-1.5 rounded-xl hover:bg-white/[0.06] text-white/20 hover:text-neon/70" title="JSON"><Download className="w-3 h-3"/></button>
          <button onClick={()=>exportCSV(report)} className="p-1.5 rounded-xl hover:bg-white/[0.06] text-white/20 hover:text-neon/70 text-[8px] font-mono" title="CSV">CSV</button>
          <div className="relative">
            <button onClick={copyShareLink} className="p-1.5 rounded-xl hover:bg-white/[0.06] text-white/20 hover:text-neon/70" title="Copy share link"><Share2 className="w-3 h-3"/></button>
            {copyToast && <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[8px] font-mono bg-neon/10 text-neon/70 border border-neon/20 rounded px-2 py-0.5 whitespace-nowrap pointer-events-none">Link copied!</span>}
          </div>
          {onClose && <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/[0.06] text-white/20 hover:text-white/50 ml-1 text-[10px]">X</button>}
        </div>
      </div>

      {(report as any)._demo && (
        <div className="px-5 py-3 bg-amber-400/5 border-b border-amber-400/10 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-400/60 shrink-0"/>
          <span className="text-[9px] font-mono text-amber-400/60 font-light">Simulated &mdash; toggle demo off for live probes</span>
        </div>
      )}

      {gemini?.plain_english_summary && (
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <p className="text-[9px] font-mono text-neon/50 uppercase tracking-[0.1em] mb-1.5 font-light">AI Analysis</p>
          <p className="text-xs text-white/60 font-light leading-relaxed">{gemini.plain_english_summary}</p>
          {gemini.action_items?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{gemini.action_items.map((item:string,i:number) => <span key={i} className="text-[8px] font-mono bg-white/[0.04] text-white/30 px-2.5 py-1 rounded-full border border-white/[0.06] font-light">{item}</span>)}</div>}
        </div>
      )}

      {totalSavings > 0 && (
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-mono text-neon/50 uppercase tracking-[0.1em] mb-1 font-light">Hidden Premium</p>
              <p className="text-2xl font-thin text-neon tracking-tight">+${totalSavings.toFixed(0)}</p>
              <p className="text-[9px] font-mono text-white/25 mt-0.5 font-light">Paying ${(base+totalSavings).toFixed(0)} vs ${base.toFixed(0)} achievable</p>
            </div>
            <div className="text-right hidden sm:block">{sigs.slice(0,3).map(g => <p key={g.variable_name} className="text-[9px] font-mono text-white/25 font-light">{g.variable_name}: +${g.delta.toFixed(0)}</p>)}</div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">{sigs.map(g => <span key={g.variable_name} className="px-2.5 py-1 text-[8px] font-mono bg-neon/5 text-neon/60 rounded-full border border-neon/10 font-light">{g.variable_name==="location"?"Spoof location":g.variable_name==="device"?"Switch device":g.variable_name==="cookie_profile"?"Clear cookies":g.variable_name}</span>)}</div>
        </div>
      )}

      <div className="px-5 py-4 space-y-4">
        <NetworkFingerprint report={report} />

        <div className={cx("p-4")}>
          <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.1em] mb-3 font-light">Price Impact</div>
          {report.gradients.map(g => {
            const pct = Math.min(Math.abs(g.delta_pct)/20*100, 100);
            return (
              <div key={g.variable_name} className="flex items-center gap-2 mb-2.5">
                <div className="w-24 flex items-center gap-1.5 text-[9px] font-mono text-white/25 shrink-0 font-light">{VAR_ICONS[g.variable_name]}{g.variable_name.replace("_"," ")}</div>
                <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">{g.significant && <div className={`h-full rounded-full transition-all ${g.delta>0?"bg-rose-400/40":"bg-neon/40"}`} style={{width:`${pct}%`}}/>}</div>
                <div className="w-16 text-right">{g.significant ? <span className={`text-[9px] font-mono ${g.delta>0?"text-rose-400/70":"text-neon/70"}`}>{fmtDelta(g.delta)}</span> : <span className="text-[9px] font-mono text-white/10">n/s</span>}</div>
                {g.significant && <span className="text-[8px] font-mono text-white/15 w-10 text-right font-light">{g.delta_pct.toFixed(1)}%</span>}
              </div>
            );
          })}
        </div>

        {/* Comparison Table */}
        <div>
          <button onClick={() => setShowComparison(!showComparison)} className="w-full flex items-center justify-between text-[9px] font-mono text-white/20 hover:text-white/40 transition-colors py-1.5 font-light">
            <span>Variable Comparison</span>
            {showComparison ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {showComparison && report.gradients.length > 0 && (
            <div className="overflow-x-auto -mx-1 mt-2">
              <table className="w-full text-[9px] font-mono border-collapse">
                <thead>
                  <tr className="text-white/25 font-light">
                    <th className="text-left py-2 px-2 whitespace-nowrap">Variable</th>
                    <th className="text-center py-2 px-2 whitespace-nowrap">High State</th>
                    <th className="text-center py-2 px-2 whitespace-nowrap">Low State</th>
                    <th className="text-right py-2 px-2 whitespace-nowrap">Delta</th>
                    <th className="text-right py-2 px-2 whitespace-nowrap">&Delta;%</th>
                    <th className="text-center py-2 px-2 whitespace-nowrap">Sig</th>
                  </tr>
                </thead>
                <tbody>
                  {report.gradients.map(g => (
                    <tr key={g.variable_name} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="py-3 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/30">{VAR_ICONS[g.variable_name] || null}</span>
                          <span className="text-white/50 font-light capitalize">{g.variable_name.replace(/_/g, " ")}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <div className="text-white/60 font-light">{g.state_high}</div>
                        <div className="flex items-center justify-center gap-2 mt-0.5">
                          <span className="text-neon/80">${g.mean_price_high.toFixed(0)}</span>
                          <span className="text-white/15">(n={g.n_high})</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <div className="text-white/60 font-light">{g.state_low}</div>
                        <div className="flex items-center justify-center gap-2 mt-0.5">
                          <span className="text-white/50">${g.mean_price_low.toFixed(0)}</span>
                          <span className="text-white/15">(n={g.n_low})</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right whitespace-nowrap font-light">
                        <span className={g.significant ? (g.delta > 0 ? "text-rose-400/70" : "text-neon/70") : "text-white/15"}>
                          {fmtDelta(g.delta)}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right whitespace-nowrap font-light">
                        <span className={g.significant ? "text-white/40" : "text-white/12"}>
                          {g.delta_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        {g.significant ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-neon/10 text-neon/80 text-[8px] font-bold" title="Statistically significant (p &lt; 0.05)">&#10003;</span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.03] text-white/15 text-[8px]" title="Not statistically significant">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <AgentGrid report={report} />

        <div>
          <button onClick={()=>setShowHistogram(!showHistogram)} className="w-full flex items-center justify-between text-[9px] font-mono text-white/20 hover:text-white/40 transition-colors py-1.5 font-light">
            <span>Price Distribution</span>
            {showHistogram ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
          </button>
          {showHistogram && histData.length > 0 && (
            <div className="h-32 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histData} margin={{top:4,right:8,left:0,bottom:16}}>
                  <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.03)"/>
                  <XAxis dataKey="bucket" tick={{fill:"rgba(255,255,255,0.2)",fontSize:8,fontFamily:"JetBrains Mono, monospace"}} tickFormatter={(v:number)=>`$${v}`} axisLine={{stroke:"rgba(255,255,255,0.04)"}}/>
                  <YAxis tick={{fill:"rgba(255,255,255,0.2)",fontSize:8,fontFamily:"JetBrains Mono, monospace"}} axisLine={{stroke:"rgba(255,255,255,0.04)"}} allowDecimals={false}/>
                  <Tooltip contentStyle={{background:"#0a0a0a",border:"1px solid rgba(0,255,65,0.15)",borderRadius:"12px",fontSize:"9px",fontFamily:"JetBrains Mono, monospace",color:"#fff"}} labelFormatter={(v:number)=>`$${v}-$${v+10}`}/>
                  <Bar dataKey="count" radius={[2,2,0,0]}>{histData.map((e,i) => <Cell key={i} fill={base?Math.abs(e.bucket-base)/base>0.08?"rgba(0,255,65,0.4)":"rgba(255,255,255,0.06)":"rgba(255,255,255,0.06)"}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div>
          <button onClick={()=>setShowAgents(!showAgents)} className="w-full flex items-center justify-between text-[9px] font-mono text-white/20 hover:text-white/40 transition-colors py-1.5 font-light">
            <span>All {report.agents.length} Agents</span>
            {showAgents ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
          </button>
          {showAgents && <div className="space-y-1 mt-2">{agentRows.map((row,ri) => <div key={ri} className="grid grid-cols-4 sm:grid-cols-8 gap-1">{row.map(a => <div key={a.agent_id} className="bg-white/[0.02] rounded-xl p-2 border border-white/[0.04]"><div className="flex items-center justify-between mb-0.5"><span className="text-[6px] font-mono text-white/15">{a.agent_id.replace("AGENT_","A")}</span>{a.price !== null ? <span className="text-[7px] font-mono text-white/50">${a.price}</span> : <span className="text-[6px] text-rose-400/50 font-mono">BLKD</span>}</div>{a.network_tier != null && <div className="text-[5px] font-mono text-white/8">{["DC","RES","MOB"][a.network_tier]}</div>}</div>)}</div>)}</div>}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-white/[0.06] text-[8px] font-mono text-white/15 leading-relaxed bg-black/20 font-light">{report.summary}</div>
    </div>
  );
}

/* ─── Floating Orbs ──────────────────────────────────────────────────── */

function FloatingOrbs() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="absolute top-[20%] left-[10%] w-[300px] h-[300px] rounded-full bg-neon/4 blur-[120px] animate-[f1_14s_ease-in-out_infinite]"/>
      <div className="absolute bottom-[30%] right-[5%] w-[250px] h-[250px] rounded-full bg-neon/3 blur-[100px] animate-[f2_16s_ease-in-out_infinite]"/>
      <style>{`@keyframes f1{0%,100%{transform:translate(0,0)}33%{transform:translate(20px,-20px)}66%{transform:translate(-15px,15px)}}@keyframes f2{0%,100%{transform:translate(0,0)}33%{transform:translate(-25px,15px)}66%{transform:translate(20px,-10px)}}`}</style>
    </div>
  );
}

/* ─── Main Chat Component ────────────────────────────────────────────── */

export default function Terminal() {
  const {data: session} = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [useCache, setUseCache] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const saveConv = useCallback((report: any) => {
    try {
      const existing = JSON.parse(localStorage.getItem("probe-conversations")||"[]");
      existing.unshift({id:report.session_id,title:(report.target_name||report.target_url||"Probe").slice(0,50),timestamp:Date.now(),targetUrl:report.target_url,targetName:report.target_name,baselinePrice:report.baseline_price,savings:report.max_price_spread,topologyClass:report.topology_class});
      localStorage.setItem("probe-conversations", JSON.stringify(existing.slice(0,50)));
    } catch {}
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const addMsg = useCallback((msg: Message) => setMessages(prev => [...prev, msg]), []);
  const updateLast = useCallback((up: Partial<Message>) => { setMessages(prev => { const i=prev.length-1; if(i<0||prev[i].role!=="assistant") return prev; const n=[...prev]; n[i]={...n[i],...up}; return n; }); }, []);

  const runProbe = useCallback(async (targetUrl: string, targetName: string) => {
    setRunning(true);
    const mid = Date.now().toString();
    addMsg({id:mid,role:"assistant",content:"Deploying 24 probe agents across 3 staggered waves...",status:"scanning",startedAt: Date.now()});
    if (useCache) {
      await new Promise(r=>setTimeout(r,500));
      updateLast({content:"Wave 1/3 - 8 agents deployed",report:{total_agents:24,successful_agents:8,failed_agents:0,detected_agents:0,agents:DEMO.agents.slice(0,8)}as any});
      await new Promise(r=>setTimeout(r,600));
      updateLast({content:"Wave 2/3 - 16 agents active",report:{total_agents:24,successful_agents:16,failed_agents:0,detected_agents:0,agents:DEMO.agents.slice(0,16)}as any});
      await new Promise(r=>setTimeout(r,600));
      updateLast({content:"Wave 3/3 - computing gradients...",report:{total_agents:24,successful_agents:22,failed_agents:1,detected_agents:1,agents:DEMO.agents}as any});
      await new Promise(r=>setTimeout(r,500));
      try {
        const ar = await fetch(`${apiBase}/api/analyze-demo`);
        if (ar.ok) { const a=await ar.json(); updateLast({content:"Complete.",report:{...DEMO,_demo:true,_analysis:a}as any,status:"complete"}); }
        else { updateLast({content:"Complete.",report:{...DEMO,_demo:true}as any,status:"complete"}); }
      } catch { updateLast({content:"Complete.",report:{...DEMO,_demo:true}as any,status:"complete"}); }
      setRunning(false); return;
    }
    try {
      const r1 = await fetch(`${apiBase}/api/probe`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target_url:targetUrl,target_name:targetName})});
      if (!r1.ok) throw new Error(`Server error: ${r1.status}`);
      const b1 = await r1.json();
      pollRef.current = setInterval(async () => {
        try {
          const r2 = await fetch(`${apiBase}/api/result/${b1.session_id}`);
          if (r2.status === 404) {
            if (pollRef.current) clearInterval(pollRef.current);
            updateLast({status:"error",error:"Probe session expired",content:"Probe session expired"}); setRunning(false);
            return;
          }
          if (!r2.ok) throw new Error(`Poll error: ${r2.status}`);
          const data: TopologyReport = await r2.json();
          if (data.status==="completed"||data.status==="failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (data.status==="completed") {
              saveConv(data);
              try {
                const ar = await fetch(`${apiBase}/api/analyze`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target_url:data.target_url||"",target_name:data.target_name||"",use_data_dir:data.session_id})});
                if (ar.ok) { const a=await ar.json(); updateLast({status:"complete",report:{...data,_analysis:a}as any,content:"Complete."}); }
                else { updateLast({status:"complete",report:data,content:"Complete."}); }
              } catch { updateLast({status:"complete",report:data,content:"Complete."}); }
            } else { updateLast({status:"error",report:data,error:data.error??undefined,content:data.error||"Failed."}); }
            setRunning(false);
          } else { updateLast({content:`Scanning... (${data.successful_agents}/${data.total_agents} agents)`,report:data}); }
        } catch(e:any) {
          if (pollRef.current) clearInterval(pollRef.current);
          updateLast({status:"error",error:e.message,content:`Error: ${e.message}`}); setRunning(false);
        }
      }, 1000);
      setTimeout(() => { if (pollRef.current) { clearInterval(pollRef.current); updateLast({status:"error",error:"Timed out",content:"Timed out after 3m."}); setRunning(false); } }, 180000);
    } catch(e:any) { updateLast({status:"error",error:e.message,content:`Error: ${e.message}`}); setRunning(false); }
  }, [apiBase, useCache, addMsg, updateLast, saveConv]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text||running) return;
    const url = extractUrl(text);
    const label = url ? SAMPLES.find(t=>t.url===url)?.label||url : text;
    addMsg({id:Date.now().toString(),role:"user",content:text}); setInput("");
    runProbe(url||"demo", label);
  }, [input, running, addMsg, runProbe]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); handleSend(); } };
  const pick = (s: typeof SAMPLES[0]) => { setInput(s.url); inputRef.current?.focus(); };
  const hasMsgs = messages.length > 0;

  return (
    <div className="h-screen flex flex-col bg-[#050505] text-white font-sans">
      <DotMatrix />
      <FloatingOrbs />
      <header className="h-12 border-b border-white/[0.06] flex items-center px-5 bg-black/80 backdrop-blur-xl shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <JacobiLogo size="md" minimal />
          <span className="text-[8px] text-white/12 font-mono hidden sm:inline font-light ml-2">/ Probe Interface</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[8px] text-white/20 font-mono hidden sm:inline font-light">{session?.user?.email?.split("@")[0]||"guest"}</span>
          <AuthButton />
          <label className="flex items-center gap-1.5 cursor-pointer group">
            <div className={`w-6 h-3 rounded-full border transition-colors relative ${useCache?"bg-neon/20 border-neon/20":"bg-white/[0.04] border-white/[0.06]"}`}>
              <div className={`w-2 h-2 rounded-full bg-white/40 absolute top-[2px] transition-transform ${useCache?"translate-x-[11px]":"translate-x-[2px]"}`}/>
            </div>
            <span className="text-[7px] font-mono text-white/15 group-hover:text-white/30 font-light">demo</span>
          </label>
          <span className={`w-1 h-1 rounded-full ${running?"bg-neon animate-pulse":hasMsgs?"bg-neon/60":"bg-white/10"}`}/>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto relative z-0">
        <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-5">
          {!hasMsgs && (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
              <div className="mb-6">
                <JacobiLogo size="lg" full />
              </div>
              <p className="text-[10px] font-mono text-white/15 mb-8 font-light tracking-[0.1em] uppercase">24-Agent Pricing Topology Probe</p>
              <div className="flex flex-wrap justify-center gap-3 max-w-xl">
                {SAMPLES.map(s => {
                  const prices: Record<string, string> = {"Leela Palace Bangalore":"$245","Tokyo Hotels Search":"$120","Knickerbocker NYC":"$350","DXB to KTM Flights":"$420","Wireless Headphones":"$65"};
                  return (
                    <button key={s.label} onClick={()=>pick(s)}
                      className="group relative px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-neon/20 hover:bg-neon/5 transition-all duration-500 text-left min-w-[180px]"
                      style={{animation: `fadeUp 0.4s ease-out both`}}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-light text-white/60 group-hover:text-neon/80 transition-colors">{s.label.split(" ").slice(0,2).join(" ")}</span>
                        <span className="text-[11px] font-mono text-neon/40 group-hover:text-neon/80 transition-colors font-light">{prices[s.label]||"$—"}</span>
                      </div>
                      <div className="overflow-hidden max-h-0 group-hover:max-h-[60px] transition-all duration-500 ease-in-out">
                        <div className="pt-2 mt-2 border-t border-white/[0.04] flex items-center justify-between">
                          <span className="text-[8px] font-mono text-white/15 font-light">{s.url.split("/")[2]||s.url.slice(0,25)}</span>
                          <span className="text-[8px] font-mono text-neon/30 group-hover:translate-x-1 transition-transform font-light">Probe &rarr;</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-8 flex items-center gap-3 text-[9px] font-mono text-white/25">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-neon/50"/>DC</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-neon/35"/>RES</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-neon/20"/>MOB</span>
                <span className="text-white/10 mx-1">/</span>
                <span className="text-white/20">24 agents / 3 tiers / 5 variables</span>
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className="space-y-2">
              {msg.role==="user" && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl rounded-br-md px-4 py-3">
                    <p className="text-xs text-white/80 whitespace-pre-wrap break-words font-light">{msg.content}</p>
                  </div>
                </div>
              )}
              {msg.role==="assistant" && (
                <div className="max-w-[94%] space-y-2">
                  {msg.status==="scanning" && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-xl bg-neon/5 border border-neon/15 flex items-center justify-center shrink-0"><Loader2 className="w-3.5 h-3.5 text-neon/70 animate-spin"/></div>
                        <p className="text-xs text-white/40 font-mono font-light pt-1">{msg.content}</p>
                      </div>
                      {msg.report ? <AgentGrid report={msg.report} scanStarted={msg.startedAt}/> : <AgentGrid report={{agents:[],total_agents:24,successful_agents:0,failed_agents:0,detected_agents:0,elapsed_seconds:0}as any} scanStarted={msg.startedAt}/>}
                    </div>
                  )}
                  {msg.status==="error" && (
                    <div className={cx("p-4","border-rose-400/10")}>
                      <div className="flex items-start gap-3"><AlertTriangle className="w-4 h-4 mt-0.5 text-rose-400/60 shrink-0"/><p className="text-xs text-rose-400/70 font-mono font-light">{msg.error||msg.content}</p></div>
                    </div>
                  )}
                  {msg.status==="complete" && msg.report && (
                    <div className="space-y-2">
                      {msg.report.error ? (
                        <div className={cx("p-4","border-amber-400/10")}>
                          <div className="flex items-start gap-3"><AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400/60 shrink-0"/><p className="text-xs text-amber-400/60 font-mono font-light">{msg.report.error}</p></div>
                        </div>
                      ) : (
                        <ResultCard report={msg.report}/>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {hasMsgs && !running && <div className="flex flex-wrap gap-1.5 pt-1">{SAMPLES.slice(0,3).map(s => <button key={s.label} onClick={()=>pick(s)} className="px-3 py-1.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-[8px] font-mono text-white/20 hover:text-white/40 hover:border-white/20 transition-all font-light">{s.label}</button>)}</div>}
          {!running && <div className="pt-2"><Leaderboard/></div>}
          <div ref={endRef}/>
        </div>
      </div>

      <div className="border-t border-white/[0.06] bg-black/80 backdrop-blur-xl shrink-0 relative z-10">
        <div className="max-w-3xl mx-auto w-full px-4 py-3">
          <div className="flex items-end gap-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl focus-within:border-neon/20 transition-colors px-4 py-2.5">
            <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Paste a URL to probe..." disabled={running}
              rows={1} className="flex-1 bg-transparent text-xs text-white/60 placeholder-white/12 outline-none resize-none font-mono font-light max-h-32 py-0.5 disabled:opacity-30" style={{minHeight:"22px"}}/>
            <button onClick={handleSend} disabled={!input.trim()||running}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-neon/10 hover:bg-neon/20 disabled:opacity-20 disabled:cursor-not-allowed transition-all shrink-0 border border-neon/15">
              {running ? <Loader2 className="w-3.5 h-3.5 text-neon/60 animate-spin"/> : <Send className="w-3.5 h-3.5 text-neon/60"/>}
            </button>
          </div>
          <p className="text-[7px] font-mono text-white/8 text-center mt-2 font-light">24 agents probe pricing across location / device / cookies / referrer / network tier</p>
        </div>
      </div>
    </div>
  );
}
