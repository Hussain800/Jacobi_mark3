/**
 * JACOBI — Content Script
 *
 * Detects pricing content on the page and injects a small floating
 * badge in the bottom-right corner. Clicking the badge highlights
 * detected prices briefly, then opens the JACOBI probe.
 *
 * Uses a closed Shadow DOM to avoid CSS conflicts with the host page.
 * Dismissed domains are persisted in chrome.storage.local.
 *
 * To activate, add to manifest.json → content_scripts matching desired URLs.
 */

"use strict";

(() => {
  // ─── Guard against double-injection ─────────────────────────────────────
  if (window.__jacobi_badge_injected) return;
  window.__jacobi_badge_injected = true;

  // ─── Price Detection ────────────────────────────────────────────────────
  const PRICE_CURRENCY_RE = /\$\s*\d[\d,]*\b|€\s*\d[\d,]*\b|£\s*\d[\d,]*\b|₹\s*\d[\d,]*\b/gi;

  const ECOM_KEYWORDS = [
    "add to cart",  "add to bag",   "buy now",     "checkout",
    "price",        "pricing",      "subscribe",    "subscription",
    "book now",     "reserve",      "reservation",  "order now",
    "shop now",     "purchase",     "pay now",      "proceed to checkout",
  ];

  const PRICE_URL_PATTERNS = [
    /\/product\//i,    /\/item\//i,      /\/dp\//i,         /\/hotel\//i,
    /\/flight\//i,     /\/booking\//i,    /\/pricing\//i,     /\/shop\//i,
    /\/store\//i,      /\/rental\//i,     /\/checkout/i,      /\/cart/i,
    /\/buy\//i,        /\/plan\//i,
  ];

  /** Check <meta> tags for structured price data. */
  function hasPriceMeta() {
    const selectors = [
      'meta[property="og:price:amount"]',
      'meta[property="product:price:amount"]',
      'meta[name="price"]',
      'meta[itemprop="price"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.content && /\d/.test(el.content)) return true;
    }
    // Also check JSON-LD
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent);
        const str = JSON.stringify(data);
        if (/"price"\s*:\s*"?[\d.]+/.test(str)) return true;
      } catch { /* invalid JSON */ }
    }
    return false;
  }

  /** Check page text for currency amounts. */
  function hasPriceText() {
    const bodyText = document.body?.innerText || "";
    return PRICE_CURRENCY_RE.test(bodyText);
  }

  /** Check page text for e-commerce keywords. */
  function hasEcomKeywords() {
    const bodyText = (document.body?.innerText || "").toLowerCase();
    return ECOM_KEYWORDS.some((kw) => bodyText.includes(kw));
  }

  /** Check URL for product / booking / pricing patterns. */
  function hasPricingURL() {
    return PRICE_URL_PATTERNS.some((p) => p.test(location.href));
  }

  /**
   * Detection heuristic — returns true if the page likely contains
   * pricing or e-commerce content.
   */
  function detectPricing() {
    if (hasPriceMeta()) return true;
    if (hasPriceText()) return true;

    // Combination: URL pattern + ecom keywords
    if (hasPricingURL() && hasEcomKeywords()) return true;

    // Strong signal: 3+ ecom indicators on page
    const bodyText = (document.body?.innerText || "").toLowerCase();
    const matchCount = ECOM_KEYWORDS.filter((kw) => bodyText.includes(kw)).length;
    if (matchCount >= 3) return true;

    return false;
  }

  // ─── Dismissal persistence ──────────────────────────────────────────────
  async function isDomainDismissed() {
    try {
      const result = await chrome.storage.local.get("jacobi_dismissed");
      const dismissed = result.jacobi_dismissed || [];
      return dismissed.includes(location.hostname);
    } catch {
      return false;
    }
  }

  async function persistDismissal() {
    try {
      const result = await chrome.storage.local.get("jacobi_dismissed");
      const dismissed = result.jacobi_dismissed || [];
      if (!dismissed.includes(location.hostname)) {
        dismissed.push(location.hostname);
        // Prune to last 200 entries to avoid unbounded growth
        if (dismissed.length > 200) dismissed.splice(0, dismissed.length - 200);
        await chrome.storage.local.set({ jacobi_dismissed: dismissed });
      }
    } catch { /* best-effort */ }
  }

  // ─── Price Highlighting ─────────────────────────────────────────────────
  /**
   * Broader regex used when walking DOM text nodes to find price elements
   * to highlight.  Includes plain numeric patterns that look like prices.
   */
  const HIGHLIGHT_RE =
    /\$\s*\d[\d,.]*\b|€\s*\d[\d,.]*\b|£\s*\d[\d,.]*\b|₹\s*\d[\d,.]*\b|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/gi;

  const HIGHLIGHTED_ELEMENTS = [];

  function highlightPrices() {
    // Clean up any previous highlights first
    HIGHLIGHTED_ELEMENTS.forEach((el) => {
      el.style.outline = "";
      el.style.boxShadow = "";
      el.style.borderRadius = "";
      el.style.transition = "";
    });
    HIGHLIGHTED_ELEMENTS.length = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "TEXTAREA", "INPUT"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.offsetParent === null && tag !== "BODY") return NodeFilter.FILTER_REJECT;
          return HIGHLIGHT_RE.test(node.textContent)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      }
    );

    const seen = new Set();
    let node;
    while ((node = walker.nextNode())) {
      let el = node.parentElement;
      // Walk up to a reasonable container for a visible highlight outline
      let target = el;
      while (
        target &&
        target !== document.body &&
        target.textContent.length < 120 &&
        target.parentElement &&
        target.parentElement.textContent.length <= target.textContent.length * 4
      ) {
        target = target.parentElement;
      }
      // Avoid body-level highlights
      if (target === document.body) target = el;
      if (!target || seen.has(target)) continue;
      seen.add(target);

      target.style.transition = "box-shadow 0.3s ease, outline 0.3s ease";
      target.style.outline = "2px solid rgba(0, 255, 65, 0.7)";
      target.style.outlineOffset = "2px";
      target.style.boxShadow = "0 0 20px rgba(0, 255, 65, 0.3), 0 0 6px rgba(0, 255, 65, 0.4)";
      target.style.borderRadius = "3px";
      HIGHLIGHTED_ELEMENTS.push(target);
    }

    // Auto-remove highlights after 2 seconds
    setTimeout(() => {
      HIGHLIGHTED_ELEMENTS.forEach((el) => {
        el.style.transition = "box-shadow 0.6s ease, outline 0.6s ease";
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.style.boxShadow = "";
        el.style.borderRadius = "";
      });
      setTimeout(() => {
        HIGHLIGHTED_ELEMENTS.forEach((el) => {
          el.style.transition = "";
        });
        HIGHLIGHTED_ELEMENTS.length = 0;
      }, 600);
    }, 2000);

    return seen.size;
  }

  // ─── Floating Badge ─────────────────────────────────────────────────────
  function injectBadge() {
    if (!document.body) {
      requestAnimationFrame(injectBadge);
      return;
    }

    // Register a unique custom element to host the shadow root
    const tag = "jcb-" + Math.random().toString(36).slice(2, 8);
    if (!customElements.get(tag)) {
      customElements.define(
        tag,
        class extends HTMLElement {
          constructor() {
            super();
          }
        }
      );
    }

    const host = document.createElement(tag);
    host.style.cssText = "all:initial; position:fixed; z-index:2147483647;";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "closed" });

    // ── Styles & markup inside shadow DOM ────────────────────────────────
    shadow.innerHTML = `
      <style>
        :host { all: initial; }

        .jcb-wrapper {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 2147483647;
          animation: jcb-slide-in 0.45s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes jcb-slide-in {
          from { transform: translateX(130%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }

        @keyframes jcb-pulse {
          0%, 100% { box-shadow: 0 2px 16px rgba(0, 255, 65, 0.08), 0 0 0 1px rgba(0, 255, 65, 0.06); }
          50%      { box-shadow: 0 2px 22px rgba(0, 255, 65, 0.16), 0 0 0 2px rgba(0, 255, 65, 0.12); }
        }

        .jcb-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          background: #08090c;
          border: 1px solid rgba(0, 255, 65, 0.45);
          border-radius: 8px;
          padding: 6px 10px;
          cursor: grab;
          user-select: none;
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
          font-size: 11px;
          color: #ffffff;
          box-shadow: 0 2px 16px rgba(0, 255, 65, 0.08), 0 0 0 1px rgba(0, 255, 65, 0.06);
          transition: box-shadow 0.2s ease, transform 0.15s ease, border-color 0.2s ease;
          position: relative;
        }

        .jcb-badge:active {
          cursor: grabbing;
        }

        .jcb-badge:hover {
          border-color: rgba(0, 255, 65, 0.7);
          box-shadow: 0 4px 28px rgba(0, 255, 65, 0.16), 0 0 0 1px rgba(0, 255, 65, 0.18);
          transform: translateY(-1px);
        }

        .jcb-bracket {
          color: #00ff41;
          font-weight: 700;
          font-size: 12px;
          line-height: 1;
        }

        .jcb-label {
          color: rgba(255, 255, 255, 0.82);
          font-size: 10.5px;
          white-space: nowrap;
          letter-spacing: 0.01em;
        }

        .jcb-dismiss {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 17px;
          height: 17px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.35);
          cursor: pointer;
          font-family: inherit;
          font-size: 10px;
          line-height: 1;
          padding: 0;
          margin-left: 3px;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }

        .jcb-dismiss:hover {
          background: rgba(239, 68, 68, 0.3);
          color: rgba(255, 255, 255, 0.9);
        }

        .jcb-tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          right: 0;
          background: #08090c;
          border: 1px solid rgba(0, 255, 65, 0.25);
          border-radius: 6px;
          padding: 5px 10px;
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.65);
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }

        .jcb-badge:hover .jcb-tooltip {
          opacity: 1;
        }
      </style>

      <div class="jcb-wrapper" id="jcb-wrapper">
        <div class="jcb-badge" id="jcb-badge">
          <span class="jcb-bracket">[</span>
          <span class="jcb-bracket">J</span>
          <span class="jcb-bracket">]</span>
          <span class="jcb-label">Probe this price</span>
          <button class="jcb-dismiss" id="jcb-dismiss" title="Dismiss for this site">&times;</button>
          <div class="jcb-tooltip">Check for pricing discrimination</div>
        </div>
      </div>
    `;

    const wrapper = shadow.getElementById("jcb-wrapper");
    const badge = shadow.getElementById("jcb-badge");
    const dismissBtn = shadow.getElementById("jcb-dismiss");

    // ── Dragging ────────────────────────────────────────────────────────
    let dragging = false;
    let dragStartX, dragStartY, startRight, startBottom;
    let moved = false;

    function clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }

    badge.addEventListener("mousedown", (e) => {
      if (e.target === dismissBtn) return;
      if (e.button !== 0) return; // left-click only
      dragging = true;
      moved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = wrapper.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      wrapper.style.animation = "none";
      wrapper.style.transition = "none";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      wrapper.style.right = clamp(startRight - dx, 0, window.innerWidth - 40) + "px";
      wrapper.style.bottom = clamp(startBottom - dy, 0, window.innerHeight - 40) + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      wrapper.style.transition = "";
    });

    // ── Click → probe ──────────────────────────────────────────────────
    badge.addEventListener("click", (e) => {
      if (moved) return;
      if (e.target === dismissBtn) return;

      highlightPrices();

      // Brief delay so user sees the highlight before navigation
      setTimeout(() => {
        const encoded = encodeURIComponent(location.href);
        const chatUrl = `http://localhost:3000/chat?url=${encoded}`;

        try {
          chrome.runtime.sendMessage(
            { type: "OPEN_PROBE", url: location.href, title: document.title },
            () => {
              if (chrome.runtime.lastError) {
                window.open(chatUrl, "_blank");
              }
            }
          );
        } catch {
          window.open(chatUrl, "_blank");
        }
      }, 400);
    });

    // ── Dismiss ────────────────────────────────────────────────────────
    dismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      persistDismissal();

      // Animate out
      wrapper.style.transition = "opacity 0.25s ease, transform 0.25s ease";
      wrapper.style.opacity = "0";
      wrapper.style.transform = "translateX(50px)";
      setTimeout(() => {
        try { host.remove(); } catch { /* already removed */ }
      }, 280);
    });
  }

  // ─── Main entry point ───────────────────────────────────────────────────
  async function init() {
    if (!detectPricing()) return;
    if (await isDomainDismissed()) return;

    // Wait for body, then inject with a short delay
    function whenBodyReady(cb) {
      if (document.body) { cb(); return; }
      requestAnimationFrame(() => whenBodyReady(cb));
    }

    whenBodyReady(() => {
      setTimeout(injectBadge, 800);
    });
  }

  init();
})();
