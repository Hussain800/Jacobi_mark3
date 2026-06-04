import type { SensitivityMatrix, PEI } from "./types";

/**
 * Jacobian Sensitivity Matrix view — the price row of the Jacobian: how much
 * each identity variable moves the price, with the t-statistic, robust effect
 * size, sample size, and confidence the friendly driver-bars don't surface.
 * Topped by the attribution-gated Price Exploitation Index and its basis line
 * ("why this verdict was / was not claimed").
 */
const COLS = "1fr 84px 66px 56px 66px 104px";

function prettyVar(v: string): string {
  if (v.startsWith("language:")) return "Language · " + v.slice(9);
  const map: Record<string, string> = {
    location: "Location",
    device: "Device",
    cookie_profile: "Cookie profile",
    referrer: "Referrer",
  };
  return map[v] || v;
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "−") + "$" + Math.abs(n).toFixed(0);
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1) + "%";
}

export function JacobianMatrix({
  matrix,
  pei,
}: {
  matrix: SensitivityMatrix;
  pei?: PEI | null;
}) {
  const rows = matrix.rows || [];
  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 4 }}>
      {/* PEI headline */}
      {pei && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--text-2)",
            }}
          >
            Price Exploitation Index
          </span>
          <span
            className="mono"
            style={{
              fontSize: 26,
              fontWeight: 600,
              lineHeight: 1,
              color: pei.gated ? "var(--cobalt-bright)" : "var(--text-3)",
            }}
          >
            {Math.round(pei.score)}
            <span style={{ fontSize: 14, color: "var(--text-3)" }}>/100</span>
          </span>
          <span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--text-2)" }}>
            {pei.interpretation}
          </span>
        </div>
      )}

      {/* Matrix table */}
      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 10,
            padding: "11px 16px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--line)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--text)",
            fontWeight: 600,
          }}
        >
          <span>Variable</span>
          <span style={{ textAlign: "right" }}>Δ price</span>
          <span style={{ textAlign: "right" }}>Δ %</span>
          <span style={{ textAlign: "right" }}>t</span>
          <span style={{ textAlign: "right" }}>effect</span>
          <span style={{ textAlign: "right" }}>confidence</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.variable + i}
            style={{
              display: "grid",
              gridTemplateColumns: COLS,
              gap: 10,
              padding: "11px 16px",
              borderTop: i === 0 ? "none" : "1px solid var(--line)",
              fontFamily: "var(--mono)",
              fontSize: 12,
              alignItems: "center",
            }}
          >
            <span style={{ color: r.significant ? "var(--text)" : "var(--text-2)", fontWeight: r.significant ? 600 : 400 }}>
              {prettyVar(r.variable)}
            </span>
            <span style={{ textAlign: "right", color: "var(--text)" }}>{fmtMoney(r.delta_usd)}</span>
            <span style={{ textAlign: "right", color: r.significant ? "var(--cobalt-bright)" : "var(--text-3)" }}>
              {fmtPct(r.delta_pct)}
            </span>
            <span style={{ textAlign: "right", color: "var(--text-2)" }}>
              {r.t_statistic == null ? "—" : r.t_statistic.toFixed(1)}
            </span>
            <span style={{ textAlign: "right", color: "var(--text-2)" }}>
              {r.effect_size == null ? "—" : r.effect_size.toFixed(2)}
            </span>
            <span
              style={{
                textAlign: "right",
                color: r.significant ? "var(--good)" : "var(--text-3)",
                fontSize: 10.5,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {(r.confidence || "").replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>

      {/* Basis — the evidence-grade "why claimed / not" line */}
      {pei?.basis && (
        <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6, marginTop: 12 }}>
          {pei.basis}
        </p>
      )}
      {matrix.note && (
        <p style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-3)", marginTop: 8, letterSpacing: "0.03em" }}>
          {matrix.note}
        </p>
      )}
    </div>
  );
}
