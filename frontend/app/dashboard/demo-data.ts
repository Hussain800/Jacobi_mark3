/**
 * Seeded demo data for the enterprise audit workspace.
 *
 * IMPORTANT — honesty rule: everything in this file is STATIC SAMPLE data
 * used to demonstrate the workflow (portfolio → findings → evidence). It is
 * NOT the output of a live audit. The dashboard renders a visible DEMO banner
 * wherever this data is shown. The only live path is /dashboard/audits, which
 * runs the real probe engine via <CockpitProbe />.
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type FindingType = "surveillance" | "map";
export type FindingStatus = "new" | "reviewing" | "escalated" | "resolved";
export type Confidence = "high" | "medium" | "low" | "insufficient";

export interface AgentObservation {
  id: string;
  context: string; // human-readable buyer context, e.g. "iPhone 15 Pro · Manhattan, US"
  geo: string;
  device: string;
  network: string;
  referrer: string;
  price: number | null;
  status: "ok" | "blocked";
}

export interface Finding {
  id: string;
  product: string;
  sku: string;
  seller: string;
  domain: string;
  url: string;
  market: string;
  type: FindingType;
  severity: Severity;
  status: FindingStatus;
  currency: string;
  observedLow: number;
  observedHigh: number;
  baseline: number; // reference price (median) for surveillance; MAP floor echoed in mapFloor
  mapFloor?: number; // present for MAP findings
  spreadPct: number; // % of the spread (high vs low) or % below MAP floor
  driver: string; // dominant buyer-context vector
  confidence: Confidence;
  topology: string; // uniform / selective / progressive / aggressive
  variationIndex: number; // 0-100 (UI label: "Variation index")
  detectedAt: string; // ISO date
  excerpt: string; // raw evidence snippet
  agents: AgentObservation[];
}

export interface PortfolioItem {
  id: string;
  product: string;
  sku: string;
  seller: string;
  domain: string;
  url: string;
  market: string;
  cadence: string;
  lastAudit: string; // ISO date
  lastStatus: "clear" | "finding" | "auditing" | "insufficient";
  latestSeverity?: Severity;
  latestSpreadPct?: number;
  findingId?: string;
}

/* ── Buyer-context grid (24 synthetic buyers), deterministic ──────────── */

const CONTEXTS: Array<{ geo: string; device: string; net: string; ref: string }> = [
  { geo: "Manhattan, US", device: "iPhone 15 Pro", net: "residential", ref: "direct" },
  { geo: "San Francisco, US", device: "MacBook Pro M3", net: "residential", ref: "direct" },
  { geo: "London, UK", device: "iPhone 15", net: "residential", ref: "direct" },
  { geo: "Dubai, AE", device: "iPhone 15 Pro Max", net: "residential", ref: "direct" },
  { geo: "Tokyo, JP", device: "Safari / macOS", net: "residential", ref: "direct" },
  { geo: "Sydney, AU", device: "Chrome / Windows", net: "fiber", ref: "direct" },
  { geo: "Toronto, CA", device: "Edge / Windows", net: "residential", ref: "search" },
  { geo: "Paris, FR", device: "Safari / iOS", net: "residential", ref: "search" },
  { geo: "Berlin, DE", device: "Firefox / Linux", net: "fiber", ref: "search" },
  { geo: "Singapore, SG", device: "Chrome / Android", net: "fiber", ref: "direct" },
  { geo: "Seoul, KR", device: "Galaxy S24", net: "mobile", ref: "direct" },
  { geo: "Madrid, ES", device: "Chrome / Windows", net: "fiber", ref: "aggregator" },
  { geo: "Amsterdam, NL", device: "Edge / Windows", net: "fiber", ref: "aggregator" },
  { geo: "São Paulo, BR", device: "Android budget", net: "mobile", ref: "search" },
  { geo: "Mumbai, IN", device: "Android budget", net: "mobile", ref: "search" },
  { geo: "Lagos, NG", device: "Android budget", net: "mobile", ref: "search" },
  { geo: "Bogotá, CO", device: "Chrome / Android", net: "vpn", ref: "aggregator" },
  { geo: "Bangalore, IN", device: "Firefox / Windows", net: "vpn", ref: "aggregator" },
  { geo: "Warsaw, PL", device: "Chrome / Windows", net: "vpn", ref: "aggregator" },
  { geo: "Mississippi, US", device: "Android budget", net: "mobile", ref: "aggregator" },
  { geo: "Rural Iowa, US", device: "Chrome / Windows", net: "vpn", ref: "aggregator" },
  { geo: "Manila, PH", device: "Android budget", net: "mobile", ref: "search" },
  { geo: "Nairobi, KE", device: "Android budget", net: "mobile", ref: "aggregator" },
  { geo: "Hanoi, VN", device: "Chrome / Android", net: "vpn", ref: "aggregator" },
];

/**
 * Build a deterministic 24-buyer observation ladder from a high→low price
 * range. A couple of indices are marked "blocked" to keep the demo honest
 * (real audits have blocked/insufficient observations). No randomness.
 */
