"use strict";

(async function () {
  const apiInput = document.getElementById("api-backend-url");
  const webappInput = document.getElementById("webapp-url");
  const telemetryInput = document.getElementById("telemetry-enabled");
  const consentInput = document.getElementById("automatic-consent");
  const currencyInput = document.getElementById("display-currency");
  const amountInput = document.getElementById("meaningful-amount");
  const percentInput = document.getElementById("meaningful-percent");
  const modeInputs = Array.from(document.querySelectorAll('input[name="travel-mode"]'));
  const status = document.getElementById("status");

  function show(text, kind) {
    status.textContent = text;
    status.className = kind || "";
  }

  function selectedMode() {
    const selected = modeInputs.find(function (item) { return item.checked; });
    return selected ? selected.value : "privacy";
  }

  function syncConsentControl() {
    const automatic = selectedMode() === "automatic";
    consentInput.disabled = !automatic;
    if (!automatic) consentInput.checked = false;
  }

  function requestOrigins(origins) {
    return new Promise(function (resolve) {
      chrome.permissions.request({ origins }, function (granted) {
        if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
        resolve({ ok: Boolean(granted), error: null });
      });
    });
  }

  const stored = await chrome.storage.sync.get(JacobiConfig.SETTINGS_KEY);
  const settings = JacobiConfig.normalizeSettings(stored[JacobiConfig.SETTINGS_KEY]);
  apiInput.value = settings.apiBackendUrl;
  webappInput.value = settings.webappUrl;
  telemetryInput.checked = settings.privacy.telemetryEnabled;
  consentInput.checked = settings.travel.automaticSavingsConsent;
  currencyInput.value = settings.travel.displayCurrency;
  amountInput.value = settings.travel.meaningfulSavingsAmount;
  percentInput.value = String(settings.travel.meaningfulSavingsPercent);
  modeInputs.forEach(function (item) {
    item.checked = item.value === settings.travel.mode;
    item.addEventListener("change", syncConsentControl);
  });
  syncConsentControl();

  document.getElementById("save").addEventListener("click", async function () {
    const api = JacobiConfig.safeHttpUrl(apiInput.value);
    const webapp = JacobiConfig.safeHttpUrl(webappInput.value);
    if (!api || !webapp) {
      show("Enter valid http(s) URLs without credentials.", "error");
      return;
    }
    const mode = selectedMode();
    if (mode === "automatic" && !consentInput.checked) {
      show("Automatic Savings Mode requires the explicit consent checkbox.", "error");
      return;
    }
    const next = JacobiConfig.normalizeSettings({
      apiBackendUrl: api.toString(),
      webappUrl: webapp.toString(),
      privacy: { telemetryEnabled: telemetryInput.checked },
      travel: {
        mode,
        automaticSavingsConsent: consentInput.checked,
        meaningfulSavingsAmount: amountInput.value,
        meaningfulSavingsPercent: percentInput.value,
        displayCurrency: currencyInput.value,
      },
    });
    const origin = JacobiConfig.permissionOrigin(next.apiBackendUrl);
    const origins = Array.from(new Set([origin].concat(mode === "automatic" ? JacobiConfig.TRAVEL_SITE_ORIGINS : []).filter(Boolean)));
    const permission = await requestOrigins(origins);
    if (!permission.ok) {
      show(permission.error ? "Access not granted: " + permission.error : "Access was not granted.", "error");
      return;
    }
    await chrome.storage.sync.set({ [JacobiConfig.SETTINGS_KEY]: next });
    Object.assign(settings, next);
    await chrome.runtime.sendMessage({ type: JacobiMessages.TYPES.SETTINGS_UPDATED });
    show(mode === "automatic" ? "Saved. Automatic mode is limited to the two localhost demo origins." : "Saved. Privacy Mode sends only after your click.", "ok");
  });

  document.getElementById("clear").addEventListener("click", async function () {
    if (!window.confirm("Clear recent Deep Audits, travel search references, dismissed sites, and wrong-match feedback?")) return;
    const response = await chrome.runtime.sendMessage({ type: JacobiMessages.TYPES.CLEAR_LOCAL_DATA });
    show(response && response.ok ? "Local extension data cleared." : "Could not clear local data.", response && response.ok ? "ok" : "error");
  });
})();
