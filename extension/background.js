"use strict";

importScripts("shared/config.js", "shared/messages.js");

const { SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings, safeHttpUrl } = JacobiConfig;
const { TYPES, validMessage, trustedSender } = JacobiMessages;
let settings = normalizeSettings(DEFAULT_SETTINGS);

chrome.storage.sync.get(SETTINGS_KEY, function (result) {
  settings = normalizeSettings(result[SETTINGS_KEY]);
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === "sync" && changes[SETTINGS_KEY]) settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
});

function openHttpUrl(value) {
  const url = safeHttpUrl(value);
  if (!url) return false;
  chrome.tabs.create({ url: url.toString() });
  return true;
}

function deepAuditUrl(sourceUrl) {
  const source = safeHttpUrl(sourceUrl);
  const app = safeHttpUrl(settings.webappUrl);
  if (!source || !app) return null;
  return app.toString().replace(/\/$/, "") + "/chat?url=" + encodeURIComponent(source.toString());
}

function tabHostname(tab) {
  try { return tab && tab.url ? new URL(tab.url).hostname : null; } catch (_) { return null; }
}

function recordRecent(sourceUrl) {
  const source = safeHttpUrl(sourceUrl);
  if (!source) return;
  chrome.storage.local.get("jacobi_recent", function (result) {
    const recent = Array.isArray(result.jacobi_recent) ? result.jacobi_recent : [];
    const next = recent.filter(function (item) { return item && item.url !== source.toString(); });
    next.unshift({ url: source.toString(), domain: source.hostname, timestamp: Date.now() });
    chrome.storage.local.set({ jacobi_recent: next.slice(0, 50) });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({ id: "deep-audit", title: "Deep Audit this price with Jacobi (60–100 seconds)", contexts: ["page", "link"] });
  });
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId !== "deep-audit") return;
  const source = info.linkUrl || info.pageUrl || (tab && tab.url);
  const target = deepAuditUrl(source);
  if (target && openHttpUrl(target)) recordRecent(source);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!trustedSender(sender, chrome.runtime.id, false) || !validMessage(message)) {
    sendResponse({ ok: false, error: "invalid_message_or_sender" });
    return false;
  }

  if (message.type === TYPES.PRODUCT_PAGE_DETECTED) {
    if (!trustedSender(sender, chrome.runtime.id, true)) {
      sendResponse({ ok: false, error: "tab_sender_required" });
      return false;
    }
    chrome.action.setBadgeText({ text: "✓", tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#00b33c", tabId: sender.tab.id });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === TYPES.OPEN_SIDE_PANEL) {
    if (!trustedSender(sender, chrome.runtime.id, true)) {
      sendResponse({ ok: false, error: "tab_sender_required" });
      return false;
    }
    chrome.sidePanel.open({ tabId: sender.tab.id });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === TYPES.OPEN_SAFE_URL) {
    sendResponse({ ok: openHttpUrl(message.url) });
    return false;
  }

  if (message.type === TYPES.OPEN_DEEP_AUDIT) {
    const target = deepAuditUrl(message.url);
    const ok = !!target && openHttpUrl(target);
    if (ok) recordRecent(message.url);
    sendResponse({ ok });
    return false;
  }

  if (message.type === TYPES.GET_RECENT) {
    chrome.storage.local.get("jacobi_recent", function (result) {
      sendResponse({ ok: true, recent: Array.isArray(result.jacobi_recent) ? result.jacobi_recent : [] });
    });
    return true;
  }

  if (message.type === TYPES.CLEAR_LOCAL_DATA) {
    chrome.storage.local.remove(["jacobi_recent", "jacobi_dismissed", "jacobi_wrong_match_feedback"], function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === TYPES.DISMISS_DOMAIN) {
    if (!trustedSender(sender, chrome.runtime.id, true) || tabHostname(sender.tab) !== message.domain) {
      sendResponse({ ok: false, error: "domain_sender_mismatch" });
      return false;
    }
    chrome.storage.local.get("jacobi_dismissed", function (result) {
      const values = Array.isArray(result.jacobi_dismissed) ? result.jacobi_dismissed : [];
      if (!values.includes(message.domain)) values.push(message.domain);
      chrome.storage.local.set({ jacobi_dismissed: values.slice(-200) }, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  sendResponse({ ok: false, error: "unsupported_message" });
  return false;
});
