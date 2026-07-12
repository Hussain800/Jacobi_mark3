/**
 * Jacobi — product context extractor (content script).
 *
 * Runs only on supported merchant domains (see manifest matches). Extracts
 * STRUCTURED product fields locally — JSON-LD first, meta tags second — and
 * hands them to the side panel on request. The raw page never leaves the
 * browser (PDR FR-2: send fields, not the page).
 */

"use strict";

(() => {
  if (window.__jacobi_context_injected) return;
  window.__jacobi_context_injected = true;

  // ── JSON-LD ─────────────────────────────────────────────────────────────
  function findJsonLdProduct() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      let data;
      try {
        data = JSON.parse(s.textContent);
      } catch {
        continue;
      }
      const nodes = [];
      const push = (n) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(push);
        nodes.push(n);
        if (n["@graph"]) push(n["@graph"]);
      };
      push(data);
      for (const node of nodes) {
        const t = node["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) {
          return node;
        }
      }
    }
    return null;
  }

  function firstOffer(product) {
    let o = product.offers;
    if (Array.isArray(o)) o = o[0];
    if (o && o["@type"] === "AggregateOffer" && Array.isArray(o.offers)) o = o.offers[0];
    return o || null;
  }

  const CONDITION_MAP = {
    NewCondition: "new",
    RefurbishedCondition: "refurbished",
    UsedCondition: "used",
    DamagedCondition: "used",
  };
  const STOCK_MAP = {
    InStock: "in_stock",
    InStoreOnly: "in_stock",
    OnlineOnly: "in_stock",
    OutOfStock: "out_of_stock",
    SoldOut: "out_of_stock",
    PreOrder: "preorder",
  };

  function schemaEnum(value, map) {
    if (!value) return null;
    const key = String(value).split("/").pop();
    return map[key] || null;
  }

  function meta(sel) {
    const el = document.querySelector(sel);
    return el && el.content ? el.content.trim() : null;
  }

  function detectFreeShipping() {
    const text = (document.body?.innerText || "").slice(0, 20000).toLowerCase();
    return /free\s+(delivery|shipping)/.test(text);
  }

  function cleanUrl() {
    try {
      const u = new URL(location.href);
      const drop = [];
      u.searchParams.forEach((_, k) => {
        if (/^utm_|^ref$|^ref_|^tag$|^pf_rd|^pd_rd|^psc$|^spm$/.test(k)) drop.push(k);
      });
      drop.forEach((k) => u.searchParams.delete(k));
      return u.toString();
    } catch {
      return location.href;
    }
  }

  // ── Context assembly ────────────────────────────────────────────────────
  function buildContext() {
    const sources = {};
    let title = null, brand = null, mpn = null, gtin = null, sku = null, model = null;
    let amount = null, currency = null, condition = null, stock = null, seller = null;

    const p = findJsonLdProduct();
    if (p) {
      title = p.name || null;
      brand = typeof p.brand === "object" ? (p.brand && p.brand.name) || null : p.brand || null;
      mpn = p.mpn || null;
      model = typeof p.model === "object" ? (p.model && p.model.name) || null : p.model || null;
      gtin = p.gtin13 || p.gtin14 || p.gtin12 || p.gtin8 || p.gtin || null;
      sku = p.sku || null;
      const o = firstOffer(p);
      if (o) {
        amount = o.price != null ? String(o.price) : (o.lowPrice != null ? String(o.lowPrice) : null);
        currency = o.priceCurrency || null;
        condition = schemaEnum(o.itemCondition, CONDITION_MAP);
        stock = schemaEnum(o.availability, STOCK_MAP);
        seller = o.seller && (o.seller.name || o.seller) || null;
        if (typeof seller === "object") seller = null;
      }
      Object.keys({ title, brand, mpn, gtin, sku, model, amount }).forEach((k) => (sources[k] = "json_ld"));
    }

    if (!title) { title = meta('meta[property="og:title"]') || document.title || null; sources.title = "meta"; }
    if (!amount) {
      amount = meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]');
      if (amount) sources.amount = "meta";
    }
    if (!currency) {
      currency = meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]');
    }
    if (!currency && /(AED|د\.إ)/.test((document.body?.innerText || "").slice(0, 20000))) {
      currency = "AED";
    }

    if (!amount) return null; // not a product page we can act on

    const ctx = {
      source_url: cleanUrl(),
      market: "AE",
      current_offer: {
        title: title,
        brand: brand,
        model: model,
        mpn: mpn,
        gtin: gtin,
        sku: sku,
        price: { amount: String(amount).replace(/[^\d.]/g, ""), currency: currency || "AED" },
        condition: condition || "new",
        stock: stock || "unknown",
        seller: seller,
      },
      page_evidence: {
        sources: sources,
        json_ld_found: !!p,
        extracted_at: new Date().toISOString(),
      },
    };
    if (detectFreeShipping()) {
      ctx.current_offer.shipping = { amount: "0", currency: ctx.current_offer.price.currency };
    }
    return ctx;
  }

  // ── Messaging ───────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "REQUEST_PRODUCT_CONTEXT") {
      sendResponse({ context: buildContext() });
      return true;
    }
    return false;
  });

  // ── Badge (small, dismissible, opens the side panel) ────────────────────
  async function isDomainDismissed() {
    try {
      const result = await chrome.storage.local.get("jacobi_dismissed");
      return (result.jacobi_dismissed || []).includes(location.hostname);
    } catch {
      return false;
    }
  }

  function injectBadge() {
    const tag = "jcb-" + Math.random().toString(36).slice(2, 8);
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
    const host = document.createElement(tag);
    host.style.cssText = "all:initial; position:fixed; z-index:2147483647;";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; }
        .badge {
          display: flex; align-items: center; gap: 6px;
          background: #08090c; border: 1px solid rgba(0,255,65,0.45);
          border-radius: 8px; padding: 6px 10px; cursor: pointer; user-select: none;
          font-family: 'JetBrains Mono','Fira Code','Courier New',monospace;
          font-size: 11px; color: #fff;
          box-shadow: 0 2px 16px rgba(0,255,65,0.08);
          transition: box-shadow .2s, transform .15s, border-color .2s;
        }
        .badge:hover { border-color: rgba(0,255,65,0.7); transform: translateY(-1px); }
        .b { color: #00ff41; font-weight: 700; font-size: 12px; }
        .x {
          width: 16px; height: 16px; border-radius: 50%; border: none;
          background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4);
          cursor: pointer; font-size: 10px; line-height: 1; padding: 0; margin-left: 2px;
        }
        .x:hover { background: rgba(239,68,68,0.3); color: #fff; }
      </style>
      <div class="wrap" id="wrap">
        <div class="badge" id="badge">
          <span class="b">[J]</span><span>Check price</span>
          <button class="x" id="dismiss" title="Dismiss for this site">&times;</button>
        </div>
      </div>`;
    shadow.getElementById("badge").addEventListener("click", (e) => {
      if (e.target === shadow.getElementById("dismiss")) return;
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });
    shadow.getElementById("dismiss").addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "DISMISS_DOMAIN", domain: location.hostname });
      host.remove();
    });
  }

  async function init() {
    const ctx = buildContext();
    if (!ctx) return;
    try {
      chrome.runtime.sendMessage({ type: "PRODUCT_PAGE_DETECTED", url: ctx.source_url });
    } catch { /* extension reloading */ }
    if (await isDomainDismissed()) return;
    if (document.body) setTimeout(injectBadge, 600);
  }

  init();
})();
