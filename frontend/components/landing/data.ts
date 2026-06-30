/**
 * Canonical sample data (clearly a *sample*, not a live audit). One internally
 * consistent story — UA182 JFK→LHR — shared by the globe and every artifact so
 * the numbers always agree. See frontend/DESIGN.md §8.
 */

import type { ProbeAgent } from "./globe/createProbeGlobe";

/** 24 synthetic buyers feeding the globe's verdict-coded nodes. */
export const AGENTS: ProbeAgent[] = [
  { city: "Manhattan", state: "over" }, { city: "New York", state: "over" },
  { city: "Dubai", state: "over" }, { city: "Los Angeles", state: "over" },
  { city: "Tokyo", state: "normal" }, { city: "Chicago", state: "normal" },
  { city: "Hong Kong", state: "normal" }, { city: "Paris", state: "normal" },
  { city: "London", state: "normal" }, { city: "Seoul", state: "normal" },
  { city: "Singapore", state: "normal" }, { city: "Sydney", state: "normal" },
  { city: "Frankfurt", state: "normal" }, { city: "Toronto", state: "normal" },
  { city: "Amsterdam", state: "normal" }, { city: "Berlin", state: "normal" },
  { city: "Madrid", state: "normal" }, { city: "São Paulo", state: "normal" },
  { city: "Lagos", state: "normal" }, { city: "Mumbai", state: "normal" },
  { city: "Bogotá", state: "normal" }, { city: "Bangalore", state: "normal" },
  { city: "Mississippi", state: "good" }, { city: "Rural Iowa", state: "good" },
];

/** Headline sample numbers, reused across hero ticker + artifacts. */
export const SAMPLE = {
  target: "UA182 · JFK → LHR",
  baseline: 498,
  highest: 642,
  delta: 144,
  deltaPct: 29,
  pei: 1.29,
  variation: 71,
  drivers: [
    { name: "Location", weight: 62 },
    { name: "Device", weight: 21 },
    { name: "Cookies", weight: 10 },
    { name: "Referrer", weight: 7 },
  ],
  ci: { lo: 96, hi: 192, p: "< 0.01" },
};

export type Verdict = "clean" | "normal" | "deviant";

/** Receipt rows — native-currency capture + USD normalization + verdict. */
export const RECEIPT_ROWS: {
  loc: string; ip: string; ua: string; native: string; usd: number; verdict: Verdict;
}[] = [
  { loc: "US · Manhattan", ip: "RESIDENTIAL", ua: "iOS · Safari", native: "USD 642.00", usd: 642, verdict: "deviant" },
  { loc: "AE · Dubai", ip: "MOBILE", ua: "iOS · Safari", native: "AED 2,356.0", usd: 641, verdict: "deviant" },
  { loc: "JP · Tokyo", ip: "RESIDENTIAL", ua: "macOS · Safari", native: "JPY 91,200", usd: 612, verdict: "normal" },
  { loc: "GB · London", ip: "RESIDENTIAL", ua: "Win · Edge", native: "GBP 472.00", usd: 596, verdict: "normal" },
  { loc: "IN · Bangalore", ip: "DATACENTER", ua: "Win · Firefox", native: "INR 42,600", usd: 512, verdict: "normal" },
  { loc: "US · Rural Iowa", ip: "DATACENTER", ua: "Android · Chrome", native: "USD 498.00", usd: 498, verdict: "clean" },
];

/** Representative rows for the audit-readout distribution bars. */
export const EVIDENCE_ROWS: {
  profile: string; price: number; verdict: Verdict; tag?: "top" | "baseline";
}[] = [
  { profile: "iPhone · Manhattan · direct", price: 642, verdict: "deviant", tag: "top" },
  { profile: "Safari · Tokyo · direct", price: 612, verdict: "normal" },
  { profile: "Edge · London · direct", price: 596, verdict: "normal" },
  { profile: "Firefox · Bangalore · VPN", price: 512, verdict: "normal" },
  { profile: "Android · rural Iowa · VPN", price: 498, verdict: "clean", tag: "baseline" },
];

/** The six buyer-context vectors + their measured sensitivity (∂price/∂vector). */
export const VECTORS: { name: string; tag: string; sensitivity: number; held: boolean }[] = [
  { name: "Geography", tag: "ip-resolved city", sensitivity: 62, held: false },
  { name: "Device", tag: "user-agent · platform", sensitivity: 21, held: true },
  { name: "Cookies", tag: "aged vs fresh", sensitivity: 10, held: true },
  { name: "Referrer", tag: "direct vs comparison", sensitivity: 7, held: true },
  { name: "Browser language", tag: "Accept-Language", sensitivity: 4, held: true },
  { name: "Session", tag: "visit history", sensitivity: 3, held: true },
];
