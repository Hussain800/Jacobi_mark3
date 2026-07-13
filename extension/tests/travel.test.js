"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const travel = require("../shared/travel.js");

function camel(value) {
  return value.replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
}

function fixture(name, vertical) {
  const html = readFileSync(join(__dirname, "fixtures", name), "utf8");
  const marker = /<meta\s+name="jacobi-travel-adapter"\s+content="([^"]+)"/i.exec(html)[1];
  const main = new RegExp(`<main([\\s\\S]*?)data-jacobi-travel="${vertical}"([\\s\\S]*?)>`, "i").exec(html);
  const attributes = (main[1] + main[2]);
  const dataset = {};
  for (const match of attributes.matchAll(/data-([a-z0-9-]+)="([^"]*)"/gi)) dataset[camel(match[1])] = match[2];
  dataset.jacobiTravel = vertical;
  return {
    querySelector(selector) {
      if (selector === 'meta[name="jacobi-travel-adapter"]') return { content: marker };
      if (selector === `[data-jacobi-travel="${vertical}"]`) return { dataset };
      return null;
    },
  };
}

test("versioned flight fixture produces a bounded typed intent", async function () {
  const result = await travel.extract(
    fixture("fixture-flight-v1.html", "flight"),
    { href: "http://127.0.0.1:4173/fixture-flight-v1.html?session=secret", hostname: "127.0.0.1" },
    new Date("2026-07-13T10:00:00Z"),
  );
  assert.equal(result.supported, true);
  assert.equal(result.adapter_id, "flight-demo-v1");
  assert.equal(result.adapter_version, "1.0.0");
  assert.equal(result.context.intent.legs[0].origin_airport, "DXB");
  assert.equal(result.context.intent.legs[1].destination_airport, "DXB");
  assert.equal(result.context.intent.baseline_offer.visible_price.amount, "3199.00");
  assert.equal(result.context.intent.baseline_offer.observation_method, "browser_observed");
  assert.deepEqual(result.context.baseline_costs, [{
    kind: "base_fare",
    state: "known",
    money: { amount: "3199.00", currency: "AED" },
    mandatory: true,
    description: "Versioned demo fixture declares the displayed total includes all known mandatory costs.",
    evidence_ref: "flight-demo-page-v1",
  }]);
  assert.equal(result.context.intent.source_page.page_reference, "flight-demo-v1");
  assert.doesNotMatch(JSON.stringify(result.context), /session=secret|source_url|raw_html/);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test("versioned hotel fixture preserves property facts but no guest identity", async function () {
  const result = await travel.extract(
    fixture("fixture-hotel-v1.html", "hotel"),
    { href: "http://localhost:4173/fixture-hotel-v1.html", hostname: "localhost" },
    new Date("2026-07-13T10:00:00Z"),
  );
  assert.equal(result.supported, true);
  assert.equal(result.context.intent.property_hint.name, "Jacobi Marina Hotel");
  assert.equal(result.context.intent.rooms[0].adults, 2);
  assert.equal(result.context.intent.selected_rate.refundable, true);
  assert.equal(result.context.baseline_costs[0].kind, "base_rate");
  assert.doesNotMatch(JSON.stringify(result.context), /guest_name|email|passport|card_number/);
});

test("adapter support is limited to exact versioned localhost demo routes", async function () {
  const doc = fixture("fixture-flight-v1.html", "flight");
  assert.equal((await travel.extract(doc, { href: "https://example.test/fixture-flight-v1.html", hostname: "example.test" })).supported, false);
  assert.equal((await travel.extract(doc, { href: "http://localhost:4173/unrelated", hostname: "localhost" })).supported, false);
});

test("fingerprint excludes baseline price, extraction time, and page reference", async function () {
  const first = await travel.extract(fixture("fixture-flight-v1.html", "flight"), { href: "http://localhost/fixture-flight-v1.html", hostname: "localhost" }, new Date("2026-07-13T10:00:00Z"));
  const changed = structuredClone(first.context);
  changed.intent.baseline_offer.visible_price.amount = "9999.00";
  changed.intent.extracted_at = "2026-07-14T10:00:00Z";
  changed.intent.source_page.page_reference = "another-reference";
  assert.equal(await travel.fingerprint(changed), first.fingerprint);
  changed.intent.legs[0].departure_date = "2026-10-21";
  assert.notEqual(await travel.fingerprint(changed), first.fingerprint);
});

test("sanitizer rejects identity, session, payment, raw URL, and HTML keys", function () {
  const clean = travel.sanitize({
    property_name: "Allowed Hotel",
    passenger_name: "Private",
    email: "private@example.test",
    session_id: "secret",
    card_number: "4111",
    source_url: "https://example.test/?token=secret",
    raw_html: "<html>",
  });
  assert.deepEqual(clean, { property_name: "Allowed Hotel" });
});
