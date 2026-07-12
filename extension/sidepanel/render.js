(function (root, factory) {
  const value = factory(root.JacobiConfig);
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiRender = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  "use strict";

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtMoney(value) {
    if (!value || value.amount === null || value.amount === undefined || !value.currency) return "Unknown";
    const number = Number(value.amount);
    if (!Number.isFinite(number)) return "Unknown";
    return esc(value.currency) + " " + number.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(number) ? 0 : 2 });
  }

  function resultState(result) {
    const status = result && result.recommendation && result.recommendation.status;
    if (status === "save") return "saving";
    if (status === "already_best") return "no-saving";
    if (status === "tradeoff") return "tradeoff";
    if (status === "error_partial" || (result && result.provider_errors && result.provider_errors.length)) return "partial-failure";
    if (status === "insufficient_evidence" || (result && result.confidence === "low")) return "uncertainty";
    return "uncertainty";
  }

  function identityPreview(context, preview) {
    const offer = context && context.current_offer ? context.current_offer : (preview || {});
    const identity = [offer.brand, offer.model || offer.mpn, offer.title].filter(Boolean);
    const identifiers = [
      offer.gtin ? ["GTIN", offer.gtin] : null,
      offer.mpn ? ["MPN", offer.mpn] : null,
      offer.sku ? ["SKU", offer.sku] : null,
    ].filter(Boolean);
    return `<section class="identity" aria-label="Extracted product identity">
      <div class="eyebrow">Product identity preview</div>
      <h2>${esc(identity[0] || "Product detected")}</h2>
      ${identity.slice(1).map(function (item) { return `<p>${esc(item)}</p>`; }).join("")}
      <div class="tags">${identifiers.map(function (item) { return `<span>${esc(item[0])}: ${esc(item[1])}</span>`; }).join("")}</div>
      <div class="price-line">Observed price: ${fmtMoney(offer.price || (offer.amount && offer.currency ? { amount: offer.amount, currency: offer.currency } : null))}</div>
      <p class="privacy-note">Only these extracted fields, the source URL, and provenance are sent to your configured Jacobi API.</p>
    </section>`;
  }

  function offerRows(offer) {
    const price = offer && offer.price ? offer.price : {};
    const rows = [["Item", fmtMoney(price.item)]];
    if (price.shipping) rows.push(["Shipping", fmtMoney(price.shipping)]);
    if (Array.isArray(price.unknown_components) && price.unknown_components.length) rows.push(["Unknown costs", price.unknown_components.join(", ")]);
    rows.push(["All-in total", fmtMoney(price.payable_total) + (price.total_complete === false ? " (incomplete)" : "")]);
    if (offer.delivery && (offer.delivery.estimate || offer.delivery.text)) rows.push(["Delivery", offer.delivery.estimate || offer.delivery.text]);
    if (offer.warranty && (offer.warranty.region || offer.warranty.text)) rows.push(["Warranty", offer.warranty.region || offer.warranty.text]);
    rows.push(["Condition", offer.condition || "unknown"]);
    if (offer.seller && offer.seller.name) rows.push(["Seller", offer.seller.name]);
    return rows.map(function (row) { return `<div class="row"><span>${esc(row[0])}</span><strong>${esc(row[1])}</strong></div>`; }).join("");
  }

  function candidates(title, items) {
    if (!Array.isArray(items) || !items.length) return "";
    return `<details><summary>${esc(title)} (${items.length})</summary>${items.map(function (candidate) {
      const offer = candidate.offer || {};
      const explanation = candidate.equivalence && candidate.equivalence.explanation;
      const reasons = Array.isArray(candidate.exclusion_reasons) ? candidate.exclusion_reasons.join(", ") : "";
      return `<div class="candidate"><strong>${esc(offer.merchant_name || "Unknown merchant")}</strong><span>${fmtMoney(offer.price && (offer.price.payable_total || offer.price.item))}</span><p>${esc(explanation || reasons || "No explanation supplied")}</p></div>`;
    }).join("")}</details>`;
  }

  function result(result) {
    const state = resultState(result);
    const rec = result.recommendation || {};
    const best = result.best_offer;
    const current = result.current_offer;
    const errors = result.provider_errors || [];
    const labels = {
      saving: "Verified saving found",
      "no-saving": "No verified saving",
      tradeoff: "Cheaper route has a trade-off",
      "partial-failure": "Partial results",
      uncertainty: "More evidence needed",
    };
    const bestCard = best && (state === "saving" || state === "tradeoff") ? `<section class="card best"><div class="eyebrow">Recommended route</div><h3>${esc(best.merchant_name)}</h3><div class="big-price">${fmtMoney(best.price && (best.price.payable_total || best.price.item))}</div>${offerRows(best)}</section><button class="primary" id="open-best">Open ${state === "saving" ? "cheaper" : "alternative"} route</button>` : "";
    const partial = errors.length ? `<div class="notice warn"><strong>Some providers failed.</strong> ${esc(errors.map(function (e) { return e.merchant_id; }).join(", "))}. Results shown are partial.</div>` : "";
    return `<div class="state" data-state="${esc(state)}">
      <div class="eyebrow">${esc(labels[state])}</div>
      <h1 class="headline ${state}">${esc(rec.headline || labels[state])}</h1>
      <p class="subline">${esc(rec.explanation || "Jacobi could not verify a complete equivalent route.")}</p>
      ${partial}${bestCard}
      ${current ? `<section class="card"><div class="eyebrow">Current page</div><h3>${esc(current.merchant_name || "Current merchant")}</h3>${offerRows(current)}</section>` : ""}
      ${candidates("Other exact offers", (result.eligible_offers || []).filter(function (c) { return !best || c.offer.observation_id !== best.observation_id; }))}
      ${candidates("Disclosed trade-offs", result.tradeoff_offers)}
      ${candidates("Similar, not equivalent", result.similar_offers)}
      ${candidates("Excluded offers and reasons", result.rejected_offers)}
      <div class="action-row">
        <button id="show-evidence" ${result.evidence_manifest_id ? "" : "disabled"}>Evidence details</button>
        <button id="report-mismatch">Report wrong match</button>
      </div>
      <div id="evidence-output" class="evidence-output" hidden></div>
      <details><summary>Method details</summary>
        <div class="row"><span>Evidence manifest</span><strong>${esc(result.evidence_manifest_id || "Unavailable")}</strong></div>
        <div class="row"><span>Comparison ID</span><strong>${esc(result.comparison_id || "Unavailable")}</strong></div>
        <div class="row"><span>Confidence</span><strong>${esc(result.confidence || "unknown")}</strong></div>
        <div class="row"><span>Fixture data</span><strong>${result.fixture_mode ? "yes — deterministic demo data" : "no"}</strong></div>
      </details>
    </div>`;
  }

  function safeActionUrl(result) {
    const candidate = result && result.recommendation && result.recommendation.action_url || result && result.best_offer && result.best_offer.source_url;
    const parsed = config.safeHttpUrl(candidate);
    return parsed ? parsed.toString() : null;
  }

  return { esc, fmtMoney, resultState, identityPreview, result, safeActionUrl };
});
