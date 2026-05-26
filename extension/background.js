"use strict";

// ─── Context Menu ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "probe-price",
    title: "Probe this price with JACOBI",
    contexts: ["page", "link"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url || "";
  const encoded = encodeURIComponent(url);
  const chatUrl = `http://localhost:3000/chat?url=${encoded}`;
  chrome.tabs.create({ url: chatUrl });
});

// ─── Message Handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TAB_URL") {
    sendResponse({ url: sender.tab?.url || "" });
  }
  if (message.type === "OPEN_PROBE") {
    const encoded = encodeURIComponent(message.url || "");
    chrome.tabs.create({ url: `http://localhost:3000/chat?url=${encoded}` });
  }
  return true;
});
