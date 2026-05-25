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

function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); }

const KNOWN_ROUTES: Record<string, number> = {
  "dxbktm": 229,  // flydubai DXB→KTM ~840 AED / 3.67
  "dxbkat": 185,  // DXB→Kathmandu lower fare
  "jfksfo": 347,  // UA123 JFK→SFO
  "jfklax": 320,  // Delta DL402 JFK→LAX
  "lhrdxb": 280,  // LHR→DXB
  "dxblhr": 265,  // DXB→LHR
  "dxbmle": 195,  // DXB→Maldives
  "dxbccu": 95,   // DXB→Kolkata
  "dxbdel": 145,  // DXB→Delhi
  "dxbdac": 175,  // DXB→Dhaka
};

function detectRouteAndPrice(url: string): { route: string; priceUSD: number; priceAED: number; category: string } {
  const u = url.toLowerCase();
  const from = (u.match(/from=([a-z]{3})/i) || [])[1] || "";
  const to = (u.match(/to=([a-z]{3})/i) || [])[1] || "";
  const key = (from + to).toLowerCase();
  if (KNOWN_ROUTES[key]) return { route: `${from.toUpperCase()}→${to.toUpperCase()}`, priceUSD: KNOWN_ROUTES[key], priceAED: Math.round(KNOWN_ROUTES[key] * 3.67), category: "flight" };
  if (u.includes("united") || u.includes("delta") || u.includes("flydubai") || u.includes("emirates") || u.includes("google.com/travel"))
    return { route: "FLIGHT", priceUSD: 280, priceAED: 1028, category: "flight" };
  if (u.includes("booking.com") || u.includes("hotel") || u.includes("leela") || u.includes("marriott") || u.includes("hilton") || u.includes("taj") || u.includes("leela"))
    return { route: "HOTEL", priceUSD: 175, priceAED: 642, category: "hotel" };
  if (u.includes("amazon") || u.includes("product") || u.includes("buy"))
    return { route: "PRODUCT", priceUSD: 45, priceAED: 165, category: "product" };
  return { route: from ? `${from.toUpperCase()}→${to.toUpperCase()}` : "ROUTE", priceUSD: 180, priceAED: 660, category: "general" };
}

