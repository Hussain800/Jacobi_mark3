"use client";

/**
 * Jacobi for Agents — provenance verification view.
 *
 * Runs the price-provenance pipeline that AI agents call before recommending
 * or booking, and renders the DecisionEnvelope without requiring raw JSON:
 * decision, provenance score + components, reason codes, price trace, policy
 * status, human explanation, evidence manifest summary, limitations, and the
 * safe next action. Fixture-backed runs are always labeled as fixtures.
 */

import { useState } from "react";
import { getClientApiBase } from "@/lib/api-base";

/* ── Envelope subset rendered here (backend/agentcore/schemas.py) ──────── */

type MoneyT = { amount: number; currency: string; label?: string | null };

type Envelope = {
  request_id: string;
  decision:
    | "proceed" | "proceed_with_caution" | "ask_user"
    | "handoff_to_user" | "use_official_route" | "block";
  provenance_score: number;
  confidence: "low" | "medium" | "high";
  score_components: Record<string, number>;
  reason_codes: string[];
  user_explanation: string;
  agent_instruction: string;
  next_action: string;
  price_summary: {
    observed_total?: MoneyT | null;
    displayed_total?: MoneyT | null;
    delta_abs?: MoneyT | null;
    delta_pct?: number | null;
    mandatory_fees_detected: MoneyT[];
    currency_notes: string[];
    price_trace: Array<{ stage: string; label: string; amount: number; currency: string }>;
  };
  route_summary: { source_route: string; preferred_route: string; route_legality: string };
  policy?: {
    domain: string; decision: string; action_mode: string;
    reason: string; reason_code?: string | null;
  } | null;
  evidence: {
    manifest_id: string; manifest_sha256: string;
    capability_tier: string; limitations: string[];
  };
  budget: { estimated_cost_usd: number; budget_status: string };
  fixture_mode: boolean;
};

const API = getClientApiBase();

const DECISION_COLOR: Record<Envelope["decision"], string> = {
  proceed: "var(--good)",
  proceed_with_caution: "var(--gold)",
  ask_user: "var(--gold)",
  handoff_to_user: "var(--cobalt-bright)",
  use_official_route: "var(--cobalt-bright)",
  block: "var(--over)",
};

const COMPONENT_LABELS: Record<string, string> = {
  source_legitimacy: "Source legitimacy",
  total_price_integrity: "Total-price integrity",
  price_stability: "Price stability",
  inventory_freshness: "Inventory freshness",
  policy_safety: "Policy safety",
  evidence_quality: "Evidence quality",
  user_control: "User control",
};

/* ── Small presentational helpers (jacobi-design tokens) ───────────────── */

