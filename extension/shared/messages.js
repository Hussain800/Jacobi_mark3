(function (root, factory) {
  const value = factory(root.JacobiConfig);
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiMessages = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  "use strict";

  const TYPES = Object.freeze({
    REQUEST_PRODUCT_CONTEXT: "REQUEST_PRODUCT_CONTEXT",
    PRODUCT_PAGE_DETECTED: "PRODUCT_PAGE_DETECTED",
    OPEN_SIDE_PANEL: "OPEN_SIDE_PANEL",
    OPEN_DEEP_AUDIT: "OPEN_DEEP_AUDIT",
    OPEN_SAFE_URL: "OPEN_SAFE_URL",
    GET_RECENT: "GET_RECENT",
    CLEAR_LOCAL_DATA: "CLEAR_LOCAL_DATA",
    DISMISS_DOMAIN: "DISMISS_DOMAIN",
    REQUEST_TRAVEL_CONTEXT: "REQUEST_TRAVEL_CONTEXT",
    TRAVEL_PAGE_DETECTED: "TRAVEL_PAGE_DETECTED",
    START_TRAVEL_SEARCH: "START_TRAVEL_SEARCH",
    GET_TRAVEL_STATE: "GET_TRAVEL_STATE",
    TRAVEL_STATE_UPDATED: "TRAVEL_STATE_UPDATED",
    REVALIDATE_TRAVEL_OFFER: "REVALIDATE_TRAVEL_OFFER",
    OPEN_TRAVEL_ROUTE: "OPEN_TRAVEL_ROUTE",
    SETTINGS_UPDATED: "SETTINGS_UPDATED",
  });
  const ALLOWED = new Set(Object.values(TYPES));
  const FIELDS = Object.freeze({
    REQUEST_PRODUCT_CONTEXT: [],
    PRODUCT_PAGE_DETECTED: ["url"],
    OPEN_SIDE_PANEL: [],
    OPEN_DEEP_AUDIT: ["url"],
    OPEN_SAFE_URL: ["url"],
    GET_RECENT: [],
    CLEAR_LOCAL_DATA: [],
    DISMISS_DOMAIN: ["domain"],
    REQUEST_TRAVEL_CONTEXT: ["fingerprint"],
    TRAVEL_PAGE_DETECTED: ["vertical", "adapterId", "adapterVersion", "fingerprint", "confidence", "missingFields"],
    START_TRAVEL_SEARCH: ["tabId", "fingerprint"],
    GET_TRAVEL_STATE: ["tabId", "fingerprint"],
    TRAVEL_STATE_UPDATED: ["tabId", "state"],
    REVALIDATE_TRAVEL_OFFER: ["tabId", "searchId", "offerId"],
    OPEN_TRAVEL_ROUTE: ["tabId", "searchId", "offerId", "revalidationId", "confirmPriceChange"],
    SETTINGS_UPDATED: [],
  });

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function validMessage(message) {
    if (!isPlainObject(message) || !ALLOWED.has(message.type)) return false;
    const allowedFields = FIELDS[message.type];
    if (Object.keys(message).some(function (key) { return key !== "type" && !allowedFields.includes(key); })) return false;
    if ((message.type === TYPES.OPEN_DEEP_AUDIT || message.type === TYPES.OPEN_SAFE_URL || message.type === TYPES.PRODUCT_PAGE_DETECTED) && message.url === undefined) return false;
    if (message.type === TYPES.DISMISS_DOMAIN && message.domain === undefined) return false;
    if (message.url !== undefined) {
      if (typeof message.url !== "string" || message.url.length > 4096) return false;
      if (!config.safeHttpUrl(message.url)) return false;
    }
    if (message.domain !== undefined) {
      if (typeof message.domain !== "string" || message.domain.length > 253) return false;
      if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(message.domain)) return false;
    }
    if (message.tabId !== undefined && (!Number.isInteger(message.tabId) || message.tabId < 0)) return false;
    if (message.vertical !== undefined && message.vertical !== "flight" && message.vertical !== "hotel") return false;
    if (message.fingerprint !== undefined && message.fingerprint !== null && !/^[a-f0-9]{64}$/.test(message.fingerprint)) return false;
    if (message.adapterId !== undefined && !/^(?:flight|hotel)-demo-v1$/.test(message.adapterId)) return false;
    if (message.adapterVersion !== undefined && !/^\d+\.\d+\.\d+$/.test(message.adapterVersion)) return false;
    if (message.confidence !== undefined && (typeof message.confidence !== "number" || message.confidence < 0 || message.confidence > 1)) return false;
    if (message.missingFields !== undefined && (!Array.isArray(message.missingFields) || message.missingFields.length > 16 || message.missingFields.some(function (item) { return typeof item !== "string" || item.length > 64; }))) return false;
    for (const field of ["searchId", "offerId", "revalidationId"]) {
      if (message[field] !== undefined && (typeof message[field] !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(message[field]))) return false;
    }
    if (message.confirmPriceChange !== undefined && typeof message.confirmPriceChange !== "boolean") return false;
    if (message.state !== undefined && !isPlainObject(message.state)) return false;
    if (message.type === TYPES.TRAVEL_PAGE_DETECTED && (!message.adapterId || !message.adapterVersion || !message.vertical)) return false;
    if (message.type === TYPES.START_TRAVEL_SEARCH && (!Number.isInteger(message.tabId) || !message.fingerprint)) return false;
    if (message.type === TYPES.GET_TRAVEL_STATE && !Number.isInteger(message.tabId)) return false;
    if ((message.type === TYPES.REVALIDATE_TRAVEL_OFFER || message.type === TYPES.OPEN_TRAVEL_ROUTE) && (!Number.isInteger(message.tabId) || !message.searchId || !message.offerId)) return false;
    return true;
  }

  function trustedSender(sender, runtimeId, requireTab) {
    if (!sender || sender.id !== runtimeId) return false;
    return !requireTab || !!(sender.tab && Number.isInteger(sender.tab.id));
  }

  return { TYPES, validMessage, trustedSender };
});
