"use strict";

(function () {
  if (window.__jacobi_context_injected) return;
  window.__jacobi_context_injected = true;

  const result = JacobiExtraction.buildContext(document, location);

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!JacobiMessages.trustedSender(sender, chrome.runtime.id, false) || !JacobiMessages.validMessage(message)) return false;
    if (message.type !== JacobiMessages.TYPES.REQUEST_PRODUCT_CONTEXT) return false;
    sendResponse(result);
    return false;
  });

  if (!result.context) return;
  chrome.runtime.sendMessage({ type: JacobiMessages.TYPES.PRODUCT_PAGE_DETECTED, url: result.context.source_url });
})();
