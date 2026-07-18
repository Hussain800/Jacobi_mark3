(function (root, factory) {
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiConfig = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SETTINGS_KEY = "jacobi_settings";
  const SETTINGS_VERSION = 2;
  const TRAVEL_SITE_ORIGINS = Object.freeze([
    "http://127.0.0.1/*",
    "http://localhost/*",
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_VERSION,
    apiBackendUrl: "http://localhost:8000",
    webappUrl: "http://localhost:3000",
    privacy: Object.freeze({ telemetryEnabled: false }),
    travel: Object.freeze({
      mode: "privacy",
      automaticSavingsConsent: false,
      meaningfulSavingsAmount: "20.00",
      meaningfulSavingsPercent: 3,
      displayCurrency: "USD",
    }),
  });

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (url.username || url.password) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function normalizeBaseUrl(value, fallback) {
    const parsed = safeHttpUrl(value) || safeHttpUrl(fallback);
    if (!parsed) return "";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  }

  function normalizeSettings(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const privacy = input.privacy && typeof input.privacy === "object" ? input.privacy : {};
    const travel = input.travel && typeof input.travel === "object" ? input.travel : {};
    const automaticSavingsConsent = travel.mode === "automatic" && travel.automaticSavingsConsent === true;
    const amount = /^\d{1,6}(?:\.\d{1,2})?$/.test(String(travel.meaningfulSavingsAmount || ""))
      ? Number(travel.meaningfulSavingsAmount).toFixed(2)
      : DEFAULT_SETTINGS.travel.meaningfulSavingsAmount;
    const percent = Number.isFinite(Number(travel.meaningfulSavingsPercent))
      ? Math.min(100, Math.max(0, Number(travel.meaningfulSavingsPercent)))
      : DEFAULT_SETTINGS.travel.meaningfulSavingsPercent;
    const displayCurrency = /^[A-Za-z]{3}$/.test(String(travel.displayCurrency || ""))
      ? String(travel.displayCurrency).toUpperCase()
      : DEFAULT_SETTINGS.travel.displayCurrency;
    return {
      schemaVersion: SETTINGS_VERSION,
      apiBackendUrl: normalizeBaseUrl(input.apiBackendUrl, DEFAULT_SETTINGS.apiBackendUrl),
      webappUrl: normalizeBaseUrl(input.webappUrl, DEFAULT_SETTINGS.webappUrl),
      privacy: { telemetryEnabled: privacy.telemetryEnabled === true },
      travel: {
        mode: automaticSavingsConsent ? "automatic" : "privacy",
        automaticSavingsConsent,
        meaningfulSavingsAmount: amount,
        meaningfulSavingsPercent: percent,
        displayCurrency,
      },
    };
  }

  function permissionOrigin(value) {
    const parsed = safeHttpUrl(value);
    return parsed ? parsed.protocol + "//" + parsed.hostname + "/*" : null;
  }

  function decimal(value, allowNumber) {
    const text = typeof value === "string"
      ? value.trim()
      : allowNumber && typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
    if (text.length > 64 || !/^\d+(?:\.\d+)?$/.test(text)) return null;
    const parts = text.split(".");
    const fractional = parts[1] || "";
    return {
      text,
      coefficient: BigInt(parts[0] + fractional),
      scale: 10n ** BigInt(fractional.length),
    };
  }

  function money(value) {
    if (!value || typeof value !== "object" || typeof value.amount !== "string") return null;
    const amount = decimal(value.amount, false);
    const currency = typeof value.currency === "string" ? value.currency.toUpperCase() : "";
    return amount && /^[A-Z]{3}$/.test(currency) ? { amount, currency } : null;
  }

  function equalDecimal(left, right) {
    return left.coefficient * right.scale === right.coefficient * left.scale;
  }

  function atLeast(left, right) {
    return left.coefficient * right.scale >= right.coefficient * left.scale;
  }

  function percentAtLeast(saving, baseline, percent) {
    return saving.coefficient * baseline.scale * 100n * percent.scale
      >= baseline.coefficient * saving.scale * percent.coefficient;
  }

  function conversionMatches(original, converted, rate, roundingMethod) {
    const numerator = original.coefficient * rate.coefficient * converted.scale;
    const denominator = original.scale * rate.scale;
    let rounded = numerator / denominator;
    const remainder = numerator % denominator;
    if (remainder > 0n) {
      const doubled = remainder * 2n;
      if (roundingMethod === "up"
        || (roundingMethod === "half_up" && doubled >= denominator)
        || (roundingMethod === "half_even" && (doubled > denominator || (doubled === denominator && rounded % 2n === 1n)))) {
        rounded += 1n;
      }
    }
    return rounded === converted.coefficient;
  }

  function meaningfulDecision(interrupt, reason, saving, converted, thresholds, evidence) {
    return Object.freeze({
      interrupt,
      badge: interrupt ? "saving" : "checked",
      reason,
      savingAmount: saving ? saving.amount.text : null,
      savingCurrency: saving ? saving.currency : null,
      savingUsd: converted ? converted.amount.text : null,
      amountThresholdUsd: thresholds.amount.text,
      percentThreshold: thresholds.percent.text,
      rateSource: evidence && typeof evidence.rate_source === "string" ? evidence.rate_source : null,
      rateTimestamp: evidence && typeof evidence.rate_timestamp === "string" ? evidence.rate_timestamp : null,
    });
  }

  function meaningfulTravelSaving(result, baselineValue, settingsValue) {
    const normalized = normalizeSettings(settingsValue);
    const thresholds = {
      amount: decimal(normalized.travel.meaningfulSavingsAmount, false),
      percent: decimal(normalized.travel.meaningfulSavingsPercent, true),
    };
    const empty = meaningfulDecision(false, "saving_not_verified", null, null, thresholds, null);
    if (!result || typeof result !== "object") return empty;
    const offers = Array.isArray(result.offers) ? result.offers : [];
    const offer = offers.find(function (item) { return item && item.offer_id === result.selected_offer_id; }) || offers[0];
    const savingValue = result.saving && result.saving.amount
      ? result.saving
      : offer && offer.saving;
    const saving = money(savingValue && savingValue.amount);
    if (!offer || !savingValue || savingValue.claim !== "verified" || !saving) return empty;
    if (typeof offer.evidence_manifest_id !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(offer.evidence_manifest_id)) {
      return meaningfulDecision(false, "evidence_manifest_missing", saving, null, thresholds, null);
    }
    if (offer.eligible !== true || offer.total_complete !== true || !offer.equivalence || offer.equivalence.classification !== "exact") {
      return meaningfulDecision(false, "saving_not_verified", saving, null, thresholds, null);
    }
    const baseline = money(baselineValue);
    if (!baseline || baseline.currency !== saving.currency || baseline.amount.coefficient <= 0n) {
      return meaningfulDecision(false, "baseline_evidence_missing", saving, null, thresholds, null);
    }

    const evidence = savingValue.usd_conversion;
    const original = money(evidence && evidence.original);
    const converted = money(evidence && evidence.converted);
    const rate = decimal(evidence && evidence.exchange_rate, false);
    const timestamp = evidence && evidence.rate_timestamp;
    const validTimestamp = typeof timestamp === "string"
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
      && Number.isFinite(Date.parse(timestamp));
    const validEvidence = original
      && converted
      && original.currency === saving.currency
      && equalDecimal(original.amount, saving.amount)
      && converted.currency === "USD"
      && rate
      && rate.coefficient > 0n
      && typeof evidence.rate_source === "string"
      && evidence.rate_source.trim().length > 0
      && validTimestamp
      && Number.isInteger(evidence.rate_age_seconds)
      && evidence.rate_age_seconds >= 0
      && ["half_even", "half_up", "down", "up"].includes(evidence.rounding_method)
      && (saving.currency !== "USD" || equalDecimal(rate, decimal("1", false)))
      && conversionMatches(original.amount, converted.amount, rate, evidence.rounding_method);
    if (!validEvidence) return meaningfulDecision(false, "usd_conversion_evidence_missing", saving, null, thresholds, null);
    if (!atLeast(converted.amount, thresholds.amount)) {
      return meaningfulDecision(false, "below_usd_threshold", saving, converted, thresholds, evidence);
    }
    if (!percentAtLeast(saving.amount, baseline.amount, thresholds.percent)) {
      return meaningfulDecision(false, "below_percent_threshold", saving, converted, thresholds, evidence);
    }
    return meaningfulDecision(true, "meaningful_verified_saving", saving, converted, thresholds, evidence);
  }

  return {
    SETTINGS_KEY,
    SETTINGS_VERSION,
    DEFAULT_SETTINGS,
    TRAVEL_SITE_ORIGINS,
    safeHttpUrl,
    normalizeSettings,
    permissionOrigin,
    meaningfulTravelSaving,
  };
});