function buildAgents(high: number, low: number, blocked: number[] = [19]): AgentObservation[] {
  const n = CONTEXTS.length;
  return CONTEXTS.map((c, i) => {
    const t = i / (n - 1);
    // ease so most buyers cluster near baseline and a few outliers stretch high/low
    const eased = Math.pow(t, 1.25);
    const price = Math.round(high - eased * (high - low));
    const isBlocked = blocked.includes(i);
    return {
      id: `A${String(i).padStart(2, "0")}`,
      context: `${c.device} · ${c.geo} · ${c.ref}`,
      geo: c.geo,
      device: c.device,
      network: c.net,
      referrer: c.ref,
      price: isBlocked ? null : price,
      status: isBlocked ? "blocked" : "ok",
    };
  });
}

/* ── Seeded findings ──────────────────────────────────────────────────── */

export const FINDINGS: Finding[] = [
  {
    id: "F-1042",
    product: "JFK → LHR economy fare",
    sku: "FLT-TATL-ECON",
    seller: "Self-audit · booking funnel",
    domain: "book.aerolux.example",
    url: "https://book.aerolux.example/search?o=JFK&d=LHR",
    market: "US / UK",
    type: "surveillance",
    severity: "critical",
    status: "new",
    currency: "USD",
    observedHigh: 642,
    observedLow: 498,
    baseline: 556,
    spreadPct: 28.9,
    driver: "Location (high-income metro) + device tier",
    confidence: "high",
    topology: "aggressive",
    variationIndex: 84,
    detectedAt: "2026-06-23T14:20:00Z",
    excerpt:
      "Same cabin, same date, same availability. Buyers presenting as high-income metros on premium devices were quoted up to $144 more than budget-device buyers in low-income regions.",
    agents: buildAgents(642, 498, [19, 11]),
  },
  {
    id: "F-1039",
    product: "Pro Wireless Headphones",
    sku: "JCB-HP-001",
    seller: "MegaDeals Marketplace",
    domain: "megadeals.example",
    url: "https://megadeals.example/item/pro-wireless-headphones",
    market: "US",
    type: "map",
    severity: "high",
    status: "reviewing",
    currency: "USD",
    observedHigh: 199,
    observedLow: 176,
    baseline: 199,
    mapFloor: 199,
    spreadPct: 11.6,
    driver: "Checkout-only discount (coupon auto-applied)",
    confidence: "high",
    topology: "selective",
    variationIndex: 61,
    detectedAt: "2026-06-22T09:05:00Z",
    excerpt:
      "Advertised price held at the $199 MAP floor, but an unauthorized coupon auto-applied at checkout dropped the effective price to $176 — 11.6% below floor — for several buyer contexts.",
    agents: buildAgents(199, 176, [19]),
  },
  {
    id: "F-1036",
    product: "CloudVault Pro annual plan",
    sku: "SUB-CV-PRO",
    seller: "Self-audit · pricing page",
    domain: "cloudvault.example",
    url: "https://cloudvault.example/pricing",
    market: "Global",
    type: "surveillance",
    severity: "high",
    status: "new",
    currency: "USD",
    observedHigh: 240,
    observedLow: 199,
    baseline: 216,
    spreadPct: 17.1,
    driver: "Returning-visitor cookies + device tier",
    confidence: "medium",
    topology: "progressive",
    variationIndex: 58,
    detectedAt: "2026-06-21T17:42:00Z",
    excerpt:
      "Aged-cookie, premium-device buyers were shown a $240 renewal; fresh-session buyers saw $199 for the identical plan. Variation tracks loyalty cookies more than geography.",
    agents: buildAgents(240, 199, [19, 7]),
  },
  {
    id: "F-1031",
    product: "Leela Palace Bangalore — deluxe room",
    sku: "HTL-LPB-DLX",
    seller: "BookNow Travel",
    domain: "booknow.example",
    url: "https://booknow.example/hotel/leela-palace-bangalore",
    market: "IN",
    type: "surveillance",
    severity: "medium",
    status: "reviewing",
    currency: "USD",
    observedHigh: 278,
    observedLow: 245,
    baseline: 256,
    spreadPct: 9.0,
    driver: "Referrer (direct vs aggregator)",
    confidence: "medium",
    topology: "selective",
    variationIndex: 44,
    detectedAt: "2026-06-20T11:15:00Z",
    excerpt:
      "Direct-navigation buyers saw $278; the same room via a price aggregator referrer resolved to $245. Within tolerance, flagged for monitoring rather than escalation.",
    agents: buildAgents(278, 245, [19]),
  },
  {
    id: "F-1027",
    product: "VitaBlend Pro Blender",
    sku: "JCB-BL-700",
    seller: "HomeGoods Direct",
    domain: "homegoods.example",
    url: "https://homegoods.example/p/vitablend-pro",
    market: "US",
    type: "map",
    severity: "low",
    status: "new",
    currency: "USD",
    observedHigh: 329,
    observedLow: 318,
    baseline: 329,
    mapFloor: 329,
    spreadPct: 3.3,
    driver: "Insufficient coverage",
    confidence: "insufficient",
    topology: "uniform",
    variationIndex: 12,
    detectedAt: "2026-06-19T08:30:00Z",
    excerpt:
      "Most buyer contexts were challenged or blocked by the seller's bot defenses; only 9 of 24 returned a usable price. Coverage is below the confidence gate — reported as insufficient evidence, not a violation.",
    agents: buildAgents(329, 318, [2, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]),
  },
];

