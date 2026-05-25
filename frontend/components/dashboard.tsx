"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Terminal, Activity, DollarSign, TrendingUp,
  Shield, Globe, Smartphone, Cookie, ExternalLink, Loader2,
  AlertTriangle, BarChart3, Network, X,
  Zap, Disc, Code, AlertOctagon, Send, Bot, User,
  ChevronDown, ChevronUp, ArrowUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface Gradient { variable_name: string; state_high: string; state_low: string; mean_price_high: number; mean_price_low: number; delta: number; delta_pct: number; pooled_std: number; t_statistic: number; significant: boolean; n_high: number; n_low: number; }
interface Agent { agent_id: string; label: string; status: string; price: number | null; response_time_ms: number | null; bot_detected: boolean; detection_signal: string | null; error_message: string | null; variables: Record<string, string>; }
interface TopologyReport { session_id: string; target_url: string; target_name: string; timestamp: string; status: string; total_agents: number; successful_agents: number; failed_agents: number; detected_agents: number; elapsed_seconds: number; control_stability: number; baseline_price: number | null; mean_price: number | null; all_prices: Record<string, number | null>; price_range: [number, number] | null; max_price_spread: number | null; max_price_spread_pct: number | null; gradients: Gradient[]; discrimination_index: number; topology_class: string; summary: string; max_discrimination_scenario: string; min_discrimination_scenario: string; agents: Agent[]; error: string | null; }

interface ChatMessage {
  id: string; role: "user" | "system" | "result"; content: string | React.ReactNode;
  timestamp: string;
}

const DEMO: TopologyReport = { session_id: "demo", target_url: "", target_name: "UA123 JFK→SFO", timestamp: "2026-05-25T20:00:00Z", status: "completed", total_agents: 24, successful_agents: 22, failed_agents: 1, detected_agents: 1, elapsed_seconds: 8.7, control_stability: 0.994, baseline_price: 347, mean_price: 352.3, all_prices: {"AGENT_00":347,"AGENT_01":371,"AGENT_02":323,"AGENT_03":368,"AGENT_04":365,"AGENT_05":329,"AGENT_06":375,"AGENT_07":335,"AGENT_08":372,"AGENT_09":338,"AGENT_10":369,"AGENT_11":358,"AGENT_12":347,"AGENT_13":343,"AGENT_14":361,"AGENT_15":347,"AGENT_16":359,"AGENT_17":347,"AGENT_18":380,"AGENT_19":320,"AGENT_20":374,"AGENT_21":341,"AGENT_22":348,"AGENT_23":346}, price_range: [320, 380], max_price_spread: 60, max_price_spread_pct: 17.3, gradients: [{variable_name:"location",state_high:"High Income",state_low:"Low Income",mean_price_high:371,mean_price_low:324,delta:47,delta_pct:13.5,pooled_std:2.5,t_statistic:18.8,significant:true,n_high:3,n_low:3},{variable_name:"device",state_high:"Premium Device",state_low:"Budget Device",mean_price_high:372.5,mean_price_low:338,delta:34.5,delta_pct:9.9,pooled_std:3.1,t_statistic:11.13,significant:true,n_high:4,n_low:4},{variable_name:"cookie_profile",state_high:"Aged Profile",state_low:"Fresh Profile",mean_price_high:350.5,mean_price_low:347,delta:3.5,delta_pct:1,pooled_std:4.2,t_statistic:0.83,significant:false,n_high:2,n_low:2},{variable_name:"referrer",state_high:"Aggregator",state_low:"Direct",mean_price_high:360,mean_price_low:347,delta:13,delta_pct:3.7,pooled_std:3.8,t_statistic:3.42,significant:true,n_high:2,n_low:2}], discrimination_index: 94.5, topology_class: "progressive", summary: "TOPOLOGY: PROGRESSIVE. Baseline: $347.00. Spread: $60.00. DI: $94.50. Significant: 3 vars.", max_discrimination_scenario: "Max: AGENT_18 DUBAI_$110K @ $380.00", min_discrimination_scenario: "Min: AGENT_19 RURAL_MISSISSIPPI_$35K @ $320.00", agents: [
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
], error: null };

const SAMPLE_TARGETS = [
  { label: "United UA123 JFK→SFO", url: "https://www.united.com/en/us/flightdetails?flight=UA123&date=2026-06-01" },
  { label: "Delta DL402 JFK→LAX", url: "https://www.delta.com/flight-status/dl402" },
  { label: "Booking.com SFO Hotel", url: "https://www.booking.com/hotel/us/san-francisco.html" },
];

