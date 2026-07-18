import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(here, "..");
const chromeCandidates = [
  process.env.CHROME_PATH,
  join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
  join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1223", "chrome-win64", "chrome.exe"),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const chromePath = chromeCandidates.find(existsSync);

if (!chromePath) {
  console.log("SKIP chromium extension test: Chrome/Edge executable not found");
  process.exit(0);
}

function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }

async function waitForFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for " + path);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const callback = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result);
  });
  return {
    socket,
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveMessage, rejectMessage) => pending.set(id, { resolve: resolveMessage, reject: rejectMessage }));
    },
  };
}

async function waitForTarget(port, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let targets = [];
  while (Date.now() < deadline) {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(predicate);
    if (target) return target;
    await delay(150);
  }
  throw new Error("Timed out waiting for Chromium target. Visible targets: " + targets.map((target) => `${target.type}:${target.url}`).join(", "));
}

async function waitForValue(page, expression, predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let value = null;
  while (Date.now() < deadline) {
    const evaluation = await page.send("Runtime.evaluate", { expression, returnByValue: true });
    value = evaluation.result.value;
    if (predicate(value)) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for page value from ${expression}; last value: ${String(value)}`);
}

async function waitForExtensionId(profilePath, port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const preferencesPath = join(profilePath, "Default", "Preferences");
  let registered = [];
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const extensionTarget = targets.find((target) => /chrome-extension:\/\/[^/]+\/background\.js/.test(target.url));
      if (extensionTarget) return new URL(extensionTarget.url).hostname;
    } catch (_) { /* Debug endpoint is still starting. */ }
    try {
      const preferences = JSON.parse(readFileSync(preferencesPath, "utf8"));
      const settings = preferences.extensions && preferences.extensions.settings || {};
      registered = Object.entries(settings).map(([id, value]) => `${id}:${value && value.path || "built-in"}`);
      for (const [id, value] of Object.entries(settings)) {
        if (value && value.path && resolve(value.path).toLowerCase() === extensionDir.toLowerCase()) return id;
      }
    } catch (_) { /* Preferences is written asynchronously. */ }
    await delay(150);
  }
  throw new Error("Timed out waiting for unpacked Jacobi extension registration. Registered: " + registered.join(", "));
}

const fixture = readFileSync(join(here, "fixture-product.html"));
const flightFixture = readFileSync(join(here, "fixtures", "fixture-flight-v1.html"));
const hotelFixture = readFileSync(join(here, "fixtures", "fixture-hotel-v1.html"));
const server = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  if (request.url === "/fixture-flight-v1.html") response.end(flightFixture);
  else if (request.url === "/fixture-hotel-v1.html") response.end(hotelFixture);
  else response.end(fixture);
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/product`;
const flightFixtureUrl = `http://127.0.0.1:${server.address().port}/fixture-flight-v1.html`;
const hotelFixtureUrl = `http://127.0.0.1:${server.address().port}/fixture-hotel-v1.html`;

const profile = mkdtempSync(join(tmpdir(), "jacobi-extension-"));
const processHandle = spawn(chromePath, [
  "--window-position=-10000,-10000", "--window-size=420,760", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
  "--disable-component-update", "--disable-sync", "--enable-extensions", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

try {
  const portFile = join(profile, "DevToolsActivePort");
  await waitForFile(portFile, 15000);
  const port = Number(readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await connect(version.webSocketDebuggerUrl);

  const extensionId = await waitForExtensionId(profile, port);
  assert.match(extensionId, /^[a-p]{32}$/);

  await browser.send("Target.createTarget", { url: fixtureUrl });
  const fixtureTarget = await waitForTarget(port, (target) => target.type === "page" && target.url === fixtureUrl);
  const fixturePage = await connect(fixtureTarget.webSocketDebuggerUrl);
  const fixtureHeading = await waitForValue(fixturePage, "document.querySelector('h1')?.textContent || ''", (value) => /WH-1000XM6/.test(value));
  assert.match(fixtureHeading, /WH-1000XM6/);
  const panelUrl = `chrome-extension://${extensionId}/sidepanel/index.html?demo=1`;
  await browser.send("Target.createTarget", { url: panelUrl });
  const panelTarget = await waitForTarget(port, (target) => target.type === "page" && target.url === panelUrl);
  const panel = await connect(panelTarget.webSocketDebuggerUrl);
  const manifestCheck = await panel.send("Runtime.evaluate", { expression: "({ version: chrome.runtime.getManifest().version, manifestPermissions: chrome.runtime.getManifest().permissions, permissions: chrome.permissions.getAll() })", awaitPromise: true, returnByValue: true });
  assert.equal(manifestCheck.result.value.version, "0.6.0");
  assert.deepEqual(manifestCheck.result.value.permissions.origins || [], []);
  assert.ok(!(manifestCheck.result.value.permissions.permissions || []).includes("tabs"));
  assert.ok((manifestCheck.result.value.manifestPermissions || []).includes("notifications"));
  await panel.send("Page.enable");
  const deadline = Date.now() + 10000;
  let state = null;
  while (Date.now() < deadline) {
    const evaluation = await panel.send("Runtime.evaluate", { expression: "document.querySelector('[data-state]')?.dataset.state || null", returnByValue: true });
    state = evaluation.result.value;
    if (state) break;
    await delay(100);
  }
  assert.equal(state, "saving");
  await panel.send("Emulation.setDeviceMetricsOverride", { width: 420, height: 760, deviceScaleFactor: 1, mobile: false });
  const screenshot = await panel.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const artifactDir = join(extensionDir, "artifacts");
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "sidepanel-saving.png"), Buffer.from(screenshot.data, "base64"));

  await browser.send("Target.createTarget", { url: flightFixtureUrl });
  await browser.send("Target.createTarget", { url: hotelFixtureUrl });
  const flightTarget = await waitForTarget(port, (target) => target.type === "page" && target.url === flightFixtureUrl);
  const hotelTarget = await waitForTarget(port, (target) => target.type === "page" && target.url === hotelFixtureUrl);
  const flightFixturePage = await connect(flightTarget.webSocketDebuggerUrl);
  const hotelFixturePage = await connect(hotelTarget.webSocketDebuggerUrl);
  const flightMarker = await waitForValue(flightFixturePage, "document.querySelector('meta[name=jacobi-travel-adapter]')?.content || ''", (value) => value === "flight-demo-v1");
  const hotelMarker = await waitForValue(hotelFixturePage, "document.querySelector('meta[name=jacobi-travel-adapter]')?.content || ''", (value) => value === "hotel-demo-v1");
  assert.equal(flightMarker, "flight-demo-v1");
  assert.equal(hotelMarker, "hotel-demo-v1");

  async function captureTravelDemo(vertical, expectedText, expectedState = "saving") {
    const url = `chrome-extension://${extensionId}/sidepanel/index.html?travelDemo=${vertical}`;
    await browser.send("Target.createTarget", { url });
    const target = await waitForTarget(port, (item) => item.type === "page" && item.url === url);
    const page = await connect(target.webSocketDebuggerUrl);
    await page.send("Page.enable");
    const deadline = Date.now() + 10000;
    let state = null;
    while (Date.now() < deadline) {
      const evaluation = await page.send("Runtime.evaluate", { expression: "document.querySelector('[data-state]')?.dataset.state || null", returnByValue: true });
      state = evaluation.result.value;
      if (state) break;
      await delay(100);
    }
    assert.equal(state, expectedState);
    const textCheck = await page.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
    assert.match(textCheck.result.value, expectedText);
    assert.match(textCheck.result.value, /Fixture data/);
    if (expectedState === "saving") assert.match(textCheck.result.value, /Immutable evidence manifest/);
    if (expectedState === "degraded") {
      assert.match(textCheck.result.value, /provider_timeout/);
      const unsafeAction = await page.send("Runtime.evaluate", { expression: "Boolean(document.querySelector('#travel-revalidate, a[href^=\"javascript:\"]'))", returnByValue: true });
      assert.equal(unsafeAction.result.value, false);
    }
    await page.send("Emulation.setDeviceMetricsOverride", { width: 420, height: 760, deviceScaleFactor: 1, mobile: false });
    const image = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(join(artifactDir, `sidepanel-travel-${vertical}.png`), Buffer.from(image.data, "base64"));
    page.socket.close();
  }

  await captureTravelDemo("flight", /DXB/);
  await captureTravelDemo("hotel", /Jacobi Marina Hotel/);
  await captureTravelDemo("degraded", /Partial provider result/, "degraded");
  console.log(`PASS unpacked Chromium extension (${extensionId}); retail + versioned flight/hotel/degraded fixture panels; screenshots extension/artifacts/sidepanel-*.png`);
  fixturePage.socket.close();
  flightFixturePage.socket.close();
  hotelFixturePage.socket.close();
  panel.socket.close();
  browser.socket.close();
} finally {
  try { execFileSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch (_) { processHandle.kill(); }
  server.close();
  await delay(700);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) { /* Chromium may retain a transient Windows profile lock. */ }
}
