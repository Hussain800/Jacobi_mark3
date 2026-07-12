"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../shared/config.js");

test("settings use one nested versioned schema", function () {
  assert.deepEqual(config.normalizeSettings({
    apiBackendUrl: "https://api.example.test/root/?ignored=1",
    webappUrl: "http://localhost:3000/",
    privacy: { telemetryEnabled: true },
    backendUrl: "https://legacy.invalid",
  }), {
    schemaVersion: 1,
    apiBackendUrl: "https://api.example.test/root",
    webappUrl: "http://localhost:3000",
    privacy: { telemetryEnabled: true },
  });
});

test("unsafe schemes and credential-bearing URLs are rejected", function () {
  assert.equal(config.safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(config.safeHttpUrl("https://user:secret@example.test"), null);
  assert.equal(config.permissionOrigin("https://api.example.test/base"), "https://api.example.test/*");
});
