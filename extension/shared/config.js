(function (root, factory) {
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiConfig = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SETTINGS_KEY = "jacobi_settings";
  const SETTINGS_VERSION = 1;
  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_VERSION,
    apiBackendUrl: "http://localhost:8000",
    webappUrl: "http://localhost:3000",
    privacy: Object.freeze({ telemetryEnabled: false }),
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
    return {
      schemaVersion: SETTINGS_VERSION,
      apiBackendUrl: normalizeBaseUrl(input.apiBackendUrl, DEFAULT_SETTINGS.apiBackendUrl),
      webappUrl: normalizeBaseUrl(input.webappUrl, DEFAULT_SETTINGS.webappUrl),
      privacy: { telemetryEnabled: privacy.telemetryEnabled === true },
    };
  }

  function permissionOrigin(value) {
    const parsed = safeHttpUrl(value);
    return parsed ? parsed.origin + "/*" : null;
  }

  return {
    SETTINGS_KEY,
    SETTINGS_VERSION,
    DEFAULT_SETTINGS,
    safeHttpUrl,
    normalizeSettings,
    permissionOrigin,
  };
});
