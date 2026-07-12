"use strict";

const IS_EXTENSION = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id && chrome.tabs);
const DEMO_MODE = !IS_EXTENSION || new URLSearchParams(location.search).has("demo");
const view = document.getElementById("view");
const freshness = document.getElementById("freshness");
let lastContext = null;
let lastResult = null;
let openTabCandidates = null;

const DEMO_CONTEXT = {
  source_url: "https://www.amazon.ae/dp/B0DEMO123",
  market: "AE",
  current_offer: {
    title: "Sony WH-1000XM6 Wireless Headphones — Black",
    brand: "Sony", model: "WH-1000XM6", mpn: "WH-1000XM6/B", gtin: "4548736158801",
    price: { amount: "1699", currency: "AED" }, condition: "new", stock: "in_stock",
  },
  page_evidence: { sources: { title: "json_ld", amount: "json_ld", currency: "json_ld" }, json_ld_found: true },
};
const DEMO_RESULT = {
  comparison_id: "cmp_extension_demo", created_at: "2026-07-12T18:00:00Z", ttl_seconds: 900,
  product: { brand: "Sony", model: "WH-1000XM6" }, confidence: "high", fixture_mode: true,
  recommendation: { status: "save", headline: "Save AED 150 on an exact match", explanation: "Same verified GTIN and model. Known all-in total is lower.", action_url: "https://www.noon.com/uae-en/demo" },
  current_offer: { merchant_name: "Amazon UAE", condition: "new", price: { item: { amount: "1699", currency: "AED" }, payable_total: { amount: "1699", currency: "AED" }, total_complete: true }, seller: { name: "Amazon.ae" } },
  best_offer: { observation_id: "obs_demo", merchant_name: "Noon", source_url: "https://www.noon.com/uae-en/demo", condition: "new", price: { item: { amount: "1549", currency: "AED" }, payable_total: { amount: "1549", currency: "AED" }, total_complete: true }, seller: { name: "Noon" }, delivery: { estimate: "Tomorrow" }, warranty: { region: "UAE" } },
  eligible_offers: [], tradeoff_offers: [], similar_offers: [], rejected_offers: [], provider_errors: [], evidence_manifest_id: "manifest_extension_demo",
};

function renderProgress(context, text) {
  view.innerHTML = JacobiRender.identityPreview(context) + `<div class="progress"><span></span>${JacobiRender.esc(text)}</div>`;
}

function renderUnsupported(response) {
  const preview = response && response.preview;
  view.innerHTML = `<div class="state" data-state="uncertainty">${preview ? JacobiRender.identityPreview(null, preview) : ""}<div class="eyebrow">Uncertainty</div><h1>Product price is incomplete</h1><p class="subline">Jacobi could not verify both an item price and currency from this page. It does not assume AED, a new condition, or a zero cost.</p><p class="subline">Open a product page, then reopen the panel. Only the active tab is read.</p></div>`;
  freshness.textContent = "";
}

function renderBackendUnavailable(message) {
  view.innerHTML = `<div class="state" data-state="backend-unavailable"><div class="eyebrow">Backend unavailable</div><h1>Could not reach your Jacobi API</h1><p class="subline">Check the self-hosted API URL and service health in Settings.</p><div class="error">${JacobiRender.esc(message)}</div><button id="open-settings">Open settings and privacy</button></div>`;
  document.getElementById("open-settings").addEventListener("click", openSettings);
}

function getActiveTab() {
  return new Promise(function (resolve) { chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { resolve(tabs && tabs[0]); }); });
}

function sendTabMessage(tabId) {
  return new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, { type: JacobiMessages.TYPES.REQUEST_PRODUCT_CONTEXT }, function (response) {
      if (chrome.runtime.lastError) resolve(null); else resolve(response || null);
    });
  });
}

async function requestContext() {
  if (DEMO_MODE) return { context: DEMO_CONTEXT, preview: DEMO_CONTEXT.current_offer };
  const tab = await getActiveTab();
  if (!tab || !Number.isInteger(tab.id) || !JacobiConfig.safeHttpUrl(tab.url)) return null;
  let response = await sendTabMessage(tab.id);
  if (response) return response;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/config.js", "shared/messages.js", "shared/extraction.js", "product-context.js"] });
  } catch (error) {
    return { context: null, preview: null, reason: error.message || "active_tab_access_denied" };
  }
  response = await sendTabMessage(tab.id);
  return response;
}

async function getSettings() {
  if (DEMO_MODE) return JacobiConfig.normalizeSettings(null);
  const stored = await chrome.storage.sync.get(JacobiConfig.SETTINGS_KEY);
  return JacobiConfig.normalizeSettings(stored[JacobiConfig.SETTINGS_KEY]);
}

function hasOriginPermission(origin) {
  return new Promise(function (resolve) { chrome.permissions.contains({ origins: [origin] }, resolve); });
}

