"use strict";

var JACOBI_BACKEND = "http://localhost:3000";

chrome.storage.sync.get("jacobi_settings", function (result) {
  if (result.jacobi_settings && result.jacobi_settings.backendUrl) {
    JACOBI_BACKEND = result.jacobi_settings.backendUrl;
  }
});

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

    recent.unshift({
      url: url,
      domain: domain,
      timestamp: Date.now(),
    });

    if (recent.length > 50) recent.length = 50;

    chrome.storage.local.set({ jacobi_recent: recent });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: "probe-price",
    title: "Probe this price with JACOBI",
    contexts: ["page", "link"],
  });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  var url = info.linkUrl || info.pageUrl || (tab && tab.url) || "";
  openProbe(url);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === "GET_TAB_URL") {
    sendResponse({ url: (sender.tab && sender.tab.url) || "" });
    return true;
  }

  if (message.type === "OPEN_PROBE") {
    openProbe(message.url || (sender.tab && sender.tab.url) || "");
    sendResponse({});
    return true;
  }

  if (message.type === "PROBE_CURRENT_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var url = (tabs && tabs[0] && tabs[0].url) || "";
      if (url) openProbe(url);
      sendResponse({});
    });
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
