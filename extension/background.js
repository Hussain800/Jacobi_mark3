"use strict";

importScripts("shared/config.js", "shared/messages.js");

const { SETTINGS_KEY, DEFAULT_SETTINGS, TRAVEL_SITE_ORIGINS, normalizeSettings, safeHttpUrl, permissionOrigin } = JacobiConfig;
const { TYPES, validMessage, trustedSender } = JacobiMessages;
const TRAVEL_SCRIPT_ID = "jacobi-travel-supported-v1";
const TRAVEL_STATE_KEY = "jacobi_travel_states_v1";
const TERMINAL = new Set(["completed", "degraded", "failed", "cancelled", "expired"]);
const ALLOWED_PROGRESS = new Set(["accepted", "parsed", "cache_checked", "running", "partial", "verifying", ...TERMINAL]);
const activeProgress = new Map();
let settings = normalizeSettings(DEFAULT_SETTINGS);
let travelStates = {};
let contentScriptQueue = Promise.resolve();

function storageGet(area, key) {
  return new Promise(function (resolve) { area.get(key, resolve); });
}

function storageSet(area, value) {
  return new Promise(function (resolve) { area.set(value, resolve); });
}

async function loadState() {
  const result = await storageGet(chrome.storage.sync, SETTINGS_KEY);
  settings = normalizeSettings(result[SETTINGS_KEY]);
  if (chrome.storage.session) {
    const session = await storageGet(chrome.storage.session, TRAVEL_STATE_KEY);
    travelStates = session[TRAVEL_STATE_KEY] && typeof session[TRAVEL_STATE_KEY] === "object" ? session[TRAVEL_STATE_KEY] : {};
  }
  await queueTravelContentScriptConfiguration();
}

loadState().catch(function () {});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "sync" || !changes[SETTINGS_KEY]) return;
  settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
  queueTravelContentScriptConfiguration().catch(function () {});
});

function hasOrigins(origins) {
  return new Promise(function (resolve) {
    chrome.permissions.contains({ origins }, function (granted) { resolve(Boolean(granted)); });
  });
}

function unregisterTravelContentScript() {
  return new Promise(function (resolve) {
    chrome.scripting.getRegisteredContentScripts({ ids: [TRAVEL_SCRIPT_ID] }, function (scripts) {
      if (!scripts || !scripts.length) { resolve(); return; }
      chrome.scripting.unregisterContentScripts({ ids: [TRAVEL_SCRIPT_ID] }, function () { resolve(); });
    });
  });
}