/* ── Seeded portfolio (monitored URLs) ────────────────────────────────── */

export const PORTFOLIO: PortfolioItem[] = [
  {
    id: "P-01", product: "JFK → LHR economy fare", sku: "FLT-TATL-ECON",
    seller: "Self-audit · booking funnel", domain: "book.aerolux.example",
    url: "https://book.aerolux.example/search?o=JFK&d=LHR", market: "US / UK",
    cadence: "Daily", lastAudit: "2026-06-23T14:20:00Z", lastStatus: "finding",
    latestSeverity: "critical", latestSpreadPct: 28.9, findingId: "F-1042",
  },
  {
    id: "P-02", product: "Pro Wireless Headphones", sku: "JCB-HP-001",
    seller: "MegaDeals Marketplace", domain: "megadeals.example",
    url: "https://megadeals.example/item/pro-wireless-headphones", market: "US",
    cadence: "Daily", lastAudit: "2026-06-22T09:05:00Z", lastStatus: "finding",
    latestSeverity: "high", latestSpreadPct: 11.6, findingId: "F-1039",
  },
  {
    id: "P-03", product: "CloudVault Pro annual plan", sku: "SUB-CV-PRO",
    seller: "Self-audit · pricing page", domain: "cloudvault.example",
    url: "https://cloudvault.example/pricing", market: "Global",
    cadence: "Weekly", lastAudit: "2026-06-21T17:42:00Z", lastStatus: "finding",
    latestSeverity: "high", latestSpreadPct: 17.1, findingId: "F-1036",
  },
  {
    id: "P-04", product: "Leela Palace Bangalore — deluxe room", sku: "HTL-LPB-DLX",
    seller: "BookNow Travel", domain: "booknow.example",
    url: "https://booknow.example/hotel/leela-palace-bangalore", market: "IN",
    cadence: "Weekly", lastAudit: "2026-06-20T11:15:00Z", lastStatus: "finding",
    latestSeverity: "medium", latestSpreadPct: 9.0, findingId: "F-1031",
  },
  {
    id: "P-05", product: "VitaBlend Pro Blender", sku: "JCB-BL-700",
    seller: "HomeGoods Direct", domain: "homegoods.example",
    url: "https://homegoods.example/p/vitablend-pro", market: "US",
    cadence: "Daily", lastAudit: "2026-06-19T08:30:00Z", lastStatus: "insufficient",
    findingId: "F-1027",
  },
  {
    id: "P-06", product: "Pro Wireless Headphones", sku: "JCB-HP-001",
    seller: "AuthorizedAudio (authorized reseller)", domain: "authorizedaudio.example",
    url: "https://authorizedaudio.example/p/pro-wireless", market: "US",
    cadence: "Daily", lastAudit: "2026-06-23T06:00:00Z", lastStatus: "clear",
  },
  {
    id: "P-07", product: "CloudVault Team annual plan", sku: "SUB-CV-TEAM",
    seller: "Self-audit · pricing page", domain: "cloudvault.example",
    url: "https://cloudvault.example/pricing/team", market: "Global",
    cadence: "Weekly", lastAudit: "2026-06-21T17:42:00Z", lastStatus: "clear",
  },
];

/* ── Derived KPI summary ──────────────────────────────────────────────── */

export function kpis() {
  const open = FINDINGS.filter((f) => f.status !== "resolved");
  const critical = FINDINGS.filter((f) => f.severity === "critical").length;
  const high = FINDINGS.filter((f) => f.severity === "high").length;
  const highConf = FINDINGS.filter((f) => f.confidence === "high").length;
  return {
    openFindings: open.length,
    critical,
    high,
    monitoredUrls: PORTFOLIO.length,
    highConfidencePct: Math.round((highConf / FINDINGS.length) * 100),
    auditsThisMonth: 318,
  };
}

export function getFinding(id: string): Finding | undefined {
  return FINDINGS.find((f) => f.id === id);
}

/* ── Presentation helpers ─────────────────────────────────────────────── */

export function severityColor(s: Severity): string {
  switch (s) {
    case "critical": return "var(--over)";
    case "high": return "#ff9d52";
    case "medium": return "var(--gold)";
    case "low": return "var(--text-2)";
  }
}

export function confidenceColor(c: Confidence): string {
  switch (c) {
    case "high": return "var(--good)";
    case "medium": return "var(--gold)";
    case "low": return "#ff9d52";
    case "insufficient": return "var(--text-2)";
  }
}

export function typeLabel(t: FindingType): string {
  return t === "surveillance" ? "Surveillance-pricing exposure" : "MAP undercut";
}

export function statusLabel(s: FindingStatus): string {
  return { new: "New", reviewing: "Reviewing", escalated: "Escalated", resolved: "Resolved" }[s];
}

export function fmtDate(iso: string): string {
  // Deterministic UTC formatting (avoids hydration locale drift).
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
