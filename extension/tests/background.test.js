"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const extensionRoot = join(__dirname, "..");

function eventTarget(listeners) {
  return { addListener(listener) { if (listeners) listeners.push(listener); } };
}

function storageArea(initial, getControl) {
  const values = { ...(initial || {}) };
  function selected(key) {
    if (typeof key === "string") return key in values ? { [key]: values[key] } : {};
    return { ...values };
  }
  return {
    get(key, callback) {
      if (getControl && getControl.deferred) {
        getControl.pending.push(function () { callback(selected(key)); });
        return;
      }
      callback(selected(key));
    },
    set(value, callback) { Object.assign(values, value); if (callback) callback(); },
    remove(key, callback) {
      for (const item of Array.isArray(key) ? key : [key]) delete values[item];
      if (callback) callback();
    },
  };
}

function backgroundContext(options) {
  const config = options || {};
  const calls = { badgeText: [], badgeColor: [], titles: [], notifications: [], panelOpen: [], fetch: [], tabMessages: [] };
  const runtimeMessages = [];
  const sessionGet = { deferred: config.deferSessionGet === true, pending: [] };
  let originGranted = false;
  let fetchImplementation = async function () { throw new Error("unexpected fetch"); };
  const context = vm.createContext({
    URL,
    Headers,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
    fetch: async function (url, options) {
      calls.fetch.push({ url, options });
      return fetchImplementation(url, options);
    },
  });
  context.globalThis = context;
  context.chrome = {
    action: {
      setBadgeText(value) { calls.badgeText.push(value); },
      setBadgeBackgroundColor(value) { calls.badgeColor.push(value); },
      setTitle(value) { calls.titles.push(value); },
    },
    contextMenus: {
      removeAll(callback) { callback(); },
      create() {},
      onClicked: eventTarget(),
    },
    notifications: {
      create(id, options, callback) {
        calls.notifications.push({ id, options });
        if (callback) callback(id);
      },
    },
    permissions: {
      contains(_value, callback) { callback(originGranted); },
    },
    runtime: {
      id: "test-extension-id",
      lastError: null,
      getManifest() { return { version: "0.6.0" }; },
      getURL(path) { return `chrome-extension://test-extension-id/${path}`; },
      sendMessage: async function () { return { ok: true }; },
      onInstalled: eventTarget(),
      onStartup: eventTarget(),
      onMessage: eventTarget(runtimeMessages),
    },
    scripting: {
      getRegisteredContentScripts(_value, callback) { callback([]); },
      unregisterContentScripts(_value, callback) { callback(); },
      registerContentScripts(_value, callback) { callback(); },
    },
    sidePanel: {
      setPanelBehavior() {},
      open(value) { calls.panelOpen.push(value); },
    },
    storage: {
      sync: storageArea(config.syncStorage),
      session: storageArea(config.sessionStorage, sessionGet),
      local: storageArea(config.localStorage),
      onChanged: eventTarget(),
    },
    tabs: {
      create() {},
      sendMessage(tabId, message, callback) {
        calls.tabMessages.push({ tabId, message });
        callback(config.tabResponse || null);
      },
    },
  };
  context.importScripts = function (...paths) {
    for (const path of paths) {
      vm.runInContext(readFileSync(join(extensionRoot, path), "utf8"), context, { filename: path });
    }
  };
  vm.runInContext(readFileSync(join(extensionRoot, "background.js"), "utf8"), context, { filename: "background.js" });
  return {
    context,
    calls,
    grantOrigin() { originGranted = true; },
    respondWith(value) { fetchImplementation = async function () { return value; }; },
    releaseSessionGet() {
      sessionGet.deferred = false;
      for (const pending of sessionGet.pending.splice(0)) pending();
    },
    dispatchMessage(message, sender) {
      assert.equal(runtimeMessages.length, 1);
      let keepAlive;
      const response = new Promise(function (resolve) {
        keepAlive = runtimeMessages[0](message, sender, resolve);
      });
      return { keepAlive, response };
    },
  };
}

function meaningfulState(includeConversion) {
  const saving = { claim: "verified", amount: { amount: "100.00", currency: "AED" } };
  if (includeConversion) {
    saving.usd_conversion = {
      original: { amount: "100.00", currency: "AED" },
      converted: { amount: "27.23", currency: "USD" },
      exchange_rate: "0.272294",
      rate_source: "fixture-fx-v1",
      rate_timestamp: "2026-07-13T10:00:00Z",
      rate_age_seconds: 60,
      rounding_method: "half_even",
    };
  }
  return {
    searchId: "search-1",
    baseline: { amount: "1000.00", currency: "AED" },
    status: "completed",
    result: {
      selected_offer_id: "offer-1",
      saving,
      offers: [{
        offer_id: "offer-1",
        eligible: true,
        total_complete: true,
        equivalence: { classification: "exact" },
        evidence_manifest_id: "man_offer_1",
      }],
    },
  };
}

