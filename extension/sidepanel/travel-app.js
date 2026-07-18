(function (root) {
  "use strict";

  const view = document.getElementById("view");
  const freshness = document.getElementById("freshness");
  let active = null;
  let settings = null;
  let state = null;

  function getActiveTab() {
    return new Promise(function (resolve) { chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { resolve(tabs && tabs[0]); }); });
  }

  function tabContext(tabId) {
    return new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { type: JacobiMessages.TYPES.REQUEST_TRAVEL_CONTEXT }, function (response) {
        if (chrome.runtime.lastError) resolve(null); else resolve(response || null);
      });
    });
  }

  async function extract(tab) {
    let response = await tabContext(tab.id);
    if (response && response.ok) return response;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/travel.js", "travel-context.js"] });
    } catch (_) { return null; }
    response = await tabContext(tab.id);
    return response && response.ok ? response : null;
  }

  async function readSettings() {
    const stored = await chrome.storage.sync.get(JacobiConfig.SETTINGS_KEY);
    return JacobiConfig.normalizeSettings(stored[JacobiConfig.SETTINGS_KEY]);
  }

  async function demoContext(vertical) {
    const degraded = vertical === "degraded";
    const fixtureVertical = vertical === "hotel" ? "hotel" : "flight";
    const file = fixtureVertical === "hotel" ? "fixture-hotel-v1.html" : "fixture-flight-v1.html";
    const html = await (await fetch(`../tests/fixtures/${file}`)).text();
    const documentValue = new DOMParser().parseFromString(html, "text/html");
    const extracted = await JacobiTravel.extract(documentValue, {
      href: `http://127.0.0.1:4173/${file}`,
      hostname: "127.0.0.1",
    }, new Date("2026-07-13T10:00:00Z"));
    const amount = fixtureVertical === "hotel" ? "2600.00" : "2899.00";
    const offerId = `fixture-${fixtureVertical}-offer-v1`;
    const result = degraded ? {
      selected_offer_id: null,
      saving: null,
      provider_environment: "fixture",
      degraded_reasons: ["provider_timeout"],
      offers: [],
    } : {
      selected_offer_id: offerId,
      saving: { claim: "potential", explanation: "Fixture saving for deterministic UI verification; a real supplier route would still require fresh revalidation." },
      degraded_reasons: [],
      offers: [{
        offer_id: offerId,
        provider: "amadeus-fixture",
        supplier_id: "fixture-supplier",
        currency: "AED",
        total_amount: amount,
        total_complete: true,
        provider_environment: "fixture",
        observation_method: "fixture",
        observed_at: "2026-07-13T10:00:02Z",
        eligible: true,
        equivalence: { classification: "exact" },
        saving: { claim: "potential" },
        evidence_manifest_id: `man_fixture_${fixtureVertical}_offer_v1`,
        revalidation_supported: false,
        limitations: fixtureVertical === "hotel"
          ? ["hotel revalidation unavailable in the initial provider contract"]
          : ["fixture rendering does not call a provider revalidation endpoint"],
      }],
    };
    return {
      extracted: {
        ok: true,
        adapterId: extracted.adapter_id,
        adapterVersion: extracted.adapter_version,
        vertical: extracted.vertical,
        confidence: extracted.confidence,
        fingerprint: extracted.fingerprint,
        context: extracted.context,
      },
      state: {
        tabId: 0,
        fingerprint: extracted.fingerprint,
        searchId: `fixture-${vertical}-search-v1`,
        status: degraded ? "degraded" : "completed",
        error: degraded ? "Fixture provider timed out; no independent offer was returned." : null,
        updatedAt: "2026-07-13T10:00:03Z",
        result,
      },
    };
  }

  function render() {
    view.innerHTML = JacobiTravelRender.state(active.extracted, settings, state);
    freshness.textContent = state && state.updatedAt ? "Updated " + new Date(state.updatedAt).toLocaleTimeString() : "Local adapter v" + active.extracted.adapterVersion;
    const start = document.getElementById("travel-start");
    if (start) start.addEventListener("click", startSearch);
    const revalidate = document.getElementById("travel-revalidate");
    if (revalidate) revalidate.addEventListener("click", revalidateOffer);
    document.querySelectorAll(".travel-evidence-load").forEach(function (button) {
      button.addEventListener("click", loadEvidence);
    });
  }

  async function loadEvidence(event) {
    const button = event.currentTarget;
    const output = button.parentElement && button.parentElement.querySelector(".evidence-output");
    const manifestId = button.dataset.manifestId;
    if (!output || !state || !state.searchId || !/^[A-Za-z0-9._:-]{1,256}$/.test(manifestId || "")) return;
    button.disabled = true;
    output.hidden = false;
    output.textContent = "Loading immutable evidence manifest...";
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: JacobiMessages.TYPES.GET_TRAVEL_EVIDENCE,
        tabId: active.tab.id,
        searchId: state.searchId,
        manifestId,
      });
    } catch (error) {
      response = { ok: false, error: String(error && error.message || "background_unavailable") };
    }
    if (!response || !response.ok || !response.manifest) {
      output.textContent = "Evidence details unavailable: " + String(response && response.error || "unknown_error");
      button.disabled = false;
      return;
    }
    output.textContent = JSON.stringify(response.manifest, null, 2);
    button.textContent = "Immutable evidence loaded";
  }

  async function startSearch() {
    const button = document.getElementById("travel-start");
    if (button) { button.disabled = true; button.textContent = "Starting independent search…"; }
    const response = await chrome.runtime.sendMessage({
      type: JacobiMessages.TYPES.START_TRAVEL_SEARCH,
      tabId: active.tab.id,
      fingerprint: active.extracted.fingerprint,
    });
    if (!response || !response.ok) {
      view.insertAdjacentHTML("beforeend", `<div class="error">${JacobiRender.esc(response && response.error || "Could not start the travel search. Open Settings to grant the configured API origin.")}</div>`);
      if (button) { button.disabled = false; button.textContent = "Search independently"; }
      return;
    }
    state = response.state;
    render();
  }

  function selectedOffer() {
    const result = state && state.result;
    const offers = result && Array.isArray(result.offers) ? result.offers : [];
    return offers.find(function (item) { return item.offer_id === result.selected_offer_id; }) || offers[0] || null;
  }

  async function revalidateOffer() {
    const offer = selectedOffer();
    const button = document.getElementById("travel-revalidate");
    if (!offer || !state || !state.searchId) return;
    button.disabled = true;
    button.textContent = "Rechecking provider price…";
    const response = await chrome.runtime.sendMessage({
      type: JacobiMessages.TYPES.REVALIDATE_TRAVEL_OFFER,
      tabId: active.tab.id,
      searchId: state.searchId,
      offerId: offer.offer_id,
    });
    if (response && response.opened) {
      button.textContent = "Fresh price confirmed — route opened";
      return;
    }
    if (response && response.requiresConfirmation) {
      button.insertAdjacentHTML("afterend", JacobiTravelRender.changed(response.revalidation || {}));
      button.remove();
      return;
    }
    button.disabled = false;
    button.textContent = "Recheck price & open supplier route";
    button.insertAdjacentHTML("afterend", `<div class="notice warn">${JacobiRender.esc(response && (response.error || response.revalidation && response.revalidation.reason) || "The offer could not be freshly revalidated, so no route was opened.")}</div>`);
  }

  async function refresh() {
    const response = await chrome.runtime.sendMessage({
      type: JacobiMessages.TYPES.GET_TRAVEL_STATE,
      tabId: active.tab.id,
      fingerprint: active.extracted.fingerprint,
    });
    state = response && response.ok ? response.state : state;
    render();
  }

  function bindChromeActions() {
    document.getElementById("open-tabs").hidden = true;
    document.getElementById("refresh").addEventListener("click", refresh);
    document.getElementById("settings").addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
    document.getElementById("deep-audit").addEventListener("click", function () {
      if (active && active.tab && JacobiConfig.safeHttpUrl(active.tab.url)) {
        chrome.runtime.sendMessage({ type: JacobiMessages.TYPES.OPEN_DEEP_AUDIT, url: active.tab.url });
      }
    });
    chrome.runtime.onMessage.addListener(function (message) {
      if (!message || message.type !== JacobiMessages.TYPES.TRAVEL_STATE_UPDATED || message.tabId !== active.tab.id) return;
      if (!message.state || message.state.fingerprint !== active.extracted.fingerprint) return;
      state = message.state;
      render();
    });
  }

  async function tryStart() {
    const query = new URLSearchParams(location.search);
    if (!chrome || !chrome.runtime || !chrome.runtime.id || query.has("demo")) return false;
    const requestedDemo = query.get("travelDemo");
    if (requestedDemo === "flight" || requestedDemo === "hotel" || requestedDemo === "degraded") {
      const demo = await demoContext(requestedDemo);
      active = { tab: { id: 0, url: `http://127.0.0.1/${requestedDemo}-fixture` }, extracted: demo.extracted };
      settings = JacobiConfig.normalizeSettings(null);
      state = demo.state;
      document.getElementById("open-tabs").hidden = true;
      document.getElementById("refresh").disabled = true;
      document.getElementById("deep-audit").disabled = true;
      document.getElementById("settings").addEventListener("click", function () { chrome.runtime.openOptionsPage(); });
      render();
      return true;
    }
    const tab = await getActiveTab();
    if (!tab || !Number.isInteger(tab.id) || !JacobiConfig.safeHttpUrl(tab.url)) return false;
    const extracted = await extract(tab);
    if (!extracted || !extracted.context || !extracted.fingerprint) return false;
    active = { tab, extracted };
    settings = await readSettings();
    const response = await chrome.runtime.sendMessage({
      type: JacobiMessages.TYPES.GET_TRAVEL_STATE,
      tabId: tab.id,
      fingerprint: extracted.fingerprint,
    });
    state = response && response.ok ? response.state : null;
    bindChromeActions();
    render();
    return true;
  }

  root.JacobiTravelPanel = { tryStart };
})(typeof globalThis !== "undefined" ? globalThis : this);
