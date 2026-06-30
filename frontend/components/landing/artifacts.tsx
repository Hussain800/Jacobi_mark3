"use client";

/**
 * Signature artifacts — these replace generic cards and carry Jacobi's identity.
 * All bound to the one canonical sample dataset (data.ts) so the numbers agree.
 */

import type { CSSProperties } from "react";
import { SAMPLE, RECEIPT_ROWS, EVIDENCE_ROWS, VECTORS } from "./data";

/* bar widths are driven by a --w custom property animated on reveal (see Reveals) */
const barW = (pct: number) => ({ "--w": `${pct}%` } as CSSProperties);

/* ── Evidence Receipt — the signature, printed on the light .jx-invert band ── */
export function EvidenceReceipt() {
  return (
    <div className="jx-receipt">
      <div className="jx-receipt__pad">
        <div className="jx-receipt__head">
          <span className="jx-receipt__title">Audit Receipt</span>
          <span className="jx-receipt__id">JACOBI · LOG #A7F2-22 · v3</span>
        </div>
        <div className="jx-receipt__meta">
          <span className="jx-receipt__k">target</span><span className="jx-receipt__v">ua182.example-air.com/booking · {SAMPLE.target}</span>
          <span className="jx-receipt__k">captured</span><span className="jx-receipt__v">2026-06-27 14:02:11 UTC</span>
          <span className="jx-receipt__k">probes</span><span className="jx-receipt__v">24 synthetic buyers · 6 vectors · 3 network tiers · public-web only</span>
        </div>
        <table className="jx-receipt__table">
          <thead>
            <tr>
              <th>#</th><th>Location</th><th>IP type</th><th>Agent</th>
              <th className="r">Native</th><th className="r">USD</th><th className="r">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {RECEIPT_ROWS.map((r, i) => (
              <tr key={i} className={r.verdict === "deviant" ? "dev" : ""}>
                <td>{String(i + 1).padStart(2, "0")}</td>
                <td>{r.loc}</td><td>{r.ip}</td><td>{r.ua}</td>
                <td className="r">{r.native}</td><td className="r">${r.usd}</td>
                <td className="r"><span className={`jx-receipt__v-tag ${r.verdict}`}>{r.verdict === "clean" ? "CLEAN" : r.verdict === "deviant" ? "DEVIANT" : "NORMAL"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="jx-receipt__foot">
          <div className="jx-receipt__stats">
            <div className="jx-receipt__stat"><div className="l">Price Exploitation Index</div><div className="v">{SAMPLE.pei.toFixed(2)}</div></div>
            <div className="jx-receipt__stat"><div className="l">Observed spread</div><div className="v">+${SAMPLE.delta}</div></div>
            <div className="jx-receipt__stat"><div className="l">Dominant driver</div><div className="v" style={{ fontSize: 16 }}>location</div></div>
          </div>
          <span className="jx-receipt__stamp">Progressive</span>
        </div>
      </div>
      <div className="jx-receipt__hash">sha256: 9f2c1ab7e4d0c8b3a611f0e2…7d54 · sealed · reproducible</div>
    </div>
  );
}

/* ── Buyer-Context Matrix — the control panel ── */
export function BuyerContextMatrix() {
  return (
    <div className="jx-matrix">
      <div className="jx-matrix__head"><span className="t">Buyer-context matrix</span><span className="m">6 vectors · 1 varied</span></div>
      <div className="jx-matrix__cols"><span>Vector</span><span className="r">State</span><span className="r">∂P / ∂V</span></div>
      {VECTORS.map((v) => (
        <div key={v.name} className={`jx-matrix__row${!v.held ? " is-varied" : ""}`}>
          <div>
            <div className="jx-matrix__name">{v.name}</div>
            <div className="jx-matrix__tag">{v.tag}</div>
          </div>
          <span className={`jx-matrix__state${!v.held ? " varied" : ""}`}>{v.held ? "held" : "varied"}</span>
          <div className="jx-matrix__sens">
            <div className="jx-matrix__bar"><div className="jx-matrix__fill" style={barW(v.sensitivity)} /></div>
            <span className="jx-matrix__pct" data-count={v.sensitivity} data-suffix="%">{v.sensitivity}%</span>
          </div>
        </div>
      ))}
      <div className="jx-matrix__foot">One vector varies; the rest are <b>held constant</b>. Only gaps that clear a Welch t-test are reported.</div>
    </div>
  );
}

/* ── Price-Delta proof — two buyers, one URL ── */
export function PriceDelta() {
  return (
    <div>
      <div className="jx-pd">
        <div className="jx-pd__buyer">
          <div className="jx-pd__who">Android · Chrome<br />rural Iowa · VPN</div>
          <div className="jx-pd__price base"><span data-count={SAMPLE.baseline} data-prefix="$">${SAMPLE.baseline}</span></div>
          <div className="jx-pd__native">USD 498.00 · baseline</div>
        </div>
        <div className="jx-pd__delta">
          <span className="x">Δ</span>
          <span className="d"><span data-count={SAMPLE.delta} data-prefix="+$">+${SAMPLE.delta}</span></span>
          <span className="p"><span data-count={SAMPLE.deltaPct} data-prefix="+" data-suffix="%">+{SAMPLE.deltaPct}%</span></span>
        </div>
        <div className="jx-pd__buyer">
          <div className="jx-pd__who">iPhone · Safari<br />Manhattan · direct</div>
          <div className="jx-pd__price dev"><span data-count={SAMPLE.highest} data-prefix="$">${SAMPLE.highest}</span></div>
          <div className="jx-pd__native">USD 642.00 · exposed</div>
        </div>
      </div>
      <p className="jx-pd__cap">same seat · same flight · same date — measured, not inferred</p>
    </div>
  );
}

/* ── Audit Readout — the dashboard verdict + confidence module ── */
const EV_LO = Math.min(...EVIDENCE_ROWS.map((e) => e.price));
const EV_HI = Math.max(...EVIDENCE_ROWS.map((e) => e.price));
const fillColor = (v: string) => (v === "deviant" ? "var(--jx-deviant)" : v === "clean" ? "var(--jx-baseline)" : "rgba(166,174,189,0.5)");

export function AuditReadout() {
  return (
    <div className="jx-audit">
      <div className="jx-audit__bar">
        <span className="jx-audit__target">ua182.example-air.com/booking · {SAMPLE.target}</span>
        <span className="jx-audit__status"><span className="d" /> Complete · 24 / 24</span>
      </div>
      <div className="jx-audit__grid">
        <div className="jx-audit__main">
          <div className="jx-kpis">
            <div className="jx-kpi"><div className="l">Baseline</div><div className="v base"><span data-count={SAMPLE.baseline} data-prefix="$">${SAMPLE.baseline}</span></div></div>
            <div className="jx-kpi"><div className="l">Highest</div><div className="v dev"><span data-count={SAMPLE.highest} data-prefix="$">${SAMPLE.highest}</span></div></div>
            <div className="jx-kpi"><div className="l">Delta</div><div className="v"><span data-count={SAMPLE.delta} data-prefix="+$">+${SAMPLE.delta}</span></div></div>
            <div className="jx-kpi"><div className="l">PEI</div><div className="v"><span data-count={SAMPLE.pei} data-decimals="2">{SAMPLE.pei.toFixed(2)}</span></div></div>
          </div>
          <div className="jx-dist">
            {EVIDENCE_ROWS.map((e, i) => {
              const w = Math.max(6, ((e.price - EV_LO) / (EV_HI - EV_LO)) * 100);
              return (
                <div className="jx-dist__row" key={i}>
                  <div>
                    <div className="jx-dist__top">
                      <span className="jx-dist__who">{e.profile}</span>
                      {e.tag === "top" && <span className="jx-dist__tag top">top</span>}
                      {e.tag === "baseline" && <span className="jx-dist__tag base">baseline</span>}
                    </div>
                    <div className="jx-dist__track"><div className="jx-dist__fill" style={{ "--w": `${w}%`, background: fillColor(e.verdict) } as CSSProperties} /></div>
                  </div>
                  <span className="jx-dist__price">${e.price}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="jx-audit__side">
          <span className="jx-side__badge"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--jx-caution)" }} /> Progressive</span>
          <div className="jx-side__big"><span data-count={SAMPLE.delta} data-prefix="+$">+${SAMPLE.delta}</span></div>
          <div className="jx-side__sub">{SAMPLE.deltaPct}% over baseline · per ticket</div>
          <div className="jx-side__drivers">
            {SAMPLE.drivers.map((d) => (
              <div className="jx-driver" key={d.name}>
                <span className="n">{d.name}</span>
                <div className="t"><div className="f" style={barW(d.weight)} /></div>
                <span className="p" data-count={d.weight} data-suffix="%">{d.weight}%</span>
              </div>
            ))}
          </div>
          <div className="jx-conf">
            <div className="jx-conf__row"><span className="jx-conf__k">Welch t-test</span><span className="jx-conf__v">p {SAMPLE.ci.p}</span></div>
            <div className="jx-conf__row"><span className="jx-conf__k">95% CI</span><span className="jx-conf__v">[ +${SAMPLE.ci.lo}, +${SAMPLE.ci.hi} ]</span></div>
            <div className="jx-conf__row"><span className="jx-conf__k">Result</span><span className="jx-conf__verdict">SIGNIFICANT</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
