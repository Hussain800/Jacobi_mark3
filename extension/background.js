"use strict";

// Web app (legacy Deep Audit chat flow). The comparison API URL lives in
// sidepanel/app.js (default http://localhost:8000).
var JACOBI_BACKEND = "http://localhost:3000";

chrome.storage.sync.get("jacobi_settings", function (result) {
  if (result.jacobi_settings && result.jacobi_settings.backendUrl) {
    JACOBI_BACKEND = result.jacobi_settings.backendUrl;
  }
});

// Legacy probe path — now the optional Deep Audit entry, via context menu only.
function openProbe(url) {
  if (!url || !/^https?:\/\//i.test(url)) return;

  var encoded = encodeURIComponent(url);
  chrome.tabs.create({ url: JACOBI_BACKEND + "/chat?url=" + encoded });

  chrome.storage.local.get("jacobi_recent", function (result) {
    var recent = result.jacobi_recent || [];
    var domain = url;
    try {
      domain = new URL(url).hostname;
    } catch (e) { /* ignore */ }

    recent.unshift({ url: url, domain: domain, timestamp: Date.now() });
    if (recent.length > 50) recent.length = 50;
    chrome.storage.local.set({ jacobi_recent: recent });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: "deep-audit",
    title: "Deep-audit this price with Jacobi",
    contexts: ["page", "link"],
  });
  // Toolbar click opens the comparison side panel.
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  var url = info.linkUrl || info.pageUrl || (tab && tab.url) || "";
  openProbe(url);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === "PRODUCT_PAGE_DETECTED") {
    if (sender.tab && sender.tab.id != null) {
      chrome.action.setBadgeText({ text: "✓", tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: "#00b33c", tabId: sender.tab.id });
    }
    sendResponse({});
    return true;
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    if (sender.tab && sender.tab.id != null && chrome.sidePanel) {
      // Called from a user click in the content script — gesture propagates.
      chrome.sidePanel.open({ tabId: sender.tab.id });
    }
    sendResponse({});
    return true;
  }

  if (message.type === "GET_TAB_URL") {
    sendResponse({ url: (sender.tab && sender.tab.url) || "" });
    return true;
  }

  if (message.type === "OPEN_PROBE") {
    openProbe(message.url || (sender.tab && sender.tab.url) || "");
    sendResponse({});
    return true;
  }

  if (message.type === "GET_RECENT") {
    chrome.storage.local.get("jacobi_recent", function (result) {
      sendResponse({ recent: result.jacobi_recent || [] });
    });
    return true;
  }

  if (message.type === "CLEAR_RECENT") {
    chrome.storage.local.set({ jacobi_recent: [] }, function () {
      sendResponse({});
    });
    return true;
  }

  if (message.type === "GET_DISMISSED") {
    chrome.storage.local.get("jacobi_dismissed", function (result) {
      sendResponse({ dismissed: result.jacobi_dismissed || [] });
    });
    return true;
  }

  if (message.type === "DISMISS_DOMAIN") {
    var domain = (message.domain || "").trim();
    if (!domain) {
      sendResponse({});
      return true;
    }
    chrome.storage.local.get("jacobi_dismissed", function (result) {
      var dismissed = result.jacobi_dismissed || [];
      if (dismissed.indexOf(domain) === -1) {
        dismissed.push(domain);
        if (dismissed.length > 200) dismissed.splice(0, dismissed.length - 200);
        chrome.storage.local.set({ jacobi_dismissed: dismissed }, function () {
          sendResponse({});
        });
      } else {
        sendResponse({});
      }
    });
    return true;
  }

  sendResponse({});
  return true;
});