function requestOriginPermission(origin) {
  return new Promise(function (resolve) { chrome.permissions.request({ origins: [origin] }, resolve); });
}

function apiUrl(base, path) {
  return new URL(path.replace(/^\//, ""), base.replace(/\/$/, "") + "/").toString();
}

async function readJsonBounded(response, maxBytes) {
  const text = await response.text();
  if (text.length > maxBytes) throw new Error("Response exceeded the extension safety limit.");
  try { return JSON.parse(text); } catch (_) { throw new Error("Backend returned invalid JSON."); }
}

async function compare(context, settings) {
  renderProgress(context, "Checking verified routes…");
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 15000);
  try {
    const response = await fetch(apiUrl(settings.apiBackendUrl, "/api/v1/compare"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context), signal: controller.signal,
    });
    if (!response.ok) throw new Error("Comparison API returned HTTP " + response.status + ".");
    return await readJsonBounded(response, 2000000);
  } finally { clearTimeout(timer); }
}

function openSafeUrl(url) {
  if (!JacobiConfig.safeHttpUrl(url)) return;
  if (IS_EXTENSION) chrome.runtime.sendMessage({ type: JacobiMessages.TYPES.OPEN_SAFE_URL, url: url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

function openSettings() {
  if (IS_EXTENSION) chrome.runtime.openOptionsPage();
}

async function showEvidence() {
  const output = document.getElementById("evidence-output");
  if (!output || !lastResult || !/^[a-zA-Z0-9_-]{1,160}$/.test(lastResult.evidence_manifest_id || "")) return;
  output.hidden = false;
  output.textContent = "Loading immutable evidence manifest…";
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 10000);
  try {
    const settings = await getSettings();
    const path = "/api/v1/evidence/" + encodeURIComponent(lastResult.evidence_manifest_id) + "?comparison_id=" + encodeURIComponent(lastResult.comparison_id || "");
    const response = await fetch(apiUrl(settings.apiBackendUrl, path), {
      headers: { "X-Jacobi-Access-Token": lastResult.comparison_access_token || "" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Evidence API returned HTTP " + response.status + ".");
    const manifest = await readJsonBounded(response, 1000000);
    output.textContent = JSON.stringify(manifest, null, 2).slice(0, 12000);
  } catch (error) { output.textContent = "Evidence unavailable: " + (error.name === "AbortError" ? "request timed out" : (error.message || error)); }
  finally { clearTimeout(timer); }
}

function hasOptionalPermission(request) {
  return new Promise(function (resolve) { chrome.permissions.contains(request, resolve); });
}

function requestOptionalPermission(request) {
  return new Promise(function (resolve) { chrome.permissions.request(request, resolve); });
}

function queryWindowTabs() {
  return new Promise(function (resolve) {
    chrome.tabs.query({ currentWindow: true }, function (tabs) { resolve(Array.isArray(tabs) ? tabs : []); });
  });
}

async function extractFromTab(tab) {
  let response = await sendTabMessage(tab.id);
  if (response && response.context) return response.context;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/config.js", "shared/messages.js", "shared/extraction.js", "product-context.js"] });
  } catch (_) { return null; }
  response = await sendTabMessage(tab.id);
  return response && response.context || null;
}

async function compareOpenTabs() {
  const button = document.getElementById("open-tabs");
  const status = document.getElementById("open-tabs-status");
  if (!IS_EXTENSION) {
    status.textContent = "Open-tab comparison is available in the unpacked extension.";
    return;
  }

  if (!openTabCandidates) {
    const tabsGranted = await hasOptionalPermission({ permissions: ["tabs"] }) ||
      await requestOptionalPermission({ permissions: ["tabs"] });
    if (!tabsGranted) {
      status.textContent = "Tab-list permission was not granted.";
      return;
    }
    const tabs = await queryWindowTabs();
    const active = tabs.find(function (tab) { return tab.active; });
    openTabCandidates = tabs.filter(function (tab) {
      return Number.isInteger(tab.id) && (!active || tab.id !== active.id) && JacobiConfig.safeHttpUrl(tab.url);
    }).slice(0, 10);
    if (!openTabCandidates.length) {
      status.textContent = "No other HTTP(S) tabs are open in this window.";
      openTabCandidates = null;
      return;
    }
    const origins = [...new Set(openTabCandidates.map(function (tab) {
      return JacobiConfig.permissionOrigin(tab.url);
    }).filter(Boolean))];
    button.textContent = "Grant " + origins.length + " origin" + (origins.length === 1 ? "" : "s");
    status.textContent = "Click again to grant access only to these open-tab origins. Tabs without verified price fields are ignored.";
    return;
  }

  const origins = [...new Set(openTabCandidates.map(function (tab) {
    return JacobiConfig.permissionOrigin(tab.url);
  }).filter(Boolean))];
  const originsGranted = !origins.length || await hasOptionalPermission({ origins: origins }) ||
    await requestOptionalPermission({ origins: origins });
  if (!originsGranted) {
    status.textContent = "Open-tab origin access was not granted.";
    return;
  }
  button.disabled = true;
  button.textContent = "Reading tabs…";
  const contexts = (await Promise.all(openTabCandidates.map(extractFromTab))).filter(function (context) {
    return context && context.source_url && context.current_offer && context.current_offer.price && context.current_offer.price.currency;
  });
  button.disabled = false;
  button.textContent = "Open tabs";
  openTabCandidates = null;
  if (!contexts.length) {
    status.textContent = "No additional product tabs had a verifiable price and currency.";
    return;
  }
  lastContext = Object.assign({}, lastContext, {
    submitted_offers: contexts.map(function (context) {
      return {
        source_url: context.source_url,
        current_offer: context.current_offer,
        page_evidence: context.page_evidence || {},
      };
    }),
  });
  status.textContent = "Including " + contexts.length + " browser-observed product tab" + (contexts.length === 1 ? "." : "s.");
  proceed(lastContext, await getSettings());
}

async function reportMismatch() {
  const button = document.getElementById("report-mismatch");
  if (!IS_EXTENSION || !lastResult) {
    if (button) button.textContent = "Feedback recorded (demo)";
    return;
  }
  const stored = await chrome.storage.local.get("jacobi_wrong_match_feedback");
  const feedback = Array.isArray(stored.jacobi_wrong_match_feedback) ? stored.jacobi_wrong_match_feedback : [];
  feedback.push({ comparisonId: lastResult.comparison_id || null, sourceUrl: lastContext && lastContext.source_url || null, createdAt: new Date().toISOString(), category: "wrong_match" });
  await chrome.storage.local.set({ jacobi_wrong_match_feedback: feedback.slice(-100) });
  button.textContent = "Wrong match recorded locally";
  button.disabled = true;
}

function wireResultActions(result) {
  const open = document.getElementById("open-best");
  if (open) {
    const url = JacobiRender.safeActionUrl(result);
    open.disabled = !url;
    if (url) open.addEventListener("click", function () { openSafeUrl(url); });
  }
  const evidence = document.getElementById("show-evidence");
  if (evidence) evidence.addEventListener("click", showEvidence);
  const mismatch = document.getElementById("report-mismatch");
  if (mismatch) mismatch.addEventListener("click", reportMismatch);
}

async function proceed(context, settings) {
  try {
    lastResult = DEMO_MODE ? DEMO_RESULT : await compare(context, settings);
    view.innerHTML = JacobiRender.result(lastResult);
    wireResultActions(lastResult);
    freshness.textContent = lastResult.created_at ? "Observed " + new Date(lastResult.created_at).toLocaleTimeString() : "";
  } catch (error) {
    const text = error && error.name === "AbortError" ? "The comparison timed out after 15 seconds." : (error.message || String(error));
    renderBackendUnavailable(text);
  }
}

async function run() {
  view.innerHTML = `<div class="progress"><span></span>Reading structured product fields from the active tab…</div>`;
  const extracted = await requestContext();
  if (!extracted || !extracted.context) { renderUnsupported(extracted); return; }
  lastContext = extracted.context;
  renderProgress(lastContext, "Identity ready. Preparing comparison…");
  const settings = await getSettings();
  if (DEMO_MODE) { setTimeout(function () { proceed(lastContext, settings); }, 120); return; }
  const origin = JacobiConfig.permissionOrigin(settings.apiBackendUrl);
  if (!origin) { renderBackendUnavailable("The configured API URL is invalid."); return; }
  if (await hasOriginPermission(origin)) { proceed(lastContext, settings); return; }
  view.innerHTML = JacobiRender.identityPreview(lastContext) + `<div class="notice"><strong>API access is optional.</strong> Grant access only to <code>${JacobiRender.esc(origin)}</code> to run this comparison.</div><button class="primary" id="grant-api">Grant API access and compare</button>`;
  document.getElementById("grant-api").addEventListener("click", async function () {
    if (await requestOriginPermission(origin)) proceed(lastContext, settings);
    else renderBackendUnavailable("API-origin permission was not granted.");
  });
}

document.getElementById("refresh").addEventListener("click", run);
document.getElementById("open-tabs").addEventListener("click", compareOpenTabs);
document.getElementById("settings").addEventListener("click", openSettings);
document.getElementById("deep-audit").addEventListener("click", function () {
  if (!lastContext || !lastContext.source_url) return;
  if (IS_EXTENSION) chrome.runtime.sendMessage({ type: JacobiMessages.TYPES.OPEN_DEEP_AUDIT, url: lastContext.source_url });
  else openSafeUrl("http://localhost:3000/chat?url=" + encodeURIComponent(lastContext.source_url));
});

run();
