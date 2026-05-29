"use client";

/**
 * CockpitProbe — Phase D: stacked readable layout.
 *
 * Restructured from side-by-side (radial + rail) into a vertical
 * narrative so a non-technical reader can follow it:
 *
 *   ░ Cockpit (idle)
 *     - command input + 5 sample cases
 *
 *   ░ Deck (running / complete / error)
 *     1. The visual — radial 24-agent web centered alone, full width
 *     2. The verdict strip — topology, hidden premium, plain-English sentence
 *     3. The math — baseline, mean, spread, % over baseline, index
 *     4. The recommendation — "switch to X to save $Y"
 *     5. The evidence table — all 24 agents sorted by price (worst → best)
 *     6. The drivers — price impact by vector, each with a short explainer
 *     7. The actions — Download PDF report · Copy link · Export JSON · New probe
 *
 * Backend behavior is unchanged — same POST /api/probe → poll
 * /api/result/{session_id} → POST /api/analyze flow, same demo mode,
 * same probe-conversations localStorage write, same retry/cancel.
 *
 * Visual styling is unchanged — we only restructured DOM and added
 * deeper textual explanations. All Claude Design tokens still apply via
 * jacobi-design.css.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ─── Types & data ──────────────────────────────────────────────────── */

interface Gradient {
  variable_name: string;
  state_high: string;
  state_low: string;
  mean_price_high: number;
  mean_price_low: number;
  delta: number;
  delta_pct: number;
  pooled_std: number;
  t_statistic: number;
  significant: boolean;
  n_high: number;
  n_low: number;
}

interface BackendAgent {
  agent_id: string;
  label: string;
  status: string;
  price: number | null;
  response_time_ms: number | null;
  bot_detected: boolean;
  detection_signal: string | null;
  error_message: string | null;
  variables: Record<string, string>;
  network_tier?: number;
  proxy_type?: string;
}

interface TopologyReport {
  session_id: string;
  target_url: string;
  target_name: string;
  timestamp: string;
  status: string;
  total_agents: number;
  successful_agents: number;
  failed_agents: number;
  detected_agents: number;
  elapsed_seconds: number;
  baseline_price: number | null;
  mean_price: number | null;
  all_prices: Record<string, number | null>;
  price_range: [number, number] | null;
  max_price_spread: number | null;
  max_price_spread_pct: number | null;
  gradients: Gradient[];
  discrimination_index: number;
  topology_class: string;
  agents: BackendAgent[];
  error: string | null;
}

const CASES = [
  { name: "Leela Palace Bangalore", host: "www.booking.com", url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html", base: 245 },
  { name: "Tokyo Hotels Search",    host: "www.booking.com", url: "https://www.booking.com/searchresults.html?ss=Tokyo", base: 120 },
  { name: "Knickerbocker NYC",      host: "www.booking.com", url: "https://www.booking.com/hotel/us/the-knickerbocker.html", base: 350 },
  { name: "DXB → KTM Flights",      host: "www.google.com",  url: "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB", base: 420 },
  { name: "Wireless Headphones",    host: "www.amazon.com",  url: "https://www.amazon.com/s?k=wireless+headphones", base: 65 },
];

const WAVES = [
  { label: "Wave 1 · datacenter",  r: 150 },
  { label: "Wave 2 · residential", r: 250 },
  { label: "Wave 3 · mobile",      r: 350 },
];
const CX = 450;
const CY = 450;

interface NodeGeom { i: number; wave: number; posInWave: number; angle: number; x: number; y: number; lineLen: number; }

const NODE_GEOM: NodeGeom[] = (() => {
  const out: NodeGeom[] = [];
  for (let i = 0; i < 24; i++) {
    const wave = Math.floor(i / 8);
    const posInWave = i % 8;
    const w = WAVES[wave];
    const offset = wave * 0.39 - Math.PI / 2;
    const angle = (posInWave / 8) * Math.PI * 2 + offset;
    const x = CX + w.r * Math.cos(angle);
    const y = CY + w.r * Math.sin(angle);
    out.push({ i, wave, posInWave, angle, x, y, lineLen: Math.hypot(x - CX, y - CY) });
  }
  return out;
})();

type NodeVis = "pending" | "deploying" | "done-over" | "done-good" | "done-normal" | "blocked";

function classifyAgent(a: BackendAgent | undefined, allPrices: number[]): NodeVis {
  if (!a) return "pending";
  if (a.status === "detected" || a.status === "failed" || a.bot_detected) return "blocked";
  if (a.status === "success" && a.price != null) {
    if (allPrices.length < 2) return "done-normal";
    const lo = Math.min(...allPrices);
    const hi = Math.max(...allPrices);
    if (hi === lo) return "done-normal";
    const ratio = (a.price - lo) / (hi - lo);
    if (ratio >= 0.75) return "done-over";
    if (ratio <= 0.25) return "done-good";
    return "done-normal";
  }
  return "deploying";
}

function agentLabelCity(a: BackendAgent): string {
  const rest = (a.label || a.agent_id).replace(/^AGENT_\d+\s*/i, "").trim();
  return rest || a.agent_id;
}

/** Neutral, factual descriptions of each pricing signal — no prescriptive
 *  advice. JACOBI reports what it observed; the reader draws conclusions. */
const VECTOR_INFO: Record<string, { label: string; what: string }> = {
  location: {
    label: "Location",
    what: "The IP geolocation each identity appeared to come from — country, region, and metro area.",
  },
  device: {
    label: "Device",
    what: "The browser user-agent and rendering fingerprint each identity reported — phone vs laptop, premium vs budget hardware.",
  },
  cookie_profile: {
    label: "Cookies / session",
    what: "The session state each identity carried — loyalty cookies, visit recency, prior browsing history.",
  },
  referrer: {
    label: "Referrer",
    what: "Where the request appeared to originate — direct visit, search engine, or comparison aggregator.",
  },
};

const TOPO: Record<string, [string, string, string]> = {
  uniform:     ["#3ad79f", "Uniform",     "Prices are roughly the same across every profile we tested. Nothing meaningful to dodge."],
  selective:   ["#d8b06a", "Selective",   "One variable is driving most of the price difference. Worth changing that one signal."],
  progressive: ["#ff9d52", "Progressive", "Several variables stack together. The more 'premium' your fingerprint looks, the more you pay."],
  aggressive:  ["#ff5468", "Aggressive",  "Multiple strong signals push the price up sharply. Changing your profile saves a lot."],
};

/* ─── Demo data (unchanged) ──────────────────────────────────────────── */

const DEMO_AGENTS: BackendAgent[] = Array.from({ length: 24 }, (_, i) => {
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
    bot_detected: i === 21,
    detection_signal: i === 21 ? "captcha" : null,
    error_message: null,
    variables: {},
    network_tier: tier,
    proxy_type: ptype,
  };
});

