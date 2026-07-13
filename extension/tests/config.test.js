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