test("background badge and notification interrupt only for evidenced meaningful savings", async function () {
  const { context, calls } = backgroundContext();
  vm.runInContext("settings = normalizeSettings({ travel: { mode: 'automatic', automaticSavingsConsent: true } });", context);

  context.testState = meaningfulState(true);
  const decision = vm.runInContext("resultBadge(42, testState)", context);
  assert.equal(decision.interrupt, true);
  assert.equal(calls.badgeText.at(-1).text, "$");
  assert.match(calls.titles.at(-1).title, /Meaningful verified saving/);
  assert.equal(calls.notifications.length, 1);
  assert.match(calls.notifications[0].options.message, /USD 27\.23/);
  assert.equal(calls.panelOpen.length, 0);

  vm.runInContext("resultBadge(42, testState)", context);
  assert.equal(calls.notifications.length, 1, "the same completed search must not notify twice");

  context.unknownConversionState = meaningfulState(false);
  const passive = vm.runInContext("resultBadge(43, unknownConversionState)", context);
  assert.equal(passive.interrupt, false);
  assert.equal(passive.reason, "usd_conversion_evidence_missing");
  assert.notEqual(calls.badgeText.at(-1).text, "$");
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.panelOpen.length, 0);
});

test("background fetches only a referenced immutable travel manifest with the hidden capability", async function () {
  const harness = backgroundContext();
  harness.grantOrigin();
  harness.respondWith({
    ok: true,
    json: async function () {
      return {
        manifest_id: "man_offer_1",
        manifest_sha256: "a".repeat(64),
        created_at: "2026-07-13T10:00:00Z",
        collection_attempts: [],
      };
    },
  });
  harness.context.evidenceState = {
    searchId: "search-1",
    capabilityToken: "secret-capability",
    result: { offers: [{ offer_id: "offer-1", evidence_manifest_id: "man_offer_1" }] },
  };
  vm.runInContext("travelStates['9'] = evidenceState", harness.context);
  const manifest = await vm.runInContext("fetchTravelEvidence(9, 'search-1', 'man_offer_1')", harness.context);
  assert.equal(manifest.manifest_id, "man_offer_1");
  assert.match(harness.calls.fetch[0].url, /\/api\/v2\/travel\/searches\/search-1\/evidence\/man_offer_1$/);
  assert.equal(harness.calls.fetch[0].options.headers.get("X-Jacobi-Search-Capability"), "secret-capability");
  assert.equal(harness.calls.panelOpen.length, 0);

  vm.runInContext("travelStates['9'] = evidenceState", harness.context);
  await assert.rejects(
    vm.runInContext("fetchTravelEvidence(9, 'search-1', 'man_other')", harness.context),
    /travel_evidence_reference_unavailable/,
  );
  assert.equal(harness.calls.fetch.length, 1);

});

test("same fingerprint reuses the completed search without page extraction or another API request", async function () {
  const harness = backgroundContext();
  const fingerprint = "c".repeat(64);
  harness.context.reusableState = {
    tabId: 7,
    fingerprint,
    searchId: "search-reused",
    capabilityToken: "hidden-capability",
    status: "completed",
    result: { offers: [] },
  };
  vm.runInContext("travelStates['7'] = reusableState", harness.context);
  const state = await vm.runInContext(`startTravelSearch(7, '${fingerprint}')`, harness.context);
  assert.equal(state.searchId, "search-reused");
  assert.equal(state.capabilityToken, undefined);
  assert.equal(harness.calls.tabMessages.length, 0);
  assert.equal(harness.calls.fetch.length, 0);
});

test("cold service worker waits for session restore before suppressing a duplicate search", async function () {
  const fingerprint = "d".repeat(64);
  const restored = {
    tabId: 9,
    fingerprint,
    searchId: "search-after-restart",
    capabilityToken: "restored-capability",
    status: "completed",
    result: { offers: [] },
  };
  const harness = backgroundContext({
    deferSessionGet: true,
    sessionStorage: { jacobi_travel_states_v1: { "9": restored } },
  });
  const request = harness.dispatchMessage({
    type: "START_TRAVEL_SEARCH",
    tabId: 9,
    fingerprint,
  }, {
    id: "test-extension-id",
    url: "chrome-extension://test-extension-id/sidepanel/index.html",
  });
  assert.equal(request.keepAlive, true);
  await Promise.resolve();
  harness.releaseSessionGet();
  const response = await request.response;
  assert.equal(response.ok, true);
  assert.equal(response.state.searchId, "search-after-restart");
  assert.equal(response.state.capabilityToken, undefined);
  assert.equal(harness.calls.tabMessages.length, 0);
  assert.equal(harness.calls.fetch.length, 0);
});
