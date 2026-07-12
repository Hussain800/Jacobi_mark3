"use strict";

(async function () {
  const apiInput = document.getElementById("api-backend-url");
  const webappInput = document.getElementById("webapp-url");
  const telemetryInput = document.getElementById("telemetry-enabled");
  const status = document.getElementById("status");

  function show(text, kind) {
    status.textContent = text;
    status.className = kind || "";
  }

  const stored = await chrome.storage.sync.get(JacobiConfig.SETTINGS_KEY);
  const settings = JacobiConfig.normalizeSettings(stored[JacobiConfig.SETTINGS_KEY]);
  apiInput.value = settings.apiBackendUrl;
  webappInput.value = settings.webappUrl;
  telemetryInput.checked = settings.privacy.telemetryEnabled;

  document.getElementById("save").addEventListener("click", async function () {
    const api = JacobiConfig.safeHttpUrl(apiInput.value);
    const webapp = JacobiConfig.safeHttpUrl(webappInput.value);
    if (!api || !webapp) {
      show("Enter valid http(s) URLs without credentials.", "error");
      return;
    }
    const next = JacobiConfig.normalizeSettings({
      apiBackendUrl: api.toString(),
      webappUrl: webapp.toString(),
      privacy: { telemetryEnabled: telemetryInput.checked },
    });
    const previousOrigin = JacobiConfig.permissionOrigin(settings.apiBackendUrl);
    const origin = JacobiConfig.permissionOrigin(next.apiBackendUrl);
    const granted = origin ? await chrome.permissions.request({ origins: [origin] }) : false;
    if (granted) {
      await chrome.storage.sync.set({ [JacobiConfig.SETTINGS_KEY]: next });
      if (previousOrigin && previousOrigin !== origin) await chrome.permissions.remove({ origins: [previousOrigin] });
      Object.assign(settings, next);
    }
    show(granted ? "Saved. API-origin access granted." : "Not saved because API-origin access was not granted.", granted ? "ok" : "error");
  });

  document.getElementById("clear").addEventListener("click", async function () {
    if (!window.confirm("Clear recent Deep Audits, dismissed sites, and wrong-match feedback?")) return;
    const response = await chrome.runtime.sendMessage({ type: JacobiMessages.TYPES.CLEAR_LOCAL_DATA });
    show(response && response.ok ? "Local extension data cleared." : "Could not clear local data.", response && response.ok ? "ok" : "error");
  });
})();