const DEMO_REPORT: TopologyReport = {
  session_id: "demo",
  target_url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html",
  target_name: "Leela Palace Bangalore",
  timestamp: "2026-05-25T20:00:00Z",
  status: "completed",
  total_agents: 24, successful_agents: 22, failed_agents: 1, detected_agents: 1,
  elapsed_seconds: 8.7,
  baseline_price: 245, mean_price: 252,
  all_prices: Object.fromEntries(DEMO_AGENTS.filter(a => a.price !== null).map(a => [a.agent_id, a.price])),
  price_range: [221, 278],
  max_price_spread: 57, max_price_spread_pct: 23.3,
  gradients: [
    { variable_name: "location",       state_high: "High Income",    state_low: "Low Income",     mean_price_high: 268.3, mean_price_low: 226.7, delta: 41.6, delta_pct: 17,   pooled_std: 2.5, t_statistic: 16.6, significant: true,  n_high: 3, n_low: 3 },
    { variable_name: "device",         state_high: "Premium Device", state_low: "Budget Device",  mean_price_high: 269.5, mean_price_low: 236,   delta: 33.5, delta_pct: 13.7, pooled_std: 3.1, t_statistic: 10.8, significant: true,  n_high: 4, n_low: 4 },
    { variable_name: "cookie_profile", state_high: "Aged Profile",   state_low: "Fresh Profile",  mean_price_high: 247.5, mean_price_low: 245,   delta: 2.5,  delta_pct: 1,    pooled_std: 4.2, t_statistic: 0.6,  significant: false, n_high: 2, n_low: 2 },
    { variable_name: "referrer",       state_high: "Aggregator",     state_low: "Direct",         mean_price_high: 257,   mean_price_low: 245,   delta: 12,   delta_pct: 4.9,  pooled_std: 3.8, t_statistic: 3.16, significant: true,  n_high: 2, n_low: 2 },
  ],
  discrimination_index: 87.1,
  topology_class: "progressive",
  agents: DEMO_AGENTS,
  error: null,
};

/* ─── Component ──────────────────────────────────────────────────────── */

type Phase = "idle" | "deploying" | "complete" | "error";

