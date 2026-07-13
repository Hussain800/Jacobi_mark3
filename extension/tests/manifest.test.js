"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "manifest.json"), "utf8"));

test("MV3 host access is optional and restricted to the supported local demo group", function () {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.optional_host_permissions, ["http://127.0.0.1/*", "http://localhost/*"]);
  assert.ok(!manifest.optional_host_permissions.includes("<all_urls>"));
  assert.ok(!manifest.optional_host_permissions.includes("http://*/*"));
  assert.ok(!manifest.optional_host_permissions.includes("https://*/*"));
  assert.equal(manifest.host_permissions, undefined);
});

test("travel access does not add checkout, debugger, cookies, or browsing-history permissions", function () {
  const disallowed = ["debugger", "cookies", "history", "webRequest", "webRequestBlocking"];
  assert.deepEqual(manifest.permissions.filter(function (item) { return disallowed.includes(item); }), []);
});
