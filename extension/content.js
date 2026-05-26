/**
 * Jacobi Price Shield — Content Script
 *
 * • Throttled MutationObserver targeting search-results containers.
 * • Price-extraction heuristics for common booking-site patterns.
 * • Shadow DOM widget injected via a randomized host element tag name
 *   with `all: initial` style reset.
 * • Sends extracted prices to the background service worker.
 */

"use strict";

(() => {
  // ─── Guard: prevent double-injection ────────────────────────────────────────
  if (window.__jacobi_content_injected) return;
  window.__jacobi_content_injected = true;

  // ─── Constants ──────────────────────────────────────────────────────────────
  const THROTTLE_MS = 1500;
  const PRICE_RE = /(?:USD|\$|€|£|¥)\s?\d[\d,]*\.?\d{0,2}|\d[\d,]*\.?\d{0,2}\s?(?:USD|EUR|GBP|JPY)/gi;
  const RESULT_SELECTORS = [
    "[data-testid='property-card']",       // Booking.com
    "[data-stid='property-listing']",      // Expedia
    ".zE1n7d",                              // Google Travel
    "[class*='resultInner']",               // Kayak
    "[class*='flight-result']",             // United
    ".sr_property_block",                   // Booking legacy
    "[data-test-id='listing']",             // Generic fallback
  ];

  // ─── Utility: throttle ─────────────────────────────────────────────────────
  function throttle(fn, ms) {
    let last = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      const remaining = ms - (now - last);
      clearTimeout(timer);
      if (remaining <= 0) {
        last = now;
        fn.apply(this, args);
      } else {
        timer = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  // ─── Price Extraction ──────────────────────────────────────────────────────
  /**
   * Walk visible result cards and extract price strings.
   * @returns {{ raw: string, value: number, currency: string }[]}
   */
  function extractPrices() {
    const prices = [];
    const seen = new Set();

    for (const sel of RESULT_SELECTORS) {
      const cards = document.querySelectorAll(sel);
      for (const card of cards) {
        const text = card.innerText ?? "";
        const matches = text.match(PRICE_RE);
        if (!matches) continue;
        for (const raw of matches) {
          if (seen.has(raw)) continue;
          seen.add(raw);

          // Normalise numeric value.
          const numeric = parseFloat(raw.replace(/[^0-9.]/g, ""));
          if (Number.isNaN(numeric) || numeric <= 0) continue;

          // Rough currency detection.
          let currency = "USD";
          if (raw.includes("€") || /EUR/i.test(raw)) currency = "EUR";
          else if (raw.includes("£") || /GBP/i.test(raw)) currency = "GBP";
          else if (raw.includes("¥") || /JPY/i.test(raw)) currency = "JPY";

          prices.push({ raw, value: numeric, currency });
        }
      }
    }

    return prices;
  }

  // ─── Shadow-DOM Widget Injection ───────────────────────────────────────────
  /**
   * Generate a random custom-element tag name to reduce fingerprinting
   * surface for anti-extension heuristics on booking sites.
   */
  function randomTagName() {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let name = "jcb-";
    for (let i = 0; i < 6; i++) {
      name += chars[Math.floor(Math.random() * chars.length)];
    }
    return name;
  }

  let widgetHost = null;
  let shadowRoot = null;

  function ensureWidget() {
    if (widgetHost && document.body.contains(widgetHost)) return shadowRoot;

    const tag = randomTagName();

    // Register a no-op custom element so the browser accepts the tag.
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }

    widgetHost = document.createElement(tag);
    // Reset all inherited styles on the host.
    widgetHost.style.cssText = "all: initial; position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;";
    document.body.appendChild(widgetHost);

    shadowRoot = widgetHost.attachShadow({ mode: "closed" });
    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
          font-size: 12px;
          color: #c8ccd4;
        }
        .jacobi-pill {
          background: #08090c;
          border: 1px solid #1a1d24;
          border-radius: 8px;
          padding: 8px 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.6);
          cursor: default;
          user-select: none;
          transition: opacity 0.25s ease;
        }
        .jacobi-pill:hover {
          border-color: #00d992;
        }
        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #555;
          flex-shrink: 0;
        }
        .dot.active   { background: #00d992; }
        .dot.warning  { background: #f5a623; }
        .dot.error    { background: #e74c3c; }
      </style>
      <div class="jacobi-pill">
        <span class="dot" id="status-dot"></span>
        <span id="label">Jacobi — idle</span>
      </div>
    `;
    return shadowRoot;
  }

  function updateWidget(verdict) {
    const sr = ensureWidget();
    const dot = sr.getElementById("status-dot");
    const label = sr.getElementById("label");
    if (!dot || !label) return;

    switch (verdict) {
      case "FAIR":
        dot.className = "dot active";
        label.textContent = "Jacobi — fair pricing";
        break;
      case "INFLATED":
        dot.className = "dot warning";
        label.textContent = "Jacobi — possible inflation";
        break;
      case "ERROR":
        dot.className = "dot error";
        label.textContent = "Jacobi — error";
        break;
      default:
        dot.className = "dot";
        label.textContent = "Jacobi — scanning…";
    }
  }

  // ─── Core Scan Logic ──────────────────────────────────────────────────────
  async function scan() {
    // Check if monitoring is enabled.
    const { jacobi_settings } = await chrome.storage.local.get("jacobi_settings");
    if (jacobi_settings && !jacobi_settings.enabled) return;

    const prices = extractPrices();
    if (prices.length === 0) return;

    updateWidget("SCANNING");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_PRICE",
        payload: { prices, url: location.href, ts: Date.now() },
      });

      if (response?.ok) {
        updateWidget(response.verdict);
      } else if (response?.error === "RATE_LIMITED") {
        // Silently back off — widget stays in current state.
      } else {
        updateWidget("ERROR");
      }
    } catch (err) {
      // Extension context invalidated (e.g., update mid-session).
      console.warn("[Jacobi] sendMessage failed:", err.message);
    }
  }

  // ─── MutationObserver (throttled) ─────────────────────────────────────────
  const throttledScan = throttle(scan, THROTTLE_MS);

  const observer = new MutationObserver(() => {
    throttledScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial scan once the page has settled.
  setTimeout(scan, 800);
})();
