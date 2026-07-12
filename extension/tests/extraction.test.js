"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const extraction = require("../shared/extraction.js");

function documentFixture(jsonLd, metadata, bodyText) {
  const meta = metadata || {};
  return {
    title: meta.title || "Fixture product",
    body: { innerText: bodyText || "" },
    querySelectorAll(selector) {
      return selector === 'script[type="application/ld+json"]' ? [{ textContent: jsonLd || "" }] : [];
    },
    querySelector(selector) {
      if (selector === 'meta[property="og:title"]' && meta.ogTitle) return { content: meta.ogTitle };
      if (selector === 'meta[property="product:price:amount"]' && meta.amount) return { content: meta.amount };
      if (selector === 'meta[property="product:price:currency"]' && meta.currency) return { content: meta.currency };
      return null;
    },
  };
}

test("bounded JSON-LD traversal finds a nested product", function () {
  const node = extraction.findProductNode({ "@graph": [{ "@type": "Thing" }, { "@type": "Product", name: "Phone" }] });
  assert.equal(node.name, "Phone");
  assert.equal(extraction.parseJsonLd("x".repeat(extraction.MAX_JSON_LD_BYTES + 1)), null);
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(extraction.findProductNode(cyclic), null);
});

test("structured extraction preserves explicit evidence without optimistic defaults", function () {
  const json = JSON.stringify({
    "@type": "Product", name: "Sony WH-1000XM6", brand: { name: "Sony" }, mpn: "WH-1000XM6/B",
    offers: { "@type": "Offer", price: "1,699.00", priceCurrency: "AED", availability: "https://schema.org/InStock" },
  });
  const result = extraction.buildContext(documentFixture(json), { href: "https://shop.example/item?utm_source=x", hostname: "shop.example" }, new Date("2026-01-01T00:00:00Z"));
  assert.equal(result.context.current_offer.price.amount, "1699.00");
  assert.equal(result.context.current_offer.price.currency, "AED");
  assert.equal(result.context.current_offer.condition, "unknown");
  assert.equal(result.context.current_offer.stock, "in_stock");
  assert.equal(result.context.source_url, "https://shop.example/item");
  assert.equal(result.context.page_evidence.sources.title, "json_ld");
  assert.equal(result.context.page_evidence.sources.model, undefined);
});

test("missing currency is uncertainty, never silently AED", function () {
  const result = extraction.buildContext(documentFixture("", { amount: "199", ogTitle: "Mystery product" }), { href: "https://shop.example/item", hostname: "shop.example" });
  assert.equal(result.context, null);
  assert.equal(result.reason, "price_or_currency_unknown");
  assert.equal(result.preview.currency, null);
});

test("merchant hooks include explicit delivery and warranty selectors", function () {
  const amazon = extraction.merchantSelectors("www.amazon.ae");
  assert.ok(amazon.delivery.length > 0);
  assert.ok(amazon.warranty.length > 0);
});

test("local product detection remains comfortably below the 500ms budget", function () {
  const json = JSON.stringify({
    "@type": "Product", name: "Sony WH-1000XM6", mpn: "WH-1000XM6/B",
    offers: { "@type": "Offer", price: "1699", priceCurrency: "AED" },
  });
  const doc = documentFixture(json);
  const location = { href: "https://shop.example/product", hostname: "shop.example" };
  const started = performance.now();
  for (let index = 0; index < 100; index += 1) extraction.buildContext(doc, location);
  const averageMs = (performance.now() - started) / 100;
  assert.ok(averageMs < 500, `average extraction ${averageMs.toFixed(3)}ms exceeded budget`);
});

test("only the named localhost demo pages explicitly enable retailer fixtures", function () {
  const json = JSON.stringify({
    "@type": "Product", name: "Sony WH-1000XM6", mpn: "WH-1000XM6/B",
    offers: { "@type": "Offer", price: "1699", priceCurrency: "AED" },
  });
  const demo = extraction.buildContext(
    documentFixture(json),
    { href: "http://127.0.0.1:4173/fixture-product.html", hostname: "127.0.0.1" },
  );
  const normal = extraction.buildContext(
    documentFixture(json),
    { href: "https://shop.example/fixture-product.html", hostname: "shop.example" },
  );
  assert.equal(demo.context.include_fixture_offers, true);
  assert.equal(demo.context.page_evidence.fixture_demo, true);
  assert.equal(normal.context.include_fixture_offers, undefined);
});
