"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "..", "travel-context.js"), "utf8");

function detection(fingerprint) {
  return {
    supported: true,
    adapter_id: "flight-demo-v1",
    adapter_version: "1.0.0",
    vertical: "flight",
    fingerprint,
    confidence: 1,
    missing_fields: [],
    context: { intent: { trip_type: "one_way" } },
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function browserContext() {
  const timers = new Map();
  const sent = [];
  const listeners = {};
  let nextTimerId = 1;
  let current = detection("a".repeat(64));
  let extractCount = 0;
  let observerCallback = null;
  const historyCalls = [];
  const context = vm.createContext({
    Date,
    Promise,
    document: { documentElement: {} },
    location: { href: "http://127.0.0.1/fixture-flight-v1.html", hostname: "127.0.0.1" },
    history: {
      pushState(...args) { historyCalls.push({ method: "pushState", args }); },
      replaceState(...args) { historyCalls.push({ method: "replaceState", args }); },
    },
    addEventListener(type, listener) { listeners[type] = listener; },
    clearTimeout(id) { timers.delete(id); },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe(target, options) {
        assert.equal(target, context.document.documentElement);
        assert.equal(options.childList, true);
        assert.equal(options.subtree, true);
        assert.equal(options.attributes, true);
      }
    },
    JacobiTravel: {
      async extract() {
        extractCount += 1;
        return structuredClone(current);
      },
    },
    chrome: {
      runtime: {
        async sendMessage(message) { sent.push(structuredClone(message)); return { ok: true }; },
        onMessage: { addListener(listener) { listeners.message = listener; } },
      },
    },
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: "travel-context.js" });
  return {
    context,
    sent,
    timers,
    listeners,
    historyCalls,
    observer() { return observerCallback; },
    extractCount() { return extractCount; },
    setDetection(value) { current = value; },
    async flushTimer() {
      assert.equal(timers.size, 1);
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
      await settle();
      return timer.delay;
    },
  };
}

test("mutation storms debounce to one inspection and suppress the same detection signature", async function () {
  const browser = browserContext();
  await settle();
  assert.equal(browser.extractCount(), 1);
  assert.equal(browser.sent.length, 1);

  for (let index = 0; index < 100; index += 1) browser.observer()([{ type: "attributes" }]);
  assert.equal(browser.timers.size, 1);
  assert.equal(await browser.flushTimer(), 450);
  assert.equal(browser.extractCount(), 2);
  assert.equal(browser.sent.length, 1, "unchanged fingerprint must not emit another detection");
});

test("SPA history and popstate share the debounce and emit only a material fingerprint change", async function () {
  const browser = browserContext();
  await settle();
  browser.setDetection(detection("b".repeat(64)));

  browser.context.history.pushState({ page: 2 }, "", "/fixture-flight-v1.html?page=2");
  browser.context.history.replaceState({ page: 3 }, "", "/fixture-flight-v1.html?page=3");
  browser.listeners.popstate();
  assert.deepEqual(browser.historyCalls.map(function (item) { return item.method; }), ["pushState", "replaceState"]);
  assert.equal(browser.timers.size, 1);
  assert.equal(await browser.flushTimer(), 450);
  assert.equal(browser.sent.length, 2);
  assert.equal(browser.sent[1].fingerprint, "b".repeat(64));

  browser.observer()([{ type: "childList" }]);
  await browser.flushTimer();
  assert.equal(browser.sent.length, 2, "the new fingerprint must also be suppressed after its first emission");
});
