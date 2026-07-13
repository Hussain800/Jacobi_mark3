(function (root, factory) {
  const value = factory(root.JacobiRender);
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiTravelRender = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function (base) {
  "use strict";

  const esc = base.esc;

  function money(value, fallbackCurrency) {
    if (!value) return "Unknown";
    const amount = value.amount != null ? value.amount : value.total_amount != null ? value.total_amount : value.item_amount;
    const currency = value.currency || fallbackCurrency;
    return amount != null && currency ? `${esc(currency)} ${esc(amount)}` : "Unknown";
  }

  function environment(value) {
    const labels = {
      fixture: "Fixture data",
      sandbox_api: "Sandbox API",
      live_official_api: "Live official API",
      browser_observed: "Browser-observed baseline",
      direct_public_metadata: "Direct public metadata",
      managed_provider: "Managed provider",
    };
    return labels[value] || "Unknown environment (unverified)";
  }

  function preview(extracted, settings) {
    const intent = extracted.context.intent;
    const baseline = intent.baseline_offer;
    let title;
    let detail;
    if (extracted.vertical === "flight") {
      const first = intent.legs[0];
      const last = intent.legs[intent.legs.length - 1];
      title = `${first.origin_airport} → ${first.destination_airport}`;
      detail = `${intent.trip_type.replace(/_/g, " ")} · ${first.departure_date}${intent.legs.length > 1 ? " to " + last.departure_date : ""} · ${intent.passengers.adults} adult${intent.passengers.adults === 1 ? "" : "s"}`;
    } else {
      title = intent.property_hint.name;
      detail = `${intent.check_in} to ${intent.check_out} · ${intent.rooms.length} room${intent.rooms.length === 1 ? "" : "s"}`;
    }
    const automatic = settings.travel.mode === "automatic" && settings.travel.automaticSavingsConsent;
    return `<section class="identity" aria-label="Locally extracted travel intent">
      <div class="eyebrow">${esc(extracted.vertical)} intent · ${esc(extracted.adapterId)} ${esc(extracted.adapterVersion)}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(detail)}</p>
      <div class="price-line">Page baseline: ${money(baseline && baseline.visible_price)}</div>
      <div class="tags"><span>${environment(baseline && baseline.observation_method)}</span><span>confidence ${esc(extracted.confidence)}</span></div>
      <p class="privacy-note">No raw HTML, complete page URL, passenger/guest identity, booking reference, session token, or payment field is sent. ${automatic ? "Automatic submission was explicitly enabled for this supported demo origin." : "Privacy Mode sends this sanitized intent only after you click."}</p>
    </section>`;
  }

  function row(label, value) {
    return `<div class="row"><span>${esc(label)}</span><strong>${esc(value == null ? "Unknown" : value)}</strong></div>`;
  }

  function offerCard(offer, selected) {
    if (!offer) return "";
    const equivalence = offer.equivalence || {};
    const saving = offer.saving || {};
    const limitations = Array.isArray(offer.limitations) ? offer.limitations : [];
    const fixture = (offer.provider_environment || offer.observation_method) === "fixture";
    return `<section class="card ${selected ? "best" : ""}">
      <div class="eyebrow">${selected ? (fixture ? "Fixture candidate" : "Best independently queried route") : "Candidate route"}</div>
      <h3>${esc(offer.provider || offer.supplier_id || "Unknown provider")}</h3>
      <div class="big-price">${money(offer, offer.currency)}</div>
      ${row("Data origin", environment(offer.provider_environment || offer.observation_method))}
      ${row("Equivalence", String(equivalence.classification || "insufficient_evidence").replace(/_/g, " "))}
      ${row("Saving claim", String(saving.claim || "cannot_compare").replace(/_/g, " "))}
      ${row("Mandatory costs", offer.total_complete === true ? "complete" : "incomplete or unknown")}
      ${row("Observed", offer.observed_at ? new Date(offer.observed_at).toLocaleString() : "Unknown")}
      ${limitations.length ? `<div class="notice warn">Limitations: ${esc(limitations.join(", "))}</div>` : ""}
    </section>`;
  }

  function progressive(state) {
    const labels = {
      accepted: "Search accepted",
      parsed: "Intent validated",
      cache_checked: "Independent cache checked",
      running: "Querying independent provider",
      partial: "Reviewing partial results",
      verifying: "Checking equivalence and mandatory costs",
    };
    return `<div class="progress"><span></span>${esc(labels[state.status] || "Checking independent travel prices")}</div>`;
  }

  function resultState(state) {
    if (!state) return "travel-ready";
    if (state.status === "expired") return "stale";
    if (state.status === "failed") return "error";
    if (state.status === "degraded") return "degraded";
    if (!Array.isArray(state.result && state.result.offers) || !state.result.offers.length) return "no-saving";
    const result = state.result;
    const offer = result.offers.find(function (item) { return item.offer_id === result.selected_offer_id; }) || result.offers[0];
    const classification = offer && offer.equivalence && offer.equivalence.classification;
    if (classification === "equivalent_with_disclosed_tradeoff") return "tradeoff";
    if (classification === "insufficient_evidence" || classification === "similar_not_equivalent") return "uncertainty";
    const claim = result.saving && result.saving.claim || offer && offer.saving && offer.saving.claim;
    return ["verified", "conditional", "potential"].includes(claim) ? "saving" : "no-saving";
  }

  function state(extracted, settings, current) {
    const head = preview(extracted, settings);
    if (!current || current.status === "detected") {
      const privacy = settings.travel.mode !== "automatic" || !settings.travel.automaticSavingsConsent;
      return head + `<div class="state" data-state="travel-ready"><div class="eyebrow">${privacy ? "Privacy Mode" : "Automatic Savings Mode"}</div><h1>${privacy ? "Ready when you are" : "Waiting for the independent search"}</h1><p class="subline">${privacy ? "Your itinerary or stay is still local." : "The supported-page consent is active; the side panel opened only because you clicked Jacobi."}</p>${privacy ? '<button class="primary" id="travel-start">Search independently</button>' : progressive({ status: "accepted" })}</div>`;
    }
    if (!["completed", "degraded", "failed", "expired"].includes(current.status)) {
      return head + `<div class="state" data-state="checking"><div class="eyebrow">Independent check</div><h1>Comparing the same trip</h1>${progressive(current)}<p class="subline">No comparison tabs are opened and no itinerary is entered twice.</p></div>`;
    }
    const result = current.result || {};
    const offers = Array.isArray(result.offers) ? result.offers : [];
    const selected = offers.find(function (item) { return item.offer_id === result.selected_offer_id; }) || offers[0] || null;
    const mode = resultState(current);
    const titles = {
      saving: "A cheaper route may be available",
      "no-saving": "No evidenced saving found",
      tradeoff: "A cheaper route has a disclosed trade-off",
      uncertainty: "Equivalence is not proven",
      degraded: "Partial provider result",
      stale: "This result is stale",
      error: "The independent check failed",
    };
    const rejected = offers.filter(function (offer) { return !offer.eligible; });
    const recheck = selected && selected.revalidation_supported !== false && extracted.vertical === "flight" && !["failed", "expired"].includes(current.status)
      ? '<button class="primary" id="travel-revalidate">Recheck price &amp; open supplier route</button>'
      : "";
    return head + `<div class="state" data-state="${esc(mode)}">
      <div class="eyebrow">${esc(mode.replace(/-/g, " "))}</div>
      <h1 class="headline ${esc(mode)}">${esc(titles[mode] || titles.uncertainty)}</h1>
      <p class="subline">${esc(current.error || (result.saving && result.saving.explanation) || "Jacobi separates exactness, total-cost completeness, freshness, and provider limitations." )}</p>
      ${selected ? offerCard(selected, true) : '<div class="notice warn">No independently queried offer is available.</div>'}
      ${recheck}
      ${selected && selected.revalidation_supported === false && extracted.vertical === "flight" ? '<div class="notice warn">This fixture demonstrates rendering only. It cannot authorize a supplier redirect without a configured provider revalidation.</div>' : ""}
      ${extracted.vertical === "hotel" && selected ? '<div class="notice warn">This hotel provider does not expose a guaranteed equivalent price-check endpoint, so Jacobi does not authorize a supplier redirect.</div>' : ""}
      ${rejected.length ? `<details><summary>Rejected or ineligible candidates (${rejected.length})</summary>${rejected.map(function (item) { return offerCard(item, false); }).join("")}</details>` : ""}
      ${Array.isArray(result.degraded_reasons) && result.degraded_reasons.length ? `<div class="notice warn">Degraded: ${esc(result.degraded_reasons.join(", "))}</div>` : ""}
      <details><summary>Search details</summary>${row("Search ID", current.searchId || "Unavailable")}${row("Status", current.status)}${row("Adapter", `${extracted.adapterId} ${extracted.adapterVersion}`)}</details>
    </div>`;
  }

  function changed(revalidation) {
    return `<div class="notice warn" id="travel-revalidation-notice"><strong>The provider price changed.</strong> ${esc((revalidation.changes || []).join(", ") || "Review the new total on the source page and run a fresh search.")} Jacobi did not open a route.</div>`;
  }

  return { environment, resultState, preview, state, changed };
});