async function configureTravelContentScript() {
  await unregisterTravelContentScript();
  if (settings.travel.mode !== "automatic" || settings.travel.automaticSavingsConsent !== true) return;
  const grantedOrigins = [];
  for (const origin of TRAVEL_SITE_ORIGINS) if (await hasOrigins([origin])) grantedOrigins.push(origin);
  if (!grantedOrigins.length) return;
  await new Promise(function (resolve, reject) {
    chrome.scripting.registerContentScripts([{
      id: TRAVEL_SCRIPT_ID,
      matches: grantedOrigins,
      js: ["shared/travel.js", "travel-context.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
    }], function () {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve();
    });
  });
}

function queueTravelContentScriptConfiguration() {
  contentScriptQueue = contentScriptQueue.catch(function () {}).then(configureTravelContentScript);
  return contentScriptQueue;
}

function openHttpUrl(value) {
  const url = safeHttpUrl(value);
  if (!url) return false;
  chrome.tabs.create({ url: url.toString() });
  return true;
}

function deepAuditUrl(sourceUrl) {
  const source = safeHttpUrl(sourceUrl);
  const app = safeHttpUrl(settings.webappUrl);
  if (!source || !app) return null;
  return app.toString().replace(/\/$/, "") + "/chat?url=" + encodeURIComponent(source.toString());
}

function tabHostname(tab) {
  try { return tab && tab.url ? new URL(tab.url).hostname : null; } catch (_) { return null; }
}

function recordRecent(sourceUrl) {
  const source = safeHttpUrl(sourceUrl);
  if (!source) return;
  chrome.storage.local.get("jacobi_recent", function (result) {
    const recent = Array.isArray(result.jacobi_recent) ? result.jacobi_recent : [];
    const next = recent.filter(function (item) { return item && item.url !== source.toString(); });
    next.unshift({ url: source.toString(), domain: source.hostname, timestamp: Date.now() });
    chrome.storage.local.set({ jacobi_recent: next.slice(0, 50) });
  });
}

function badge(tabId, state) {
  const values = {
    detected: ["TR", "#315a8a", "Travel page detected"],
    consent: ["!", "#9a681c", "Privacy Mode: click Jacobi to send"],
    checking: ["…", "#315a8a", "Checking independent travel prices"],
    saving: ["$", "#008a3b", "Cheaper route found; click to review"],
    checked: ["✓", "#4b596a", "Independent travel check complete"],
    degraded: ["!", "#9a681c", "Travel check completed with limitations"],
    stale: ["↻", "#9a681c", "Travel result is stale; recheck required"],
    error: ["!", "#8a3333", "Travel check failed"],
  };
  const selected = values[state] || values.detected;
  chrome.action.setBadgeText({ tabId, text: selected[0] });
  chrome.action.setBadgeBackgroundColor({ tabId, color: selected[1] });
  chrome.action.setTitle({ tabId, title: "Jacobi — " + selected[2] });
}

function stateKey(tabId) { return String(tabId); }

function publicState(state) {
  if (!state) return null;
  const result = { ...state };
  delete result.capabilityToken;
  delete result.lastRevalidation;
  return result;
}

async function persistStates() {
  if (!chrome.storage.session) return;
  await storageSet(chrome.storage.session, { [TRAVEL_STATE_KEY]: travelStates });
}

async function updateTravelState(tabId, patch) {
  const key = stateKey(tabId);
  travelStates[key] = { ...(travelStates[key] || {}), ...patch, tabId, updatedAt: new Date().toISOString() };
  await persistStates();
  try { await chrome.runtime.sendMessage({ type: TYPES.TRAVEL_STATE_UPDATED, tabId, state: publicState(travelStates[key]) }); } catch (_) {}
  return travelStates[key];
}

function contextFromTab(tabId, fingerprint) {
  return new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, { type: TYPES.REQUEST_TRAVEL_CONTEXT, fingerprint }, function (response) {
      if (chrome.runtime.lastError) { resolve({ ok: false, error: "travel_context_unavailable" }); return; }
      resolve(response || { ok: false, error: "travel_context_unavailable" });
    });
  });
}

function boundedContext(response, fingerprint) {
  if (!response || response.ok !== true || response.fingerprint !== fingerprint || !response.context) return null;
  if (response.vertical !== "flight" && response.vertical !== "hotel") return null;
  const payload = JSON.stringify(response.context);
  if (payload.length > 65_536 || /"(?:passenger_name|guest_name|passport|card_number|email|raw_html|html)"\s*:/i.test(payload)) return null;
  return response;
}

