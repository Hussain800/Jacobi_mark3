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
