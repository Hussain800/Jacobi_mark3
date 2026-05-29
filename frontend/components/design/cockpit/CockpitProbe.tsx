"use client";

/**
 * CockpitProbe — Phase C port of probe.html + probe.js onto live JACOBI.
 *
 * Two states (same as the static prototype):
 *   - idle:  command input + 5 sample case rows
 *   - deck:  24-agent radial web + telemetry → verdict
 *
 * What changed from probe.js: every API call is the real backend.
 *   - POST /api/probe                       (kicks off a probe)
 *   - poll GET /api/result/{session_id}     (1s cadence, 3-min timeout)
 *   - POST /api/analyze                     (final verdict)
 *   - demo mode (useCache) uses DEMO_REPORT + /api/analyze-demo, same
 *     scripted wave reveal as before
 *   - Cancel halts polling without firing analyze
 *   - probe-conversations localStorage write on completion (history)
 *
 * The radial-web visualization is driven by the backend's per-agent
 * status as it lands. The progressive `firing → done.over/good/normal`
 * class transitions mirror probe.js exactly, but each node maps to a
 * real backend `AGENT_NN`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ─── Types & helpers ────────────────────────────────────────────────── */

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
  discrimination_score?: number;
}

/* ─── Sample cases (used for the "or open a case" list on idle) ──── */

