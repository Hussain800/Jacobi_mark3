(function () {
  "use strict";

  if (globalThis.__jacobiTravelContextInstalled || !globalThis.JacobiTravel) return;
  globalThis.__jacobiTravelContextInstalled = true;

  const REQUEST = "REQUEST_TRAVEL_CONTEXT";
  const DETECTED = "TRAVEL_PAGE_DETECTED";
  let current = null;
  let lastDetection = "";
  let timer = null;

  async function inspect() {
    try {
      const result = await JacobiTravel.extract(document, location, new Date());
      current = result.supported ? result : null;
      if (!current) return;
      const signature = [current.adapter_id, current.fingerprint || "missing", current.missing_fields.join(",")].join(":");
      if (signature === lastDetection) return;
      lastDetection = signature;
      await chrome.runtime.sendMessage({
        type: DETECTED,
        vertical: current.vertical,
        adapterId: current.adapter_id,
        adapterVersion: current.adapter_version,
        fingerprint: current.fingerprint,
        confidence: current.confidence,
        missingFields: current.missing_fields.slice(0, 16),
      });
    } catch (_) {
      current = null;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(inspect, 450);
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || message.type !== REQUEST || Object.keys(message).some(function (key) { return key !== "type" && key !== "fingerprint"; })) return false;
    Promise.resolve(inspect()).then(function () {
      if (!current || (message.fingerprint && message.fingerprint !== current.fingerprint)) {
        sendResponse({ ok: false, error: "travel_context_changed" });
        return;
      }
      sendResponse({
        ok: true,
        adapterId: current.adapter_id,
        adapterVersion: current.adapter_version,
        vertical: current.vertical,
        fingerprint: current.fingerprint,
        confidence: current.confidence,
        missingFields: current.missing_fields,
        context: current.context,
      });
    }).catch(function () { sendResponse({ ok: false, error: "travel_context_unavailable" }); });
    return true;
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  ["pushState", "replaceState"].forEach(function (method) {
    const original = history[method];
    if (typeof original !== "function") return;
    history[method] = function () {
      const value = original.apply(this, arguments);
      schedule();
      return value;
    };
  });
  addEventListener("popstate", schedule);
  inspect();
})();
