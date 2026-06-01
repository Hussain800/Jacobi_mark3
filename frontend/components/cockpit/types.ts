/**
 * Shared cockpit types, demo data, axis mapping, and pure helpers.
 *
 * Backend contract for an Agent and TopologyReport is fixed; this file
 * is the single place we touch those shapes. Visual files only consume
 * these via imports.
 */

export interface Gradient {
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

export interface Agent {
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
  // Native (on-page) price fields; optional, absent on demo/cached results.
  native_price?: number | null;
  native_currency?: string | null;
  normalized_price_usd?: number | null;
  inferred?: boolean;
  // Browser-language vector (Phase 4); optional → render N/A when absent.
  browser_language?: string | null;
  accept_language_header?: string | null;
  language_label?: string | null;
  language_pair_id?: string | null;
  language_pair_role?: string | null;
}

export interface TopologyReport {
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
  control_stability: number;
  baseline_price: number | null;
  mean_price: number | null;
  all_prices: Record<string, number | null>;
  price_range: [number, number] | null;
  max_price_spread: number | null;
  max_price_spread_pct: number | null;
  gradients: Gradient[];
  discrimination_index: number;
  topology_class: string;
  summary: string;
  max_discrimination_scenario: string;
  min_discrimination_scenario: string;
  agents: Agent[];
  error: string | null;
  discrimination_score?: number;
  // Native (on-page) currency for the headline; USD figures are the normalized
  // comparison basis. Optional → render N/A when absent.
  native_currency?: string | null;
  native_baseline_price?: number | null;
  normalized_currency?: string | null;
  fx_rate_used?: number | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  report?: TopologyReport;
  status?: "scanning" | "complete" | "error";
  error?: string;
  startedAt?: number;
}

/**
 * Map agent index (0..23) to a logical axis. This mirrors the backend's
 * 7/7/3/4/3 axis allocation but with the order chosen so that the visual
 * cluster layout is stable and IOWA/NYC type extremes can land at cluster
 * edges. The cockpit visualization sits on top of whatever the backend
 * actually returns — index alignment is for layout only.
 */
export type Axis = "loc" | "dev" | "cookie" | "ref" | "ctrl";

export const AXIS_LABEL: Record<Axis, string> = {
  loc:    "Location",
  dev:    "Device",
  cookie: "Cookies",
  ref:    "Referrer",
  ctrl:   "Network",
};

/**
 * Index-to-axis lookup. AGENT_00 is the baseline control; subsequent
 * agents fall into their cluster by the conventional backend ordering.
 */
export const INDEX_TO_AXIS: Axis[] = [
  "ctrl",
  "loc", "loc", "loc", "loc", "loc",
  "dev", "dev", "dev", "dev", "dev",
  "cookie", "cookie", "cookie",
  "ref", "ref", "ref", "ref",
  "loc", "loc",
  "dev", "dev",
  "ctrl", "ctrl",
];

export const SHORT_LABELS = [
  "BASE", "NYC", "IOWA", "SFO", "LDN", "MUM",
  "iPhn", "Andr", "Mac",  "Cbk", "Glx",
  "Aged", "Frsh", "Plat",
  "Kayak", "Dir", "Sky", "Dir·M",
  "DXB", "MS",
  "iPad", "SE",
  "CTR·1", "CTR·2",
];

/* ─── Demo data (used when useCache is on) ─────────────────────────── */

export const DEMO_AGENTS: Agent[] = Array.from({ length: 24 }, (_, i) => {
  const tier = i < 8 ? 0 : i < 16 ? 1 : 2;
  const ptype = tier === 0 ? "datacenter" : tier === 1 ? "residential" : "mobile";
  const labels = [
    "BASELINE MACBOOK MANHATTAN DIRECT",
    "LOCATION HIGH MANHATTAN",
    "LOCATION LOW RURAL IOWA",
    "LOCATION HIGH SAN FRANCISCO",
    "LOCATION HIGH LONDON",
    "LOCATION LOW MUMBAI",
    "DEVICE HIGH IPHONE 15 PRO",
    "DEVICE LOW ANDROID BUDGET",
    "DEVICE HIGH MACBOOK PRO M3",
    "DEVICE LOW CHROMEBOOK",
    "DEVICE HIGH GALAXY S24",
    "COOKIE HIGH 30D INTENT",
    "COOKIE LOW FRESH",
    "COOKIE HIGH 90D PLATINUM",
    "REFERRER HIGH VIA KAYAK",
    "REFERRER LOW DIRECT",
    "REFERRER HIGH SKYSCANNER",
    "REFERRER LOW DIRECT",
    "LOCATION HIGH DUBAI",
    "LOCATION LOW RURAL MISSISSIPPI",
    "DEVICE HIGH IPAD PRO",
    "DEVICE LOW IPHONE SE",
    "CONTROL REPEAT 1",
    "CONTROL REPEAT 2",
  ];
  const basePrices = [
    245, 268, 228, 265, 262, 231, 272, 234, 269, 236, 266, 254,
    245, 241, 258, 245, 256, 245, 278, 221, 271, 238, 246, 244,
  ];
  return {
    agent_id: `AGENT_${String(i).padStart(2, "0")}`,
    label: `AGENT_${String(i).padStart(2, "0")}  ${labels[i]}`,
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

export const DEMO_REPORT: TopologyReport = {
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
  control_stability: 0.994,
  baseline_price: 245,
  mean_price: 252,
  all_prices: Object.fromEntries(
    DEMO_AGENTS.filter((a) => a.price !== null).map((a) => [a.agent_id, a.price]),
  ),
  price_range: [221, 278],
  max_price_spread: 57,
  max_price_spread_pct: 23.3,
  gradients: [
    { variable_name: "location",       state_high: "High Income",   state_low: "Low Income",      mean_price_high: 268.3, mean_price_low: 226.7, delta: 41.6, delta_pct: 17,  pooled_std: 2.5, t_statistic: 16.6, significant: true,  n_high: 3, n_low: 3 },
    { variable_name: "device",         state_high: "Premium Device", state_low: "Budget Device",   mean_price_high: 269.5, mean_price_low: 236,   delta: 33.5, delta_pct: 13.7, pooled_std: 3.1, t_statistic: 10.8, significant: true,  n_high: 4, n_low: 4 },
    { variable_name: "cookie_profile", state_high: "Aged Profile",   state_low: "Fresh Profile",   mean_price_high: 247.5, mean_price_low: 245,   delta: 2.5,  delta_pct: 1,   pooled_std: 4.2, t_statistic: 0.6,  significant: false, n_high: 2, n_low: 2 },
    { variable_name: "referrer",       state_high: "Aggregator",     state_low: "Direct",          mean_price_high: 257,   mean_price_low: 245,   delta: 12,   delta_pct: 4.9, pooled_std: 3.8, t_statistic: 3.16, significant: true,  n_high: 2, n_low: 2 },
  ],
  discrimination_index: 87.1,
  topology_class: "progressive",
  discrimination_score: 84.2,
  summary: "TOPOLOGY: PROGRESSIVE. Baseline: $245/night. Spread: $57. DI: $87.10. Significant: 3 vars.",
  max_discrimination_scenario: "Max: AGENT_18 DUBAI @ $278",
  min_discrimination_scenario: "Min: AGENT_19 RURAL MISSISSIPPI @ $221",
  agents: DEMO_AGENTS,
  error: null,
};

export const SAMPLES: { label: string; url: string; price: string }[] = [
  { label: "Leela Palace Bangalore", url: "https://www.booking.com/hotel/in/the-leela-palace-bangalore.html", price: "$245" },
  { label: "Tokyo Hotels Search",     url: "https://www.booking.com/searchresults.html?ss=Tokyo",             price: "$120" },
  { label: "Knickerbocker NYC",       url: "https://www.booking.com/hotel/us/the-knickerbocker.html",         price: "$350" },
  { label: "DXB to KTM Flights",      url: "https://www.google.com/travel/flights?q=Flights+to+KTM+from+DXB", price: "$420" },
  { label: "Wireless Headphones",     url: "https://www.amazon.com/s?k=wireless+headphones",                  price: "$65"  },
];

/* ─── Helpers ──────────────────────────────────────────────────────── */

export function extractUrl(text: string) {
  const m = text.match(/https?:\/\/[^\s]+/g);
  return m ? m[0] : null;
}

export function fmtDelta(d: number) {
  return d >= 0 ? `+$${d.toFixed(0)}` : `-$${Math.abs(d).toFixed(0)}`;
}

export function buildHistogram(prices: Record<string, number | null>) {
  const v = Object.values(prices).filter((p) => p !== null) as number[];
  if (!v.length) return [];
  const mn = Math.floor(Math.min(...v) / 10) * 10;
  const mx = Math.ceil(Math.max(...v) / 10) * 10;
  const bins: Record<number, number> = {};
  for (let b = mn; b <= mx; b += 10) bins[b] = 0;
  for (const p of v) {
    const bin = Math.floor(p / 10) * 10;
    bins[bin] = (bins[bin] || 0) + 1;
  }
  return Object.entries(bins)
    .map(([k, c]) => ({ bucket: Number(k), count: c }))
    .sort((a, b) => a.bucket - b.bucket);
}

export function buildNetworkData(report: TopologyReport) {
  const agents = report.agents.filter(
    (a) => a.status === "success" && a.price != null,
  );
  return [
    { k: 0, l: "Datacenter" },
    { k: 1, l: "Residential" },
    { k: 2, l: "Mobile 5G" },
  ].map((t) => {
    const prices = agents
      .filter((a) => a.network_tier === t.k)
      .map((a) => a.price!);
    const avg = prices.length
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : 0;
    return {
      name: t.l,
      avg,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      count: prices.length,
    };
  });
}

/* Topology class → restrained color tokens (no SaaS rainbow) */
export function topologyClassColor(c: string) {
  switch (c) {
    case "uniform":     return "text-signal";
    case "selective":   return "text-warning";
    case "progressive": return "text-warning";
    case "aggressive":  return "text-overcharge";
    default:            return "text-muted";
  }
}

export function topologyHeadline(c: string) {
  switch (c) {
    case "uniform":     return "Uniform pricing — no discrimination detected.";
    case "selective":   return "Selective pricing — one variable is being exploited.";
    case "progressive": return "Progressive pricing — multiple variables stack against you.";
    case "aggressive":  return "Aggressive discrimination — pricing varies sharply by identity.";
    default:            return "Pricing topology classified.";
  }
}

export function dl(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function exportJSON(r: TopologyReport) {
  dl(
    new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }),
    `probe-${r.session_id || "report"}.json`,
  );
}

export function exportCSV(r: TopologyReport) {
  const rows = [
    "agent_id,label,status,price,network_tier,proxy_type,response_time_ms",
    ...r.agents.map((a) =>
      [
        a.agent_id,
        `"${a.label}"`,
        a.status,
        a.price ?? "",
        a.network_tier ?? "",
        a.proxy_type ?? "",
        a.response_time_ms ?? "",
      ].join(","),
    ),
  ].join("\n");
  dl(new Blob([rows], { type: "text/csv" }), `probe-agents-${r.session_id || "report"}.csv`);
}

/* Derive the scan phase from current message status + report */
export type ScanPhase =
  | "queued"
  | "deploying"
  | "collecting"
  | "analyzing"
  | "verdict"
  | "error";

export function deriveScanPhase(msg: Message | null): ScanPhase {
  if (!msg) return "queued";
  if (msg.status === "error") return "error";
  if (msg.status === "complete") return "verdict";
  const succ = msg.report?.successful_agents ?? 0;
  const total = msg.report?.total_agents ?? 24;
  if (succ === 0) return "queued";
  if (succ < 8) return "deploying";
  if (succ < total) return "collecting";
  return "analyzing";
}

export function cheapestProfile(report: TopologyReport): Agent | null {
  const priced = report.agents.filter(
    (a) => a.price !== null && a.status === "success",
  );
  if (!priced.length) return null;
  return priced.reduce((min, a) => (a.price! < min.price! ? a : min), priced[0]);
}

export function dearestProfile(report: TopologyReport): Agent | null {
  const priced = report.agents.filter(
    (a) => a.price !== null && a.status === "success",
  );
  if (!priced.length) return null;
  return priced.reduce((max, a) => (a.price! > max.price! ? a : max), priced[0]);
}

/* Friendly description of an agent profile from its label/variables */
export function profileSummary(agent: Agent): string {
  const lbl = agent.label || "";
  const segs = lbl.split(/\s+/).slice(2).join(" ").toLowerCase();
  if (segs) return segs;
  if (agent.variables && Object.keys(agent.variables).length) {
    return Object.entries(agent.variables)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  }
  return agent.agent_id;
}
