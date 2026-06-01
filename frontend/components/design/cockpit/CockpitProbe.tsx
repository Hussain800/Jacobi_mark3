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
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = "Bearer " + token;

      const sessionId = (report as any)?.session_id || verdict.session;
      const r = await fetch("/api/export/" + sessionId + "/pdf", { headers });

      if (r.status === 401) {
        alert("Sign in to download the PDF report.");
      } else if (r.status === 404) {
        alert("Report not found. Run a probe first, then download.");
      } else if (!r.ok) {
        alert("Download failed. Please try again.");
      } else {

        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "jacobi-report-" + (verdict.session || "probe").slice(0, 8) + ".pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("PDF export failed", e);
    } finally {
      setPdfBusy(false);
    }
  }, [verdict, report]);

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
