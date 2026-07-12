/**
 * Jacobi side panel — progressive comparison UI.
 *
 * Flow: request structured product context from the content script on the
 * active tab -> POST /api/v1/compare -> render one obvious result
 * (save / already best / trade-off / honest uncertainty). Evidence and
 * methodology stay behind an expandable section (PDR: savings before
 * sophistication).
 *
 * Dev harness: outside an extension context (plain browser tab), it runs the
 * deterministic Sony fixture against the local backend so the panel can be
 * developed and reviewed without loading the extension.
 */

"use strict";

const IS_EXTENSION = typeof chrome !== "undefined" && !!(chrome.tabs && chrome.runtime && chrome.runtime.id);
const DEFAULT_API = "http://localhost:8000";
const DEFAULT_WEBAPP = "http://localhost:3000";

const DEMO_CONTEXT = {
  source_url: "https://www.amazon.ae/dp/B0DEMO123",
  market: "AE",
  current_offer: {
    title: "Sony WH-1000XM6 Wireless Noise Cancelling Headphones - Black",
    brand: "Sony",
    mpn: "WH-1000XM6/B",
    gtin: "4548736158801",
    price: { amount: "1699", currency: "AED" },
    shipping: { amount: "0", currency: "AED" },
    condition: "new",
    stock: "in_stock",
  },
  page_evidence: { sources: {}, json_ld_found: true, extracted_at: new Date().toISOString() },
};

const view = document.getElementById("view");
const freshnessEl = document.getElementById("freshness");
let lastContext = null;

// ── helpers ────────────────────────────────────────────────────────────────

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function fmtMoney(m) {
  if (!m) return "—";
  const n = parseFloat(m.amount);
  const shown = Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2 });
  return `${m.currency} ${shown}`;
}

async function getSettings() {
  if (!IS_EXTENSION) return { apiUrl: DEFAULT_API, webappUrl: DEFAULT_WEBAPP };
  return new Promise((resolve) => {
    chrome.storage.sync.get("jacobi_settings", (r) => {
      const s = r.jacobi_settings || {};
      resolve({
        apiUrl: s.apiBackendUrl || DEFAULT_API,
        webappUrl: s.backendUrl || DEFAULT_WEBAPP,
      });
    });
  });
}

function openUrl(url) {
  if (IS_EXTENSION) chrome.tabs.create({ url });
  else window.open(url, "_blank");
}

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
  });
}

async function requestContext() {
  if (!IS_EXTENSION) return DEMO_CONTEXT;
  const tab = await getActiveTab();
  if (!tab || tab.id == null) return null;
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: "REQUEST_PRODUCT_CONTEXT" }, (resp) => {
      if (chrome.runtime.lastError || !resp) return resolve(null); // no content script here
      resolve(resp.context || null);
    });
  });
}

// ── render states ──────────────────────────────────────────────────────────

function renderStatus(text) {
  view.innerHTML = `
    <div class="state">
      <div class="status-line"><span class="pulse-dot"></span> ${esc(text)}</div>
    </div>`;
}

function renderUnsupported() {
  view.innerHTML = `
    <div class="state">
      <div class="headline">No product detected</div>
      <p class="subline">
        Jacobi reads supported retailer product pages automatically.
        Open a product page on a supported UAE store (Amazon.ae, Noon,
        Sharaf DG, Jumbo, Sony) and reopen this panel.
      </p>
    </div>`;
  freshnessEl.textContent = "";
}

function renderError(message) {
  view.innerHTML = `
    <div class="state">
      <div class="headline warn">Comparison unavailable</div>
      <div class="error-box mono">${esc(message)}</div>
      <p class="subline">Is the Jacobi backend running? Default: <span class="mono">${esc(DEFAULT_API)}</span></p>
    </div>`;
}