const CASES = [
  { name: "Leela Palace Bangalore", host: "www.booking.com", url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html", base: 245 },
  { name: "Tokyo Hotels Search",    host: "www.booking.com", url: "https://www.booking.com/searchresults.html?ss=Tokyo", base: 120 },
  { name: "Knickerbocker NYC",      host: "www.booking.com", url: "https://www.booking.com/hotel/us/the-knickerbocker.html", base: 350 },
  { name: "DXB → KTM Flights",      host: "www.google.com",  url: "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB", base: 420 },
  { name: "Wireless Headphones",    host: "www.amazon.com",  url: "https://www.amazon.com/s?k=wireless+headphones", base: 65 },
];

/* ─── Radial web geometry — mirrors probe.js exactly ───────────────── */

const WAVES = [
  { label: "Wave 1 · datacenter",  r: 150 },
  { label: "Wave 2 · residential", r: 250 },
  { label: "Wave 3 · mobile",      r: 350 },
];
const CX = 450;
const CY = 450;

interface NodeGeom {
  i: number;
  wave: number;
  posInWave: number;
  angle: number;
  x: number;
  y: number;
  lineLen: number;
}

function buildGeometry(): NodeGeom[] {
  const out: NodeGeom[] = [];
  for (let i = 0; i < 24; i++) {
    const wave = Math.floor(i / 8);
    const posInWave = i % 8;
    const w = WAVES[wave];
    const offset = wave * 0.39 - Math.PI / 2;
    const angle = (posInWave / 8) * Math.PI * 2 + offset;
    const x = CX + w.r * Math.cos(angle);
    const y = CY + w.r * Math.sin(angle);
    const lineLen = Math.hypot(x - CX, y - CY);
    out.push({ i, wave, posInWave, angle, x, y, lineLen });
  }
  return out;
}

const NODE_GEOM = buildGeometry();

type NodeVis = "pending" | "deploying" | "done-over" | "done-good" | "done-normal" | "blocked";

function classifyAgent(a: BackendAgent | undefined, baselinePrice: number | null, allPrices: number[]): NodeVis {
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
  // Backend labels look like "AGENT_05 LOCATION HIGH SAN FRANCISCO".
  // Strip "AGENT_NN" prefix; show the rest in title case.
  const rest = (a.label || a.agent_id).replace(/^AGENT_\d+\s*/i, "").trim();
  if (!rest) return a.agent_id;
  return rest;
}

const TOPO: Record<string, [string, string]> = {
  uniform:     ["#3ad79f", "Uniform"],
  selective:   ["#d8b06a", "Selective"],
  progressive: ["#ff9d52", "Progressive"],
  aggressive:  ["#ff5468", "Aggressive"],
};

/* ─── Demo data (matches dashboard.tsx's DEMO_REPORT) ────────────── */

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
  total_agents: 24,
  successful_agents: 22,
  failed_agents: 1,
  detected_agents: 1,
  elapsed_seconds: 8.7,
  baseline_price: 245,
  mean_price: 252,
  all_prices: Object.fromEntries(DEMO_AGENTS.filter(a => a.price !== null).map(a => [a.agent_id, a.price])),
  price_range: [221, 278],
  max_price_spread: 57,
  max_price_spread_pct: 23.3,
  gradients: [
    { variable_name: "location",       state_high: "High Income",   state_low: "Low Income",     mean_price_high: 268.3, mean_price_low: 226.7, delta: 41.6, delta_pct: 17,   pooled_std: 2.5, t_statistic: 16.6, significant: true,  n_high: 3, n_low: 3 },
    { variable_name: "device",         state_high: "Premium Device", state_low: "Budget Device",  mean_price_high: 269.5, mean_price_low: 236,   delta: 33.5, delta_pct: 13.7, pooled_std: 3.1, t_statistic: 10.8, significant: true,  n_high: 4, n_low: 4 },
    { variable_name: "cookie_profile", state_high: "Aged Profile",   state_low: "Fresh Profile",  mean_price_high: 247.5, mean_price_low: 245,   delta: 2.5,  delta_pct: 1,    pooled_std: 4.2, t_statistic: 0.6,  significant: false, n_high: 2, n_low: 2 },
    { variable_name: "referrer",       state_high: "Aggregator",     state_low: "Direct",         mean_price_high: 257,   mean_price_low: 245,   delta: 12,   delta_pct: 4.9,  pooled_std: 3.8, t_statistic: 3.16, significant: true,  n_high: 2, n_low: 2 },
  ],
  discrimination_index: 87.1,
  topology_class: "progressive",
  discrimination_score: 84.2,
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

  // Live state
  const [report, setReport] = useState<TopologyReport | null>(null);
  const [returnedAgents, setReturnedAgents] = useState<BackendAgent[]>([]);
  const [activeWave, setActiveWave] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);

  // Refs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const lastUrlRef = useRef("");
  const lastNameRef = useRef("");
  const cancelledRef = useRef(false);

  /* Auto-run when arriving with ?url=... */
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

  /* Cleanup on unmount */
  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current)    clearInterval(tickRef.current);
  }, []);

  const saveConv = useCallback((r: TopologyReport) => {
    try {
      const existing = JSON.parse(localStorage.getItem("probe-conversations") || "[]");
      existing.unshift({
        id: r.session_id,
        session_id: r.session_id,
        title: (r.target_name || r.target_url || "Probe").slice(0, 50),
        timestamp: Date.now(),
        targetUrl: r.target_url,
        targetName: r.target_name,
        baselinePrice: r.baseline_price,
        savings: r.max_price_spread,
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

    // Elapsed timer
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

  /* Demo mode — scripted wave reveal */
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

    // Optional /api/analyze-demo
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

  /* Live mode — real backend */
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
          // Wave label
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

  /* Derived: per-node visual state */
  const allPrices = useMemo(
    () => returnedAgents.filter(a => a.price != null && a.status === "success").map(a => a.price as number),
    [returnedAgents],
  );

  const nodeStates: NodeVis[] = useMemo(() => {
    return NODE_GEOM.map((g) => {
      const idStr = `AGENT_${String(g.i).padStart(2, "0")}`;
      const a = returnedAgents.find(x => x.agent_id === idStr);
      const succ = returnedAgents.length;
      if (a) return classifyAgent(a, report?.baseline_price ?? null, allPrices);
      // Not yet returned. Show as deploying if its wave is the active wave.
      if (phase === "deploying" && g.wave <= activeWave) return "deploying";
      return "pending";
    });
  }, [returnedAgents, allPrices, phase, activeWave, report?.baseline_price]);

  /* Verdict numbers */
  const verdict = useMemo(() => {
    if (!report) return null;
    const cls = report.topology_class || "selective";
    const [color, label] = TOPO[cls] || TOPO.selective;
    const spread = Math.round(report.max_price_spread || 0);
    const pct = Math.round(report.max_price_spread_pct || 0);
    const index = Math.round(report.discrimination_index || 0);
    const sortedAgents = report.agents.filter(a => a.status === "success" && a.price != null);
    const top = sortedAgents.reduce((m, a) => (a.price! > (m.price ?? 0) ? a : m), sortedAgents[0]);
    const low = sortedAgents.reduce((m, a) => (a.price! < (m.price ?? Infinity) ? a : m), sortedAgents[0]);
    const dominant = report.gradients
      .filter(g => g.significant)
      .reduce((m, g) => (Math.abs(g.delta_pct) > Math.abs(m?.delta_pct ?? 0) ? g : m), null as Gradient | null);
    return {
      color, label, spread, pct, index,
      top: top ? { city: agentLabelCity(top), price: top.price } : null,
      low: low ? { city: agentLabelCity(low), price: low.price } : null,
      dominant: dominant?.variable_name || "location",
      successCount: report.successful_agents,
      totalCount: report.total_agents,
      gradients: report.gradients,
    };
  }, [report]);

  const topVectors = useMemo(() => {
    if (!verdict) return [];
    const max = Math.max(1, ...verdict.gradients.map(g => Math.abs(g.delta_pct)));
    return verdict.gradients
      .slice()
      .sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
      .slice(0, 4)
      .map(g => ({
        name: g.variable_name.charAt(0).toUpperCase() + g.variable_name.slice(1).replace("_", " "),
        pct: Math.round(Math.abs(g.delta_pct)),
        max,
      }));
  }, [verdict]);

  const [copyLabel, setCopyLabel] = useState("Copy result link");
  const copyShare = useCallback(() => {
    if (!report?.session_id) return;
    try {
      navigator.clipboard.writeText(`${window.location.origin}/share/${report.session_id}`);
      setCopyLabel("Link copied ✓");
      setTimeout(() => setCopyLabel("Copy result link"), 1800);
    } catch {}
  }, [report?.session_id]);

  /* ─── Render ──────────────────────────────────────────────────────── */

  return (
    <main className="probe-main">
      {/* ── COCKPIT (idle) ─────────────────────────────────────────── */}
      <section className={`cockpit ${phase === "idle" ? "active" : ""}`} id="cockpit">
        <div className="wrap cockpit-wrap">
          <span className="eyebrow cockpit-eyebrow">
            <span className="dot">●</span> JACOBI · probe cockpit
          </span>
          <h1 className="cockpit-h1 serif">
            Paste a URL. <span className="cobalt-i">Twenty-four shoppers</span> go to work.
          </h1>

          <form
            className="probe-instrument cockpit-bar"
            id="cockpit-form"
            onSubmit={handleSubmit}
          >
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

      {/* ── DECK (deploying / complete / error) ────────────────────── */}
      <section className={`deck ${phase !== "idle" ? "active" : ""}`} id="deck">
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

          <div className="deck-grid">
            {/* ── Radial web ────────────────────────────────── */}
            <div className="radial-stage" id="radial-stage">
              <svg
                className="radial-svg"
                viewBox="0 0 900 900"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
              >
                {/* guides */}
                {WAVES.map((w, i) => (
                  <circle key={`g${i}`} cx={CX} cy={CY} r={w.r} className="radial-guide" />
                ))}

                {/* lines */}
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
                      style={{
                        strokeDasharray: g.lineLen,
                        strokeDashoffset: dashoffset,
                      }}
                    />
                  );
                })}

                {/* hub */}
                <circle cx={CX} cy={CY} r={30} className="radial-hub" />
                <circle cx={CX} cy={CY} r={20} className="radial-hub" />
                <circle cx={CX} cy={CY} r={11} className="radial-hub core" />

                {/* nodes */}
                {NODE_GEOM.map((g) => {
                  const v = nodeStates[g.i];
                  let cls = "radial-node";
                  if (v === "deploying") cls += " deploying";
                  if (v === "done-over") cls += " done over";
                  if (v === "done-good") cls += " done good";
                  if (v === "done-normal") cls += " done normal";
                  if (v === "blocked") cls += " blocked";
                  return (
                    <g
                      key={`n${g.i}`}
                      className={cls}
                      transform={`translate(${g.x} ${g.y})`}
                    >
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

            {/* ── Rail: telemetry → verdict ─────────────────── */}
            <aside className="rail">
              {phase === "deploying" || phase === "error" ? (
                <div className="rail-live">
                  <span className="label-mono">telemetry</span>
                  <div className="telemetry">
                    {returnedAgents.slice().reverse().slice(0, 8).map((a) => {
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
                  {phase === "error" && errorMsg && (
                    <div style={{
                      marginTop: 22, padding: "14px 16px",
                      border: "1px solid var(--over-line)",
                      background: "var(--over-soft)",
                      borderRadius: "var(--r-sm)",
                      fontFamily: "var(--mono)", fontSize: 12,
                      color: "var(--over)",
                    }}>
                      {errorMsg}
                      {lastUrlRef.current && (
                        <button
                          onClick={retry}
                          style={{
                            display: "block", marginTop: 12,
                            fontFamily: "var(--mono)", fontSize: 11,
                            color: "var(--cobalt-bright)",
                            background: "none", border: "1px solid var(--cobalt-line)",
                            borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                            letterSpacing: "0.04em",
                          }}
                        >
                          ↻ retry probe
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {phase === "complete" && verdict && (
                <div className="rail-verdict">
                  <div
                    className="topology-badge"
                    style={{
                      color: verdict.color,
                      borderColor: verdict.color + "55",
                      background: verdict.color + "14",
                    }}
                  >
                    <span
                      className="tb-dot"
                      style={{ background: verdict.color, boxShadow: `0 0 8px ${verdict.color}` }}
                    />
                    {verdict.label}
                  </div>
                  <div className="ev-spread-label label-mono">Hidden premium</div>
                  <div className="ev-spread serif tnum">+${verdict.spread}</div>
                  <div className="ev-spread-sub mono">
                    {verdict.pct}% over baseline · {verdict.successCount}/{verdict.totalCount} agents returned
                  </div>

                  <div className="ev-index">
                    <div className="evi-top">
                      <span className="label-mono">Discrimination index</span>
                      <span className="evi-val mono">
                        {verdict.index}<span className="muted">/100</span>
                      </span>
                    </div>
                    <div className="evi-track">
                      <div
                        className="evi-fill in"
                        style={{ ["--w" as string]: verdict.index + "%" } as React.CSSProperties}
                      />
                    </div>
                  </div>

                  <p className="verdict-text sec">
                    {verdict.top && verdict.low ? (
                      <>
                        {/^[aeiou]/i.test(verdict.label) ? "An " : "A "}
                        <strong style={{ color: verdict.color }}>{verdict.label.toLowerCase()}</strong> pricing topology.{" "}
                        A shopper in{" "}
                        <span className="over">{verdict.top.city}</span> paid{" "}
                        <span className="over">${verdict.top.price}</span> —{" "}
                        <span className="over">${verdict.spread} more</span>{" "}
                        than <span className="good">{verdict.low.city}</span>{" "}
                        (<span className="good">${verdict.low.price}</span>) for the identical listing.{" "}
                        The dominant signal was{" "}
                        <strong style={{ color: "var(--text)" }}>{verdict.dominant}</strong>.
                      </>
                    ) : (
                      <>Topology: {verdict.label.toLowerCase()}.</>
                    )}
                  </p>

                  <div className="impact">
                    <span className="label-mono">Price impact by vector</span>
                    <div className="impact-bars">
                      {topVectors.map(v => (
                        <div key={v.name} className="impact-row">
                          <span className="impact-name mono">{v.name}</span>
                          <div className="impact-track">
                            <div
                              className="impact-fill"
                              style={{ width: `${(v.pct / v.max) * 100}%` }}
                            />
                          </div>
                          <span className="impact-val mono">{v.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="verdict-actions">
                    <button className="btn btn-primary" onClick={copyShare}>
                      {copyLabel}
                    </button>
                    <button className="btn btn-ghost" onClick={backToIdle}>
                      new probe →
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
