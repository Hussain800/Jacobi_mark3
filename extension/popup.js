/**
 * JACOBI — Popup Script
 *
 * Displays:
 *  - The current tab URL.
 *  - A "Probe this price" button that sends the page to JACOBI chat.
 *  - A scrolling list of recent probes from chrome.storage.local.
 */

"use strict";

(async () => {
  // ─── DOM refs ────────────────────────────────────────────────────────────
  const urlEl = document.getElementById("current-url");
  const btnProbe = document.getElementById("btn-probe");
  const btnClear = document.getElementById("btn-clear");
  const listEl = document.getElementById("recent-list");

  // ─── Load current tab URL ────────────────────────────────────────────────
  let currentTabUrl = null;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) {
      currentTabUrl = tab.url;
      urlEl.textContent = tab.url;
      urlEl.classList.remove("empty");
    } else {
      urlEl.textContent = "No probeable page in this tab";
      urlEl.classList.add("empty");
      btnProbe.disabled = true;
    }
  } catch {
    urlEl.textContent = "Could not read tab";
    urlEl.classList.add("empty");
    btnProbe.disabled = true;
  }

  // ─── Probe button handler ────────────────────────────────────────────────
  btnProbe.addEventListener("click", async () => {
    if (!currentTabUrl) return;

    btnProbe.classList.add("loading");
    btnProbe.disabled = true;

    try {
      await chrome.runtime.sendMessage({ type: "PROBE_CURRENT_TAB" });
      // The background will open the chat tab — close the popup.
      window.close();
    } catch (err) {
      console.error("[JACOBI] Probe failed:", err);
      btnProbe.classList.remove("loading");
      btnProbe.disabled = false;
    }
  });

  // ─── Load & render recent probes ─────────────────────────────────────────
  async function renderRecent() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_RECENT" });
      const recent = response?.recent || [];

      if (!recent.length) {
        listEl.innerHTML = '<li class="recent-none">No probes yet</li>';
        return;
      }

      listEl.innerHTML = recent
        .map((entry) => {
          const time = formatTime(entry.timestamp);
          const domain = entry.domain || entry.url;
          return `
            <li class="recent-item" data-url="${escapeAttr(entry.url)}">
              <span class="recent-dot"></span>
              <div class="recent-info">
                <div class="recent-domain">${escapeHtml(domain)}</div>
                <div class="recent-time">${time}</div>
              </div>
            </li>`;
        })
        .join("");

      // Clicking a recent item re-probes that URL.
      listEl.querySelectorAll(".recent-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const url = item.dataset.url;
          if (!url) return;

          const chatUrl = `http://localhost:3000/chat?url=${encodeURIComponent(url)}`;
          try {
            await chrome.tabs.create({ url: chatUrl });
            window.close();
          } catch (err) {
            console.error("[JACOBI] Failed to open chat:", err);
          }
        });
      });
    } catch (err) {
      console.error("[JACOBI] Failed to load recent probes:", err);
    }
  }

  // ─── Clear recent probes ─────────────────────────────────────────────────
  btnClear.addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "CLEAR_RECENT" });
      await renderRecent();
    } catch (err) {
      console.error("[JACOBI] Clear failed:", err);
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatTime(ts) {
    if (!ts) return "—";
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ─── Kick off ────────────────────────────────────────────────────────────
  await renderRecent();
})();