function extensionPageSender(sender) {
  if (!trustedSender(sender, chrome.runtime.id, false) || sender.tab) return false;
  return typeof sender.url === "string" && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

async function apiFetch(path, options, capabilityToken) {
  const backend = safeHttpUrl(settings.apiBackendUrl);
  const origin = permissionOrigin(settings.apiBackendUrl);
  if (!backend || !origin || !(await hasOrigins([origin]))) throw new Error("backend_origin_permission_required");
  const headers = new Headers((options && options.headers) || {});
  headers.set("Accept", "application/json, text/event-stream");
  if (capabilityToken) headers.set("X-Jacobi-Search-Capability", capabilityToken);
  const response = await fetch(backend.toString().replace(/\/$/, "") + path, { ...(options || {}), headers, cache: "no-store" });
  if (!response.ok) throw new Error("travel_api_" + response.status);
  return response;
}

function safeJson(response) {
  return response.json().then(function (value) {
    const encoded = JSON.stringify(value);
    if (encoded.length > 512 * 1024) throw new Error("travel_api_response_too_large");
    return value;
  });
}

function responseToken(value) {
  return value && (value.capability_token || value.access_token || (value.access && value.access.token));
}

function responseSearchId(value) {
  return value && (value.search_id || value.id || (value.search && value.search.search_id));
}

function responseStatus(value) {
  const candidate = value && (value.status || (value.search && value.search.status));
  return ALLOWED_PROGRESS.has(candidate) ? candidate : "accepted";
}

function savingClaim(result) {
  const claim = result && (result.saving_claim || result.claim || (result.saving && result.saving.claim) || (result.best_offer && result.best_offer.saving_claim));
  return ["verified", "conditional", "potential"].includes(claim) ? claim : null;
}

function resultBadge(tabId, state) {
  if (state.status === "expired") badge(tabId, "stale");
  else if (state.status === "failed") badge(tabId, "error");
  else if (state.status === "degraded") badge(tabId, "degraded");
  else if (savingClaim(state.result)) badge(tabId, "saving");
  else badge(tabId, "checked");
}

async function fetchResult(tabId, state) {
  const response = await apiFetch(`/api/v2/travel/searches/${encodeURIComponent(state.searchId)}`, { method: "GET" }, state.capabilityToken);
  const value = await safeJson(response);
  const result = value.result || value;
  const status = responseStatus(value);
  const next = await updateTravelState(tabId, { status, result, error: null });
  resultBadge(tabId, next);
  return next;
}

function eventStatus(eventName, data) {
  const explicit = data && data.status;
  if (ALLOWED_PROGRESS.has(explicit)) return explicit;
  if (eventName === "search.completed") return "completed";
  if (eventName === "search.degraded") return "degraded";
  if (eventName === "search.failed") return "failed";
  if (eventName === "provider.partial" || eventName === "offer.added" || eventName === "ranking.updated") return "partial";
  return "running";
}

async function consumeSse(tabId, state) {
  const headers = { Accept: "text/event-stream" };
  if (state.lastEventId) headers["Last-Event-ID"] = state.lastEventId;
  const response = await apiFetch(`/api/v2/travel/searches/${encodeURIComponent(state.searchId)}/events`, { method: "GET", headers }, state.capabilityToken);
  if (!response.body || !response.body.getReader) throw new Error("sse_stream_unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      let eventName = "message";
      let eventId = null;
      const dataLines = [];
      frame.split(/\r?\n/).forEach(function (line) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("id:")) eventId = line.slice(3).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      });
      let data = {};
      try { data = JSON.parse(dataLines.join("\n") || "{}"); } catch (_) {}
      const status = eventStatus(eventName, data);
      state = await updateTravelState(tabId, { status, lastEventId: eventId || state.lastEventId, progress: { event: eventName, data } });
      badge(tabId, TERMINAL.has(status) ? (status === "degraded" ? "degraded" : status === "failed" ? "error" : "checked") : "checking");
      if (TERMINAL.has(status)) { await fetchResult(tabId, state); return; }
    }
    if (chunk.done) break;
  }
  throw new Error("sse_ended_before_terminal_state");
}

function wait(milliseconds) { return new Promise(function (resolve) { setTimeout(resolve, milliseconds); }); }

async function pollResult(tabId, state) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    state = await fetchResult(tabId, state);
    if (TERMINAL.has(state.status)) return;
    badge(tabId, "checking");
    await wait(750);
  }
  await updateTravelState(tabId, { status: "degraded", error: "Search continues; reopen Jacobi to refresh." });
  badge(tabId, "degraded");
}

