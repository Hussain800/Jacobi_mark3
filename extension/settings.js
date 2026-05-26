/**
 * JACOBI — Settings Page Script
 *
 * Uses the same flat key structure as background.js:
 *   chrome.storage.sync: backendUrl, autoProbe, maxRecent
 *   chrome.storage.local: recentProbes
 */

"use strict";

const DEFAULTS = {
  backendUrl: "http://localhost:3000",
  autoProbe: false,
  maxRecent: 15,
};

(async () => {
  // ─── DOM refs ──────────────────────────────────────────────────────────
  const urlInput    = document.getElementById("backend-url");
  const autoToggle  = document.getElementById("auto-probe");
  const maxSlider   = document.getElementById("max-recent");
  const sliderValue = document.getElementById("slider-value");
  const sliderLabel = document.getElementById("slider-label");
  const btnSave     = document.getElementById("btn-save");
  const btnClear    = document.getElementById("btn-clear-all");
  const banner      = document.getElementById("status-banner");

  // ─── Load settings ─────────────────────────────────────────────────────
  const data = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...data };

  urlInput.value    = settings.backendUrl;
  autoToggle.checked = settings.autoProbe;
  maxSlider.value   = settings.maxRecent;
  sliderValue.textContent = settings.maxRecent;
  sliderLabel.textContent = settings.maxRecent + " entries";

  // ─── Slider live update ────────────────────────────────────────────────
  maxSlider.addEventListener("input", () => {
    const v = maxSlider.value;
    sliderValue.textContent = v;
    sliderLabel.textContent = v + " entries";
  });

  // ─── Auto-save on change ──────────────────────────────────────────────
  async function autoSave() {
    settings.backendUrl = urlInput.value.trim();
    settings.autoProbe  = autoToggle.checked;
    settings.maxRecent  = parseInt(maxSlider.value, 10) || 15;
    await chrome.storage.sync.set(settings);
  }

  urlInput.addEventListener("change", async () => {
    settings.backendUrl = urlInput.value.trim();
    await chrome.storage.sync.set({ backendUrl: settings.backendUrl });
    showBanner("success", "Backend URL saved");
  });

  autoToggle.addEventListener("change", async () => {
    settings.autoProbe = autoToggle.checked;
    await chrome.storage.sync.set({ autoProbe: settings.autoProbe });
    showBanner("success", "Auto-probe " + (settings.autoProbe ? "enabled" : "disabled"));
  });

  maxSlider.addEventListener("change", async () => {
    settings.maxRecent = parseInt(maxSlider.value, 10) || 15;
    await chrome.storage.sync.set({ maxRecent: settings.maxRecent });
    showBanner("success", "Max probes set to " + settings.maxRecent);
  });

  // ─── Save all ──────────────────────────────────────────────────────────
  btnSave.addEventListener("click", async () => {
    try {
      await autoSave();
      showBanner("success", "All settings saved");
    } catch (err) {
      console.error("[JACOBI] Save failed:", err);
      showBanner("error", "Save failed");
    }
  });

  // ─── Clear all data ────────────────────────────────────────────────────
  btnClear.addEventListener("click", async () => {
    if (!confirm("This will clear all recent probes and local data. Continue?")) return;

    try {
      await chrome.storage.local.remove("recentProbes");
      await chrome.storage.local.remove("jacobi_daily_count");
      await chrome.storage.local.remove("jacobi_recent_probes");
      showBanner("success", "All probe data cleared");
    } catch (err) {
      console.error("[JACOBI] Clear failed:", err);
      showBanner("error", "Clear failed");
    }
  });

  // ─── Banner helper ─────────────────────────────────────────────────────
  let bannerTimer = null;

  function showBanner(type, msg) {
    if (bannerTimer) clearTimeout(bannerTimer);
    banner.className = "status-banner show " + type;
    banner.textContent = msg;
    bannerTimer = setTimeout(() => {
      banner.classList.remove("show");
    }, 2200);
  }
})();
