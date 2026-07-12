"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../shared/config.js");
const render = require("../sidepanel/render.js");

test("every comparison outcome maps to an explicit panel state", function () {
  assert.equal(render.resultState({ recommendation: { status: "save" } }), "saving");
  assert.equal(render.resultState({ recommendation: { status: "already_best" } }), "no-saving");
  assert.equal(render.resultState({ recommendation: { status: "tradeoff" } }), "tradeoff");
  assert.equal(render.resultState({ recommendation: { status: "insufficient_evidence" } }), "uncertainty");
  assert.equal(render.resultState({ recommendation: { status: "save" }, provider_errors: [{ merchant_id: "x" }] }), "saving");
  assert.match(render.result({ recommendation: { status: "error_partial" }, provider_errors: [{ merchant_id: "noon" }] }), /data-state="partial-failure"/);
});

test("offer actions accept only safe http(s) routes", function () {
  assert.equal(render.safeActionUrl({ recommendation: { action_url: "javascript:alert(1)" } }), null);
  assert.equal(render.safeActionUrl({ best_offer: { source_url: "https://shop.example/item" } }), "https://shop.example/item");
});

test("hostile result text is escaped", function () {
  const html = render.result({ recommendation: { status: "already_best", headline: "<img src=x onerror=alert(1)>" } });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
