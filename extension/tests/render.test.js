"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../shared/config.js");
const render = require("../sidepanel/render.js");
const travelRender = require("../sidepanel/travel-render.js");

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

test("travel environment labels never collapse fixture, sandbox, and official production", function () {
  assert.equal(travelRender.environment("fixture"), "Fixture data");
  assert.equal(travelRender.environment("sandbox_api"), "Sandbox API");
  assert.equal(travelRender.environment("live_official_api"), "Live official API");
  assert.equal(travelRender.environment("live"), "Unknown environment (unverified)");
});

test("travel renderer exposes degraded and exact-saving states without unsafe routes", function () {
  const saving = {
    status: "completed",
    result: {
      selected_offer_id: "offer-1",
      saving: { claim: "potential", explanation: "Lower total, pending revalidation." },
      offers: [{ offer_id: "offer-1", provider: "fixture", currency: "AED", total_amount: "2800.00", total_complete: true, provider_environment: "fixture", equivalence: { classification: "exact" }, saving: { claim: "potential" }, evidence_manifest_id: "man_fixture_offer_1" }],
    },
  };
  assert.equal(travelRender.resultState(saving), "saving");
  const html = travelRender.state({
    vertical: "flight", adapterId: "flight-demo-v1", adapterVersion: "1.0.0", confidence: 1,
    context: { intent: { legs: [{ origin_airport: "DXB", destination_airport: "LHR", departure_date: "2026-10-20" }], trip_type: "one_way", passengers: { adults: 1 }, baseline_offer: { visible_price: { amount: "3199.00", currency: "AED" }, observation_method: "browser_observed" } } },
  }, config.normalizeSettings(null), saving);
  assert.match(html, /data-state="saving"/);
  assert.match(html, /Recheck price/);
  assert.match(html, /Immutable evidence manifest/);
  assert.match(html, /man_fixture_offer_1/);
  assert.match(html, /travel-evidence-load/);
  assert.doesNotMatch(html, /javascript:/);
});

test("travel renderer explains deterministic exclusion and hard preference facts", function () {
  const extractedFlight = {
    vertical: "flight", adapterId: "flight-demo-v1", adapterVersion: "1.0.0", confidence: 1,
    context: { intent: { legs: [{ origin_airport: "DXB", destination_airport: "LHR", departure_date: "2026-10-20" }], trip_type: "one_way", passengers: { adults: 1 }, baseline_offer: null } },
  };
  const rendered = travelRender.state(extractedFlight, config.normalizeSettings(null), {
    status: "completed",
    searchId: "search-explanation-1",
    result: {
      selected_offer_id: "offer-explanation-1",
      offers: [{
        offer_id: "offer-explanation-1",
        provider: "fixture-provider",
        provider_environment: "fixture",
        currency: "AED",
        total_amount: "900.00",
        eligible: false,
        total_complete: true,
        equivalence: {
          classification: "rejected",
          reason_codes: ["CABIN_MISMATCH"],
          explanation: "Cabin differs.",
        },
        saving: { claim: "cannot_compare" },
        hard_preference_violations: ["flight_checked_bags"],
      }],
    },
  });
  assert.match(rendered, /Why included or excluded/);
  assert.match(rendered, /Cabin differs/);
  assert.match(rendered, /Hard preference conflicts/);
  assert.match(rendered, /flight_checked_bags/);
});

test("degraded travel rendering is explicit, passive, and retains fixture provenance", function () {
  const html = travelRender.state({
    vertical: "flight", adapterId: "flight-demo-v1", adapterVersion: "1.0.0", confidence: 1,
    context: { intent: { legs: [{ origin_airport: "DXB", destination_airport: "LHR", departure_date: "2026-10-20" }], trip_type: "one_way", passengers: { adults: 1 }, baseline_offer: { visible_price: { amount: "3199.00", currency: "AED" }, observation_method: "browser_observed" } } },
  }, config.normalizeSettings(null), {
    searchId: "fixture-degraded-search-v1",
    status: "degraded",
    error: "Fixture provider timed out; no independent offer was returned.",
    result: { offers: [], saving: null, provider_environment: "fixture", degraded_reasons: ["provider_timeout"] },
  });
  assert.match(html, /data-state="degraded"/);
  assert.match(html, /Fixture data/);
  assert.match(html, /provider_timeout/);
  assert.doesNotMatch(html, /travel-revalidate|javascript:/);
});
