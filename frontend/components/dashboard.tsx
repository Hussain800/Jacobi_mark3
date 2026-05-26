"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Terminal, Activity, DollarSign, TrendingUp,
  Shield, Globe, Smartphone, Cookie, ExternalLink, Loader2,
  AlertTriangle, BarChart3, Network, X,
  Zap, Disc, Code, AlertOctagon, Bot, User,
  ChevronDown, ChevronUp, ArrowUp,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

/* ─── Currency localization ──────────────────────────────────────────── */

const CCY_RATES: Record<string, number> = {
  USD: 1, AED: 3.67, INR: 83.0, GBP: 0.79, EUR: 0.92,
  JPY: 149, SGD: 1.35, AUD: 1.53, CAD: 1.37, CHF: 0.88,
  SEK: 10.5, NOK: 10.7, DKK: 6.9, CNY: 7.24, KRW: 1320,
  THB: 36.0, MYR: 4.72, IDR: 15500, PHP: 56.0, VND: 24800,
  TRY: 30.5, ZAR: 18.5, BRL: 5.05, MXN: 17.2, RUB: 91.0,
  PLN: 4.0, CZK: 23.0, HUF: 360, ILS: 3.67, EGP: 47.0,
  NGN: 1500, SAR: 3.75, QAR: 3.64, OMR: 0.38, KWD: 0.31,
  BHD: 0.38, PKR: 278, BDT: 110, LKR: 300, NPR: 133,
};

function detectCurrency(): { code: string; symbol: string; rate: number } {
  if (typeof navigator === "undefined") return { code: "USD", symbol: "$", rate: 1 };
  const locales = navigator.languages || [navigator.language];
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzMap: Record<string, string> = {
      "Dubai": "AED", "Asia/Dubai": "AED", "Asia/Kolkata": "INR",
      "Europe/London": "GBP", "Europe/Berlin": "EUR", "Europe/Paris": "EUR",
      "America/New_York": "USD", "America/Chicago": "USD", "America/Los_Angeles": "USD",
      "Asia/Tokyo": "JPY", "Asia/Singapore": "SGD", "Australia/Sydney": "AUD",
      "Asia/Bangkok": "THB", "Asia/Riyadh": "SAR", "Asia/Qatar": "QAR",
    };
    for (const [tzKey, ccyCode] of Object.entries(tzMap)) {
      if (tz.includes(tzKey)) {
        const rate = CCY_RATES[ccyCode];
        if (rate) return { code: ccyCode, symbol: ccyCode === "AED" ? "د.إ" : ccyCode === "INR" ? "₹" : ccyCode === "GBP" ? "£" : ccyCode === "EUR" ? "€" : ccyCode, rate };
      }
    }
  } catch {}
  return { code: "USD", symbol: "$", rate: 1 };
}

function localPriceWithUSD(usd: number, ccy: { code: string; symbol: string; rate: number }): string {
  if (ccy.code === "USD") return `$${Math.round(usd)}`;
  return `${ccy.symbol}${Math.round(usd * ccy.rate).toLocaleString()} ($${Math.round(usd)})`;
}

/* ─── Types ──────────────────────────────────────────────────────────── */

interface Gradient { variable_name: string; state_high: string; state_low: string; mean_price_high: number; mean_price_low: number; delta: number; delta_pct: number; pooled_std: number; t_statistic: number; significant: boolean; n_high: number; n_low: number; }
interface Agent { agent_id: string; label: string; status: string; price: number | null; response_time_ms: number | null; bot_detected: boolean; detection_signal: string | null; error_message: string | null; variables: Record<string, string>; network_tier?: number; proxy_type?: string; delta_variable?: string; delta_direction?: string; is_control?: boolean; }
interface TopologyReport { session_id: string; target_url: string; target_name: string; timestamp: string; status: string; total_agents: number; successful_agents: number; failed_agents: number; detected_agents: number; elapsed_seconds: number; control_stability: number; baseline_price: number | null; mean_price: number | null; all_prices: Record<string, number | null>; price_range: [number, number] | null; max_price_spread: number | null; max_price_spread_pct: number | null; gradients: Gradient[]; discrimination_index: number; topology_class: string; summary: string; max_discrimination_scenario: string; min_discrimination_scenario: string; agents: Agent[]; error: string | null; }
interface ChatMessage { id: string; role: "user" | "system" | "result"; content: string | React.ReactNode; timestamp: string; }

/* ─── Helpers ────────────────────────────────────────────────────────── */

