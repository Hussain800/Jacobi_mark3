/**
 * Jacobi Price Shield — Background Service Worker (MV3)
 *
 * Implements a DurableTokenBucket that persists state to chrome.storage.local
 * so rate-limiting survives the MV3 service-worker termination cycle.
 *
 * Capacity : 10 tokens
 * Refill   : 2 tokens / second
 */

"use strict";

// ─── Durable Token Bucket ──────────────────────────────────────────────────────
class DurableTokenBucket {
  /** @param {{ capacity: number, refillRate: number, storageKey?: string }} opts */
  constructor({ capacity, refillRate, storageKey = "jacobi_bucket" }) {
    this.capacity = capacity;
    this.refillRate = refillRate; // tokens per second
    this.storageKey = storageKey;
  }

  /**
   * Load persisted bucket state from chrome.storage.local.
   * Returns { tokens: number, lastRefill: number }.
   */
  async _load() {
    const result = await chrome.storage.local.get(this.storageKey);
    if (result[this.storageKey]) {
      return result[this.storageKey];
    }
    // First run — initialise with full capacity.
    const initial = { tokens: this.capacity, lastRefill: Date.now() };
    await chrome.storage.local.set({ [this.storageKey]: initial });
    return initial;
  }

  /** Persist bucket state back to storage. */
  async _save(state) {
    await chrome.storage.local.set({ [this.storageKey]: state });
  }

  /**
   * Attempt to consume one token.
   * @returns {Promise<boolean>} true if the request is permitted.
   */
  async consume() {
    const state = await this._load();
    const now = Date.now();
    const elapsed = (now - state.lastRefill) / 1000; // seconds

    // Refill tokens based on elapsed time, capped at capacity.
    state.tokens = Math.min(this.capacity, state.tokens + elapsed * this.refillRate);
    state.lastRefill = now;

    if (state.tokens < 1) {
      await this._save(state);
      return false;
    }

    state.tokens -= 1;
    await this._save(state);
    return true;
  }

  /** Return the current token count (after refill) without consuming. */
  async peek() {
    const state = await this._load();
    const now = Date.now();
    const elapsed = (now - state.lastRefill) / 1000;
    return Math.min(this.capacity, state.tokens + elapsed * this.refillRate);
  }
}

// Singleton bucket — 10 tokens, refills at 2/s.
const bucket = new DurableTokenBucket({ capacity: 10, refillRate: 2 });

// ─── Message Listener ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "ANALYZE_PRICE") return false;

  (async () => {
    const allowed = await bucket.consume();
    if (!allowed) {
      sendResponse({ ok: false, error: "RATE_LIMITED" });
      return;
    }

    try {
      // --- Placeholder: forward to Jacobi backend or run local heuristic ---
      // For the skeleton we echo back a stub verdict.
      const verdict = {
        ok: true,
        verdict: "UNKNOWN",          // FAIR | INFLATED | UNKNOWN
        confidence: 0,
        prices: message.payload?.prices ?? [],
        ts: Date.now(),
      };

      // Persist latest verdict so popup can read it.
      await chrome.storage.local.set({
        jacobi_last_verdict: {
          tabId: sender.tab?.id,
          url: sender.tab?.url,
          ...verdict,
        },
      });

      sendResponse(verdict);
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();

  // Return true to indicate we will call sendResponse asynchronously.
  return true;
});

// ─── Install / Update Hook ──────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Jacobi] Installed (${details.reason})`);
  // Seed default settings.
  chrome.storage.local.get("jacobi_settings", (res) => {
    if (!res.jacobi_settings) {
      chrome.storage.local.set({
        jacobi_settings: { enabled: true },
      });
    }
  });
});