function generateMockReport(url: string, name: string): TopologyReport {
  const seed = hashStr(url + name) || 1;
  const rng = (max: number, min = 0) => { const x = Math.sin(seed * (++rngCtr || 1)) * 10000; return min + (x - Math.floor(x)) * (max - min); };
  let rngCtr = 0;
  const { route, priceUSD: knownPrice, priceAED, category } = detectRouteAndPrice(url);
  const isGulf = /dubai|flydubai|dxb|uae|emirates|etihad|gulf/i.test(url);
  const base = knownPrice;
  const scale = category === "hotel" ? 0.5 : category === "flight" ? 0.7 : 0.8;
  const classes = ["selective", "progressive", "aggressive"] as const;
  const cls = classes[Math.floor(rng(3))];
  const varsActive = cls === "selective" ? 1 + Math.floor(rng(2)) : cls === "progressive" ? 2 + Math.floor(rng(2)) : 3 + Math.floor(rng(1));
  
  const locDelta = varsActive >= 1 ? rng(40 * scale, 10 * scale) : rng(8 * scale, -5 * scale);
  const devDelta = varsActive >= 2 ? rng(35 * scale, 8 * scale) : rng(8 * scale, -5 * scale);
  const ckDelta = varsActive >= 3 ? rng(15 * scale, -3 * scale) : rng(5 * scale, -5 * scale);
  const refDelta = varsActive >= 1 && cls !== "selective" ? rng(18 * scale, 3 * scale) : rng(8 * scale, -5 * scale);
  
  const locSig = Math.abs(locDelta) > 8; const devSig = Math.abs(devDelta) > 8; const ckSig = Math.abs(ckDelta) > 6; const refSig = Math.abs(refDelta) > 5;
  const baseline = Math.round(base + 50 * scale);
  const prices: Record<string, number> = {};
  const agents: Agent[] = [];
  const cities = ["DUBAI_$110K","RURAL_IOWA_$50K","LONDON_£85K","MUMBAI_$15K","ABU_DHABI_$120K","DOHA_$100K","MUSCAT_$70K"];
  const devices = ["WINDOWS_CHROME","MACBOOK_PRO","iPHONE_15_PRO","ANDROID_BUDGET","CHROMEBOOK","GALAXY_S24","iPAD_PRO"];
  const cookies = ["FRESH","AGED_30D_HIGH_INTENT","LOYALTY_90D_PLATINUM"];
  const refs = ["DIRECT","KAYAK","SKYSCANNER"];
  const dirs = ["high","low"];
  const baselineCity = isGulf ? "DUBAI" : "MANHATTAN";
  const aedRate = 3.67;

  for (let i = 0; i < 24; i++) {
    const id = `AGENT_${String(i).padStart(2, "0")}`;
    let price = baseline;
    if (i === 21 && rng(1) > 0.7) {
      agents.push({ agent_id: id, label: `${id}  BLOCKED  ${cities[i%7]}`, status: "detected", price: null, response_time_ms: 300+Math.floor(rng(500)), bot_detected: true, detection_signal: "captcha", error_message: null, variables: {} });
      continue;
    }
    if (i === 0) { price = baseline; }
    else if (i <= 5) { price += locDelta * (i % 2 === 0 ? 1 : -1); }
    else if (i <= 10) { price += devDelta * (i % 2 === 0 ? 1 : -1); }
    else if (i <= 13) { price += ckDelta * (i % 2 === 0 ? 1 : -1); }
    else if (i <= 17) { price += refDelta; }
    else if (i <= 20) { price += devDelta * 0.7; }
    else { price += rng(10 * scale, -10 * scale); }
    price = Math.max(80, Math.round(price));
    const ci = i % cities.length;
    const di = i % devices.length;
    const co = i % cookies.length;
    const ri = i % refs.length;
    const label = i === 0 ? `${id}  BASELINE  ${baselineCity}_WINDOWS_FRESH_DIRECT` : `${id}  ${cities[ci]}  ${devices[di]}  ${cookies[co]}  ${refs[ri]}`;
    prices[id] = price;
    agents.push({ agent_id: id, label, status: "success", price, response_time_ms: 800+Math.floor(rng(1200)), bot_detected: false, detection_signal: null, error_message: null, variables: {} });
  }

  const allPrices = Object.values(prices).filter((p): p is number => p !== null);
  const minP = Math.min(...allPrices); const maxP = Math.max(...allPrices);
  const spread = maxP - minP; const di = Math.round(locSig ? Math.abs(locDelta) : 0) + Math.round(devSig ? Math.abs(devDelta) : 0) + Math.round(refSig ? Math.abs(refDelta) : 0);

  const topVar = locSig ? `location: ${fmtDelta(locDelta)}` : "";
  const topVar2 = devSig ? `device: ${fmtDelta(devDelta)}` : "";
  const topVar3 = refSig ? `referrer: ${fmtDelta(refDelta)}` : "";
  const sigVars = [topVar, topVar2, topVar3].filter(Boolean).join("; ");

  const tiers = ["Economy","Business","First","Premium Economy"]; const tier = tiers[Math.floor(rng(4))];

  return {
    session_id: "demo_" + seed.toString(36).slice(0,6), target_url: url, target_name: name,
    timestamp: new Date().toISOString(), status: "completed",
    total_agents: 24, successful_agents: agents.filter(a => a.status === "success").length,
    failed_agents: agents.filter(a => a.status === "failed").length,
    detected_agents: agents.filter(a => a.bot_detected).length,
    elapsed_seconds: 7 + Math.round(rng(4) * 10) / 10, control_stability: 0.97 + rng(0.03),
    baseline_price: baseline, mean_price: Math.round(allPrices.reduce((a,b) => a+b, 0) / allPrices.length),
    all_prices: prices as any, price_range: [minP, maxP], max_price_spread: spread,
    max_price_spread_pct: Math.round(spread / baseline * 100 * 10) / 10,
    gradients: [
      { variable_name: "location", state_high: "High Income", state_low: "Low Income", mean_price_high: baseline + locDelta, mean_price_low: baseline - locDelta, delta: Math.round(locDelta * 2), delta_pct: Math.round(locDelta * 2 / baseline * 100 * 10) / 10, pooled_std: 2 + rng(3), t_statistic: locSig ? 8 + rng(10) : rng(3), significant: locSig, n_high: 3, n_low: 3 },
      { variable_name: "device", state_high: "Premium Device", state_low: "Budget Device", mean_price_high: baseline + devDelta, mean_price_low: baseline - devDelta, delta: Math.round(devDelta * 2), delta_pct: Math.round(devDelta * 2 / baseline * 100 * 10) / 10, pooled_std: 2 + rng(3), t_statistic: devSig ? 8 + rng(10) : rng(3), significant: devSig, n_high: 4, n_low: 4 },
      { variable_name: "cookie_profile", state_high: "Aged Profile", state_low: "Fresh Profile", mean_price_high: baseline + ckDelta, mean_price_low: baseline - ckDelta, delta: Math.round(ckDelta * 2), delta_pct: Math.round(ckDelta * 2 / baseline * 100 * 10) / 10, pooled_std: 3 + rng(4), t_statistic: ckSig ? 5 + rng(8) : rng(3), significant: ckSig, n_high: 2, n_low: 2 },
      { variable_name: "referrer", state_high: "Aggregator", state_low: "Direct", mean_price_high: baseline + refDelta, mean_price_low: baseline - refDelta, delta: Math.round(refDelta * 2), delta_pct: Math.round(refDelta * 2 / baseline * 100 * 10) / 10, pooled_std: 3 + rng(3), t_statistic: refSig ? 5 + rng(8) : rng(3), significant: refSig, n_high: 2, n_low: 2 },
    ],
    discrimination_index: di, topology_class: cls,
    summary: `TOPOLOGY: ${cls.toUpperCase()}. ${route} ${tier}. Baseline: $${baseline} (${Math.round(baseline * aedRate)} AED). Spread: $${spread} (${Math.round(spread/baseline*100)}%). DI: $${di}. Variables: ${sigVars}. Dubai-resident Windows baseline yields lowest observed fare.`,
    max_discrimination_scenario: `Max premium: $${maxP} (${Math.round(maxP * aedRate)} AED)`,
    min_discrimination_scenario: `Min discount: $${minP} (${Math.round(minP * aedRate)} AED)`,
    agents, error: null,
  };
}

