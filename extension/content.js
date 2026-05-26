/**
 * JACOBI — Content Script (optional)
 *
 * Injects a small floating badge in the bottom-right corner of pages that
 * appear to be product, booking, or pricing pages. Clicking it opens the
 * JACOBI chat with the current page URL pre-filled.
 *
 * This script is self-contained and uses a closed Shadow DOM to avoid
 * style conflicts with the host page.
 *
 * To activate, either:
 *   a) Add to manifest.json → content_scripts with your target URL patterns
 *   b) Use chrome.scripting.executeScript via the activeTab permission
 */

"use strict";

(() => {
  // Guard against double-injection
  if (window.__jacobi_badge_injected) return;
  window.__jacobi_badge_injected = true;

  // ─── Heuristic: only show on product / booking / pricing pages ────────────
  const PRICE_KEYWORDS = [
    "price", "buy", "book", "reservation", "checkout", "cart", "shop",
    "product", "flight", "hotel", "rental", "subscription", "plan",
  ];

  const pageText = (document.body?.innerText || "").toLowerCase();
  const hasPriceSignal = PRICE_KEYWORDS.some((kw) => pageText.includes(kw));
  if (!hasPriceSignal) return;

  // ─── Wait for body ───────────────────────────────────────────────────────
  function inject() {
    if (!document.body) {
      requestAnimationFrame(inject);
      return;
    }

    // Random tag name to reduce fingerprinting surface.
    const tag = "jcb-" + Math.random().toString(36).slice(2, 8);

    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }

    const host = document.createElement(tag);
    host.style.cssText =
      "all: initial; position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #050505;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 8px 14px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
          cursor: pointer;
          user-select: none;
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .badge:hover {
          border-color: rgba(0, 217, 146, 0.4);
          box-shadow: 0 4px 24px rgba(0, 217, 146, 0.06);
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #00d992;
          flex-shrink: 0;
        }
        .label {
          font-weight: 500;
          color: rgba(0, 217, 146, 0.8);
          font-size: 12px;
        }
        .suffix {
          font-size: 10px;
          opacity: 0.6;
        }
      </style>
      <div class="badge" id="jacobi-badge">
        <span class="dot"></span>
        <span class="label">Probe price</span>
        <span class="suffix">JACOBI</span>
      </div>
    `;

    shadow.getElementById("jacobi-badge").addEventListener("click", () => {
      const chatUrl = `http://localhost:3000/chat?url=${encodeURIComponent(location.href)}`;
      // Try to message the extension background first (if the content script
      // was injected by the extension); fall back to direct navigation.
      try {
        chrome.runtime.sendMessage(
          {
            type: "PROBE_CURRENT_TAB",
            url: location.href,
            title: document.title,
          },
          () => {
            // If sendMessage succeeded, the background handles it.
            // If it failed (e.g., no extension context), open directly.
            if (chrome.runtime.lastError) {
              window.open(chatUrl, "_blank");
            }
          }
        );
      } catch {
        window.open(chatUrl, "_blank");
      }
    });
  }

  // Start after a short delay so the page has settled.
  setTimeout(inject, 1200);
})();
