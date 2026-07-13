(function (root, factory) {
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiConfig = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SETTINGS_KEY = "jacobi_settings";
  const SETTINGS_VERSION = 2;
  const TRAVEL_SITE_ORIGINS = Object.freeze([
    "http://127.0.0.1/*",
    "http://localhost/*",
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_VERSION,
    apiBackendUrl: "http://localhost:8000",
    webappUrl: "http://localhost:3000",
    privacy: Object.freeze({ telemetryEnabled: false }),
    travel: Object.freeze({
      mode: "privacy",
      automaticSavingsConsent: false,
      meaningfulSavingsAmount: "20.00",
      meaningfulSavingsPercent: 3,
      displayCurrency: "USD",
    }),
  });

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (url.username || url.password) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function normalizeBaseUrl(value, fallback) {
    const parsed = safeHttpUrl(value) || safeHttpUrl(fallback);
    if (!parsed) return "";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  }

  function normalizeSettings(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const privacy = input.privacy && typeof input.privacy === "object" ? input.privacy : {};
    const travel = input.travel && typeof input.travel === "object" ? input.travel : {};
    const automaticSavingsConsent = travel.mode === "automatic" && travel.automaticSavingsConsent === true;
    const amount = /^\d{1,6}(?:\.\d{1,2})?$/.test(String(travel.meaningfulSavingsAmount || ""))
      ? Number(travel.meaningfulSavingsAmount).toFixed(2)
      : DEFAULT_SETTINGS.travel.meaningfulSavingsAmount;
    const percent = Number.isFinite(Number(travel.meaningfulSavingsPercent))
      ? Math.min(100, Math.max(0, Number(travel.meaningfulSavingsPercent)))
      : DEFAULT_SETTINGS.travel.meaningfulSavingsPercent;
    const displayCurrency = /^[A-Za-z]{3}$/.test(String(travel.displayCurrency || ""))
      ? String(travel.displayCurrency).toUpperCase()
      : DEFAULT_SETTINGS.travel.displayCurrency;
    return {
      schemaVersion: SETTINGS_VERSION,
      apiBackendUrl: normalizeBaseUrl(input.apiBackendUrl, DEFAULT_SETTINGS.apiBackendUrl),
      webappUrl: normalizeBaseUrl(input.webappUrl, DEFAULT_SETTINGS.webappUrl),
      privacy: { telemetryEnabled: privacy.telemetryEnabled === true },
      travel: {
        mode: automaticSavingsConsent ? "automatic" : "privacy",
        automaticSavingsConsent,
        meaningfulSavingsAmount: amount,
        meaningfulSavingsPercent: percent,
        displayCurrency,
      },
    };
  }

  function permissionOrigin(value) {
    const parsed = safeHttpUrl(value);
    return parsed ? parsed.protocol + "//" + parsed.hostname + "/*" : null;
  }

  return {
    SETTINGS_KEY,
    SETTINGS_VERSION,
    DEFAULT_SETTINGS,
    TRAVEL_SITE_ORIGINS,
    safeHttpUrl,
    normalizeSettings,
    permissionOrigin,
  };
});