export default function CockpitProbe({ initialUrl }: { initialUrl?: string }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [phase, setPhase] = useState<Phase>("idle");
  const [input, setInput] = useState(initialUrl || "");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckPhaseLabel, setDeckPhaseLabel] = useState("deploying");
  const [useCache, setUseCache] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [report, setReport] = useState<TopologyReport | null>(null);
  const [returnedAgents, setReturnedAgents] = useState<BackendAgent[]>([]);
  const [activeWave, setActiveWave] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const lastUrlRef = useRef("");
  const lastNameRef = useRef("");
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (initialUrl && phase === "idle") {
      const t = setTimeout(() => {
        const label = CASES.find(c => c.url === initialUrl)?.name || initialUrl;
        startProbe(initialUrl, label);
      }, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current)    clearInterval(tickRef.current);
  }, []);

  const saveConv = useCallback((r: TopologyReport) => {
    try {
      const existing = JSON.parse(localStorage.getItem("probe-conversations") || "[]");
      existing.unshift({
        id: r.session_id, session_id: r.session_id,
        title: (r.target_name || r.target_url || "Probe").slice(0, 50),
        timestamp: Date.now(),
        targetUrl: r.target_url, targetName: r.target_name,
        baselinePrice: r.baseline_price, savings: r.max_price_spread,
        topologyClass: r.topology_class,
      });
      localStorage.setItem("probe-conversations", JSON.stringify(existing.slice(0, 50)));
    } catch {}
  }, []);

  const stopTimers = useCallback(() => {
    if (pollRef.current)    { clearInterval(pollRef.current);    pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current);  timeoutRef.current = null; }
    if (tickRef.current)    { clearInterval(tickRef.current);    tickRef.current = null; }
  }, []);

  const handleAnalyze = useCallback(async (data: TopologyReport) => {
    try {
      const r = await fetch(`${apiBase}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_url: data.target_url || "",
          target_name: data.target_name || "",
          use_data_dir: data.session_id,
        }),
      });
      if (r.ok) {
        const a = await r.json();
        setReport({ ...data, _analysis: a } as TopologyReport & { _analysis: unknown });
      } else {
        setReport(data);
      }
    } catch {
      setReport(data);
    }
  }, [apiBase]);

  const startProbe = useCallback((url: string, name: string) => {
    cancelledRef.current = false;
    setPhase("deploying");
    setDeckPhaseLabel("deploying");
    setDeckUrl(url);
    setReturnedAgents([]);
    setActiveWave(0);
    setElapsed(0);
    setErrorMsg(null);
    setReport(null);
    lastUrlRef.current = url;
    lastNameRef.current = name;
    startTimeRef.current = performance.now();

    tickRef.current = setInterval(() => {
      setElapsed((performance.now() - startTimeRef.current) / 1000);
    }, 100);

    if (useCache) {
      runDemo(url, name);
      return;
    }
    runLive(url, name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCache, apiBase]);

  const runDemo = useCallback(async (url: string, name: string) => {
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    const sub: BackendAgent[] = [];
    setActiveWave(0);
    for (let i = 0; i < 8; i++) { if (cancelledRef.current) return; sub.push(DEMO_AGENTS[i]); }
    await wait(900);
    setReturnedAgents([...sub]);
    setActiveWave(1);
    for (let i = 8; i < 16; i++) { if (cancelledRef.current) return; sub.push(DEMO_AGENTS[i]); }
    await wait(900);
    setReturnedAgents([...sub]);
    setActiveWave(2);
    for (let i = 16; i < 24; i++) { if (cancelledRef.current) return; sub.push(DEMO_AGENTS[i]); }
    await wait(900);
    if (cancelledRef.current) return;
    setReturnedAgents([...sub]);
    setDeckPhaseLabel("complete");
    try {
      const r = await fetch(`${apiBase}/api/analyze-demo`);
      if (r.ok) {
        const a = await r.json();
        setReport({ ...DEMO_REPORT, target_url: url, target_name: name, _analysis: a, _demo: true } as TopologyReport & { _analysis: unknown; _demo: boolean });
      } else {
        setReport({ ...DEMO_REPORT, target_url: url, target_name: name, _demo: true } as TopologyReport & { _demo: boolean });
      }
    } catch {
      setReport({ ...DEMO_REPORT, target_url: url, target_name: name, _demo: true } as TopologyReport & { _demo: boolean });
    }
    setPhase("complete");
    stopTimers();
  }, [apiBase, stopTimers]);

  const runLive = useCallback(async (url: string, name: string) => {
    try {
      const r1 = await fetch(`${apiBase}/api/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_url: url, target_name: name }),
      });
      if (!r1.ok) throw new Error(`Server error: ${r1.status}`);
      const b1 = await r1.json();
      const sessionId: string = b1.session_id;

      pollRef.current = setInterval(async () => {
        if (cancelledRef.current) return;
        try {
          const r2 = await fetch(`${apiBase}/api/result/${sessionId}`);
          if (r2.status === 404) {
            stopTimers();
            setErrorMsg("Probe session expired");
            setPhase("error");
            return;
          }
          if (!r2.ok) throw new Error(`Poll error: ${r2.status}`);
          const data: TopologyReport = await r2.json();
          setReturnedAgents(data.agents.filter(a => a.status === "success" || a.status === "detected" || a.status === "failed"));
          const succ = data.successful_agents;
          setActiveWave(succ < 8 ? 0 : succ < 16 ? 1 : 2);

          if (data.status === "completed" || data.status === "failed") {
            stopTimers();
            if (data.status === "completed") {
              saveConv(data);
              setDeckPhaseLabel("analyzing");
              await handleAnalyze(data);
              setDeckPhaseLabel("complete");
              setPhase("complete");
            } else {
              setErrorMsg(data.error || "Probe failed");
              setReport(data);
              setPhase("error");
            }
          }
        } catch (e) {
          stopTimers();
          setErrorMsg(e instanceof Error ? e.message : "Poll error");
          setPhase("error");
        }
      }, 1000);

      timeoutRef.current = setTimeout(() => {
        stopTimers();
        setErrorMsg("Probe timed out after 3 minutes");
        setPhase("error");
      }, 180_000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Request failed");
      setPhase("error");
      stopTimers();
    }
  }, [apiBase, stopTimers, saveConv, handleAnalyze]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopTimers();
    setPhase("idle");
  }, [stopTimers]);

  const retry = useCallback(() => {
    if (!lastUrlRef.current) return;
    startProbe(lastUrlRef.current, lastNameRef.current || lastUrlRef.current);
  }, [startProbe]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    let v = input.trim();
    if (!v) v = "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html";
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    const label = CASES.find(c => c.url === v)?.name || v;
    startProbe(v, label);
  }, [input, startProbe]);

  const backToIdle = useCallback(() => {
    cancel();
    setInput("");
    setReport(null);
    setReturnedAgents([]);
  }, [cancel]);

  /* ─── Derived data for the readable verdict ────────────────────── */

  const allPrices = useMemo(
    () => returnedAgents.filter(a => a.price != null && a.status === "success").map(a => a.price as number),
    [returnedAgents],
  );

  const nodeStates: NodeVis[] = useMemo(() => {
    return NODE_GEOM.map((g) => {
      const idStr = `AGENT_${String(g.i).padStart(2, "0")}`;
      const a = returnedAgents.find(x => x.agent_id === idStr);
      if (a) return classifyAgent(a, allPrices);
      if (phase === "deploying" && g.wave <= activeWave) return "deploying";
      return "pending";
    });
  }, [returnedAgents, allPrices, phase, activeWave]);

  const verdict = useMemo(() => {
    if (!report) return null;
    const cls = report.topology_class || "selective";
    const [color, label, blurb] = TOPO[cls] || TOPO.selective;
    const spread = Math.round(report.max_price_spread || 0);
    const pct = Math.round(report.max_price_spread_pct || 0);
    const index = Math.round(report.discrimination_index || 0);

    const successAgents = report.agents.filter(a => a.status === "success" && a.price != null);
    const sortedByPrice = successAgents.slice().sort((a, b) => (b.price! - a.price!));
    const top = sortedByPrice[0];
    const low = sortedByPrice[sortedByPrice.length - 1];

    const dominant = report.gradients
      .filter(g => g.significant)
      .reduce<Gradient | null>((m, g) => (Math.abs(g.delta_pct) > Math.abs(m?.delta_pct ?? 0) ? g : m), null);

    return {
      color, label, blurb, spread, pct, index,
      baseline: report.baseline_price ?? null,
      mean: report.mean_price ?? null,
      range: report.price_range,
      top, low,
      sortedByPrice,
      dominantName: dominant?.variable_name || null,
      dominantPct: dominant ? Math.round(Math.abs(dominant.delta_pct)) : 0,
      successCount: report.successful_agents,
      totalCount: report.total_agents,
      gradients: report.gradients,
      elapsed: report.elapsed_seconds,
      target: report.target_url,
      session: report.session_id,
      targetName: report.target_name,
    };
  }, [report]);

  const topVectors = useMemo(() => {
    if (!verdict) return [];
    const max = Math.max(1, ...verdict.gradients.map(g => Math.abs(g.delta_pct)));
    return verdict.gradients
      .slice()
      .sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
      .map(g => ({
        key: g.variable_name,
        info: VECTOR_INFO[g.variable_name] || { label: g.variable_name, what: "", how: "" },
        pct: Math.round(Math.abs(g.delta_pct)),
        delta: g.delta,
        max,
        high: g.state_high, low: g.state_low,
        highPrice: g.mean_price_high, lowPrice: g.mean_price_low,
        significant: g.significant,
      }));
  }, [verdict]);

  const [copyLabel, setCopyLabel] = useState("Copy share link");
  const copyShare = useCallback(() => {
    if (!report?.session_id) return;
    try {
      navigator.clipboard.writeText(`${window.location.origin}/share/${report.session_id}`);
      setCopyLabel("Link copied ✓");
      setTimeout(() => setCopyLabel("Copy share link"), 1800);
    } catch {}
  }, [report?.session_id]);

  const exportJSON = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `probe-${report.session_id || "report"}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, [report]);

  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadPDF = useCallback(async () => {
    if (!verdict || !report) return;
    setPdfBusy(true);
    try {
      const mod = await import("jspdf");
      const jsPDF = mod.jsPDF || (mod as { default: typeof mod.jsPDF }).default;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();   // 595
      const H = doc.internal.pageSize.getHeight();  // 842
      const M = 44;

      /* Single-page forensic-report layout.
       *
       * Palette (RGB):
       *   ink     = #0c0f15  near-black canvas
       *   surface = #161b25  card tint
       *   line    = #2a3245  hairlines
       *   text    = #ffffff  primary
       *   text-2  = #c4ccd9  body
       *   text-3  = #7d8699  metadata
       *   cobalt  = #6e92ff  accent
       *   over    = #ff5468  exposed premium
       *   good    = #3ad79f  baseline
       */
      const C = {
        ink:    [12, 15, 21] as const,
        surface:[22, 27, 37] as const,
        surface2:[28, 34, 47] as const,
        line:   [42, 50, 69] as const,
        text:   [255, 255, 255] as const,
        text2:  [196, 204, 217] as const,
        text3:  [125, 134, 153] as const,
        cobalt: [110, 146, 255] as const,
        over:   [255, 84, 104] as const,
        good:   [58, 215, 159] as const,
      };
      const setFill = (c: readonly [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
      const setText = (c: readonly [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
      const setStroke = (c: readonly [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

      // ── Canvas ─────────────────────────────────────────────────
      setFill(C.ink);
      doc.rect(0, 0, W, H, "F");

      // ── Header band ────────────────────────────────────────────
      setStroke(C.cobalt);
      doc.setLineWidth(1.4);
      doc.line(M, 56, M + 28, 56);   // cobalt accent tick top-left

      // Brand mark (small geometric crosshair)
      setStroke(C.cobalt);
      doc.setLineWidth(0.8);
      doc.circle(M + 11, 78, 9, "S");
      doc.circle(M + 11, 78, 4, "S");
      setFill(C.cobalt);
      doc.circle(M + 14, 75, 1.4, "F");

      doc.setFont("helvetica", "bold").setFontSize(14);
      setText(C.text);
      doc.text("JACOBI", M + 28, 81);
      doc.setFont("helvetica", "normal").setFontSize(8.5);
      setText(C.text3);
      doc.text("Pricing topology forensic report", M + 78, 81);

      // Right side: session id + date
      doc.setFont("courier", "normal").setFontSize(8);
      setText(C.text3);
      const dateLine = new Date().toLocaleString();
      const sessionLine = `Session ${verdict.session.slice(0, 12) || "—"}`;
      doc.text(dateLine,    W - M, 75, { align: "right" });
      doc.text(sessionLine, W - M, 86, { align: "right" });

      // Header rule
      setStroke(C.line);
      doc.setLineWidth(0.6);
      doc.line(M, 102, W - M, 102);

      // ── Target line ───────────────────────────────────────────
      let y = 122;
      doc.setFont("helvetica", "normal").setFontSize(8);
      setText(C.text3);
      doc.text("TARGET", M, y);
      doc.setFont("courier", "normal").setFontSize(9.5);
      setText(C.text2);
      const targetText = doc.splitTextToSize(verdict.target || "—", W - 2 * M - 60);
      doc.text(targetText[0] || "—", M + 60, y);
      if (verdict.targetName) {
        y += 13;
        doc.setFont("helvetica", "italic").setFontSize(9);
        setText(C.text3);
        doc.text(verdict.targetName, M + 60, y);
      }
      y += 22;

      // ── Headline panel (the verdict) ──────────────────────────
      // Cobalt-glow shadow rect + main panel
      setFill(C.surface);
      setStroke(C.line);
      doc.setLineWidth(0.6);
      doc.roundedRect(M, y, W - 2 * M, 112, 6, 6, "FD");

      // Topology pill (top-left inside panel)
      const topoColor = (() => {
        const t = verdict.label.toLowerCase();
        if (t === "uniform")     return C.good;
        if (t === "aggressive")  return C.over;
        return [255, 157, 82] as const; // progressive/selective amber
      })();
      const pillX = M + 18, pillY = y + 16;
      const pillTextW = doc.getTextWidth(verdict.label.toUpperCase());
      setFill([topoColor[0], topoColor[1], topoColor[2]]);
      doc.setGState(doc.GState({ opacity: 0.18 }));
      doc.roundedRect(pillX, pillY - 9, pillTextW + 28, 16, 8, 8, "F");
      doc.setGState(doc.GState({ opacity: 1 }));
      setFill(topoColor);
      doc.circle(pillX + 8, pillY - 1, 2, "F");
      doc.setFont("helvetica", "bold").setFontSize(7.5);
      setText(topoColor);
      doc.text(verdict.label.toUpperCase(), pillX + 16, pillY + 1.5);

      // Big spread number
      doc.setFont("helvetica", "bold").setFontSize(46);
      setText(C.text);
      const spreadStr = `+$${verdict.spread}`;
      doc.text(spreadStr, M + 18, y + 70);

      // Label above spread
      doc.setFont("helvetica", "normal").setFontSize(7.5);
      setText(C.text3);
      doc.text("HIDDEN PREMIUM", M + 18, y + 38);

      // Sub line under spread
      doc.setFont("helvetica", "normal").setFontSize(9);
      setText(C.text2);
      doc.text(
        `${verdict.pct}% over baseline · ${verdict.successCount}/${verdict.totalCount} identities returned · ${(verdict.elapsed || 0).toFixed(1)}s`,
        M + 18, y + 90,
      );

      // Right side of panel: discrimination index visual
      const diX = W - M - 150, diY = y + 22;
      doc.setFont("helvetica", "normal").setFontSize(7.5);
      setText(C.text3);
      doc.text("DISCRIMINATION INDEX", diX, diY);
      doc.setFont("helvetica", "bold").setFontSize(32);
      setText(C.text);
      doc.text(String(verdict.index), diX, diY + 32);
      doc.setFont("helvetica", "normal").setFontSize(10);
      setText(C.text3);
      doc.text("/100", diX + doc.getTextWidth(String(verdict.index)) + 4, diY + 32);

      // Index bar
      const barX = diX, barY = diY + 50, barW = 130, barH = 4;
      setFill(C.line);
      doc.roundedRect(barX, barY, barW, barH, 2, 2, "F");
      // gradient simulation with 3 segments cobalt → amber → over
      const fillW = (verdict.index / 100) * barW;
      const seg1 = Math.min(fillW, barW * 0.4);
      const seg2 = Math.max(0, Math.min(fillW - barW * 0.4, barW * 0.3));
      const seg3 = Math.max(0, fillW - barW * 0.7);
      if (seg1 > 0) { setFill(C.cobalt); doc.roundedRect(barX, barY, seg1, barH, 2, 2, "F"); }
      if (seg2 > 0) { setFill([255, 157, 82]); doc.rect(barX + barW * 0.4, barY, seg2, barH, "F"); }
      if (seg3 > 0) { setFill(C.over); doc.rect(barX + barW * 0.7, barY, seg3, barH, "F"); }

      y += 132;

      // ── Plain English summary ──────────────────────────────────
      doc.setFont("helvetica", "normal").setFontSize(8);
      setText(C.text3);
      doc.text("SUMMARY", M, y);
      y += 14;
      doc.setFont("helvetica", "normal").setFontSize(10);
      setText(C.text);
      const summary =
        verdict.top && verdict.low
          ? `An identity presenting as "${agentLabelCity(verdict.top)}" was quoted $${verdict.top.price}. An identity presenting as "${agentLabelCity(verdict.low)}" was quoted $${verdict.low.price} for the identical listing — a $${verdict.spread} gap${verdict.dominantName ? `. The dominant signal in the data was ${verdict.dominantName}.` : "."}`
          : verdict.blurb;
      const summaryLines = doc.splitTextToSize(summary, W - 2 * M);
      doc.text(summaryLines, M, y);
      y += summaryLines.length * 13 + 16;

      // ── Endpoints row (top vs bottom) ──────────────────────────
      if (verdict.top && verdict.low) {
        const cardW = (W - 2 * M - 14) / 2;
        const cardH = 64;

        // Top (over)
        setFill(C.surface);
        setStroke([C.over[0], C.over[1], C.over[2]]);
        doc.setLineWidth(0.5);
        doc.roundedRect(M, y, cardW, cardH, 5, 5, "FD");
        doc.setFont("helvetica", "normal").setFontSize(7);
        setText(C.over);
        doc.text("TOP QUOTE", M + 14, y + 18);
        doc.setFont("helvetica", "bold").setFontSize(22);
        setText(C.text);
        doc.text(`$${verdict.top.price}`, M + 14, y + 42);
        doc.setFont("helvetica", "normal").setFontSize(8.5);
        setText(C.text2);
        const topName = doc.splitTextToSize(agentLabelCity(verdict.top), cardW - 28);
        doc.text(topName[0] || "—", M + 14, y + 56);

        // Low (good)
        const lowX = M + cardW + 14;
        setFill(C.surface);
        setStroke([C.good[0], C.good[1], C.good[2]]);
        doc.roundedRect(lowX, y, cardW, cardH, 5, 5, "FD");
        doc.setFont("helvetica", "normal").setFontSize(7);
        setText(C.good);
        doc.text("LOW QUOTE", lowX + 14, y + 18);
        doc.setFont("helvetica", "bold").setFontSize(22);
        setText(C.text);
        doc.text(`$${verdict.low.price}`, lowX + 14, y + 42);
        doc.setFont("helvetica", "normal").setFontSize(8.5);
        setText(C.text2);
        const lowName = doc.splitTextToSize(agentLabelCity(verdict.low), cardW - 28);
        doc.text(lowName[0] || "—", lowX + 14, y + 56);

        y += cardH + 20;
      }

      // ── Drivers (impact bars) ──────────────────────────────────
      doc.setFont("helvetica", "normal").setFontSize(8);
      setText(C.text3);
      doc.text("DRIVERS", M, y);
      y += 16;
      const tvMax = Math.max(1, ...topVectors.map(v => v.pct));
      topVectors.forEach(v => {
        // Label
        doc.setFont("helvetica", "normal").setFontSize(9.5);
        setText(C.text);
        doc.text(v.info.label, M, y);
        // Value
        doc.setFont("courier", "bold").setFontSize(9);
        setText(v.significant ? C.text : C.text3);
        doc.text(
          v.significant ? `${v.pct}%` : "n/s",
          W - M, y, { align: "right" },
        );
        // Track
        const trackX = M + 110, trackY = y - 5, trackW = W - 2 * M - 140, trackH = 6;
        setFill(C.line);
        doc.roundedRect(trackX, trackY, trackW, trackH, 3, 3, "F");
        if (v.significant) {
          const w = (v.pct / tvMax) * trackW;
          setFill(C.cobalt);
          doc.roundedRect(trackX, trackY, w, trackH, 3, 3, "F");
        }
        y += 20;
      });

      // ── Footer ─────────────────────────────────────────────────
      setStroke(C.line);
      doc.setLineWidth(0.4);
      doc.line(M, H - 50, W - M, H - 50);
      doc.setFont("helvetica", "normal").setFontSize(7.5);
      setText(C.text3);
      doc.text(
        "Generated by JACOBI · 24-agent adversarial pricing probe",
        M, H - 32,
      );
      doc.text(
        `jacobi.report/${verdict.session.slice(0, 8)}`,
        W - M, H - 32, { align: "right" },
      );

      doc.save(`jacobi-report-${verdict.session.slice(0, 8) || "probe"}.pdf`);
    } catch (e) {
      console.error("PDF generation failed", e);
    } finally {
      setPdfBusy(false);
    }
  }, [verdict, report, topVectors]);

  /* ─── Render ──────────────────────────────────────────────────────── */

  const showStage = phase !== "idle";

  return (
    <main className="probe-main">
      {/* ── COCKPIT (idle) ───────────────────────────────────────────── */}
      <section className={`cockpit ${phase === "idle" ? "active" : ""}`} id="cockpit">
        <div className="wrap cockpit-wrap">
          <span className="eyebrow cockpit-eyebrow">
            <span className="dot">●</span> JACOBI · probe cockpit
          </span>
          <h1 className="cockpit-h1 serif">
            Paste a URL. <span className="cobalt-i">Twenty-four shoppers</span> go to work.
          </h1>

          <form className="probe-instrument cockpit-bar" onSubmit={handleSubmit}>
            <div className="pi-row">
              <span className="pi-meta">
                <span className="pi-glyph">⌖</span> 24 agents
              </span>
              <input
                className="pi-input"
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="paste a flight, hotel or product URL"
                spellCheck="false"
                autoComplete="off"
              />
              <button className="pi-submit" type="submit">
                Probe <span className="pi-arrow">→</span>
              </button>
            </div>
            <span className="pi-rule" />
          </form>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 14 }}>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3)",
              letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={useCache}
                onChange={e => setUseCache(e.target.checked)}
                style={{ accentColor: "var(--cobalt)" }}
              />
              Demo mode
            </label>
          </div>

          <div className="cases">
            <div className="cases-divider"><span className="label-mono">or open a case</span></div>
            <div className="cases-list">
              {CASES.map((c, i) => (
                <button
                  key={i}
                  className="case-row"
                  onClick={() => { setInput(c.url); startProbe(c.url, c.name); }}
                >
                  <span className="case-info">
                    <span className="case-name">{c.name}</span>
                    <span className="case-host mono">{c.host}</span>
                  </span>
                  <span className="case-meta">
                    <span className="case-price mono">${c.base}</span>
                    <span className="case-arrow">→</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DECK (deploying / complete / error) ──────────────────────── */}
      <section className={`deck ${showStage ? "active" : ""}`} id="deck">
        <div className="wrap">
          <div className="deck-head">
            <div className="deck-target">
              <button className="deck-back" onClick={backToIdle} aria-label="New probe">
                ← new probe
              </button>
              <div className="deck-target-url mono">{deckUrl}</div>
            </div>
            <div className="deck-state">
              <span className="chip">
                <span className="pulse" />
                <span>{phase === "error" ? "halted" : deckPhaseLabel}</span>
              </span>
              {phase === "deploying" && (
                <button
                  onClick={cancel}
                  style={{
                    marginLeft: 12, fontFamily: "var(--mono)", fontSize: 11,
                    color: "var(--text-3)", letterSpacing: "0.06em",
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                  }}
                >
                  cancel
                </button>
              )}
            </div>
          </div>

          {/* ── 1. THE VISUAL — radial alone, centered ───────────── */}
          <div
            className="radial-stage"
            id="radial-stage"
            style={{ maxWidth: 620, margin: "0 auto 64px" }}
          >
            <svg
              className="radial-svg"
              viewBox="0 0 900 900"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              {WAVES.map((w, i) => (
                <circle key={`g${i}`} cx={CX} cy={CY} r={w.r} className="radial-guide" />
              ))}
              {NODE_GEOM.map((g) => {
                const v = nodeStates[g.i];
                const isFiring = v === "deploying";
                const isDone = v === "done-over" || v === "done-good" || v === "done-normal";
                const isBlocked = v === "blocked";
                let cls = "radial-line";
                if (isFiring) cls += " firing";
                if (isDone || isBlocked) {
                  cls += " done";
                  if (v === "done-over") cls += " over";
                  else if (v === "done-good") cls += " good";
                }
                const dashoffset = (isFiring || isDone || isBlocked) ? 0 : g.lineLen;
                return (
                  <line
                    key={`l${g.i}`}
                    x1={CX} y1={CY} x2={g.x} y2={g.y}
                    className={cls}
                    style={{ strokeDasharray: g.lineLen, strokeDashoffset: dashoffset }}
                  />
                );
              })}
              <circle cx={CX} cy={CY} r={30} className="radial-hub" />
              <circle cx={CX} cy={CY} r={20} className="radial-hub" />
              <circle cx={CX} cy={CY} r={11} className="radial-hub core" />
              {NODE_GEOM.map((g) => {
                const v = nodeStates[g.i];
                let cls = "radial-node";
                if (v === "deploying") cls += " deploying";
                if (v === "done-over") cls += " done over";
                if (v === "done-good") cls += " done good";
                if (v === "done-normal") cls += " done normal";
                if (v === "blocked") cls += " blocked";
                return (
                  <g key={`n${g.i}`} className={cls} transform={`translate(${g.x} ${g.y})`}>
                    <circle r={11} className="rn-ring" />
                    <circle r={5.5} className="rn-dot" />
                  </g>
                );
              })}
            </svg>

            <div className="radial-readout mono">
              <div className="rr-label label-mono">live deployment</div>
              <div className="rr-count">
                <span>{returnedAgents.length}</span>
                <span className="rr-of">/24 agents</span>
              </div>
              <div className="rr-time">
                <span>{elapsed.toFixed(1)}</span>s elapsed
              </div>
              <div className="rr-waves">
                {WAVES.map((w, i) => (
                  <div
                    key={i}
                    className={`rr-wave${i === activeWave && phase === "deploying" ? " active" : ""}`}
                  >
                    <span className="rw-dot" />
                    {w.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── While running — telemetry log ────────────────────── */}
          {phase === "deploying" && (
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <span className="label-mono" style={{ display: "block", marginBottom: 10 }}>
                Live returns
              </span>
              <div className="telemetry">
                {returnedAgents.slice().reverse().map((a) => {
                  const tier = a.network_tier ?? 0;
                  const net = ["datacenter", "residential", "mobile"][tier] || "—";
                  const succ = a.status === "success";
                  const state = succ && a.price != null && allPrices.length
                    ? (a.price === Math.max(...allPrices) ? "over" : a.price === Math.min(...allPrices) ? "good" : "")
                    : "";
                  const cls = `tele-row${state ? " " + state : ""}`;
                  return (
                    <div key={a.agent_id} className={cls}>
                      <span className="tele-ok">{succ ? "✓" : "×"}</span>
                      <span className="tele-city">{agentLabelCity(a)}</span>
                      <span className="tele-net">{net}</span>
                      <span className="tele-price tnum">
                        {a.price != null ? `$${a.price}` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────── */}
          {phase === "error" && errorMsg && (
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              <div style={{
                padding: "20px 22px",
                border: "1px solid var(--over-line)",
                background: "var(--over-soft)",
                borderRadius: "var(--r)",
                color: "var(--over)",
                fontFamily: "var(--mono)", fontSize: 13,
                marginBottom: 18,
              }}>
                {errorMsg}
              </div>
              {lastUrlRef.current && (
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button className="btn btn-primary" onClick={retry}>
                    ↻ retry probe
                  </button>
                  <button className="btn btn-ghost" onClick={backToIdle}>
                    new probe
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── 2-7. THE DETAILED RESULT — full width, scrolls naturally ── */}
          {phase === "complete" && verdict && report && (
            <div style={{ maxWidth: 880, margin: "0 auto" }}>

              {/* 2. Headline + topology */}
              <ResultSection eyebrow="01 · verdict">
                <div
                  className="topology-badge"
                  style={{
                    color: verdict.color,
                    borderColor: verdict.color + "55",
                    background: verdict.color + "14",
                    marginBottom: 22,
                  }}
                >
                  <span
                    className="tb-dot"
                    style={{ background: verdict.color, boxShadow: `0 0 8px ${verdict.color}` }}
                  />
                  {verdict.label} pricing
                </div>
                <div className="ev-spread-label label-mono">Hidden premium · what you're overpaying</div>
                <div className="ev-spread serif tnum" style={{ marginBottom: 10 }}>
                  +${verdict.spread}
                </div>
                <div className="ev-spread-sub mono" style={{ marginBottom: 22 }}>
                  {verdict.pct}% over the cheapest result · {verdict.successCount}/{verdict.totalCount} agents returned in {verdict.elapsed?.toFixed?.(1) || "?"}s
                </div>
                <p className="verdict-text" style={{ marginTop: 0, color: "var(--text)" }}>
                  {verdict.blurb}
                </p>
                {verdict.top && verdict.low && (
                  <p className="verdict-text" style={{ color: "var(--text)" }}>
                    An identity presenting as{" "}
                    <span className="over">{agentLabelCity(verdict.top)}</span> was quoted{" "}
                    <span className="over">${verdict.top.price}</span>.{" "}
                    An identity presenting as{" "}
                    <span className="good">{agentLabelCity(verdict.low)}</span> was quoted{" "}
                    <span className="good">${verdict.low.price}</span> for the identical listing.{" "}
                    The gap is{" "}
                    <strong style={{ color: "var(--text)" }}>${verdict.spread}</strong>
                    {verdict.dominantName && (
                      <>
                        {" "}— and the dominant driver in the data was{" "}
                        <strong style={{ color: "var(--text)" }}>{verdict.dominantName}</strong>.
                      </>
                    )}
                  </p>
                )}
              </ResultSection>

              {/* 3. Stats grid */}
              <ResultSection eyebrow="02 · numbers">
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 28,
                }}>
                  <Stat label="Baseline" value={verdict.baseline != null ? `$${verdict.baseline}` : "—"} />
                  <Stat label="Mean" value={verdict.mean != null ? `$${Math.round(verdict.mean)}` : "—"} />
                  <Stat label="Range" value={verdict.range ? `$${verdict.range[0]} – $${verdict.range[1]}` : "—"} />
                  <Stat label="Spread" value={`$${verdict.spread}`} accent="over" />
                  <Stat label="% over baseline" value={`${verdict.pct}%`} accent="over" />
                  <Stat label="Discrimination index" value={`${verdict.index}/100`} />
                </div>
                <div className="ev-index" style={{ marginTop: 26 }}>
                  <div className="evi-track">
                    <div
                      className="evi-fill in"
                      style={{ ["--w" as string]: verdict.index + "%" } as React.CSSProperties}
                    />
                  </div>
                </div>
                <p className="verdict-text" style={{ marginTop: 18, color: "var(--text)" }}>
                  The <strong style={{ color: "var(--text)" }}>discrimination index</strong> rolls
                  the spread and how many vectors contributed into a single 0–100 score. Above 60
                  means at least one identity signal materially moved the price; above 80 means
                  several signals stacked.
                </p>
              </ResultSection>

              {/* 3. Drivers — neutral, observational only */}
              <ResultSection eyebrow="03 · drivers">
                <p className="verdict-text" style={{ marginBottom: 24, color: "var(--text)" }}>
                  Four signals were tested. Each bar shows how much that one variable
                  moved the price on its own, holding the others as steady as the sample allowed.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {topVectors.map(v => (
                    <div key={v.key}>
                      <div className="impact-row" style={{ marginBottom: 10 }}>
                        <span className="impact-name mono" style={{ width: "auto", minWidth: 90, color: "var(--text)" }}>
                          {v.info.label}
                        </span>
                        <div className="impact-track">
                          <div
                            className="impact-fill"
                            style={{
                              width: `${(v.pct / v.max) * 100}%`,
                              background: v.significant
                                ? "linear-gradient(90deg, var(--cobalt), var(--cobalt-bright))"
                                : "var(--text-4)",
                            }}
                          />
                        </div>
                        <span className="impact-val mono" style={{ color: v.significant ? "var(--text)" : "var(--text-3)" }}>
                          {v.significant ? `${v.pct}%` : "n/s"}
                        </span>
                      </div>
                      <div style={{
                        fontFamily: "var(--sans)", fontSize: 13.5,
                        color: "var(--text)", lineHeight: 1.65,
                        padding: "0 0 0 102px",
                      }}>
                        <div style={{ marginBottom: 4 }}>{v.info.what}</div>
                        {v.significant && (
                          <div style={{ color: "var(--text-2)", fontFamily: "var(--mono)", fontSize: 11, margin: "6px 0" }}>
                            {v.high} ~${Math.round(v.highPrice)} &nbsp;vs&nbsp; {v.low} ~${Math.round(v.lowPrice)}
                            &nbsp;·&nbsp; gap ${Math.round(v.delta)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ResultSection>

              {/* 4. Per-agent table */}
              <ResultSection eyebrow="04 · all 24 agents">
                <p className="verdict-text" style={{ marginBottom: 22, color: "var(--text)" }}>
                  Every identity we deployed, sorted by price (most expensive first). Agents that
                  saw the highest prices are marked red; the cheapest, green.
                </p>
                <div style={{
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-sm)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 110px 100px 70px",
                    gap: 12,
                    padding: "12px 18px",
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--line)",
                    fontFamily: "var(--mono)",
                    fontSize: 10.5, textTransform: "uppercase",
                    letterSpacing: "0.16em", color: "var(--text-3)",
                  }}>
                    <span>#</span>
                    <span>Profile</span>
                    <span>Network</span>
                    <span>Status</span>
                    <span style={{ textAlign: "right" }}>Price</span>
                  </div>
                  {report.agents.slice().sort((a, b) => (b.price ?? -1) - (a.price ?? -1)).map((a, idx) => {
                    const tier = a.network_tier ?? 0;
                    const net = ["Datacenter", "Residential", "Mobile"][tier] || "—";
                    let priceColor = "var(--text-2)";
                    if (a.price != null && allPrices.length > 1) {
                      const hi = Math.max(...allPrices), lo = Math.min(...allPrices);
                      if (a.price === hi) priceColor = "var(--over)";
                      else if (a.price === lo) priceColor = "var(--good)";
                    }
                    return (
                      <div
                        key={a.agent_id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "44px 1fr 110px 100px 70px",
                          gap: 12,
                          padding: "13px 18px",
                          borderTop: idx === 0 ? "none" : "1px solid var(--line)",
                          fontFamily: "var(--mono)",
                          fontSize: 12,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ color: "var(--text-3)" }}>{a.agent_id.replace("AGENT_", "#")}</span>
                        <span style={{ color: "var(--text-2)" }}>{agentLabelCity(a)}</span>
                        <span style={{ color: "var(--text-3)" }}>{net}</span>
                        <span style={{ color: a.status === "success" ? "var(--good)" : "var(--over)" }}>
                          {a.status}
                        </span>
                        <span style={{ color: priceColor, textAlign: "right", fontWeight: 500 }}>
                          {a.price != null ? `$${a.price}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ResultSection>

              {/* 5. Actions */}
              <ResultSection eyebrow="05 · take it with you">
                <p className="verdict-text" style={{ marginBottom: 22, color: "var(--text)" }}>
                  Download a printable PDF of this report, share it with someone, or export the
                  raw data for your own analysis.
                </p>
                <div className="verdict-actions" style={{ marginTop: 0 }}>
                  <button
                    className="btn btn-primary"
                    onClick={downloadPDF}
                    disabled={pdfBusy}
                  >
                    {pdfBusy ? "Generating…" : "↓ Download PDF report"}
                  </button>
                  <button className="btn btn-ghost" onClick={copyShare}>
                    {copyLabel}
                  </button>
                  <button className="btn btn-ghost" onClick={exportJSON}>
                    Export JSON
                  </button>
                  <button className="btn btn-ghost" onClick={backToIdle}>
                    New probe →
                  </button>
                </div>
              </ResultSection>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

/* ─── Layout helpers ─────────────────────────────────────────────────── */

function ResultSection({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <section style={{
      paddingTop: 40,
      paddingBottom: 40,
      borderTop: "1px solid var(--line)",
    }}>
      <div className="label-mono" style={{ marginBottom: 22, color: "var(--cobalt-bright)" }}>
        {eyebrow}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "over" | "good" }) {
  const c =
    accent === "over" ? "var(--over)" :
    accent === "good" ? "var(--good)" :
                        "var(--text)";
  return (
    <div>
      <div className="label-mono" style={{ marginBottom: 8 }}>{label}</div>
      <div
        className="tnum"
        style={{
          fontFamily: "var(--mono)", fontSize: 22,
          color: c, letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
    </div>
  );
}