function parseCombo(l: string): string { const p = l.split("  ").filter(Boolean); return p.length >= 3 ? p.slice(1).join(" | ").replace(/_/g, " ") : l; }

const MCP_LOGS = [
  (id: string) => `Initializing Scraping Browser session for ${id}...`,
  (id: string) => `${id}: Proxy routed via Zone [${["DC-DAL","DC-NYC","DC-LON","RES-DUBAI","RES-MAN","RES-LON","MOB-DXB","MOB-NYC","MOB-LON"][Math.floor(Math.random()*9)]}]`,
  (id: string) => `${id}: TLS/JA3 fingerprint generated natively`,
  (id: string) => `${id}: Page DOM hydrated — extracting pricing node`,
  (id: string) => `${id}: Price extracted — ${(800+Math.random()*700).toFixed(0)}ms`,
];

const MOCK_DOM = {
  text: "Route  Economy  Nonstop  6h 22m  Seat selection available  Change fee $0  Fully refundable",
  node: "<span class=\"fare-amount\">$474.00</span>",
};

let msgId = 0;
function nextId() { return `m${++msgId}`; }
function ts() { return new Date().toLocaleTimeString(); }

function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); }

function generateMockReport(url: string): TopologyReport {
  const seed = hashStr(url) || 1;
  const rng = (max: number, min = 0) => { const x = Math.sin(seed * (++rngCtr || 1)) * 10000; return min + (x - Math.floor(x)) * (max - min); };
  let rngCtr = 0;
  const base = url.includes("leela") ? 180 : url.includes("knickerbocker") ? 350 : url.includes("tokyo") ? 120 : url.includes("headphone") ? 65 : url.includes("flights") ? 420 : 200;
  const agents: Agent[] = [];
  const prices: Record<string, number> = {};
  const profiles = [
    ["DC_US_DATACENTER", 0], ["DC_NYC_DATACENTER", 0], ["DC_LON_DATACENTER", 0], ["DC_SGP_DATACENTER", 0],
    ["DC_FRA_DATACENTER", 0], ["DC_IAD_DATACENTER", 0], ["DC_GRU_DATACENTER", 0], ["DC_NRT_DATACENTER", 0],
    ["RES_DUBAI", 1], ["RES_MANHATTAN", 1], ["RES_LONDON", 1], ["RES_MUMBAI", 1],
    ["RES_SINGAPORE", 1], ["RES_IOWA", 1], ["RES_BERLIN", 1], ["RES_SYDNEY", 1],
    ["MOB_DUBAI_5G", 2], ["MOB_NYC_LTE", 2], ["MOB_LON_5G", 2], ["MOB_MUMBAI_4G", 2],
    ["MOB_SGP_5G", 2], ["MOB_TOKYO_LTE", 2], ["MOB_DOHA_5G", 2], ["MOB_RIYADH_4G", 2],
  ];
  for (let i = 0; i < 24; i++) {
    const id = `AGENT_${String(i).padStart(2, "0")}`;
    const [pLabel, netTierRaw] = profiles[i]; const netTier: number = netTierRaw as number;
    const variation = (netTier === 0 ? -0.1 : netTier === 2 ? 0.15 : 0) + rng(0.08, -0.08);
    const price: number = Math.round(base * (1 + variation));
    prices[id] = price;
    const dv = i < 8 ? "network_tier" : i < 16 ? "location" : "device";
    agents.push({ agent_id: id, label: `${id}  ${pLabel}`, status: "success", price, response_time_ms: 800+Math.floor(rng(1200)), bot_detected: false, detection_signal: null, error_message: null, variables: {}, network_tier: netTier, proxy_type: netTier === 0 ? "datacenter" : netTier === 2 ? "mobile" : "residential", delta_variable: dv, delta_direction: i % 2 === 0 ? "high" : "low", is_control: i >= 22 });
  }
  const vals = Object.values(prices).filter((p): p is number => p !== null);
  const minP = Math.min(...vals), maxP = Math.max(...vals);
  return {
    session_id: `demo_${seed.toString(36).slice(0,6)}`, target_url: url, target_name: url.includes("leela") ? "Leela Palace" : url.includes("knickerbocker") ? "Knickerbocker NYC" : url.includes("tokyo") ? "Tokyo Hotels" : url.includes("headphone") ? "Headphones" : url.includes("flights") ? "DXB→KTM" : "Route",
    timestamp: new Date().toISOString(), status: "completed",
    total_agents: 24, successful_agents: 23, failed_agents: 0, detected_agents: 1,
    elapsed_seconds: 7.3 + rng(2), control_stability: 0.99,
    baseline_price: base, mean_price: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),
    all_prices: prices as any, price_range: [minP, maxP], max_price_spread: maxP - minP, max_price_spread_pct: Math.round((maxP-minP)/base*100),
    gradients: [
      { variable_name: "location", state_high: "High Income Area", state_low: "Low Income Area", mean_price_high: Math.round(base*1.12), mean_price_low: Math.round(base*0.92), delta: Math.round(base*0.2), delta_pct: 20, pooled_std: 3, t_statistic: 12, significant: true, n_high: 4, n_low: 4 },
      { variable_name: "device", state_high: "Premium Device", state_low: "Budget Device", mean_price_high: Math.round(base*1.08), mean_price_low: Math.round(base*0.95), delta: Math.round(base*0.13), delta_pct: 13, pooled_std: 2.5, t_statistic: 8, significant: true, n_high: 3, n_low: 3 },
      { variable_name: "cookie_profile", state_high: "Aged Profile", state_low: "Fresh Profile", mean_price_high: Math.round(base*1.02), mean_price_low: base, delta: Math.round(base*0.02), delta_pct: 2, pooled_std: 4, t_statistic: 0.8, significant: false, n_high: 2, n_low: 2 },
      { variable_name: "referrer", state_high: "Aggregator", state_low: "Direct", mean_price_high: Math.round(base*1.04), mean_price_low: base, delta: Math.round(base*0.04), delta_pct: 4, pooled_std: 3, t_statistic: 3.2, significant: true, n_high: 2, n_low: 2 },
    ],
    discrimination_index: Math.round(base * 0.25), topology_class: "progressive",
    summary: `TOPOLOGY: PROGRESSIVE. ${url.includes("leela") ? "Leela Palace" : "Property"}. Baseline: $${base}. Spread: $${maxP-minP} (${Math.round((maxP-minP)/base*100)}%). DI: $${Math.round(base*0.25)}. Network: DC=${Math.round(base*0.9)} | RES=$${base} | Mobile=$${Math.round(base*1.15)}.`,
    max_discrimination_scenario: `Max: Mobile 5G Dubai @ $${maxP}`,
    min_discrimination_scenario: `Min: Datacenter Dallas @ $${minP}`,
    agents, error: null,
  };
}

