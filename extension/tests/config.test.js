"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../shared/config.js");

test("settings use one nested versioned schema", function () {
  assert.deepEqual(config.normalizeSettings({
    apiBackendUrl: "https://api.example.test/root/?ignored=1",
    webappUrl: "http://localhost:3000/",
    privacy: { telemetryEnabled: true },
    travel: { mode: "automatic", automaticSavingsConsent: true, meaningfulSavingsAmount: "25", meaningfulSavingsPercent: 4, displayCurrency: "aed" },
    backendUrl: "https://legacy.invalid",
  }), {
    schemaVersion: 2,
    apiBackendUrl: "https://api.example.test/root",
    webappUrl: "http://localhost:3000",
    privacy: { telemetryEnabled: true },
    travel: { mode: "automatic", automaticSavingsConsent: true, meaningfulSavingsAmount: "25.00", meaningfulSavingsPercent: 4, displayCurrency: "AED" },
  });
});

test("automatic mode fails closed to privacy without explicit consent", function () {
  const settings = config.normalizeSettings({ travel: { mode: "automatic", automaticSavingsConsent: false } });
  assert.equal(settings.travel.mode, "privacy");
  assert.equal(settings.travel.automaticSavingsConsent, false);
  assert.deepEqual(config.TRAVEL_SITE_ORIGINS, ["http://127.0.0.1/*", "http://localhost/*"]);
});

test("unsafe schemes and credential-bearing URLs are rejected", function () {
  assert.equal(config.safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(config.safeHttpUrl("https://user:secret@example.test"), null);
  assert.equal(config.permissionOrigin("https://api.example.test/base"), "https://api.example.test/*");
  assert.equal(config.permissionOrigin("http://localhost:8000/api"), "http://localhost/*");
});

function verifiedResult(amount, currency, usdAmount, conversionOverrides) {
  const conversion = {
    original: { amount, currency },
    converted: { amount: usdAmount, currency: "USD" },
    exchange_rate: currency === "USD" ? "1" : "0.272294",
    rate_source: "fixture-fx-v1",
    rate_timestamp: "2026-07-13T10:00:00Z",
    rate_age_seconds: 60,
    rounding_method: "half_even",
    ...(conversionOverrides || {}),
  };
  return {
    selected_offer_id: "offer-1",
    saving: { claim: "verified", amount: { amount, currency }, usd_conversion: conversion },
    offers: [{
      offer_id: "offer-1",
      eligible: true,
      total_complete: true,
      equivalence: { classification: "exact" },
      evidence_manifest_id: "man_offer_1",
    }],
  };
}

test("meaningful travel saving uses the larger USD amount and baseline-percent thresholds", function () {
  const settings = config.normalizeSettings(null);
  const belowPercent = config.meaningfulTravelSaving(
    verifiedResult("25.00", "USD", "25.00"),
    { amount: "1000.00", currency: "USD" },
    settings,
  );
  assert.deepEqual(belowPercent, {
    interrupt: false,
    badge: "checked",
    reason: "below_percent_threshold",
    savingAmount: "25.00",
    savingCurrency: "USD",
    savingUsd: "25.00",
    amountThresholdUsd: "20.00",
    percentThreshold: "3",
    rateSource: "fixture-fx-v1",
    rateTimestamp: "2026-07-13T10:00:00Z",
  });

  const exactBoundary = config.meaningfulTravelSaving(
    verifiedResult("20.00", "USD", "20.00"),
    { amount: "500.00", currency: "USD" },
    settings,
  );
  assert.equal(exactBoundary.interrupt, true);
  assert.equal(exactBoundary.badge, "saving");
  assert.equal(exactBoundary.reason, "meaningful_verified_saving");
  assert.equal(Object.isFrozen(exactBoundary), true);

  const belowUsd = config.meaningfulTravelSaving(
    verifiedResult("19.99", "USD", "19.99"),
    { amount: "500.00", currency: "USD" },
    settings,
  );
  assert.equal(belowUsd.interrupt, false);
  assert.equal(belowUsd.reason, "below_usd_threshold");
});

test("meaningful travel saving fails passive without complete explicit USD conversion evidence", function () {
  const settings = config.normalizeSettings(null);
  const explicit = config.meaningfulTravelSaving(
    verifiedResult("100.00", "AED", "27.23"),
    { amount: "1000.00", currency: "AED" },
    settings,
  );
  assert.equal(explicit.interrupt, true);
  assert.equal(explicit.savingUsd, "27.23");

  const missingSource = verifiedResult("100.00", "AED", "27.23", { rate_source: "" });
  assert.equal(config.meaningfulTravelSaving(missingSource, { amount: "1000.00", currency: "AED" }, settings).reason, "usd_conversion_evidence_missing");

  const dishonestRate = verifiedResult("100.00", "AED", "27.23", { exchange_rate: "0.1" });
  assert.equal(config.meaningfulTravelSaving(dishonestRate, { amount: "1000.00", currency: "AED" }, settings).reason, "usd_conversion_evidence_missing");

  const missingConversion = verifiedResult("100.00", "AED", "27.23");
  delete missingConversion.saving.usd_conversion;
  const passive = config.meaningfulTravelSaving(missingConversion, { amount: "1000.00", currency: "AED" }, settings);
  assert.equal(passive.interrupt, false);
  assert.equal(passive.badge, "checked");
  assert.equal(passive.reason, "usd_conversion_evidence_missing");

  const missingManifest = verifiedResult("100.00", "AED", "27.23");
  delete missingManifest.offers[0].evidence_manifest_id;
  assert.equal(config.meaningfulTravelSaving(missingManifest, { amount: "1000.00", currency: "AED" }, settings).reason, "evidence_manifest_missing");
});
