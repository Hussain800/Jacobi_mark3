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
    return true;
  }

  function trustedSender(sender, runtimeId, requireTab) {
    if (!sender || sender.id !== runtimeId) return false;
    return !requireTab || !!(sender.tab && Number.isInteger(sender.tab.id));
  }

  return { TYPES, validMessage, trustedSender };
});