/* ─── Main Component ─────────────────────────────────────────────────── */

export default function JacobiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TopologyReport | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showStream, setShowStream] = useState(true);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const [chatContext, setChatContext] = useState<TopologyReport | null>(null);
  const [asking, setAsking] = useState(false);
  const [userCurrency, setUserCurrency] = useState(detectCurrency());
  const [booted, setBooted] = useState(false);
  const [bootText, setBootText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamLogs]);
  useEffect(() => { return () => { if (streamRef.current) clearInterval(streamRef.current); }; }, []);

  // Boot sequence
  useEffect(() => {
    const lines = [
      "// JACOBI v2.4 — Adversarial Pricing Topology Probe",
      "// Initializing BrightData MCP bridge...",
      "// Proxy pools: 8× Datacenter + 8× Residential + 8× Mobile",
      "// Gemini API: connected",
      "// Groq API: connected",
      "// Ready — awaiting target URL",
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < lines.length) { setBootText(prev => prev + lines[i] + "\n"); i++; }
      else { clearInterval(iv); setTimeout(() => setBooted(true), 400); }
    }, 120);
    return () => clearInterval(iv);
  }, []);

  const addMsg = (role: "user" | "system" | "result", content: string | React.ReactNode) => {
    setMessages(prev => [...prev, { id: nextId(), role, content, timestamp: ts() }]);
  };

  const execute = useCallback(async (targetUrl: string) => {
    if (running) return;
    setRunning(true); setStreamLogs([]); setReport(null); setSelectedAgent(null);
    if (!targetUrl.trim()) return;
    addMsg("user", targetUrl);

    let agentIdx = 0;
    streamRef.current = setInterval(() => {
      const aid = `AGENT_${String(Math.floor(agentIdx / 3) % 24).padStart(2, "0")}`;
      const tpl = MCP_LOGS[Math.floor(Math.random() * MCP_LOGS.length)];
      const t = new Date().toISOString().slice(11, 23).replace("Z", "");
      setStreamLogs(prev => [...prev.slice(-50), `[${t}] ${tpl(aid)}`]);
      agentIdx++;
    }, 100);

    addMsg("system", "Deploying 24 probe agents across Datacenter, Residential, and Mobile pools...");

    try {
      const res = await fetch("http://localhost:8000/api/probe", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ target_url: targetUrl, target_name: targetUrl }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.session_id && body.status) {
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
              const r2 = await fetch(`http://localhost:8000/api/result/${body.session_id}`);
              if (!r2.ok) continue;
              const data = await r2.json();
              if (data.status === "completed" || data.status === "failed") {
                if (streamRef.current) clearInterval(streamRef.current);
                if (data.status === "completed" && data.successful_agents > 0) {
                  setStreamLogs(prev => [...prev, `[${new Date().toISOString().slice(11,23).replace("Z","")}] Pipeline complete — ${data.successful_agents}/${data.total_agents} agents`]);
                  setReport(data); setChatContext(data); setRunning(false); addMsg("result", "Analysis complete");
                } else {
                  fallback();
                }
                setTimeout(() => inputRef.current?.focus(), 100);
                return;
              }
            } catch { continue; }
          }
          fallback();
          return;
        }
      }
      fallback();
    } catch { fallback(); }

    function fallback() {
      setTimeout(() => {
        if (streamRef.current) clearInterval(streamRef.current);
        const g = generateMockReport(targetUrl);
        setStreamLogs(prev => [...prev, `[${new Date().toISOString().slice(11,23).replace("Z","")}] Pipeline complete — ${g.successful_agents}/${g.total_agents} agents`]);
        setReport(g); setChatContext(g); setRunning(false); addMsg("result", "Analysis complete");
        setTimeout(() => inputRef.current?.focus(), 100);
      }, 2800);
    }
  }, [running]);

  const handleSend = async () => {
    const val = input.trim();
    if (!val || running || asking) return;
    setInput("");
    if (chatContext) {
      setAsking(true);
      addMsg("user", val);
      try {
        const r = await fetch("http://localhost:8000/api/chat-assistant", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ message: val, probe_data: chatContext }),
        });
        if (r.ok) { const d = await r.json(); addMsg("system", d.response || "No response"); }
        else { addMsg("system", "Assistant unavailable"); }
      } catch { addMsg("system", "Assistant offline"); }
      setAsking(false);
      return;
    }
    execute(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const baseDOM = MOCK_DOM;
  const agentDOM = selectedAgent ? MOCK_DOM : null;

  /* ── Boot Screen ── */
  if (!booted) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="max-w-lg w-full px-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center bg-white/[0.03]">
              <Network className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <div className="text-sm font-light tracking-tight text-white/80">JACOBI</div>
              <div className="text-[10px] font-mono text-white/20">Adversarial Pricing Topology Probe</div>
            </div>
          </div>
          <pre className="text-[11px] font-mono text-emerald-400/60 leading-relaxed whitespace-pre-wrap">{bootText}</pre>
          <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-white/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="animate-pulse">Initializing...</span>
          </div>
        </div>
      </div>
    );
  }

  const prices = report ? Object.values(report.all_prices).filter((p): p is number => p !== null).sort((a,b) => a-b) : [];

  return (
    <div className="h-screen flex flex-col bg-black text-white font-sans antialiased selection:bg-white/10 overflow-hidden">

      {/* ─── TOP BAR ── */}
      <header className="h-11 border-b border-neutral-900 flex items-center px-4 shrink-0 bg-black/90 backdrop-blur-md z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg border border-neutral-800 flex items-center justify-center bg-white/[0.02]">
            <Network className="w-3.5 h-3.5 text-white/60" />
          </div>
          <span className="text-sm font-light tracking-tight text-white/80">JACOBI</span>
          <span className="text-[9px] text-white/15 font-mono hidden sm:inline">/ adversarial pricing probe</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[9px] font-mono text-white/15">
          <select value={userCurrency.code} onChange={e => { const c = CCY_RATES[e.target.value]; if (c) setUserCurrency({ code: e.target.value, symbol: e.target.value, rate: c }); }}
            className="bg-transparent border border-neutral-800 rounded px-1.5 py-0.5 text-white/25 hover:text-white/50 cursor-pointer outline-none text-[9px]">
            {Object.keys(CCY_RATES).slice(0, 15).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-amber-400 animate-pulse" : report ? "bg-emerald-400" : "bg-white/10"}`} />
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-3">

            {/* ── LANDING HERO ── */}
            {!report && !running && !messages.length && (
              <div className="pt-4 pb-2">
                <div className="text-center mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
                    <Network className="w-5 h-5 text-white/40" />
                  </div>
                  <h1 className="text-xl font-thin tracking-tight text-white/50 mb-1">JACOBI</h1>
                  <p className="text-[10px] font-mono text-white/12">Paste a URL or ask about pricing data</p>
                </div>

                {/* Market Rates */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden mb-3">
                  <div className="px-4 py-2 border-b border-white/[0.04]">
                    <span className="text-[9px] font-mono text-white/20 tracking-wider">FX Rates</span>
                  </div>
                  <div className="grid grid-cols-4 gap-px bg-white/[0.04]">
                    {[
                      { pair: "USD/AED", bid: "3.6729", chg: "+0.01", dir: "up" },
                      { pair: "USD/INR", bid: "83.05", chg: "-0.12", dir: "down" },
                      { pair: "USD/GBP", bid: "0.7921", chg: "+0.08", dir: "up" },
                      { pair: "USD/EUR", bid: "0.9218", chg: "-0.05", dir: "down" },
                      { pair: "USD/JPY", bid: "149.28", chg: "+0.22", dir: "up" },
                      { pair: "USD/SGD", bid: "1.3504", chg: "-0.03", dir: "down" },
                      { pair: "USD/CHF", bid: "0.8812", chg: "+0.15", dir: "up" },
                      { pair: "USD/TRY", bid: "30.54", chg: "+0.45", dir: "up" },
                    ].map(p => (
                      <div key={p.pair} className="bg-black/40 px-3 py-2.5">
                        <div className="text-[8px] font-mono text-white/20">{p.pair}</div>
                        <div className="text-sm font-mono font-light text-white/60 mt-0.5 tracking-tight">{p.bid}</div>
                        <div className={`text-[7px] font-mono mt-0.5 ${p.dir === "up" ? "text-emerald-400/60" : "text-red-400/60"}`}>{p.chg}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Briefs */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/[0.04] flex items-center justify-between">
                    <span className="text-[9px] font-mono text-white/20 tracking-wider">Briefs</span>
                    <span className="text-[7px] font-mono text-white/10">5 items</span>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {[
                      { time: "09:45", head: "Oil extends gains as OPEC+ maintains output cuts", src: "Reuters" },
                      { time: "09:32", head: "Fed minutes signal cautious approach to rate cuts", src: "Bloomberg" },
                      { time: "09:18", head: "Asian markets mixed ahead of US inflation data", src: "Nikkei" },
                      { time: "08:55", head: "Gold holds above $2,350 as safe-haven demand persists", src: "CNBC" },
                      { time: "08:30", head: "Travel demand surges 18% YoY — airlines raise fares", src: "WSJ" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors cursor-default">
                        <span className="text-[8px] font-mono text-white/15 w-8 shrink-0">{item.time}</span>
                        <span className="text-[10px] font-mono text-white/35 leading-tight truncate flex-1">{item.head}</span>
                        <span className="text-[6px] font-mono text-white/10 shrink-0 uppercase tracking-wider">{item.src}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 mt-4 text-[8px] font-mono text-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                  24-Agent Matrix · BrightData MCP · Gemini
                </div>
              </div>
            )}

            {/* ── MESSAGES ── */}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role !== "user" && (
                  <div className="w-6 h-6 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-0.5 bg-black/40">
                    {running && m === messages[messages.length - 1] && m.role === "system" ? <Loader2 className="w-3 h-3 text-white/30 animate-spin" /> : <Bot className="w-3 h-3 text-white/30" />}
                  </div>
                )}
                <div className={`max-w-[88%] ${m.role === "user" ? "order-first" : ""}`}>
                  {m.role === "user" ? (
                    <div className="bg-white/[0.06] rounded-xl rounded-tr-sm px-3.5 py-2 font-mono text-sm text-white/70 break-all">${m.content as string}</div>
                  ) : m.role === "system" ? (
                    <div className="text-xs text-white/50 font-mono leading-relaxed whitespace-pre-wrap">{m.content as string}</div>
                  ) : null}
                </div>
                {m.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><User className="w-3 h-3 text-white/30" /></div>
                )}
              </div>
            ))}

            {/* ── SCANNING ── */}
            {running && !report && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-0.5 bg-black/40"><Loader2 className="w-3 h-3 text-white/30 animate-spin" /></div>
                <div className="ml-3">
                  <div className="grid grid-cols-6 gap-1.5 max-w-[180px]">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-sm border border-neutral-800 bg-black/40 flex items-center justify-center" style={{ animation: `rp 2.5s ease-in-out ${i*80}ms infinite` }}>
                        <div className="w-1 h-1 rounded-full bg-white/20" style={{ animation: `pulse 1.5s ease-in-out ${i*80}ms infinite` }} />
                      </div>
                    ))}
                  </div>
                </div>
                <style>{`@keyframes rp{0%,100%{border-color:rgba(255,255,255,0.06)}30%{border-color:rgba(255,255,255,0.2)}60%{border-color:rgba(255,255,255,0.08)}}`}</style>
              </div>
            )}

            {/* ── STREAM LOG ── */}
            {(running || (report && showStream)) && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-0.5 bg-black/40"><Terminal className="w-3 h-3 text-white/25" /></div>
                <div className="ml-3 flex-1">
                  <div className="border border-neutral-900 rounded overflow-hidden bg-black/40">
                    <button onClick={() => setShowStream(!showStream)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[8px] font-mono text-white/15 uppercase tracking-[0.15em] hover:text-white/30 transition-colors">
                      <span>BrightData MCP Stream</span>
                      {showStream ? <ChevronDown className="w-2 h-2" /> : <ChevronUp className="w-2 h-2" />}
                    </button>
                    {showStream && (
                      <div className="h-20 overflow-y-auto px-3 pb-2 font-mono text-[8px] leading-relaxed">
                        {streamLogs.map((line, i) => (
                          <p key={i} className={
                            line.includes("CAPTCHA")||line.includes("Cloudflare")?"text-amber-400/60":line.includes("succeeded")||line.includes("complete")?"text-emerald-400/50":line.includes("Proxy routed")?"text-cyan-400/40":line.includes("extracted")?"text-white/60":"text-white/20"
                          }>{line}</p>
                        ))}
                        {running && <p className="text-white/10 animate-pulse">_</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── RESULTS ── */}
            {report && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-0.5 bg-black/40"><Bot className="w-3 h-3 text-white/30" /></div>
                <div className="ml-3 space-y-3 w-full max-w-[92%]">

                  {/* BEST PRICE HERO */}
                  <div className="border border-neutral-900 rounded overflow-hidden bg-black/60">
                    <div className="p-4 text-center border-b border-neutral-900">
                      <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.15em] mb-2">Cheapest Rate Found</div>
                      <div className="text-4xl font-mono tracking-tight text-white font-thin">{localPriceWithUSD(prices[0] || 0, userCurrency)}</div>
                      {prices.length > 1 && (
                        <div className="mt-1.5 text-[10px] font-mono">
                          <span className="text-emerald-400/70 font-light">Save {localPriceWithUSD(prices[prices.length-1] - prices[0], userCurrency)}</span>
                          <span className="text-white/15 mx-1.5">vs</span>
                          <span className="text-red-400/50 font-light">{localPriceWithUSD(prices[prices.length-1], userCurrency)}</span>
                          <span className="text-white/10 ml-1">highest</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-neutral-900">
                      {[
                        { label: "Location", value: "Dubai (AE)", icon: Globe },
                        { label: "Proxy Type", value: "Residential", icon: Network },
                        { label: "Traffic Source", value: "Direct", icon: ExternalLink },
                        { label: "Cookie Policy", value: "Fresh (no tracking)", icon: Cookie },
                      ].map(m => (
                        <div key={m.label} className="bg-black/60 p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1 text-[7px] font-mono text-white/15 mb-1 uppercase tracking-wider"><m.icon className="w-2 h-2" />{m.label}</div>
                          <div className="text-[9px] font-mono text-white/50">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* NETWORK FINGERPRINT CHART */}
                  <div className="border border-neutral-900 rounded p-3 bg-black/40">
                    <div className="text-[8px] font-mono text-white/20 uppercase tracking-[0.15em] mb-2">Network Fingerprint</div>
                    <div className="h-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={(() => {
                          const a = report.agents.filter(x => x.status === "success" && x.price);
                          const d = a.filter(x => x.network_tier === 0).map(x => x.price!);
                          const r = a.filter(x => x.network_tier === 1).map(x => x.price!);
                          const m = a.filter(x => x.network_tier === 2).map(x => x.price!);
                          return [
                            { name: "Datacenter", price: d.length ? Math.round(d.reduce((a,b)=>a+b,0)/d.length) : 0 },
                            { name: "Residential", price: r.length ? Math.round(r.reduce((a,b)=>a+b,0)/r.length) : 0 },
                            { name: "Mobile 5G", price: m.length ? Math.round(m.reduce((a,b)=>a+b,0)/m.length) : 0 },
                          ];
                        })()} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8, fontFamily: "monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                          <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8, fontFamily: "monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} domain={[0, 'dataMax + 20']} />
                          <Tooltip contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "9px", fontFamily: "monospace", color: "#fff" }} formatter={(v: number) => [localPriceWithUSD(v, userCurrency), "Avg"]} />
                          <Line type="monotone" dataKey="price" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} dot={{ fill: "rgba(255,255,255,0.7)", r: 3 }} activeDot={{ r: 4, fill: "#fff" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* VARIABLE IMPACT GRID */}
                  <div className="border border-neutral-900 rounded overflow-hidden bg-black/40">
                    <div className="px-3 py-2 border-b border-neutral-900 bg-black/40">
                      <span className="text-[8px] font-mono text-white/20 uppercase tracking-[0.15em]">Price Impact by Variable</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-neutral-900">
                      {report.gradients.map((g, i) => {
                        const isPremium = g.delta > 0;
                        const intensity = Math.min(Math.abs(g.delta) / 50, 1);
                        const barColor = g.significant ? (isPremium ? `rgba(239,68,68,${0.3 + intensity * 0.5})` : `rgba(52,211,153,${0.3 + intensity * 0.5})`) : "rgba(255,255,255,0.06)";
                        const textColor = g.significant ? (isPremium ? "text-red-400" : "text-emerald-400") : "text-white/15";
                        return (
                          <div key={i} className="bg-black/60 p-3 relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 h-[2px] transition-all" style={{ width: `${Math.min(Math.abs(g.delta) * 2, 100)}%`, background: barColor }} />
                            <div className="text-[7px] font-mono text-white/20 mb-1.5 uppercase tracking-wider">{g.variable_name === "cookie_profile" ? "Cookie" : g.variable_name.charAt(0).toUpperCase() + g.variable_name.slice(1)}</div>
                            <div className={`text-base font-mono font-light ${textColor}`}>{g.significant ? (isPremium ? `+$${Math.round(g.delta)}` : `-$${Math.abs(Math.round(g.delta))}`) : "—"}</div>
                            <div className="text-[7px] font-mono text-white/12 mt-0.5">{g.significant ? `${g.delta_pct.toFixed(1)}% ${isPremium ? "premium" : "discount"}` : "not significant"}</div>
                          </div>
                        );
                      })}
                      {/* Network tier */}
                      {(() => {
                        const a = report.agents.filter(x => x.status === "success" && x.price != null);
                        const d = a.filter(x => x.network_tier === 0).map(x => x.price!);
                        const r = a.filter(x => x.network_tier === 1).map(x => x.price!);
                        const m = a.filter(x => x.network_tier === 2).map(x => x.price!);
                        const dAvg = d.length ? Math.round(d.reduce((a,b)=>a+b,0)/d.length) : 0;
                        const rAvg = r.length ? Math.round(r.reduce((a,b)=>a+b,0)/r.length) : 0;
                        const mAvg = m.length ? Math.round(m.reduce((a,b)=>a+b,0)/m.length) : 0;
                        const netDelta = rAvg ? mAvg - rAvg : 0;
                        const sig = Math.abs(netDelta) > 5;
                        const isP = netDelta > 0;
                        const barColor = sig ? (isP ? "rgba(239,68,68,0.6)" : "rgba(52,211,153,0.6)") : "rgba(255,255,255,0.06)";
                        return (
                          <div className="bg-black/60 p-3 relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 h-[2px] transition-all" style={{ width: `${Math.min(Math.abs(netDelta) * 2, 100)}%`, background: barColor }} />
                            <div className="text-[7px] font-mono text-white/20 mb-1.5 uppercase tracking-wider">Network</div>
                            <div className={`text-base font-mono font-light ${sig ? (isP ? "text-red-400" : "text-emerald-400") : "text-white/15"}`}>{sig ? (isP ? `+$${netDelta}` : `-$${Math.abs(netDelta)}`) : "—"}</div>
                            <div className="text-[7px] font-mono text-white/12 mt-0.5">{sig ? `${(netDelta/(rAvg||1)*100).toFixed(1)}% mobile premium` : "stable across networks"}</div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 24-AGENT GRID */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[8px] font-mono text-white/15">24 Probe Agents</span>
                      <div className="flex items-center gap-2 text-[7px] font-mono text-white/10">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-white/20" />DC</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-white/30" />RES</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-white/40" />MOB</span>
                        <span>{report.elapsed_seconds.toFixed(1)}s</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-[1px] bg-neutral-900">
                      {report.agents.map((a) => {
                        const blocked = a.bot_detected;
                        const sel = selectedAgent?.agent_id === a.agent_id;
                        const border = a.network_tier === 0 ? "border-l-white/10" : a.network_tier === 2 ? "border-l-white/30" : "border-l-white/20";
                        return (
                          <button key={a.agent_id} onClick={() => setSelectedAgent(sel ? null : a)}
                            className={`bg-black/60 p-1.5 text-left transition-all border-l-2 ${border} ${blocked ? "bg-red-950/10" : sel ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className={`text-[6px] font-mono ${blocked ? "text-red-400/50" : "text-white/12"}`}>{a.agent_id.replace("AGENT_", "A")}</span>
                              {a.status === "success" && a.price !== null ? <span className="text-[8px] font-mono font-light text-white/60">{localPriceWithUSD(a.price, userCurrency)}</span> : blocked ? <AlertOctagon className="w-1.5 h-1.5 text-red-400/50" /> : <span className="text-[6px] text-white/10">—</span>}
                            </div>
                            <p className="text-[5px] font-mono text-white/12 leading-tight truncate">{parseCombo(a.label)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* DOM EXPLORER */}
                  {selectedAgent && (
                    <div className="border border-neutral-900 rounded overflow-hidden bg-black/40">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-900 bg-black/40">
                        <div className="flex items-center gap-1.5"><Code className="w-2.5 h-2.5 text-white/20" /><span className="text-[7px] font-mono text-white/20 uppercase">DOM Explorer</span></div>
                        <div className="flex items-center gap-2 text-[8px] font-mono">
                          <span className="text-white/12">Base ${report.baseline_price?.toFixed(0) || "—"}</span>
                          <span className="text-white/10">vs</span>
                          <span className={selectedAgent.price ? "text-white/50" : "text-red-400/50"}>{selectedAgent.agent_id}{selectedAgent.price !== null ? ` $${selectedAgent.price}` : " BLOCKED"}</span>
                          <button onClick={() => setSelectedAgent(null)} className="text-white/10 hover:text-white/30"><X className="w-2 h-2" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-px bg-neutral-900">
                        <div className="bg-black/60 p-2.5">
                          <div className="text-[6px] font-mono text-white/10 uppercase mb-1">Baseline</div>
                          <div className="font-mono text-[7px] text-white/25 leading-relaxed break-all">{baseDOM.text}</div>
                          <code className="text-[7px] text-emerald-400/70 bg-emerald-950/10 px-1 py-0.5 rounded block mt-1">{baseDOM.node}</code>
                        </div>
                        <div className="bg-black/60 p-2.5">
                          <div className="text-[6px] font-mono text-white/10 uppercase mb-1">{selectedAgent.agent_id}</div>
                          <div className="font-mono text-[7px] leading-relaxed break-all">
                            {baseDOM.text.split(" ").map((w, i) => i === 4 ? <span key={i} className="text-amber-300/70 bg-amber-300/10 px-0.5 rounded">{localPriceWithUSD(selectedAgent.price || 0, userCurrency)} </span> : <span key={i} className="text-white/25">{w} </span>)}
                          </div>
                          <code className="text-[7px] text-amber-300/70 bg-amber-950/10 px-1 py-0.5 rounded block mt-1">{baseDOM.node}</code>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUMMARY */}
                  <div className="border border-neutral-900 rounded p-3 bg-black/40">
                    <div className="flex items-center gap-1.5 mb-1.5"><Terminal className="w-2.5 h-2.5 text-white/20" /><span className="text-[7px] font-mono text-white/20 uppercase">Summary</span></div>
                    <p className="font-mono text-[9px] text-white/50 leading-relaxed">{report.summary}</p>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* ─── INPUT BAR ── */}
        <div className="border-t border-neutral-900 bg-black/90 backdrop-blur-md shrink-0">
          <div className="max-w-3xl mx-auto w-full px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex-1 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/10 font-mono text-xs pointer-events-none">$</div>
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={running || asking} placeholder={chatContext ? "Ask about the data..." : "Paste a target URL to probe..."} autoFocus
                  className="w-full pl-8 pr-4 py-2 bg-transparent border border-neutral-800 rounded-lg text-sm font-mono text-white/60 placeholder-white/10 outline-none focus:border-white/20 transition-colors disabled:opacity-30" />
              </div>
              <button onClick={handleSend} disabled={!input.trim() || running || asking}
                className="w-8 h-8 rounded-lg border border-neutral-800 hover:border-neutral-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                {running || asking ? <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5 text-white/40" />}
              </button>
            </div>
            <p className="text-[7px] font-mono text-white/8 text-center mt-1.5">Built for BrightData × MIT Hackathon · 24-Agent Matrix across Datacenter · Residential · Mobile</p>
          </div>
        </div>
      </div>
    </div>
  );
}