function offerRows(offer) {
  const rows = [];
  const p = offer.price || {};
  rows.push(["Item", fmtMoney(p.item)]);
  if (p.shipping) rows.push(["Shipping", fmtMoney(p.shipping)]);
  if (p.unknown_components && p.unknown_components.length) {
    rows.push(["Unknown", p.unknown_components.join(", ")]);
  }
  rows.push(["All-in total", fmtMoney(p.payable_total) + (p.total_complete ? "" : " (incomplete)")]);
  if (offer.delivery && offer.delivery.estimate) rows.push(["Delivery", offer.delivery.estimate]);
  if (offer.warranty && offer.warranty.region) {
    rows.push(["Warranty", `${offer.warranty.region} ${offer.warranty.duration || ""}`.trim()]);
  }
  rows.push(["Condition", offer.condition]);
  if (offer.seller && offer.seller.name) rows.push(["Seller", offer.seller.name]);
  return rows.map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span>${esc(v)}</span></div>`).join("");
}

function candidateList(title, items) {
  if (!items || !items.length) return "";
  const lis = items.map((c) => {
    const o = c.offer;
    let why = c.equivalence ? c.equivalence.explanation : "";
    const excl = (c.exclusion_reasons || []).join(", ");
    const incomplete = o.price && o.price.total_complete === false
      ? ` (total incomplete: ${(o.price.unknown_components || []).join(", ") || "unknown costs"})` : "";
    return `<div class="offer-li">
      <div><strong>${esc(o.merchant_name)}</strong> — <span class="mono">${esc(fmtMoney(o.price.payable_total || o.price.item))}${esc(incomplete)}</span></div>
      <div class="why">${esc(why)}${excl ? ` [${esc(excl)}]` : ""}</div>
    </div>`;
  }).join("");
  return `<details><summary>${esc(title)} (${items.length})</summary>${lis}</details>`;
}

function renderResult(result) {
  const rec = result.recommendation || {};
  const best = result.best_offer;
  const cur = result.current_offer;
  const status = rec.status;

  const headlineClass = status === "save" ? "save" : (status === "tradeoff" ? "warn" : "");
  const model = result.product && result.product.model ? result.product.model : "";
  const brand = result.product && result.product.brand ? result.product.brand : "";

  let bestCard = "";
  if (best && (status === "save" || status === "tradeoff")) {
    bestCard = `
      <div class="card best">
        <h3>${esc(best.merchant_name)}</h3>
        <div class="price">${esc(fmtMoney(best.price.payable_total || best.price.item))}</div>
        ${offerRows(best)}
      </div>
      <button class="cta" id="open-best">Open ${status === "save" ? "cheaper" : "alternative"} offer</button>`;
  }

  const matchConf = result.eligible_offers && result.eligible_offers[0]
    ? result.eligible_offers[0].equivalence.score : null;

  const tags = [
    `<span class="badge-tag ok">${esc(brand)} ${esc(model)}</span>`,
    matchConf != null ? `<span class="badge-tag ok">match ${(matchConf * 100).toFixed(0)}%</span>` : "",
    `<span class="badge-tag">confidence: ${esc(result.confidence)}</span>`,
    result.fixture_mode ? `<span class="badge-tag warn">demo fixtures</span>` : "",
  ].join("");

  view.innerHTML = `
    <div class="state">
      <div class="headline ${headlineClass}">${esc(rec.headline || "")}</div>
      <p class="subline">${esc(rec.explanation || "")}</p>
      <div>${tags}</div>
      ${bestCard}
      <div class="card">
        <h3>Your current offer — ${esc(cur ? cur.merchant_name : "")}</h3>
        ${cur ? offerRows(cur) : ""}
      </div>
      ${candidateList("Other exact offers", (result.eligible_offers || []).filter((c) => !best || c.offer.observation_id !== best.observation_id))}
      ${candidateList("With trade-offs", result.tradeoff_offers)}
      ${candidateList("Similar (not exact)", result.similar_offers)}
      ${candidateList("Rejected — and why", result.rejected_offers)}
      <details>
        <summary>Evidence &amp; methodology</summary>
        <div class="row"><span class="k">Evidence manifest</span><span class="mono">${esc(result.evidence_manifest_id || "—")}</span></div>
        <div class="row"><span class="k">Comparison ID</span><span class="mono">${esc(result.comparison_id)}</span></div>
        <div class="row"><span class="k">Reason codes</span><span class="mono" style="text-align:right">${esc((result.reason_codes || []).join(" "))}</span></div>
        <div class="row"><span class="k">Providers failed</span><span>${esc((result.provider_errors || []).map((e) => e.merchant_id).join(", ") || "none")}</span></div>
      </details>
    </div>`;

  if (bestCard) {
    document.getElementById("open-best").addEventListener("click", () => openUrl(rec.action_url || best.source_url));
  }
  freshnessEl.textContent = `observed ${new Date(result.created_at).toLocaleTimeString()} · ttl ${result.ttl_seconds}s`;
}

// ── main flow ──────────────────────────────────────────────────────────────

async function run() {
  renderStatus("Recognising this product…");
  const ctx = await requestContext();
  if (!ctx) {
    renderUnsupported();
    return;
  }
  lastContext = ctx;
  const title = ctx.current_offer.title || "product";
  renderStatus(`Checking verified retailers for “${title.slice(0, 60)}”…`);

  const { apiUrl } = await getSettings();
  try {
    const resp = await fetch(`${apiUrl}/api/v1/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ctx),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${detail.slice(0, 300)}`);
    }
    renderResult(await resp.json());
  } catch (err) {
    renderError(err.message || String(err));
  }
}

document.getElementById("refresh").addEventListener("click", run);
document.getElementById("deep-audit").addEventListener("click", async () => {
  const { webappUrl } = await getSettings();
  const target = (lastContext && lastContext.source_url) || "";
  openUrl(`${webappUrl}/chat?url=${encodeURIComponent(target)}`);
});

run();
