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
import { createClient } from "../../../lib/supabase/client";

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

// Preset case studies — always use the curated demo result so the
// experience is deterministic for demos / investors. Users who want to
// run a live probe can paste their own URL into the input above.
const CASE_URLS = new Set<string>();
const CASES = [
  { name: "Leela Palace Bangalore", host: "www.booking.com", url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html", base: 245 },
  { name: "Tokyo Hotels Search",    host: "www.booking.com", url: "https://www.booking.com/searchresults.html?ss=Tokyo", base: 120 },
  { name: "Knickerbocker NYC",      host: "www.booking.com", url: "https://www.booking.com/hotel/us/the-knickerbocker.html", base: 350 },
  { name: "DXB → KTM Flights",      host: "www.google.com",  url: "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB", base: 420 },
  { name: "Wireless Headphones",    host: "www.amazon.com",  url: "https://www.amazon.com/s?k=wireless+headphones", base: 65 },
];
CASES.forEach(c => CASE_URLS.add(c.url));

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
  const apiBase = ""; // relative paths go through Vercel/Next.js proxy

  const [phase, setPhase] = useState<Phase>("idle");
  const [input, setInput] = useState(initialUrl || "");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckPhaseLabel, setDeckPhaseLabel] = useState("deploying");
  const [publishToBoard, setPublishToBoard] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Backend rejects /api/probe with 401 (sign-in required) or 402 (quota
  // exhausted). We surface that state as a structured block instead of a
  // generic "Server error: 401" so the user sees a real next step.
  const [rejection, setRejection] = useState<null | {
    code: "auth_required" | "quota_exceeded" | "unknown";
    message: string;
    used?: number;
    limit?: number | null;
    tier?: string;
  }>(null);

  const [report, setReport] = useState<TopologyReport | null>(null);
  const [returnedAgents, setReturnedAgents] = useState<BackendAgent[]>([]);
  const [activeWave, setActiveWave] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<"verdict" | "evidence">("verdict");

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

    setRejection(null);
    // Preset case studies always show the curated demo result so the
    // experience is deterministic for live demos and investor pitches.
    // A user pasting their own URL falls through to the live engine.
    if (CASE_URLS.has(url)) {
      runDemo(url, name);
      return;
    }
    runLive(url, name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, publishToBoard]);

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
      // SaaS auth: attach Supabase access token so the backend can identify
      // the user, run the quota check, and stamp user_id on the saved probe.
      // getSession() is a local read; refresh if the token is missing/stale
      // so a long-lived tab doesn't surface as a spurious "Sign in" prompt.
      const sb = createClient();
      let { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) {
        try {
          const { data: refreshed } = await sb.auth.refreshSession();
          session = refreshed.session;
        } catch { /* user truly signed out — backend will 401 */ }
      }
      const token = session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const r1 = await fetch(`${apiBase}/api/probe`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          target_url: url,
          target_name: name,
          publish_to_board: publishToBoard,
        }),
      });

      if (r1.status === 401 || r1.status === 402) {
        // Structured rejection from the backend (auth_required / quota_exceeded).
        let payload: { detail?: { code?: string; message?: string; used?: number; limit?: number | null; tier?: string } } = {};
        try { payload = await r1.json(); } catch { /* ignore */ }
        const d = payload.detail || {};
        stopTimers();
        setRejection({
          code: (d.code as "auth_required" | "quota_exceeded") || (r1.status === 401 ? "auth_required" : "quota_exceeded"),
          message: d.message || (r1.status === 401 ? "Sign in to run a live probe." : "Monthly probe limit reached."),
          used: d.used,
          limit: d.limit,
          tier: d.tier,
        });
        setPhase("idle");
        return;
      }
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
              // Friendly fallback message — "No valid prices extracted"
              // is the engine telling us 24-out-of-24 agents got blocked
              // by the target site's bot-detection. Surface that as a
              // clear next-step instead of a raw error string.
              const raw = (data.error || "").toLowerCase();
              const blocked =
                raw.includes("no valid prices") ||
                raw.includes("captcha") ||
                raw.includes("blocked") ||
                raw.includes("detected");
              setErrorMsg(
                blocked
                  ? "This site blocked our 24 agents at the perimeter. Try one of the case studies below to see how JACOBI works."
                  : data.error || "Probe failed."
              );
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
      const M = 50;                                  // generous outer margin
      const COL_W = W - 2 * M;                       // usable content width

      /* ──────────────────────────────────────────────────────────────
       * JACOBI · TWO-PAGE FORENSIC REPORT
       *
       * Design discipline:
       *  - All vertical layout uses a `y` cursor that gets incremented
       *    AFTER each section by a measured/reserved height. Never
       *    place by absolute Y.
       *  - Multi-line text always renders via splitTextToSize +
       *    iterating all lines; never `lines[0]` which silently truncates.
       *  - Each section has a fixed reserved height; if its content is
       *    shorter, we leave whitespace (that's good design, not waste).
       *  - Numbers and currency use Courier for tabular alignment.
       *  - Dark canvas + monochrome typography + cobalt accent only —
       *    no rainbow charts, no AI-slop gradients.
       * ──────────────────────────────────────────────────────────── */

      // ─── Palette (matches the live app brand) ─────────────────
      const C = {
        ink:     [10, 12, 18] as const,    // canvas
        surface: [20, 24, 34] as const,    // card tint
        surface2:[26, 31, 44] as const,    // panel tint
        line:    [42, 50, 70] as const,    // hairline
        line2:   [56, 65, 88] as const,    // stronger divider
        text:    [240, 243, 250] as const, // primary
        text2:   [180, 188, 204] as const, // body
        text3:   [115, 125, 145] as const, // muted
        cobalt:  [110, 146, 255] as const, // accent
        over:    [255, 84, 104] as const,  // alert / high price
        good:    [58, 215, 159] as const,  // baseline / low price
        amber:   [255, 167, 82] as const,  // mid-warning
      };
      const setFill = (c: readonly [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
      const setText = (c: readonly [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
      const setStroke = (c: readonly [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

      const dateLine = new Date().toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
      const sessionShort = (verdict.session || "—").slice(0, 8);

      // Topology accent color
      const topoColor =
        verdict.label.toLowerCase() === "uniform" ? C.good :
        verdict.label.toLowerCase() === "aggressive" ? C.over :
        C.amber;

      // ─── Reusable: page chrome ────────────────────────────────
      const drawPageChrome = (pageNum: 1 | 2) => {
        // Dark canvas
        setFill(C.ink);
        doc.rect(0, 0, W, H, "F");

        // Top accent tick
        setStroke(C.cobalt);
        doc.setLineWidth(1.6);
        doc.line(M, 38, M + 36, 38);

        // Brand mark — JAC[ ]BI rendered as text-only, monospaced.
        // CRITICAL: measure ALL widths in the brand font BEFORE switching
        // to the tagline font, otherwise the tagline X is computed in
        // the wrong font and overlaps the wordmark.
        doc.setFont("courier", "bold").setFontSize(11);
        const jacW = doc.getTextWidth("JAC");
        const bracketW = doc.getTextWidth("[ ]");
        const biW = doc.getTextWidth("BI");
        const brandTotalW = jacW + 2 + bracketW + 4 + biW;
        setText(C.text);
        doc.text("JAC", M, 60);
        setText(C.cobalt);
        doc.text("[ ]", M + jacW + 2, 60);
        setText(C.text);
        doc.text("BI", M + jacW + 2 + bracketW + 4, 60);

        // Tagline — anchor X off pre-measured brand width.
        doc.setFont("helvetica", "normal").setFontSize(7);
        setText(C.text3);
        doc.text("PRICING TOPOLOGY · FORENSIC REPORT", M + brandTotalW + 16, 60);

        // Right header: date + session
        doc.setFont("courier", "normal").setFontSize(7.5);
        setText(C.text3);
        doc.text(dateLine.toUpperCase(), W - M, 54, { align: "right" });
        doc.text(`SESSION ${sessionShort}`, W - M, 65, { align: "right" });

        // Header rule
        setStroke(C.line);
        doc.setLineWidth(0.5);
        doc.line(M, 78, W - M, 78);

        // Footer rule
        doc.line(M, H - 50, W - M, H - 50);

        // Footer text
        doc.setFont("helvetica", "normal").setFontSize(7);
        setText(C.text3);
        doc.text(
          "24-agent adversarial pricing probe",
          M, H - 32,
        );
        doc.text(
          `Page ${pageNum} of 2  ·  jacobi.report/${sessionShort}`,
          W - M, H - 32, { align: "right" },
        );
      };

      /* ═══════════════════════════════════════════════════════════
       * PAGE 1 — VERDICT
       * ═══════════════════════════════════════════════════════════ */

      drawPageChrome(1);
      let y = 110;

      // ─── 1. Title + target ─────────────────────────────────────
      doc.setFont("helvetica", "bold").setFontSize(22);
      setText(C.text);
      doc.text("Pricing topology analysis", M, y);
      y += 26;

      // Target name (italic, big)
      if (verdict.targetName) {
        doc.setFont("helvetica", "italic").setFontSize(13);
        setText(C.text2);
        const nameLines = doc.splitTextToSize(verdict.targetName, COL_W);
        doc.text(nameLines, M, y);
        y += nameLines.length * 16;
      }

      // Target URL (courier, smaller, muted)
      doc.setFont("courier", "normal").setFontSize(8.5);
      setText(C.text3);
      const urlLines = doc.splitTextToSize(verdict.target || "—", COL_W);
      doc.text(urlLines.slice(0, 2), M, y);
      y += Math.min(urlLines.length, 2) * 11 + 18;

      // ─── 2. Hero verdict card ─────────────────────────────────
      // Reserved height: 200 pts. Contents:
      //   left half: HIDDEN PREMIUM label · big $X · pct over baseline
      //   right half: DISCRIMINATION INDEX · big N/100 · gauge bar
      //   top of card: topology pill, centered horizontally
      const heroH = 180;
      setFill(C.surface);
      setStroke(C.line2);
      doc.setLineWidth(0.8);
      doc.roundedRect(M, y, COL_W, heroH, 8, 8, "FD");

      // Topology pill (top, centered)
      const pillLabel = verdict.label.toUpperCase();
      doc.setFont("helvetica", "bold").setFontSize(8);
      const pillTextW = doc.getTextWidth(pillLabel);
      const pillW = pillTextW + 36;
      const pillX = M + (COL_W - pillW) / 2;
      const pillY = y - 11;
      setFill(C.ink);  // outer ring (same as canvas) for "punched out" look
      doc.roundedRect(pillX - 4, pillY - 4, pillW + 8, 30, 14, 14, "F");
      setFill(topoColor);
      doc.roundedRect(pillX, pillY, pillW, 22, 11, 11, "F");
      // dot
      setFill(C.ink);
      doc.circle(pillX + 12, pillY + 11, 2.4, "F");
      setText(C.ink);
      doc.text(pillLabel, pillX + pillW / 2 + 5, pillY + 14.5, { align: "center" });

      // Divider down the middle
      setStroke(C.line);
      doc.setLineWidth(0.5);
      doc.line(M + COL_W / 2, y + 28, M + COL_W / 2, y + heroH - 18);

      // LEFT HALF — Hidden Premium
      const lhx = M + 28;
      doc.setFont("helvetica", "bold").setFontSize(8);
      setText(C.text3);
      doc.text("HIDDEN PREMIUM", lhx, y + 54);

      doc.setFont("helvetica", "bold").setFontSize(40);
      setText(C.text);
      const heroNum = verdict.spread > 0 ? `+$${verdict.spread}` : "$0";
      doc.text(heroNum, lhx, y + 100);

      doc.setFont("helvetica", "normal").setFontSize(9);
      setText(C.text2);
      doc.text(`${verdict.pct}% over baseline`, lhx, y + 122);

      doc.setFont("courier", "normal").setFontSize(8);
      setText(C.text3);
      doc.text(
        `${verdict.successCount}/${verdict.totalCount} IDENTITIES · ${(verdict.elapsed || 0).toFixed(1)}s`,
        lhx, y + 144,
      );

      // RIGHT HALF — Discrimination Index
      const rhx = M + COL_W / 2 + 28;
      doc.setFont("helvetica", "bold").setFontSize(8);
      setText(C.text3);
      doc.text("DISCRIMINATION INDEX", rhx, y + 54);

      doc.setFont("helvetica", "bold").setFontSize(40);
      setText(C.text);
      const indexStr = String(verdict.index);
      doc.text(indexStr, rhx, y + 100);
      // /100 suffix
      const indexW = doc.getTextWidth(indexStr);
      doc.setFont("helvetica", "normal").setFontSize(13);
      setText(C.text3);
      doc.text("/ 100", rhx + indexW + 6, y + 100);

      // Gauge bar
      const gaugeX = rhx, gaugeY = y + 122, gaugeW = COL_W / 2 - 56, gaugeH = 6;
      setFill(C.line);
      doc.roundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 3, 3, "F");
      const idxClamp = Math.max(0, Math.min(100, verdict.index));
      const fillW = (idxClamp / 100) * gaugeW;
      // 3-zone color: cobalt → amber → over
      const s1 = Math.min(fillW, gaugeW * 0.4);
      const s2 = Math.max(0, Math.min(fillW - gaugeW * 0.4, gaugeW * 0.3));
      const s3 = Math.max(0, fillW - gaugeW * 0.7);
      if (s1 > 0) { setFill(C.cobalt); doc.roundedRect(gaugeX, gaugeY, s1, gaugeH, 3, 3, "F"); }
      if (s2 > 0) { setFill(C.amber);  doc.rect(gaugeX + gaugeW * 0.4, gaugeY, s2, gaugeH, "F"); }
      if (s3 > 0) { setFill(C.over);   doc.rect(gaugeX + gaugeW * 0.7, gaugeY, s3, gaugeH, "F"); }

      doc.setFont("courier", "normal").setFontSize(7.5);
      setText(C.text3);
      doc.text("FAIR", gaugeX, gaugeY + 18);
      doc.text("HOSTILE", gaugeX + gaugeW, gaugeY + 18, { align: "right" });

      y += heroH + 26;

      // ─── 3. What this means — plain English ───────────────────
      doc.setFont("helvetica", "bold").setFontSize(8);
      setText(C.cobalt);
      doc.text("WHAT THIS MEANS", M, y);
      y += 16;

      doc.setFont("helvetica", "normal").setFontSize(10.5);
      setText(C.text);
      const summary =
        verdict.top && verdict.low && verdict.top.price !== verdict.low.price
          ? `An identity presenting as "${agentLabelCity(verdict.top)}" was quoted $${verdict.top.price}. ` +
            `An identity presenting as "${agentLabelCity(verdict.low)}" was quoted $${verdict.low.price} for the identical listing — ` +
            `a $${verdict.spread} gap${verdict.dominantName ? `. The dominant signal in the data was ${verdict.dominantName}.` : "."}`
          : verdict.label.toLowerCase() === "uniform"
            ? `All 24 synthetic identities received the same price across the four discrimination vectors tested. ` +
              `This is a positive finding — the listing's price does not appear to depend on the shopper's identity.`
            : verdict.blurb;
      const summaryLines = doc.splitTextToSize(summary, COL_W);
      doc.text(summaryLines, M, y);
      y += summaryLines.length * 14 + 22;

      // ─── 4. Endpoint cards (TOP / LOW quote) ──────────────────
      if (verdict.top && verdict.low) {
        const cardW = (COL_W - 16) / 2;
        const cardH = 84;

        // TOP quote (red)
        setFill(C.surface);
        setStroke(C.over);
        doc.setLineWidth(0.8);
        doc.roundedRect(M, y, cardW, cardH, 6, 6, "FD");
        // Cobalt-bar stripe top
        setFill(C.over);
        doc.rect(M, y, cardW, 2, "F");
        doc.setFont("helvetica", "bold").setFontSize(7.5);
        setText(C.over);
        doc.text("TOP QUOTE", M + 14, y + 18);
        doc.setFont("helvetica", "bold").setFontSize(24);
        setText(C.text);
        doc.text(`$${verdict.top.price}`, M + 14, y + 46);
        doc.setFont("helvetica", "normal").setFontSize(8.5);
        setText(C.text2);
        const topName = doc.splitTextToSize(agentLabelCity(verdict.top), cardW - 28);
        doc.text(topName.slice(0, 2), M + 14, y + 64);

        // LOW quote (green)
        const lowX = M + cardW + 16;
        setFill(C.surface);
        setStroke(C.good);
        doc.roundedRect(lowX, y, cardW, cardH, 6, 6, "FD");
        setFill(C.good);
        doc.rect(lowX, y, cardW, 2, "F");
        doc.setFont("helvetica", "bold").setFontSize(7.5);
        setText(C.good);
        doc.text("LOW QUOTE", lowX + 14, y + 18);
        doc.setFont("helvetica", "bold").setFontSize(24);
        setText(C.text);
        doc.text(`$${verdict.low.price}`, lowX + 14, y + 46);
        doc.setFont("helvetica", "normal").setFontSize(8.5);
        setText(C.text2);
        const lowName = doc.splitTextToSize(agentLabelCity(verdict.low), cardW - 28);
        doc.text(lowName.slice(0, 2), lowX + 14, y + 64);

        y += cardH + 26;
      }

      // ─── 5. Driver chart — what moved the price ───────────────
      if (topVectors.length > 0) {
        doc.setFont("helvetica", "bold").setFontSize(8);
        setText(C.cobalt);
        doc.text("WHAT MOVED THE PRICE", M, y);
        y += 18;

        const labelW = 130;
        const valueW = 50;
        const barX = M + labelW + 10;
        const barAvailW = COL_W - labelW - valueW - 20;
        const tvMax = Math.max(1, ...topVectors.map(v => v.pct));

        topVectors.forEach(v => {
          // Label
          doc.setFont("helvetica", "normal").setFontSize(10);
          setText(C.text);
          doc.text(v.info.label, M, y + 4);

          // Background track
          setFill(C.line);
          doc.roundedRect(barX, y - 2, barAvailW, 8, 4, 4, "F");

          // Fill (cobalt for significant, lighter line for non-significant)
          if (v.significant) {
            const w = Math.max(2, (v.pct / tvMax) * barAvailW);
            setFill(C.cobalt);
            doc.roundedRect(barX, y - 2, w, 8, 4, 4, "F");
          }

          // Value (right-aligned)
          doc.setFont("courier", "bold").setFontSize(10);
          setText(v.significant ? C.text : C.text3);
          const valStr = v.significant ? `${v.pct}%` : "n/s";
          doc.text(valStr, W - M, y + 4, { align: "right" });

          y += 22;
        });
      }

      /* ═══════════════════════════════════════════════════════════
       * PAGE 2 — METHOD + AGENT DATA
       * ═══════════════════════════════════════════════════════════ */
      doc.addPage();
      drawPageChrome(2);
      y = 110;

      // ─── Page 2 title ─────────────────────────────────────────
      doc.setFont("helvetica", "bold").setFontSize(22);
      setText(C.text);
      doc.text("Methodology & raw data", M, y);
      y += 32;

      // ─── 1. Method panel ──────────────────────────────────────
      doc.setFont("helvetica", "bold").setFontSize(8);
      setText(C.cobalt);
      doc.text("METHOD", M, y);
      y += 16;

      const methodPoints: [string, string][] = [
        ["24 synthetic identities",
         "8 datacenter + 8 residential + 8 mobile network tiers, dispatched in three waves over a 30-second window."],
        ["Four discrimination vectors",
         "Location (IP geo), device (user-agent + fingerprint), cookie profile (session history), referrer (origin)."],
        ["One variable at a time",
         "Identities are paired so each pair differs on exactly one vector. Confounders are held constant."],
        ["Welch's t-test per vector",
         "Bot-detected and failed responses are excluded. The remaining prices feed an unequal-variance t-test; an effect is reported when |t| > 2.0."],
      ];

      methodPoints.forEach(([heading, body]) => {
        doc.setFont("helvetica", "bold").setFontSize(10);
        setText(C.text);
        doc.text("•", M, y);
        doc.text(heading, M + 12, y);
        y += 14;
        doc.setFont("helvetica", "normal").setFontSize(9);
        setText(C.text2);
        const lines = doc.splitTextToSize(body, COL_W - 12);
        doc.text(lines, M + 12, y);
        y += lines.length * 12 + 10;
      });

      y += 10;

      // ─── 2. Distribution + table header in one band ───────────
      // (Stat cards were eating 78pt of vertical space, pushing the
      // 24-row table into the footer. Collapsed to a single inline
      // summary line so all 24 rows fit cleanly above the footer.)
      doc.setFont("helvetica", "bold").setFontSize(8);
      setText(C.cobalt);
      doc.text("DISTRIBUTION", M, y);
      doc.setFont("courier", "normal").setFontSize(9);
      setText(C.text);
      const distStr = [
        verdict.baseline != null ? `BASELINE $${Math.round(verdict.baseline)}` : null,
        verdict.mean     != null ? `MEAN $${Math.round(verdict.mean)}` : null,
        verdict.range    ? `RANGE $${Math.round(verdict.range[0])}–$${Math.round(verdict.range[1])}` : null,
        verdict.spread > 0 ? `SPREAD $${verdict.spread}` : "SPREAD $0",
      ].filter(Boolean).join("   ·   ");
      doc.text(distStr, M + 90, y);
      y += 20;

      // ─── 3. All 24 agents table ───────────────────────────────
      doc.setFont("helvetica", "bold").setFontSize(8);
      setText(C.cobalt);
      doc.text("ALL 24 IDENTITIES", M, y);
      y += 14;

      // Column widths sum to COL_W = 495
      const col = { num: 32, profile: 245, network: 80, status: 60, price: 78 };
      const rowH = 14;   // tightened from 16 so 24 rows fit above footer

      // Header row
      setFill(C.surface2);
      doc.roundedRect(M, y, COL_W, rowH + 4, 3, 3, "F");
      doc.setFont("helvetica", "bold").setFontSize(7);
      setText(C.text3);
      let cx = M + 10;
      doc.text("#", cx, y + 12); cx += col.num;
      doc.text("PROFILE", cx, y + 12); cx += col.profile;
      doc.text("NETWORK", cx, y + 12); cx += col.network;
      doc.text("STATUS", cx, y + 12); cx += col.status;
      doc.text("PRICE", W - M - 10, y + 12, { align: "right" });
      y += rowH + 6;

      const sortedAgents = report.agents
        .slice()
        .sort((a, b) => (b.price ?? -1) - (a.price ?? -1));

      const validPrices = sortedAgents.map(a => a.price).filter((p): p is number => p != null);
      const hi = validPrices.length ? Math.max(...validPrices) : null;
      const lo = validPrices.length ? Math.min(...validPrices) : null;

      sortedAgents.forEach((a, idx) => {
        // Alternating row tint
        if (idx % 2 === 0) {
          setFill(C.surface);
          doc.rect(M, y - 4, COL_W, rowH, "F");
        }

        const tier = a.network_tier ?? 0;
        const net = ["Datacenter", "Residential", "Mobile"][tier] || "—";
        const profile = agentLabelCity(a);
        const profileShort = profile.length > 40 ? profile.slice(0, 38) + "…" : profile;

        // # column
        doc.setFont("courier", "normal").setFontSize(8);
        setText(C.text3);
        cx = M + 10;
        doc.text(a.agent_id.replace("AGENT_", "#"), cx, y + 8);
        cx += col.num;

        // Profile
        doc.setFont("helvetica", "normal").setFontSize(8.5);
        setText(C.text2);
        doc.text(profileShort, cx, y + 8);
        cx += col.profile;

        // Network
        doc.setFont("helvetica", "normal").setFontSize(8);
        setText(C.text3);
        doc.text(net, cx, y + 8);
        cx += col.network;

        // Status (color-coded)
        const statusColor =
          a.status === "success" ? C.good :
          a.status === "detected" ? C.amber : C.text3;
        doc.setFont("helvetica", "bold").setFontSize(7.5);
        setText(statusColor);
        doc.text((a.status || "—").toUpperCase(), cx, y + 8);

        // Price (right-aligned, color-coded high/low)
        const priceColor =
          a.price == null ? C.text3 :
          (hi !== null && a.price === hi) ? C.over :
          (lo !== null && a.price === lo) ? C.good : C.text;
        doc.setFont("courier", "bold").setFontSize(9);
        setText(priceColor);
        doc.text(
          a.price != null ? `$${a.price}` : "—",
          W - M - 10, y + 8, { align: "right" },
        );

        y += rowH;
      });

      // ══════════════════════════════════════════════════
      // PAGE 2 CONTINUED — EXECUTIVE SUMMARY
      // ══════════════════════════════════════════════════
      y += 24;
      if (y > H - 200) { doc.addPage(); drawPageChrome(2); y = 100; }
      
      setFill(C.surface); setStroke(C.line);
      doc.roundedRect(M, y, COL_W, 18, 4, 4, "FD");
      doc.setFont("helvetica", "bold").setFontSize(8); setText(C.cobalt);
      doc.text("EXECUTIVE SUMMARY", M + 10, y + 12.5);
      y += 28;

      const realProbes = agents.filter((a: any) => (a.response_time_ms || 0) > 0).length;
      const filled = agents.length - realProbes;
      const succ2 = report?.successful_agents || 0;
      const tot2 = report?.total_agents || 24;
      const conf = tot2 > 0 ? Math.round((succ2 / tot2) * 100) : 0;
      const sigG = (report?.gradients || []).filter((g: any) => g.significant).sort((a: any, b: any) => Math.abs(b.delta) - Math.abs(a.delta));
      const sevRaw = (report as any)?.discrimination_score || 0;
      const sev = sevRaw > 80 ? "Critical" : sevRaw > 50 ? "High" : sevRaw > 20 ? "Moderate" : "Low";

      const summaryRows: [string, string][] = [
        ["Target URL", (verdict.target || "").substring(0, 90)],
        ["Timestamp", dateLine],
        ["Real probes run", String(realProbes)],
      ];
      if (filled > 0) summaryRows.push(["Agents skipped", `${filled} (exact-uniform gate passed)`]);
      summaryRows.push(
        ["Highest price", hi != null ? `$${hi.toLocaleString()}` : "—"],
        ["Lowest price", lo != null ? `$${lo.toLocaleString()}` : "—"],
        ["Max spread", spread > 0 ? `$${spread.toLocaleString()} (${verdict.pct}%)` : "$0"],
        ["Topology verdict", verdict.label.toUpperCase()],
        ["Confidence score", `${conf}%`],
        ["Suspected driver", sigG.length > 0 ? sigG[0].variable_name.replace(/_/g, " ") : "None detected"],
        ["Severity", sev],
      );

      const rowH2 = 16;
      summaryRows.forEach(([k, v]) => {
        if (y > H - 60) { doc.addPage(); drawPageChrome(2); y = 100; }
        doc.setFont("helvetica", "normal").setFontSize(7.5); setText(C.text3);
        doc.text(k, M + 4, y + 5);
        doc.setFont("courier", "normal").setFontSize(7.5); setText(C.text);
        doc.text(v, M + 150, y + 5);
        setStroke(C.line); doc.setLineWidth(0.3);
        doc.line(M, y + rowH2 - 2, W - M, y + rowH2 - 2);
        y += rowH2;
      });

      // ══════════════════════════════════════════════════
      // EVIDENCE TABLE
      // ══════════════════════════════════════════════════
      y += 18;
      if (y > H - 200) { doc.addPage(); drawPageChrome(2); y = 100; }
      
      setFill(C.surface); setStroke(C.line);
      doc.roundedRect(M, y, COL_W, 18, 4, 4, "FD");
      doc.setFont("helvetica", "bold").setFontSize(8); setText(C.cobalt);
      doc.text("EVIDENCE APPENDIX", M + 10, y + 12.5);
      y += 28;

      const evAgents = agents.filter((a: any) => a.evidence?.extraction_method !== "none" && a.evidence != null);
      if (evAgents.length > 0) {
        // Table header
        const cols = [
          { label: "AGENT", w: 50 }, { label: "REGION", w: 55 }, { label: "DEVICE", w: 55 },
          { label: "PRICE", w: 55 }, { label: "RAW TEXT", w: 105 }, { label: "METHOD", w: 80 },
        ];
        let cx2 = M;
        doc.setFont("helvetica", "bold").setFontSize(6.5); setText(C.text3);
        cols.forEach(c => {
          doc.text(c.label, cx2 + 3, y + 6);
          cx2 += c.w;
        });
        y += 12;
        setStroke(C.line); doc.setLineWidth(0.5);
        doc.line(M, y, W - M, y);
        y += 6;

        evAgents.slice(0, 20).forEach((a: any) => {
          if (y > H - 60) { doc.addPage(); drawPageChrome(2); y = 100; }
          const ev = a.evidence || {};
          const vars = a.variables || {};
          const vals = [
            a.agent_id || "—",
            vars.location || "—",
            vars.device || "—",
            a.price != null ? `$${a.price}` : "—",
            (ev.price_raw_text || "N/A").substring(0, 18),
            ev.extraction_method || "N/A",
          ];
          let cx3 = M;
          doc.setFont("courier", "normal").setFontSize(6.5);
          vals.forEach((v, i) => {
            setText(i === 3 && a.price != null ? C.good : C.text2);
            doc.text(v.substring(0, cols[i].w / 5.5), cx3 + 2, y + 6);
            cx3 += cols[i].w;
          });
          y += 12;
        });

        // Evidence stats
        y += 4;
        doc.setFont("helvetica", "normal").setFontSize(7); setText(C.text3);
        doc.text(`${evAgents.length} of ${agents.length} agents captured evidence · ${realProbes} real probes · ${filled} skipped`, M, y + 5);
      } else {
        doc.setFont("helvetica", "normal").setFontSize(8); setText(C.text3);
        doc.text("No evidence data available. Evidence requires live BrightData probes.", M, y + 5);
      }

      // ══════════════════════════════════════════════════
      // METHODOLOGY
      // ══════════════════════════════════════════════════
      y += 24;
      if (y > H - 200) { doc.addPage(); drawPageChrome(2); y = 100; }
      
      setFill(C.surface); setStroke(C.line);
      doc.roundedRect(M, y, COL_W, 18, 4, 4, "FD");
      doc.setFont("helvetica", "bold").setFontSize(8); setText(C.cobalt);
      doc.text("METHODOLOGY", M + 10, y + 12.5);
      y += 24;

      const methodLines = [
        "Jacobi runs controlled buyer-context probes against target URLs. Each probe deploys synthetic shopper identities — varying location, device, cookie profile, referrer, and browser language — to detect price discrimination on e-commerce and travel sites.",
        "",
        "HOW IT WORKS: Jacobi sends real HTTP requests through BrightData's global proxy network. Each identity is routed through a different IP and geographic region. The target HTML is parsed using site-specific selectors (e.g., Amazon's corePriceDisplay, Booking.com's data-testid elements). Prices are normalized to USD for comparison.",
        "",
        "UNIFORM-GATE OPTIMIZATION: If the first 10 real probes return the exact same price (to the cent), remaining agents are skipped. This saves time and BrightData credits without sacrificing accuracy. If any agent sees a different price, the full 24-agent audit runs.",
        "",
        "STATISTICAL ANALYSIS: Prices are grouped by variable and compared using Welch's t-test. Variables with |t| > 2.0 are flagged as significant. The Discrimination Index measures total USD spread from significant variables.",
        "",
        "EVIDENCE INTEGRITY: Every real probe captures raw HTML excerpt, exact price text, currency, and extraction method for independent verification.",
      ];

      doc.setFont("helvetica", "normal").setFontSize(7.5); setText(C.text2);
      methodLines.forEach(line => {
        if (y > H - 40) { doc.addPage(); drawPageChrome(2); y = 100; }
        if (line === "") { y += 6; return; }
        const wrapped = doc.splitTextToSize(line, COL_W - 8);
        doc.text(wrapped, M + 4, y + 5);
        y += wrapped.length * 10 + 2;
      });

      doc.save(`jacobi-report-${sessionShort}.pdf`);
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

          <div style={{
            marginTop: 18, display: "flex", justifyContent: "center",
            gap: 22, flexWrap: "wrap",
          }}>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2)",
              letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={publishToBoard}
                onChange={e => setPublishToBoard(e.target.checked)}
                style={{ accentColor: "var(--cobalt)" }}
              />
              Include on public board
            </label>
          </div>

          {/* Backend rejection — auth required or quota exhausted. */}
          {rejection && (
            <div
              data-reveal
              className="in"
              style={{
                marginTop: 24,
                padding: "22px 24px",
                border: "1px solid var(--cobalt-line)",
                borderRadius: "var(--r)",
                background: "linear-gradient(180deg, var(--surface), var(--ink-2))",
                maxWidth: 520, marginLeft: "auto", marginRight: "auto",
                textAlign: "center",
              }}
            >
              <div className="label-mono" style={{ color: "var(--cobalt-bright)", marginBottom: 10 }}>
                {rejection.code === "auth_required" ? "Sign in required" : "Monthly limit reached"}
              </div>
              <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 16 }}>
                {rejection.message}
                {rejection.code === "quota_exceeded" && rejection.limit ? (
                  <>
                    {" "}You're on the <strong>{rejection.tier || "Free"}</strong> plan
                    ({rejection.used} / {rejection.limit} this month).
                  </>
                ) : null}
              </p>
              {rejection.code === "auth_required" ? (
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const sb = createClient();
                    await sb.auth.signInWithOAuth({
                      provider: "google",
                      options: { redirectTo: `${window.location.origin}/auth/callback?next=/chat` },
                    });
                  }}
                >
                  Sign in with Google →
                </button>
              ) : (
                <a href="/pricing" className="btn btn-primary">
                  Upgrade to Pro →
                </a>
              )}
            </div>
          )}

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

              {/* Tab switcher */}
              <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--line)" }}>
                <button onClick={() => setActiveTab("verdict")} style={{
                  padding: "12px 24px", background: "none", border: "none",
                  borderBottom: activeTab === "verdict" ? "2px solid var(--cobalt-bright)" : "2px solid transparent",
                  color: activeTab === "verdict" ? "var(--cobalt-bright)" : "var(--muted)",
                  fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: activeTab === "verdict" ? 600 : 400, cursor: "pointer"
                }}>Verdict</button>
                <button onClick={() => setActiveTab("evidence")} style={{
                  padding: "12px 24px", background: "none", border: "none",
                  borderBottom: activeTab === "evidence" ? "2px solid var(--cobalt-bright)" : "2px solid transparent",
                  color: activeTab === "evidence" ? "var(--cobalt-bright)" : "var(--muted)",
                  fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: activeTab === "evidence" ? 600 : 400, cursor: "pointer"
                }}>Evidence</button>
              </div>

              {activeTab === "verdict" && (<>

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
                    letterSpacing: "0.16em", color: "var(--text)",
                    fontWeight: 600,
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
                        <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{a.agent_id.replace("AGENT_", "#")}</span>
                        <span style={{ color: "var(--text)", fontWeight: 500 }}>{agentLabelCity(a)}</span>
                        <span style={{ color: "var(--text-2)" }}>{net}</span>
                        <span style={{
                          color: a.status === "success" ? "var(--good)" : "var(--over)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          fontSize: 11,
                        }}>
                          {a.status}
                        </span>
                        <span style={{ color: priceColor, textAlign: "right", fontWeight: 600 }}>
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

              </>)}
              {activeTab === "evidence" && report && (
                <div>
                  {/* Summary cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 32 }}>
                    {(() => {
                      const aprices = returnedAgents.filter((a: any) => a.price != null).map((a: any) => a.price);
                      const srt = [...aprices].sort((a: any, b: any) => a - b);
                      const mp = srt[srt.length - 1] || 0;
                      const lp = srt[0] || 0;
                      const sp = mp - lp;
                      const succ = report.successful_agents || 0;
                      const tot = report.total_agents || 24;
                      const conf = tot > 0 ? Math.round((succ / tot) * 100) : 0;
                      const sigG = (report.gradients || []).filter((g: any) => g.significant).sort((a: any, b: any) => Math.abs(b.delta) - Math.abs(a.delta));
                      const sev = (report as any).discrimination_score || 0;
                      return (
                        <>
                          <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 }}>
                            <div className="label-mono" style={{ fontSize: 10, marginBottom: 6 }}>Highest</div>
                            <div className="tnum" style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--over)", fontWeight: 600 }}>${mp.toLocaleString()}</div>
                          </div>
                          <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 }}>
                            <div className="label-mono" style={{ fontSize: 10, marginBottom: 6 }}>Lowest</div>
                            <div className="tnum" style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--good)", fontWeight: 600 }}>${lp.toLocaleString()}</div>
                          </div>
                          <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 }}>
                            <div className="label-mono" style={{ fontSize: 10, marginBottom: 6 }}>Spread</div>
                            <div className="tnum" style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--cobalt-bright)", fontWeight: 600 }}>${sp.toLocaleString()}</div>
                          </div>
                          <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 }}>
                            <div className="label-mono" style={{ fontSize: 10, marginBottom: 6 }}>Confidence</div>
                            <div className="tnum" style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--cobalt-bright)", fontWeight: 600 }}>{conf}%</div>
                          </div>
                          <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 }}>
                            <div className="label-mono" style={{ fontSize: 10, marginBottom: 6 }}>Driver</div>
                            <div className="tnum" style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--cobalt-bright)", fontWeight: 600 }}>
                              {sigG.length > 0 ? sigG[0].variable_name.replace(/_/g, " ") : "None"}
                            </div>
                          </div>
                          <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 16 }}>
                            <div className="label-mono" style={{ fontSize: 10, marginBottom: 6 }}>Severity</div>
                            <div className="tnum" style={{ fontFamily: "var(--mono)", fontSize: 18, color: sev > 50 ? "var(--over)" : "var(--cobalt-bright)", fontWeight: 600 }}>
                              {sev > 80 ? "Critical" : sev > 50 ? "High" : sev > 20 ? "Moderate" : "Low"}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Agent table */}
                  <div className="label-mono" style={{ marginBottom: 16, color: "var(--cobalt-bright)" }}>agent evidence</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" as any }}>
                          <th style={{ padding: "8px 12px", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Agent</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Region</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Device</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Price</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Raw Text</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnedAgents.map((a: any, i: number) => {
                          const ev = a.evidence;
                          const vars = a.variables || {};
                          return (
                            <tr key={a.agent_id || i} style={{ borderBottom: "1px solid var(--line)" }}>
                              <td style={{ padding: "6px 12px", color: "var(--text)", fontSize: 12 }}>{a.agent_id}</td>
                              <td style={{ padding: "6px 12px", color: "var(--text)", fontSize: 12 }}>{vars.location || "—"}</td>
                              <td style={{ padding: "6px 12px", color: "var(--text)", fontSize: 12 }}>{vars.device || "—"}</td>
                              <td style={{ padding: "6px 12px", fontSize: 12, color: a.price != null ? "var(--cobalt-bright)" : "var(--muted)" }}>
                                {a.price != null ? "$" + a.price.toLocaleString() : "—"}
                              </td>
                              <td style={{ padding: "6px 12px", color: "var(--text)", fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ev?.price_raw_text || "—"}
                              </td>
                              <td style={{ padding: "6px 12px", color: "var(--text)", fontSize: 12 }}>{ev?.extraction_method || a.status || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
                    {(() => {
                      const realProbes = returnedAgents.filter((a: any) => a.evidence?.extraction_method !== "none" && a.evidence != null).length;
                      const filled = returnedAgents.length - realProbes;
                      if (filled > 0) {
                        return <>{realProbes} real probes · {filled} confirmed uniform (no variance detected)</>;
                      }
                      return <>{realProbes} of {returnedAgents.length} agents captured evidence</>;
                    })()}
                  </div>
                </div>
              )}

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
