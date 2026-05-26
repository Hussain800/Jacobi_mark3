/**
 * Jacobi Price Shield — Popup Script
 *
 * Reads the latest verdict from chrome.storage.local and renders it.
 * Manages the enable/disable toggle for price monitoring.
 */

"use strict";

(async () => {
  const dotEl   = document.getElementById("verdict-dot");
  const textEl  = document.getElementById("verdict-text");
  const metaEl  = document.getElementById("verdict-meta");
  const toggleEl = document.getElementById("toggle-enabled");

  // ─── Load current verdict ────────────────────────────────────────────────
  async function loadVerdict() {
    const { jacobi_last_verdict } = await chrome.storage.local.get("jacobi_last_verdict");

    if (!jacobi_last_verdict) {
      dotEl.className = "verdict-dot";
      textEl.textContent = "No data";
      metaEl.textContent = "Navigate to a supported booking site.";
      return;
    }

    const { verdict, confidence, url, ts } = jacobi_last_verdict;

    switch (verdict) {
      case "FAIR":
        dotEl.className = "verdict-dot fair";
        textEl.textContent = "Fair pricing detected";
        break;
      case "INFLATED":
        dotEl.className = "verdict-dot inflated";
        textEl.textContent = "Possible price inflation";
        break;
      case "UNKNOWN":
        dotEl.className = "verdict-dot";
        textEl.textContent = "Insufficient data";
        break;
      default:
        dotEl.className = "verdict-dot error";
        textEl.textContent = "Error";
    }

    const domain = url ? new URL(url).hostname : "—";
    const time = ts ? new Date(ts).toLocaleTimeString() : "—";
    metaEl.textContent = `${domain} · ${time}`;
  }

  // ─── Load toggle state ──────────────────────────────────────────────────
  async function loadToggle() {
    const { jacobi_settings } = await chrome.storage.local.get("jacobi_settings");
    const enabled = jacobi_settings?.enabled ?? true;
    toggleEl.checked = enabled;
  }

  // ─── Toggle handler ────────────────────────────────────────────────────
  toggleEl.addEventListener("change", async () => {
    const enabled = toggleEl.checked;
    await chrome.storage.local.set({ jacobi_settings: { enabled } });
  });

  // ─── Initialise ────────────────────────────────────────────────────────
  await Promise.all([loadVerdict(), loadToggle()]);
})();
