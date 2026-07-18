"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../shared/config.js");
const messages = require("../shared/messages.js");

test("message schema rejects unknown types and unsafe URLs", function () {
  assert.equal(messages.validMessage({ type: "DO_ANYTHING" }), false);
  assert.equal(messages.validMessage({ type: messages.TYPES.OPEN_SAFE_URL, url: "file:///etc/passwd" }), false);
  assert.equal(messages.validMessage({ type: messages.TYPES.OPEN_SAFE_URL, url: "https://shop.example/item" }), true);
  assert.equal(messages.validMessage({ type: messages.TYPES.OPEN_SAFE_URL, url: "https://shop.example/item", payload: "unexpected" }), false);
});

test("sender validation binds messages to this extension and optional tab", function () {
  assert.equal(messages.trustedSender({ id: "ext", tab: { id: 4 } }, "ext", true), true);
  assert.equal(messages.trustedSender({ id: "other", tab: { id: 4 } }, "ext", true), false);
  assert.equal(messages.trustedSender({ id: "ext" }, "ext", true), false);
});

test("dismissed domains must be hostnames", function () {
  assert.equal(messages.validMessage({ type: messages.TYPES.DISMISS_DOMAIN, domain: "amazon.ae" }), true);
  assert.equal(messages.validMessage({ type: messages.TYPES.DISMISS_DOMAIN, domain: "amazon.ae/path" }), false);
});

test("travel messages are field-bounded and do not carry page HTML or intent payloads", function () {
  const detected = {
    type: messages.TYPES.TRAVEL_PAGE_DETECTED,
    vertical: "flight",
    adapterId: "flight-demo-v1",
    adapterVersion: "1.0.0",
    fingerprint: "a".repeat(64),
    confidence: 1,
    missingFields: [],
  };
  assert.equal(messages.validMessage(detected), true);
  assert.equal(messages.validMessage({ ...detected, html: "<html>" }), false);
  assert.equal(messages.validMessage({ type: messages.TYPES.START_TRAVEL_SEARCH, tabId: 3, fingerprint: "b".repeat(64) }), true);
  assert.equal(messages.validMessage({ type: messages.TYPES.START_TRAVEL_SEARCH, tabId: 3, fingerprint: "bad" }), false);
  assert.equal(messages.validMessage({ type: messages.TYPES.REVALIDATE_TRAVEL_OFFER, tabId: 3, searchId: "search_1", offerId: "offer_1" }), true);
  assert.equal(messages.validMessage({ type: messages.TYPES.GET_TRAVEL_EVIDENCE, tabId: 3, searchId: "search_1", manifestId: "man_offer_1" }), true);
  assert.equal(messages.validMessage({ type: messages.TYPES.GET_TRAVEL_EVIDENCE, tabId: 3, searchId: "search_1", manifestId: "../../secret" }), false);
  assert.equal(messages.validMessage({ type: messages.TYPES.GET_TRAVEL_EVIDENCE, tabId: 3, searchId: "search_1", manifestId: "man_offer_1", capabilityToken: "secret" }), false);
});