function beginProgress(tabId, state) {
  if (activeProgress.has(tabId) || !state || !state.searchId || !state.capabilityToken || TERMINAL.has(state.status)) return;
  const task = consumeSse(tabId, state).catch(function () { return pollResult(tabId, travelStates[stateKey(tabId)]); }).catch(async function (error) {
    await updateTravelState(tabId, { status: "degraded", error: String(error && error.message || "progress_unavailable").slice(0, 200) });
    badge(tabId, "degraded");
  }).finally(function () { activeProgress.delete(tabId); });
  activeProgress.set(tabId, task);
}

async function startTravelSearch(tabId, fingerprint) {
  const existing = travelStates[stateKey(tabId)];
  if (existing && existing.fingerprint === fingerprint && existing.searchId) {
    beginProgress(tabId, existing);
    return publicState(existing);
  }
  const response = boundedContext(await contextFromTab(tabId, fingerprint), fingerprint);
  if (!response) throw new Error("travel_context_changed");
  badge(tabId, "checking");
  await updateTravelState(tabId, {
    fingerprint,
    vertical: response.vertical,
    adapterId: response.adapterId,
    adapterVersion: response.adapterVersion,
    status: "accepted",
    result: null,
    error: null,
  });
  const extensionVersion = chrome.runtime.getManifest().version;
  const created = await safeJson(await apiFetch("/api/v2/travel/searches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": fingerprint,
      "X-Jacobi-Extension-Version": extensionVersion,
    },
    body: JSON.stringify({
      vertical: response.vertical,
      intent: response.context.intent,
      baseline_costs: Array.isArray(response.context.baseline_costs) ? response.context.baseline_costs : [],
    }),
  }));
  const searchId = responseSearchId(created);
  const capabilityToken = responseToken(created);
  if (!searchId || !capabilityToken) throw new Error("travel_api_missing_search_access");
  const state = await updateTravelState(tabId, {
    searchId: String(searchId),
    capabilityToken: String(capabilityToken),
    status: responseStatus(created),
    result: created.result || null,
    lastEventId: null,
  });
  if (TERMINAL.has(state.status)) resultBadge(tabId, state); else beginProgress(tabId, state);
  return publicState(state);
}

function revalidationStatus(value) {
  return String(value && (value.status || value.revalidation_status || value.outcome) || "unknown").toLowerCase();
}

async function authorizeAndOpen(tabId, state, offerId, revalidationId, confirmedPriceChange) {
  const response = await safeJson(await apiFetch("/api/v2/travel/redirects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      search_id: state.searchId,
      offer_id: offerId,
      revalidation_id: revalidationId,
    }),
  }, state.capabilityToken));
  const route = response.target_url || response.redirect_url || response.url || (response.redirect && response.redirect.url);
  if (!route || !openHttpUrl(route)) throw new Error("validated_redirect_unavailable");
  await updateTravelState(tabId, { routeOpenedAt: new Date().toISOString() });
  return { ok: true, opened: true };
}