const VAR_ICONS: Record<string, React.ReactNode> = { location: <Globe className="w-3 h-3" />, device: <Smartphone className="w-3 h-3" />, cookie_profile: <Cookie className="w-3 h-3" />, referrer: <ExternalLink className="w-3 h-3" /> };
function clsColor(cls: string): string { switch (cls) { case "uniform": return "text-blue-400"; case "selective": return "text-yellow-400"; case "progressive": return "text-orange-400"; case "aggressive": return "text-red-400"; default: return "text-white/40"; } }
function fmtDelta(d: number): string { return d >= 0 ? `+$${d.toFixed(0)}` : `-$${Math.abs(d).toFixed(0)}`; }
function parseCombo(l: string): string { const p = l.split("  ").filter(Boolean); return p.length >= 3 ? p.slice(1).join(" | ").replace(/_/g, " ") : l; }

const MOCK_DOM: Record<string, { text: string; price: string; node: string }> = {
  "AGENT_00": { text: "UA123 JFK→SFO  Economy  $347.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class K  Fully refundable", price: "$347.00", node: "<span class=\"fare-amount\">$347.00</span>" },
  "AGENT_01": { text: "UA123 JFK→SFO  Economy  $371.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class L  Fully refundable  Seat selection $15", price: "$371.00", node: "<span class=\"fare-amount\">$371.00</span>" },
  "AGENT_18": { text: "UA123 JFK→SFO  Economy  $380.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class M  Change fee $75", price: "$380.00", node: "<span class=\"fare-amount\">$380.00</span>" },
  "AGENT_19": { text: "UA123 JFK→SFO  Economy  $320.00  Nonstop  6h 22m  Depart 8:00AM  Arrive 10:22AM  Seat 14A  Fare Class K  Seat selection free", price: "$320.00", node: "<span class=\"fare-amount\">$320.00</span>" },
};

const MCP_LOGS = [
  (id: string) => `Initializing Scraping Browser session for ${id}...`,
  (id: string) => `${id}: Proxy routed via Zone [RESIDENTIAL-${["US-NY","US-IA","US-CA","GB","AE","IN","US-MS"][Math.floor(Math.random()*7)]}]`,
  (id: string) => `${id}: TLS/JA3 fingerprint generated natively`,
  (id: string) => `${id}: HTTP/2 session negotiated with ALPN`,
  (id: string) => `${id}: Browser context isolated — canvas/WebGL/fonts spoofed`,
  (id: string) => `${id}: Cloudflare challenge detected — Web Unlocker engaged`,
  (id: string) => `${id}: Challenge solved — challenge_clearance cookie planted`,
  (id: string) => `${id}: Page DOM fully hydrated — waiting for fare element`,
  (id: string) => `${id}: Fare element located — extracting pricing node`,
  (id: string) => `${id}: Price extracted — ${(800+Math.random()*700).toFixed(0)}ms`,
];

let msgId = 0;
function nextId() { return `m${++msgId}`; }
function ts() { return new Date().toLocaleTimeString(); }