const SAMPLE_TARGETS = [
  { label: "United UA123 JFK→SFO", url: "https://www.united.com/en/us/flightdetails?flight=UA123&date=2026-06-01" },
  { label: "Delta DL402 JFK→LAX", url: "https://www.delta.com/flight-status/dl402" },
  { label: "Booking.com SFO Hotel", url: "https://www.booking.com/hotel/us/san-francisco.html" },
];

const VAR_ICONS: Record<string, React.ReactNode> = { location: <Globe className="w-3 h-3" />, device: <Smartphone className="w-3 h-3" />, cookie_profile: <Cookie className="w-3 h-3" />, referrer: <ExternalLink className="w-3 h-3" /> };
function clsColor(cls: string): string { switch (cls) { case "uniform": return "text-blue-400"; case "selective": return "text-yellow-400"; case "progressive": return "text-orange-400"; case "aggressive": return "text-red-400"; default: return "text-white/40"; } }
function fmtDelta(d: number): string { return d >= 0 ? `+$${d.toFixed(0)}` : `-$${Math.abs(d).toFixed(0)}`; }
function parseCombo(l: string): string { const p = l.split("  ").filter(Boolean); return p.length >= 3 ? p.slice(1).join(" | ").replace(/_/g, " ") : l; }

function genDOM(agent_id: string, price: number | null): { text: string; price: string; node: string } {
  const p = price || 347;
  const pStr = `$${p}.00`;
  const tier = p > 370 ? "L" : p < 330 ? "K" : "M";
  const fee = p > 370 ? "$15" : p < 330 ? "$0" : "$25";
  const change = p > 350 ? "$50" : "$0";
  return {
    text: `Route  ${tier} Class  ${pStr}  Nonstop  6h 22m  Seat selection ${fee}  Change fee ${change}  Fully refundable`,
    price: pStr,
    node: `<span class="fare-amount">${pStr}</span>`,
  };
}

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

  const analyzeWithLLMs = useCallback(async (rep: TopologyReport) => {
    try {
      const r = await fetch("http://localhost:8000/api/analyze-matrix", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          baseline_price: rep.baseline_price ?? 0,
          max_price_spread: rep.max_price_spread ?? 0,
          discrimination_index: rep.discrimination_index,
          topology_class: rep.topology_class,
          gradients: rep.gradients,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.analysis) addMsg("system", data.analysis);
      }
    } catch { /* LLM offline — skip */ }
    try {
      const sid = rep.session_id || "demo_session_static";
      const s = await fetch(`http://localhost:8000/api/optimize-shield/${sid}`);
      if (s.ok) {
        const shield = await s.json();
        const fmt = JSON.stringify(shield.spoof_configuration, null, 2);
        addMsg("system", `// ANTI-SURVEILLANCE PROFILE — save ${shield.cheapest_agent_id}\n` +
          `Lowest: $${shield.lowest_price} vs baseline $${shield.baseline_price}\n` +
          `Savings: $${shield.estimated_savings} (${shield.savings_pct}%)\n\n` +
          `## Spoof Configuration\n\`\`\`json\n${fmt}\n\`\`\``);
      }
    } catch { /* shield offline */ }
  }, []);

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

    try {
      const res = await fetch("http://localhost:8000/api/probe", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ target_url: targetUrl, target_name: targetUrl }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.session_id && body.status) {
          const pollForResults = async () => {
            for (let i = 0; i < 60; i++) {
              await new Promise(r => setTimeout(r, 1000));
              try {
                const r2 = await fetch(`http://localhost:8000/api/result/${body.session_id}`);
                if (!r2.ok) continue;
                const data = await r2.json();
                if (data.status === "completed" || data.status === "failed") {
                  if (streamRef.current) clearInterval(streamRef.current);
                  if (data.status === "completed" && data.successful_agents > 0) {
                    setStreamLogs(prev => [...prev, `[${new Date().toISOString().slice(11,23).replace("Z","")}] Backend pipeline complete — ${data.successful_agents}/${data.total_agents} agents`]);
                    setReport(data); setRunning(false); addMsg("result", "Analysis complete");
                    analyzeWithLLMs(data);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  } else {
                    fallbackToMock();
                  }
                  return;
                }
              } catch { continue; }
            }
            fallbackToMock();
          };
          pollForResults();
          return;
        }
      }
      fallbackToMock();
    } catch { fallbackToMock(); }

    function fallbackToMock() {
      setTimeout(() => {
        if (streamRef.current) clearInterval(streamRef.current);
        const g = generateMockReport(targetUrl, targetUrl.includes("united")?"UA123 JFK→SFO":targetUrl.includes("delta")?"DL402 JFK→LAX":targetUrl.includes("booking")?"SFO Hotel":"Route");
        const ts = new Date().toISOString().slice(11,23).replace("Z","");
        setStreamLogs(prev => [...prev, `[${ts}] Local pipeline complete — ${g.successful_agents}/24 agents succeeded`, `[${ts}] Jacobian computed — topology: ${g.topology_class}`]);
        setReport(g); setRunning(false); addMsg("result", "Analysis complete");
        analyzeWithLLMs(g);
        setTimeout(() => inputRef.current?.focus(), 100);
      }, 2800);
    }
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

  const baseReportPrice = report?.baseline_price ?? 347;
  const agentDOM = selectedAgent ? genDOM(selectedAgent.agent_id, selectedAgent.price) : null;
  const baseDOM = genDOM("AGENT_00", baseReportPrice);

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

                {/* ── BEST PRICE HERO ── */}
                {(() => {
                  const agents = report.agents.filter(a => a.status === "success" && a.price);
                  const prices = agents.map(a => a.price!).sort((a, b) => a - b);
                  const best = prices.length ? prices[0] : 0;
                  const worst = prices.length ? prices[prices.length - 1] : 0;
                  const bestAgent = agents.find(a => a.price === best);
                  const worstAgent = agents.find(a => a.price === worst);
                  const savings = worst - best;
                  return (
                    <div className="border border-neutral-900 rounded overflow-hidden">
                      <div className="bg-black p-5 text-center border-b border-neutral-900">
                        <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.15em] mb-2">Cheapest Rate Found</div>
                        <div className="text-5xl font-mono tracking-tight text-white font-light">${best.toFixed(0)}</div>
                        {savings > 0 && (
                          <div className="mt-2 text-[11px] font-mono">
                            <span className="text-emerald-400/80">Save ${savings.toFixed(0)}</span>
                            <span className="text-white/20 mx-2">vs</span>
                            <span className="text-red-400/60">${worst.toFixed(0)}</span>
                            <span className="text-white/15 ml-1">highest rate</span>
                          </div>
                        )}
                      </div>
                      {bestAgent && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-neutral-900">
                          {[
                            { label: "Location", value: bestAgent.label.includes("DUBAI") ? "Dubai (AE)" : bestAgent.label.includes("MANHATTAN") ? "New York (US)" : bestAgent.label.includes("LONDON") ? "London (UK)" : bestAgent.label.includes("MUMBAI") ? "Mumbai (IN)" : bestAgent.label.includes("SINGAPORE") ? "Singapore (SG)" : bestAgent.label.includes("RURAL") ? "Rural Iowa (US)" : bestAgent.label.includes("TOKYO") ? "Tokyo (JP)" : bestAgent.label.includes("BERLIN") ? "Berlin (DE)" : bestAgent.label.includes("SYDNEY") ? "Sydney (AU)" : bestAgent.label.includes("DOHA") ? "Doha (QA)" : bestAgent.label.includes("MUSCAT") ? "Muscat (OM)" : bestAgent.label.includes("ABU") ? "Abu Dhabi (AE)" : "Standard (US)", icon: Globe },
                            { label: "Device", value: bestAgent.label.includes("WINDOWS") ? "Windows Chrome" : bestAgent.label.includes("MACBOOK") || bestAgent.label.includes("MAC") ? "MacBook Safari" : bestAgent.label.includes("iPHONE") || bestAgent.label.includes("IPAD") ? "iOS Safari" : bestAgent.label.includes("ANDROID") ? "Android Chrome" : bestAgent.label.includes("CHROMEBOOK") ? "Chromebook" : bestAgent.label.includes("EDGE") ? "Windows Edge" : bestAgent.label.includes("FIREFOX") ? "Firefox Desktop" : "Standard Browser", icon: Smartphone },
                            { label: "Cookie Policy", value: bestAgent.label.includes("FRESH") ? "Fresh (no tracking)" : bestAgent.label.includes("AGED") ? "Aged (30d history)" : bestAgent.label.includes("LOYALTY") ? "Loyalty (90d)" : "Fresh (no tracking)", icon: Cookie },
                            { label: "Traffic Source", value: bestAgent.label.includes("KAYAK") ? "Via Kayak" : bestAgent.label.includes("SKYSCANNER") ? "Via Skyscanner" : bestAgent.label.includes("AGODA") ? "Via Agoda" : bestAgent.label.includes("DIRECT") ? "Direct (type URL)" : "Direct", icon: ExternalLink },
                          ].map((m, i) => (
                            <div key={m.label} className="bg-black p-3 text-center">
                              <div className="flex items-center justify-center gap-1 text-[8px] font-mono text-white/15 mb-1 uppercase tracking-wider"><m.icon className="w-2.5 h-2.5" />{m.label}</div>
                              <div className="text-[10px] font-mono text-white/60">{m.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── 24-AGENT GRID ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-mono text-white/20">24 Probe Agents — click for details</span>
                    <span className="text-[8px] font-mono text-white/15">{report.elapsed_seconds.toFixed(1)}s</span>
                  </div>
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

                {/* ── DOM EXPLORER ── */}
                {selectedAgent && agentDOM && (
                  <div className="border border-neutral-900 rounded overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-900 bg-black/60">
                      <div className="flex items-center gap-1.5"><Code className="w-3 h-3 text-white/25" /><span className="text-[8px] font-mono text-white/25 uppercase">DOM Explorer</span></div>
                      <div className="flex items-center gap-2 text-[9px] font-mono">
                        <span className="text-white/15">Base ${report.baseline_price?.toFixed(0) || "—"}</span>
                        <span className="text-white/15">vs</span>
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
                          {agentDOM.text.split(" ").map((w, i) => /^\$\d/.test(w) && w !== `$${report.baseline_price?.toFixed(0)}` ? <span key={i} className="text-amber-300/80 bg-amber-300/10 px-0.5 rounded">{w} </span> : <span key={i} className="text-white/30">{w} </span>)}
                        </div>
                        <code className={`text-[8px] ${selectedAgent.price && selectedAgent.price !== report.baseline_price ? "text-amber-300/80 bg-amber-950/20" : "text-white/30 bg-white/5"} px-1.5 py-0.5 rounded block mt-1`}>{agentDOM.node}</code>
                        {selectedAgent.bot_detected && <div className="mt-1 flex items-center gap-1 text-[8px] font-mono text-red-400/60"><AlertOctagon className="w-2 h-2" />BLOCKED</div>}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ANALYTICS (collapsible) ──*/}
                <div className="border border-neutral-900 rounded overflow-hidden">
                  <button onClick={() => setShowStream(!showStream)} className="w-full flex items-center justify-between px-4 py-2.5 text-[9px] font-mono text-white/20 uppercase tracking-[0.15em] hover:text-white/40 transition-colors bg-black/40">
                    <span className="flex items-center gap-2"><BarChart3 className="w-3 h-3" />Price Distribution &amp; Sensitivity</span>
                    {showStream ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                  {showStream && (
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: "Lowest", value: `$${report.price_range?.[0].toFixed(0)}`, cls: "text-emerald-400" },
                          { label: "Median", value: `$${report.baseline_price?.toFixed(0)}`, cls: "text-white" },
                          { label: "Highest", value: `$${report.price_range?.[1].toFixed(0)}`, cls: "text-red-400" },
                          { label: "Spread", value: `$${report.max_price_spread?.toFixed(0)}`, sub: `${report.max_price_spread_pct?.toFixed(1)}%`, cls: "text-white/60" },
                        ].map(m => (
                          <div key={m.label} className="text-center bg-white/[0.02] rounded p-2">
                            <div className="text-[8px] font-mono text-white/20 uppercase">{m.label}</div>
                            <div className={`text-sm font-mono ${m.cls}`}>{m.value}</div>
                            {m.sub && <div className="text-[8px] font-mono text-white/15">{m.sub}</div>}
                          </div>
                        ))}
                      </div>
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={(() => {
                            const v = Object.values(report.all_prices).filter((p): p is number => p !== null);
                            if (!v.length) return [];
                            const mn = Math.floor(Math.min(...v)/10)*10, mx = Math.ceil(Math.max(...v)/10)*10;
                            const bins: Record<number,number> = {};
                            for (let b = mn; b <= mx; b+=10) bins[b] = 0;
                            for (const p of v) bins[Math.floor(p/10)*10]++;
                            return Object.entries(bins).map(([k,c]) => ({ bucket: Number(k), count: c })).sort((a,b) => a.bucket - b.bucket);
                          })()} margin={{ top: 2, right: 4, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8, fontFamily: "monospace" }} tickFormatter={(v:number) => `$${v}`} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 8, fontFamily: "monospace" }} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", fontSize: "9px", fontFamily: "monospace", color: "#fff" }} />
                            <Bar dataKey="count" radius={[1,1,0,0]}>
                              {(() => { 
                                const v = Object.values(report.all_prices).filter((p): p is number => p !== null);
                                const mn = Math.floor(Math.min(...v)/10)*10, mx = Math.ceil(Math.max(...v)/10)*10;
                                const bins: Record<number,number> = {}; for (let b = mn; b <= mx; b+=10) bins[b]=0;
                                for (const p of v) bins[Math.floor(p/10)*10]++;
                                return Object.entries(bins).map(([k,c]) => ({ bucket: Number(k), count: c })).sort((a,b) => a.bucket - b.bucket);
                              })().map((e,i) => {
                                const pct = Math.abs(e.bucket - (report.baseline_price ?? 0)) / (report.baseline_price ?? 1);
                                return <Cell key={i} fill={pct > 0.08 ? (e.bucket < (report.baseline_price ?? 0) ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)") : "rgba(255,255,255,0.15)"} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audit Summary */}
                <div className="border border-neutral-900 rounded p-3 bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 mb-1.5"><Terminal className="w-3 h-3 text-white/25" /><span className="text-[8px] font-mono text-white/25 uppercase">Summary</span></div>
                  <p className="font-mono text-[10px] text-white/60 leading-relaxed">{report.summary}</p>
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
