"use client";

/**
 * Shared presentational pieces for the enterprise audit workspace.
 * Styled with jacobi-design.css tokens so the dashboard matches the
 * reframed marketing surface.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type Severity,
  type Confidence,
  type FindingType,
  type FindingStatus,
  severityColor,
  confidenceColor,
  typeLabel,
  statusLabel,
} from "./demo-data";

/* ── DEMO banner — honesty rule: seeded data is always labeled ────────── */

export function DemoModeBanner() {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        justifyContent: "center", textAlign: "center",
        padding: "9px 16px",
        background: "rgba(216,176,106,0.14)",
        borderBottom: "1px solid rgba(216,176,106,0.34)",
        fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em",
        color: "var(--gold)",
      }}
    >
      <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em" }}>
        ● Demo data
      </span>
      <span style={{ color: "var(--text-2)" }}>
        Sample audit workspace for illustration. “Run audit” executes a real, live audit.
      </span>
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

const TABS = [
  { label: "Overview", href: "/dashboard/overview" },
  { label: "Portfolio", href: "/dashboard/portfolio" },
  { label: "Findings", href: "/dashboard/findings" },
  { label: "Evidence", href: "/dashboard/evidence" },
  { label: "Run audit", href: "/dashboard/audits" },
];

export function DashboardTabs() {
  const pathname = usePathname();
  return (
    <div style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
      <div className="wrap" style={{ display: "flex", gap: 4, overflowX: "auto" }}>
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: "16px 18px",
                fontFamily: "var(--mono)", fontSize: 12,
                letterSpacing: "0.1em", textTransform: "uppercase",
                color: active ? "var(--cobalt-bright)" : "var(--text-2)",
                borderBottom: active ? "2px solid var(--cobalt-bright)" : "2px solid transparent",
                textDecoration: "none", whiteSpace: "nowrap",
                transition: "color .15s",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Badges & pills ───────────────────────────────────────────────────── */

function pill(label: string, color: string, opts?: { solid?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 9px", borderRadius: 999,
        fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase",
        color: opts?.solid ? "#07080b" : color,
        background: opts?.solid ? color : "color-mix(in srgb, " + color + " 14%, transparent)",
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return pill(severity, severityColor(severity), { solid: severity === "critical" });
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const label = confidence === "insufficient" ? "insufficient" : `${confidence} confidence`;
  return pill(label, confidenceColor(confidence));
}

export function TypePill({ type }: { type: FindingType }) {
  const color = type === "surveillance" ? "var(--cobalt-bright)" : "var(--gold)";
  return pill(typeLabel(type), color);
}

export function StatusPill({ status }: { status: FindingStatus }) {
  const color =
    status === "escalated" ? "var(--over)" :
    status === "reviewing" ? "var(--cobalt-bright)" :
    status === "resolved" ? "var(--good)" : "var(--text-2)";
  return pill(statusLabel(status), color);
}

/* ── KPI strip ────────────────────────────────────────────────────────── */

export function KpiStrip({ items }: { items: Array<{ label: string; value: string; accent?: string }> }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        background: "var(--line)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-sm)",
        overflow: "hidden",
      }}
    >
      {items.map((it) => (
        <div key={it.label} style={{ background: "var(--surface)", padding: "18px 20px", flex: "1 1 150px" }}>
          <div
            className="serif tnum"
            style={{ fontSize: 30, lineHeight: 1, color: it.accent || "var(--text)", marginBottom: 8 }}
          >
            {it.value}
          </div>
          <div className="label-mono" style={{ color: "var(--text-2)" }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Section header ───────────────────────────────────────────────────── */

export function PageHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <span className="eyebrow"><span className="dot">●</span> {eyebrow}</span>
      <h1 className="display sec-title" style={{ marginTop: 10 }}>{title}</h1>
      {lede && <p className="sec-lede sec" style={{ marginTop: 8 }}>{lede}</p>}
    </div>
  );
}

/* ── Evidence export controls ─────────────────────────────────────────── */

export function EvidenceActions() {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button className="btn btn-primary" onClick={() => window.print()}>
        ↓ Download evidence packet
      </button>
      <button
        className="btn btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch { /* clipboard unavailable */ }
        }}
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
      <button className="btn btn-ghost" title="Available in the full product" style={{ opacity: 0.6, cursor: "default" }}>
        Export JSON
      </button>
    </div>
  );
}