function pill(label: string, color: string) {
  return (
    <span
      key={label}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "3px 9px", borderRadius: 999,
        fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
        letterSpacing: "0.1em", textTransform: "uppercase",
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function money(m?: MoneyT | null) {
  if (!m) return "—";
  return `${m.currency} ${m.amount.toLocaleString()}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div
        style={{
          fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--text-2)", marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 12,
  background: "var(--surface)", padding: 20,
};

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ProvenancePage() {
  const [env, setEnv] = useState<Envelope | null>(null);
  const [manifest, setManifest] = useState<unknown | null>(null);
  const [showManifest, setShowManifest] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advUrl, setAdvUrl] = useState("");
  const [advScope, setAdvScope] = useState("recommend");

  async function runVerify(body: Record<string, unknown>, label: string) {
    setLoading(label);
    setError(null);
    setEnv(null);
    setManifest(null);
    setShowManifest(false);
    const target = `${API}/api/v1/agent/verify`;
    try {
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const detail = await r.text();
        throw new Error(`HTTP ${r.status} from ${target}: ${detail.slice(0, 300)}`);
      }
      setEnv((await r.json()) as Envelope);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  async function toggleManifest() {
    if (showManifest) {
      setShowManifest(false);
      return;
    }
    if (!env) return;
    if (!manifest) {
      try {
        const r = await fetch(`${API}/api/v1/agent/manifests/${env.evidence.manifest_id}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setManifest(await r.json());
      } catch (e) {
        setError(`Manifest fetch failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    setShowManifest(true);
  }

  return (
    <div>
      <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Agent provenance</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", maxWidth: 720 }}>
        The verification layer AI agents call before recommending or booking.
        Jacobi checks whether a price is current, total, fee-complete and safe
        to act on, then returns a decision with evidence. No purchase is ever
        executed.
      </p>

      {/* Demo launchers */}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Lodging fee-drift check</div>
          <p style={{ color: "var(--text-2)", fontSize: 13, minHeight: 54 }}>
            Listing shows AED 2,180 — checkout-prep evidence totals AED 2,530
            after 3 mandatory fees. Fixture-backed demo.
          </p>
          <button
            className="btn"
            disabled={loading !== null}
            onClick={() => runVerify({ demo: "fee_drift", consent_scope: "recommend" }, "fee_drift")}
            style={{ cursor: "pointer" }}
          >
            {loading === "fee_drift" ? "Verifying…" : "Run verification"}
          </button>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Restricted-route purchase attempt</div>
          <p style={{ color: "var(--text-2)", fontSize: 13, minHeight: 54 }}>
            An agent requests purchase_authorized on a platform whose terms
            prohibit automated booking. Jacobi must block it.
          </p>
          <button
            className="btn"
            disabled={loading !== null}
            onClick={() => runVerify({ demo: "blocked_route" }, "blocked_route")}
            style={{ cursor: "pointer" }}
          >
            {loading === "blocked_route" ? "Verifying…" : "Run verification"}
          </button>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Verify any URL</div>
          <input
            value={advUrl}
            onChange={(e) => setAdvUrl(e.target.value)}
            placeholder="https://example.com/product"
            style={{
              width: "100%", boxSizing: "border-box", marginBottom: 8,
              background: "transparent", border: "1px solid var(--line)",
              borderRadius: 8, padding: "8px 10px", color: "var(--text-1, inherit)",
              fontFamily: "var(--mono)", fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={advScope}
              onChange={(e) => setAdvScope(e.target.value)}
              style={{
                background: "var(--surface)", border: "1px solid var(--line)",
                borderRadius: 8, padding: "8px 10px", color: "inherit",
                fontFamily: "var(--mono)", fontSize: 12,
              }}
            >
              <option value="research_only">research_only</option>
              <option value="recommend">recommend</option>
              <option value="checkout_prepare">checkout_prepare</option>
              <option value="purchase_authorized">purchase_authorized</option>
            </select>
            <button
              className="btn"
              disabled={loading !== null || !advUrl.trim()}
              onClick={() => runVerify({ url: advUrl.trim(), consent_scope: advScope }, "custom")}
              style={{ cursor: "pointer" }}
            >
              {loading === "custom" ? "Verifying…" : "Verify"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 20, padding: 14, borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--over) 45%, transparent)",
            background: "color-mix(in srgb, var(--over) 10%, transparent)",
            fontFamily: "var(--mono)", fontSize: 12, color: "var(--over)",
            wordBreak: "break-all",
          }}
        >
          Verification failed — is the backend running? {error}
        </div>
      )}

      {env && (
        <div style={{ ...cardStyle, marginTop: 24 }}>
          {/* Header: decision + score + fixture banner */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "6px 14px", borderRadius: 8, fontWeight: 800,
                fontFamily: "var(--mono)", letterSpacing: "0.08em",
                textTransform: "uppercase", fontSize: 13,
                color: "#070809", background: DECISION_COLOR[env.decision],
              }}
            >
              {env.decision.replaceAll("_", " ")}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>
              {env.provenance_score}
              <span style={{ fontSize: 12, color: "var(--text-2)" }}> /100 provenance</span>
            </span>
            {pill(`${env.confidence} confidence`, "var(--cobalt-bright)")}
            {env.fixture_mode && pill("fixture demo data", "var(--gold)")}
          </div>

          <Section title="Why">
            <p style={{ margin: 0, maxWidth: 760 }}>{env.user_explanation}</p>
          </Section>

          <Section title="Reason codes">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {env.reason_codes.map((c) =>
                pill(
                  c,
                  c.includes("BLOCK") || c.includes("FORBID") || c.includes("RESTRICTED")
                    ? "var(--over)"
                    : c.includes("STABLE") || c === "OFFICIAL_ROUTE_FOUND"
                      ? "var(--good)"
                      : "var(--gold)",
                ),
              )}
            </div>
          </Section>

          <Section title="Score components">
            <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => {
                const v = env.score_components[key] ?? 0;
                return (
                  <div key={key} style={{ display: "grid", gridTemplateColumns: "180px 1fr 40px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</span>
                    <div style={{ height: 6, borderRadius: 3, background: "color-mix(in srgb, var(--line) 60%, transparent)" }}>
                      <div
                        style={{
                          width: `${v}%`, height: "100%", borderRadius: 3,
                          background: v >= 70 ? "var(--good)" : v >= 45 ? "var(--gold)" : "var(--over)",
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{v}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {env.price_summary.price_trace.length > 0 && (
            <Section title="Price trace">
              <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 380 }}>
                <tbody>
                  {env.price_summary.price_trace.map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "7px 14px 7px 0", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2)", textTransform: "uppercase" }}>
                        {t.stage.replaceAll("_", " ")}
                      </td>
                      <td style={{ padding: "7px 14px 7px 0" }}>{t.label}</td>
                      <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 600 }}>
                        {t.currency} {t.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {env.price_summary.delta_abs && (
                    <tr>
                      <td />
                      <td style={{ padding: "9px 14px 0 0", fontWeight: 700 }}>Drift vs displayed</td>
                      <td
                        style={{
                          padding: "9px 0 0", textAlign: "right", fontWeight: 800,
                          color: env.price_summary.delta_abs.amount > 0 ? "var(--over)" : "var(--good)",
                        }}
                      >
                        {env.price_summary.delta_abs.amount > 0 ? "+" : ""}
                        {money(env.price_summary.delta_abs)}
                        {env.price_summary.delta_pct != null && ` (${env.price_summary.delta_pct > 0 ? "+" : ""}${env.price_summary.delta_pct}%)`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>
          )}

          {env.policy && (
            <Section title="Platform policy">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {pill(
                  `policy: ${env.policy.decision}`,
                  env.policy.decision === "block" ? "var(--over)" : env.policy.decision === "warn" ? "var(--gold)" : "var(--good)",
                )}
                {pill(env.policy.action_mode.replaceAll("_", " "), "var(--cobalt-bright)")}
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                  {env.policy.domain} — {env.policy.reason}
                </span>
              </div>
            </Section>
          )}

          <Section title="Evidence manifest">
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, display: "grid", gap: 6 }}>
              <span>id: {env.evidence.manifest_id}</span>
              <span style={{ wordBreak: "break-all" }}>
                sha256: {env.evidence.manifest_sha256.slice(0, 24)}…{" "}
                <button
                  onClick={() => navigator.clipboard?.writeText(env.evidence.manifest_sha256)}
                  style={{ background: "none", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text-2)", cursor: "pointer", fontSize: 10, padding: "2px 8px" }}
                >
                  copy
                </button>
              </span>
              <span>tier: {env.evidence.capability_tier}</span>
            </div>
            {env.evidence.limitations.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-2)", fontSize: 13 }}>
                {env.evidence.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button
                onClick={toggleManifest}
                style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, color: "inherit", cursor: "pointer", fontSize: 12, padding: "7px 12px" }}
              >
                {showManifest ? "Hide manifest JSON" : "View manifest JSON"}
              </button>
              <a
                href={`${API}/api/v1/agent/manifests/${env.evidence.manifest_id}/export`}
                style={{ border: "1px solid var(--line)", borderRadius: 8, color: "inherit", fontSize: 12, padding: "7px 12px", textDecoration: "none" }}
              >
                Download JSON
              </a>
            </div>
            {showManifest && manifest != null && (
              <pre
                style={{
                  marginTop: 12, padding: 12, borderRadius: 8, overflow: "auto",
                  maxHeight: 320, fontSize: 11, border: "1px solid var(--line)",
                  background: "color-mix(in srgb, var(--line) 20%, transparent)",
                }}
              >
                {JSON.stringify(manifest, null, 2)}
              </pre>
            )}
          </Section>

          <Section title="Safe next action">
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>{env.next_action}</span>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                Agent instruction: {env.agent_instruction}
              </span>
              <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-2)" }}>
                preferred route: {env.route_summary.preferred_route} · legality: {env.route_summary.route_legality} · budget: {env.budget.budget_status}
              </span>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