async function revalidateAndOpen(tabId, searchId, offerId) {
  const state = travelStates[stateKey(tabId)];
  if (!state || state.searchId !== searchId || !state.capabilityToken) throw new Error("travel_search_access_unavailable");
  const offers = state.result && Array.isArray(state.result.offers) ? state.result.offers : [];
  const selectedOffer = offers.find(function (item) { return item.offer_id === offerId; });
  const expected = {};
  if (selectedOffer && selectedOffer.total_amount != null) expected.expected_total = String(selectedOffer.total_amount);
  if (selectedOffer && selectedOffer.currency) expected.expected_currency = String(selectedOffer.currency);
  const value = await safeJson(await apiFetch(`/api/v2/travel/searches/${encodeURIComponent(searchId)}/offers/${encodeURIComponent(offerId)}/revalidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expected),
  }, state.capabilityToken));
  const status = revalidationStatus(value);
  const revalidationId = value.revalidation_id || value.id;
  if (!revalidationId) throw new Error("revalidation_id_missing");
  await updateTravelState(tabId, { lastRevalidation: { offerId, revalidationId: String(revalidationId), status, value } });
  if (["changed", "price_changed"].includes(status)) return { ok: true, priceChanged: true, requiresConfirmation: true, revalidation: value };
  if (!["confirmed", "unchanged", "available", "current", "verified"].includes(status)) return { ok: false, error: "offer_not_revalidated", revalidation: value };
  if (value.redirect_eligible !== true) return { ok: false, error: "revalidated_offer_has_no_safe_redirect", revalidation: value };
  return authorizeAndOpen(tabId, state, offerId, String(revalidationId), false);
}

async function confirmTravelRoute(tabId, searchId, offerId, revalidationId, confirmedPriceChange) {
  const state = travelStates[stateKey(tabId)];
  const prior = state && state.lastRevalidation;
  if (!state || state.searchId !== searchId || !prior || prior.offerId !== offerId || prior.revalidationId !== revalidationId) throw new Error("revalidation_mismatch");
  if (!["changed", "price_changed"].includes(prior.status) || confirmedPriceChange !== true) throw new Error("price_change_confirmation_required");
  return authorizeAndOpen(tabId, state, offerId, revalidationId, true);
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({ id: "deep-audit", title: "Deep Audit this price with Jacobi (60–100 seconds)", contexts: ["page", "link"] });
  });
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  queueTravelContentScriptConfiguration().catch(function () {});
});

chrome.runtime.onStartup.addListener(function () { loadState().catch(function () {}); });

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId !== "deep-audit") return;
  const source = info.linkUrl || info.pageUrl || (tab && tab.url);
  const target = deepAuditUrl(source);
  if (target && openHttpUrl(target)) recordRecent(source);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!trustedSender(sender, chrome.runtime.id, false) || !validMessage(message)) {
    sendResponse({ ok: false, error: "invalid_message_or_sender" });
    return false;
  }

  if (message.type === TYPES.PRODUCT_PAGE_DETECTED) {
    if (!trustedSender(sender, chrome.runtime.id, true)) { sendResponse({ ok: false, error: "tab_sender_required" }); return false; }
    chrome.action.setBadgeText({ text: "✓", tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#00b33c", tabId: sender.tab.id });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === TYPES.TRAVEL_PAGE_DETECTED) {
    if (!trustedSender(sender, chrome.runtime.id, true)) { sendResponse({ ok: false, error: "tab_sender_required" }); return false; }
    const tabId = sender.tab.id;
    const automatic = settings.travel.mode === "automatic" && settings.travel.automaticSavingsConsent === true;
    const prior = travelStates[stateKey(tabId)];
    const reusable = prior && prior.fingerprint === message.fingerprint && prior.searchId;
    if (reusable && TERMINAL.has(prior.status)) resultBadge(tabId, prior);
    else badge(tabId, message.missingFields.length ? "degraded" : automatic ? "detected" : "consent");
    updateTravelState(tabId, {
      fingerprint: message.fingerprint,
      vertical: message.vertical,
      adapterId: message.adapterId,
      adapterVersion: message.adapterVersion,
      status: reusable ? prior.status : message.missingFields.length ? "degraded" : "detected",
      missingFields: message.missingFields,
    }).then(function () {
      if (automatic && message.fingerprint && !message.missingFields.length) return startTravelSearch(tabId, message.fingerprint);
    }).catch(async function (error) {
      await updateTravelState(tabId, { status: "failed", error: String(error.message || error).slice(0, 200) });
      badge(tabId, "error");
    });
    sendResponse({ ok: true, automatic });
    return false;
  }

  if (message.type === TYPES.START_TRAVEL_SEARCH) {
    if (!extensionPageSender(sender)) { sendResponse({ ok: false, error: "extension_page_sender_required" }); return false; }
    startTravelSearch(message.tabId, message.fingerprint).then(function (state) { sendResponse({ ok: true, state }); }).catch(function (error) { sendResponse({ ok: false, error: String(error.message || error).slice(0, 200) }); });
    return true;
  }

  if (message.type === TYPES.GET_TRAVEL_STATE) {
    if (!extensionPageSender(sender)) { sendResponse({ ok: false, error: "extension_page_sender_required" }); return false; }
    const state = travelStates[stateKey(message.tabId)] || null;
    if (state && state.fingerprint === message.fingerprint) beginProgress(message.tabId, state);
    sendResponse({ ok: true, state: state && (!message.fingerprint || state.fingerprint === message.fingerprint) ? publicState(state) : null });
    return false;
  }

  if (message.type === TYPES.REVALIDATE_TRAVEL_OFFER) {
    if (!extensionPageSender(sender)) { sendResponse({ ok: false, error: "extension_page_sender_required" }); return false; }
    revalidateAndOpen(message.tabId, message.searchId, message.offerId).then(sendResponse).catch(function (error) { sendResponse({ ok: false, error: String(error.message || error).slice(0, 200) }); });
    return true;
  }

  if (message.type === TYPES.OPEN_TRAVEL_ROUTE) {
    if (!extensionPageSender(sender)) { sendResponse({ ok: false, error: "extension_page_sender_required" }); return false; }
    confirmTravelRoute(message.tabId, message.searchId, message.offerId, message.revalidationId, message.confirmPriceChange).then(sendResponse).catch(function (error) { sendResponse({ ok: false, error: String(error.message || error).slice(0, 200) }); });
    return true;
  }

  if (message.type === TYPES.SETTINGS_UPDATED) {
    if (!extensionPageSender(sender)) { sendResponse({ ok: false, error: "extension_page_sender_required" }); return false; }
    queueTravelContentScriptConfiguration().then(function () { sendResponse({ ok: true }); }).catch(function (error) { sendResponse({ ok: false, error: String(error.message || error) }); });
    return true;
  }

  if (message.type === TYPES.OPEN_SIDE_PANEL) {
    if (!trustedSender(sender, chrome.runtime.id, true)) { sendResponse({ ok: false, error: "tab_sender_required" }); return false; }
    chrome.sidePanel.open({ tabId: sender.tab.id });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === TYPES.OPEN_SAFE_URL) { sendResponse({ ok: openHttpUrl(message.url) }); return false; }

  if (message.type === TYPES.OPEN_DEEP_AUDIT) {
    const target = deepAuditUrl(message.url);
    const ok = !!target && openHttpUrl(target);
    if (ok) recordRecent(message.url);
    sendResponse({ ok });
    return false;
  }

  if (message.type === TYPES.GET_RECENT) {
    chrome.storage.local.get("jacobi_recent", function (result) { sendResponse({ ok: true, recent: Array.isArray(result.jacobi_recent) ? result.jacobi_recent : [] }); });
    return true;
  }

  if (message.type === TYPES.CLEAR_LOCAL_DATA) {
    chrome.storage.local.remove(["jacobi_recent", "jacobi_dismissed", "jacobi_wrong_match_feedback"], function () {
      travelStates = {};
      const done = function () { sendResponse({ ok: true }); };
      if (chrome.storage.session) chrome.storage.session.remove(TRAVEL_STATE_KEY, done); else done();
    });
    return true;
  }

  if (message.type === TYPES.DISMISS_DOMAIN) {
    if (!trustedSender(sender, chrome.runtime.id, true) || tabHostname(sender.tab) !== message.domain) { sendResponse({ ok: false, error: "domain_sender_mismatch" }); return false; }
    chrome.storage.local.get("jacobi_dismissed", function (result) {
      const values = Array.isArray(result.jacobi_dismissed) ? result.jacobi_dismissed : [];
      if (!values.includes(message.domain)) values.push(message.domain);
      chrome.storage.local.set({ jacobi_dismissed: values.slice(-200) }, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  sendResponse({ ok: false, error: "unsupported_message" });
  return false;
});