export default function JacobiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TopologyReport | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showStream, setShowStream] = useState(true);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamLogs]);
  useEffect(() => { return () => { if (streamRef.current) clearInterval(streamRef.current); }; }, []);
  useEffect(() => { if (!messages.length) { setMessages([{ id: nextId(), role: "system", content: "Enter a target URL and I'll deploy 24 probe agents to map their pricing algorithm.", timestamp: ts() }]); } }, []);

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
    }, 90);

    addMsg("system", "Deploying 24 probe agents across 3 staggered waves...");

    setTimeout(() => {
      if (streamRef.current) clearInterval(streamRef.current);
      setStreamLogs(prev => [...prev, `[${new Date().toISOString().slice(11,23).replace("Z","")}] Pipeline complete — 22/24 agents succeeded`]);
      setReport(DEMO);
      setRunning(false);
      addMsg("result", "Analysis complete");
      setTimeout(() => inputRef.current?.focus(), 100);
    }, 3000);
  }, [running]);

  const handleSend = () => {
    const val = input.trim();
    if (!val || running) return;
    setInput("");
    execute(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const agentDOM = selectedAgent ? (MOCK_DOM[selectedAgent.agent_id] || MOCK_DOM["AGENT_00"]) : null;
  const baseDOM = MOCK_DOM["AGENT_00"];

  return (
    <div className="h-screen flex flex-col bg-black text-white font-sans antialiased selection:bg-white/10">
      <style>{`@keyframes blockPulse{0%,100%{border-color:rgba(220,38,38,0.1)}50%{border-color:rgba(220,38,38,0.3)}}.animate-blockPulse{animation:blockPulse 2s ease-in-out infinite;border:1px solid rgba(220,38,38,0.1)}`}</style>

      {/* Header */}
      <header className="h-12 border-b border-neutral-900 flex items-center px-5 shrink-0 bg-black/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded border border-neutral-800 flex items-center justify-center"><Network className="w-3.5 h-3.5 text-white/70" /></div>
          <span className="text-sm font-medium tracking-tight">JACOBI</span>
          <span className="text-[10px] text-white/15 font-mono hidden sm:inline">/ chat interface</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[10px] font-mono text-white/15">
          {SAMPLE_TARGETS.map(s => (
            <button key={s.label} onClick={() => { setInput(s.url); inputRef.current?.focus(); }}
              className="px-2 py-1 rounded border border-neutral-800 hover:border-neutral-700 text-white/20 hover:text-white/40 transition-colors text-[9px]">{s.label.split(" ").slice(0,2).join(" ")}</button>
          ))}
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role !== "user" && (
                <div className="w-7 h-7 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-1">
                  {running && m === messages[messages.length - 1] && m.role === "system" ? <Loader2 className="w-3.5 h-3.5 text-white/40 animate-spin" /> : <Bot className="w-3.5 h-3.5 text-white/40" />}
                </div>
              )}
              <div className={`max-w-[85%] ${m.role === "user" ? "order-first" : ""}`}>
                {m.role === "user" ? (
                  <div className="bg-white/[0.06] rounded-2xl rounded-tr-md px-4 py-2.5 font-mono text-sm text-white/80 break-all">${m.content as string}</div>
                ) : m.role === "system" ? (
                  <div className="text-sm text-white/60 font-mono">{m.content as string}</div>
                ) : null}
              </div>
              {m.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-1"><User className="w-3.5 h-3.5 text-white/40" /></div>
              )}
            </div>
          ))}

          {/* Scanning Ripple */}
          {running && !report && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-1"><Loader2 className="w-3.5 h-3.5 text-white/40 animate-spin" /></div>
              <div className="max-w-[85%] ml-3">
                <div className="grid grid-cols-6 gap-1.5 max-w-[200px]">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded border border-neutral-800 bg-black flex items-center justify-center" style={{ animation: `rp 2.5s ease-in-out ${i*80}ms infinite` }}>
                      <div className="w-1 h-1 rounded-full bg-white/30" style={{ animation: `pulse 1.5s ease-in-out ${i*80}ms infinite` }} />
                    </div>
                  ))}
                </div>
              </div>
              <style>{`@keyframes rp{0%,100%{border-color:rgba(255,255,255,0.06)}30%{border-color:rgba(255,255,255,0.2)}60%{border-color:rgba(255,255,255,0.08)}}`}</style>
            </div>
          )}

          {/* Network Stream */}
          {(running || (report && showStream)) && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-1"><Terminal className="w-3.5 h-3.5 text-white/30" /></div>
              <div className="max-w-[85%] ml-3 flex-1">
                <div className="border border-neutral-900 rounded overflow-hidden">
                  <button onClick={() => setShowStream(!showStream)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] font-mono text-white/20 uppercase tracking-[0.15em] hover:text-white/30 transition-colors bg-black/40">
                    <span>BrightData MCP Stream</span>
                    {showStream ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />}
                  </button>
                  {showStream && (
                    <div className="h-24 overflow-y-auto px-3 pb-2 font-mono text-[9px] leading-relaxed bg-black/60">
                      {streamLogs.map((line, i) => (
                        <p key={i} className={
                          line.includes("CAPTCHA")||line.includes("Cloudflare")?"text-amber-400/70":line.includes("succeeded")||line.includes("complete")?"text-emerald-400/60":line.includes("Proxy routed")?"text-cyan-400/50":line.includes("TLS")?"text-purple-400/50":line.includes("extracted")?"text-white/80":"text-white/25"
                        }>{line}</p>
                      ))}
                      {running && <p className="text-white/10 animate-pulse">_</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {report && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full border border-neutral-800 flex items-center justify-center shrink-0 mt-1"><Bot className="w-3.5 h-3.5 text-white/40" /></div>
              <div className="max-w-[88%] ml-3 space-y-4 w-full">

                {/* Metric Strip */}
                <div className="grid grid-cols-4 gap-px bg-neutral-900 rounded overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/15 z-10" />
                  <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/15 z-10" />
                  <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/15 z-10" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/15 z-10" />
                  {[
                    { label: "Baseline", value: `$${report.baseline_price?.toFixed(0) ?? "—"}`, sub: `${report.successful_agents} agents`, icon: DollarSign, cls: "" },
                    { label: "Spread", value: `$${report.max_price_spread?.toFixed(0) ?? "—"}`, sub: `${report.max_price_spread_pct?.toFixed(1)}%`, icon: TrendingUp, cls: "" },
                    { label: "DI", value: `$${report.discrimination_index.toFixed(0)}`, sub: "discrimination", icon: Activity, cls: "" },
                    { label: "Class", value: report.topology_class.toUpperCase(), sub: "3 vars active", icon: Shield, cls: clsColor(report.topology_class) },
                  ].map((m, mi) => (
                    <div key={m.label} className="bg-black p-3 relative">
                      <div className="flex items-center gap-1.5 text-[8px] font-mono text-white/20 mb-1.5 uppercase tracking-[0.1em]"><m.icon className="w-2.5 h-2.5" />{m.label}</div>
                      <div className={`text-lg font-mono tracking-tight ${m.cls || "text-white"}`}>{m.value}</div>
                      <div className="text-[8px] font-mono text-white/15 mt-0.5">{m.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Swarm */}
                <div>
                  <div className="text-[9px] font-mono text-white/20 mb-2">Agent Swarm — click for DOM diff</div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-[1px] bg-neutral-900">
                    {report.agents.map((a) => {
                      const blocked = a.bot_detected; const sel = selectedAgent?.agent_id === a.agent_id;
                      return (
                        <button key={a.agent_id} onClick={() => setSelectedAgent(sel ? null : a)}
                          className={`bg-black p-1.5 text-left transition-all ${blocked ? "bg-red-950/20 animate-blockPulse" : sel ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-[7px] font-mono ${blocked ? "text-red-400/60" : "text-white/15"}`}>{a.agent_id.replace("AGENT_", "A")}</span>
                            {a.status === "success" && a.price !== null ? <span className="text-[9px] font-mono text-white/70">${a.price}</span> : blocked ? <AlertOctagon className="w-2 h-2 text-red-400/60" /> : <span className="text-[7px] text-white/15">—</span>}
                          </div>
                          <p className="text-[6px] font-mono text-white/15 leading-tight truncate">{parseCombo(a.label)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* DOM Explorer */}
                {selectedAgent && agentDOM && (
                  <div className="border border-neutral-900 rounded overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-900 bg-black/60">
                      <div className="flex items-center gap-1.5"><Code className="w-3 h-3 text-white/25" /><span className="text-[8px] font-mono text-white/25 uppercase">DOM Explorer</span></div>
                      <div className="flex items-center gap-2 text-[9px] font-mono">
                        <span className="text-white/15">Base $347</span><span className="text-white/15">vs</span>
                        <span className={selectedAgent.price ? "text-white/70" : "text-red-400/60"}>{selectedAgent.agent_id}{selectedAgent.price !== null ? ` $${selectedAgent.price}` : " BLOCKED"}</span>
                        <button onClick={() => setSelectedAgent(null)} className="text-white/15 hover:text-white/40"><X className="w-2.5 h-2.5" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-neutral-900">
                      <div className="bg-black p-3">
                        <div className="text-[7px] font-mono text-white/10 uppercase mb-1">Baseline</div>
                        <div className="font-mono text-[8px] text-white/30 leading-relaxed break-all">{baseDOM.text}</div>
                        <code className="text-[8px] text-emerald-400/80 bg-emerald-950/20 px-1.5 py-0.5 rounded block mt-1">{baseDOM.node}</code>
                      </div>
                      <div className="bg-black p-3">
                        <div className="text-[7px] font-mono text-white/10 uppercase mb-1">{selectedAgent.agent_id}</div>
                        <div className="font-mono text-[8px] leading-relaxed break-all">
                          {agentDOM.text.split(" ").map((w, i) => /^\$\d/.test(w) && w !== "$347.00" ? <span key={i} className="text-amber-300/80 bg-amber-300/10 px-0.5 rounded">{w} </span> : <span key={i} className="text-white/30">{w} </span>)}
                        </div>
                        <code className={`text-[8px] ${selectedAgent.price && selectedAgent.price !== 347 ? "text-amber-300/80 bg-amber-950/20" : "text-white/30 bg-white/5"} px-1.5 py-0.5 rounded block mt-1`}>{agentDOM.node}</code>
                        {selectedAgent.bot_detected && <div className="mt-1 flex items-center gap-1 text-[8px] font-mono text-red-400/60"><AlertOctagon className="w-2 h-2" />BLOCKED</div>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sensitivity + Histogram */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] font-mono text-white/20 mb-2">Gradient Sensitivity</div>
                    <div className="space-y-[1px]">
                      {report.gradients.map((g) => {
                        const high = g.delta > 0; const sig = g.significant;
                        return (
                          <div key={g.variable_name} className="flex items-center bg-white/[0.02] px-3 py-2">
                            <div className="w-24 flex items-center gap-1.5 text-[9px] font-mono text-white/40">{VAR_ICONS[g.variable_name]}{g.variable_name.replace("_"," ")}</div>
                            <div className="flex-1 grid grid-cols-3 gap-1 text-[9px] font-mono">
                              <span className="text-white/15">{g.state_high}</span>
                              <span className={`text-center ${sig ? (high ? "text-white" : "text-white/60") : "text-white/15"}`}>{sig ? fmtDelta(g.delta) : "—"}</span>
                              <span className="text-right text-white/15">{g.state_low}</span>
                            </div>
                            {sig && <div className={`ml-2 px-1.5 py-0.5 rounded text-[7px] font-mono ${high ? "bg-white/10 text-white/70" : "bg-white/5 text-white/30"}`}>{g.delta_pct.toFixed(1)}%</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-white/20 mb-2">Distribution</div>
                    <div className="h-36 relative">
                      <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-white/15" />
                      <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-white/15" />
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const v = Object.values(report.all_prices).filter((p): p is number => p !== null);
                          if (!v.length) return [];
                          const mn = Math.floor(Math.min(...v)/10)*10, mx = Math.ceil(Math.max(...v)/10)*10;
                          const bins: Record<number, number> = {};
                          for (let b = mn; b <= mx; b+=10) bins[b] = 0;
                          for (const p of v) { bins[Math.floor(p/10)*10]++; }
                          return Object.entries(bins).map(([k,c]) => ({ bucket: Number(k), count: c })).sort((a,b) => a.bucket - b.bucket);
                        })()} margin={{ top: 4, right: 4, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }} tickFormatter={(v: number) => `$${v}`} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                          <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "9px", fontFamily: "monospace", color: "#fff" }} />
                          <Bar dataKey="count" radius={[1,1,0,0]}>
                            {(() => { const v = Object.values(report.all_prices).filter((p): p is number => p !== null); return v; })() && (() => { const v = Object.values(report.all_prices).filter((p): p is number => p !== null); return v; })().length > 0 && (() => { const v = Object.values(report.all_prices).filter((p): p is number => p !== null); const mn = Math.floor(Math.min(...v)/10)*10, mx = Math.ceil(Math.max(...v)/10)*10; const bins: Record<number,number> = {}; for (let b = mn; b <= mx; b+=10) bins[b] = 0; for (const p of v) bins[Math.floor(p/10)*10]++; return Object.entries(bins).map(([k,c]) => ({ bucket: Number(k), count: c })).sort((a,b) => a.bucket - b.bucket); })().map((e,i) => { const pct = Math.abs(e.bucket - (report.baseline_price ?? 0)) / (report.baseline_price ?? 1); return <Cell key={i} fill={pct > 0.08 ? (e.bucket < (report.baseline_price ?? 0) ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)") : "rgba(255,255,255,0.15)"} />; })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Audit Summary */}
                <div className="border border-neutral-900 rounded p-3 bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 mb-1.5"><Terminal className="w-3 h-3 text-white/25" /><span className="text-[8px] font-mono text-white/25 uppercase">Summary</span></div>
                  <p className="font-mono text-[10px] text-white/60 leading-relaxed">{report.summary}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[8px] font-mono">
                    <span className="text-white/30">&gt; {report.max_discrimination_scenario}</span>
                    <span className="text-emerald-400/40">&gt; {report.min_discrimination_scenario}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input Bar */}
      <div className="border-t border-neutral-900 bg-black/80 backdrop-blur-md shrink-0">
        <div className="max-w-3xl mx-auto w-full px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/10 font-mono text-xs pointer-events-none">$</div>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={running} placeholder="Paste a target URL to probe..." autoFocus
                className="w-full pl-8 pr-4 py-2.5 bg-transparent border border-neutral-800 rounded-lg text-sm font-mono text-white/70 placeholder-white/10 outline-none focus:border-white/20 transition-colors disabled:opacity-30" />
            </div>
            <button onClick={handleSend} disabled={!input.trim() || running}
              className="w-9 h-9 rounded-lg border border-neutral-800 hover:border-neutral-700 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              {running ? <Loader2 className="w-4 h-4 text-white/30 animate-spin" /> : <ArrowUp className="w-4 h-4 text-white/50" />}
            </button>
          </div>
          <p className="text-[9px] font-mono text-white/10 text-center mt-2">Built for BrightData × MIT Hackathon &middot; 24-Agent Matrix Probe</p>
        </div>
      </div>
    </div>
  );
}
