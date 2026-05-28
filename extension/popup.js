/**
 * JACOBI — Popup Script
 *
 * Features:
 *  - Current tab URL display with probeability detection
 *  - "Probe this page" button
 *  - Quick actions: probe link, copy URL
 *  - Recent probes list with favicons and timestamps
 *  - Clear recent probes
 *  - Settings integration (chrome.storage.sync)
 *  - Toast notifications
 */

"use strict";

(async () => {
  // ─── DOM refs ────────────────────────────────────────────────────────────
  const statusDot   = document.getElementById("status-dot");
  const statusDomain = document.getElementById("status-domain");
  const statusHint   = document.getElementById("status-hint");
  const btnProbe     = document.getElementById("btn-probe");
  const btnProbeLink = document.getElementById("btn-probe-link");
  const btnCopyUrl   = document.getElementById("btn-copy-url");
  const btnClear     = document.getElementById("btn-clear");
  const btnSettings  = document.getElementById("btn-settings");
  const listEl       = document.getElementById("recent-list");
  const toastEl      = document.getElementById("toast");
  const versionText  = document.getElementById("version-text");

  // ─── State ───────────────────────────────────────────────────────────────
  let currentTabUrl   = null;
  let currentTabTitle = null;
  let toastTimer      = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return url; }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatTime(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60000) return "now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  // ─── Load current tab ────────────────────────────────────────────────────
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) {
      currentTabUrl   = tab.url;
      currentTabTitle = tab.title || "";
      const domain = getDomain(tab.url);
      statusDomain.textContent = domain;
      statusHint.textContent   = "Ready to probe";
      statusDot.classList.add("ready");
      statusDot.classList.remove("inactive");
    } else {
      statusDomain.textContent = "No page";
      statusHint.textContent   = "Open a web page to probe";
      statusDot.classList.add("inactive");
      btnProbe.disabled = true;
      btnProbeLink.disabled = true;
      btnCopyUrl.disabled = true;
    }
  } catch {
    statusDomain.textContent = "Error";
    statusHint.textContent   = "Could not read tab";
    statusDot.classList.add("inactive");
    btnProbe.disabled = true;
    btnProbeLink.disabled = true;
    btnCopyUrl.disabled = true;
  }

  // ─── Load manifest version ───────────────────────────────────────────────
  try {
    const manifest = chrome.runtime.getManifest();
    if (manifest.version) versionText.textContent = "v" + manifest.version;
  } catch { /* ignore */ }

  // ─── Probe button ────────────────────────────────────────────────────────
  btnProbe.addEventListener("click", async () => {
    if (!currentTabUrl) return;

    btnProbe.classList.add("loading");
    btnProbe.disabled = true;

    try {
      await chrome.runtime.sendMessage({
        type: "PROBE_CURRENT_TAB",
        url: currentTabUrl,
        title: currentTabTitle,
      });
      window.close();
    } catch (err) {
      console.error("[JACOBI] Probe failed:", err);
      btnProbe.classList.remove("loading");
      btnProbe.disabled = false;
      showToast("Probe failed — check backend");
    }
  });

  // ─── Probe link button ───────────────────────────────────────────────────
  btnProbeLink.addEventListener("click", async () => {
    if (!currentTabUrl) return;

    btnProbeLink.textContent = "Reading links...";
    btnProbeLink.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const links = [];
          document.querySelectorAll("a[href]").forEach((a) => {
            const href = a.href;
            if (/^https?:\/\//i.test(href) && links.length < 50) {
              links.push({ url: href, text: (a.textContent || href).trim().slice(0, 80) });
            }
          });
          return links;
        },
      });

      btnProbeLink.textContent = "Probe link";
      btnProbeLink.disabled = false;

      if (!results || !results[0] || !results[0].result || !results[0].result.length) {
        showToast("No links found on this page");
        return;
      }

      showLinkPicker(results[0].result);
    } catch (err) {
      console.error("[JACOBI] Link scan failed:", err);
      btnProbeLink.textContent = "Probe link";
      btnProbeLink.disabled = false;
      showToast("Could not scan page links");
    }
  });

  function showLinkPicker(links) {
    const html = links.slice(0, 8).map((l, i) => {
      const domain = getDomain(l.url);
      return `<li class="recent-item" data-url="${escapeAttr(l.url)}">
        <span style="font-size:8px;color:var(--text-faint);flex-shrink:0;">${i + 1}</span>
        <div class="recent-info">
          <div class="recent-domain">${escapeHtml(l.text)}</div>
          <div class="recent-url">${escapeHtml(domain)}</div>
        </div>
      </li>`;
    }).join("");

    listEl.innerHTML = html;

    listEl.querySelectorAll(".recent-item").forEach((item) => {
      item.addEventListener("click", async () => {
        const url = item.dataset.url;
        if (!url) return;
        try {
          await chrome.runtime.sendMessage({
            type: "OPEN_PROBE",
            url,
            title: "",
          });
          window.close();
        } catch (err) {
          console.error("[JACOBI] Link probe failed:", err);
        }
      });
    });
  }

  // ─── Copy URL button ─────────────────────────────────────────────────────
  btnCopyUrl.addEventListener("click", async () => {
    if (!currentTabUrl) return;
    try {
      await navigator.clipboard.writeText(currentTabUrl);
      showToast("URL copied to clipboard");
    } catch {
      showToast("Copy failed");
    }
  });

  // ─── Render recent probes ────────────────────────────────────────────────
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
          const time   = formatTime(entry.timestamp);
          const domain = entry.domain || getDomain(entry.url);
          const favicon = entry.favicon ||
            `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
          return `
            <li class="recent-item" data-url="${escapeAttr(entry.url)}">
              <img class="recent-favicon" src="${escapeAttr(favicon)}"
                   alt="" loading="lazy"
                   onerror="this.style.display='none'">
              <div class="recent-info">
                <div class="recent-domain">${escapeHtml(domain)}</div>
                <div class="recent-url">${escapeHtml(entry.title || entry.url)}</div>
              </div>
              <span class="recent-time">${time}</span>
            </li>`;
        })
        .join("");

      // Click handler to re-probe
      listEl.querySelectorAll(".recent-item").forEach((item) => {
        item.addEventListener("click", async () => {
          const url = item.dataset.url;
          if (!url) return;
          try {
            await chrome.runtime.sendMessage({ type: "OPEN_PROBE", url, title: "" });
            window.close();
          } catch (err) {
            console.error("[JACOBI] Re-probe failed:", err);
          }
        });
      });
    } catch (err) {
      console.error("[JACOBI] Failed to load recent:", err);
    }
  }

  // ─── Clear recent ────────────────────────────────────────────────────────
  btnClear.addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "CLEAR_RECENT" });
      await renderRecent();
      showToast("Recent probes cleared");
    } catch (err) {
      console.error("[JACOBI] Clear failed:", err);
    }
  });

  // ─── Open settings ───────────────────────────────────────────────────────
  btnSettings.addEventListener("click", () => {
    chrome.runtime.openOptionsPage
      ? chrome.runtime.openOptionsPage()
      : chrome.tabs.create({ url: "settings.html" });
  });

  // ─── Kick off ────────────────────────────────────────────────────────────
  await renderRecent();
})();
