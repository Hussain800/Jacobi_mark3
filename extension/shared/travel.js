(function (root, factory) {
  const value = factory(root);
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiTravel = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CONTRACT_VERSION = "1.0.0";
  const MAX_SERIALIZED_BYTES = 32 * 1024;
  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
  const PAGE_PATHS = Object.freeze({
    "flight-demo-v1": new Set(["/fixture-flight-v1.html", "/travel/flight-v1"]),
    "hotel-demo-v1": new Set(["/fixture-hotel-v1.html", "/travel/hotel-v1"]),
  });
  const SENSITIVE_KEYS = /^(?:passenger_names?|guest_names?|first_name|last_name|email|passport(?:_number)?|document_number|card_number|payment_card|credential|cookie|session(?:_id)?|auth(?:orization)?|token|booking_reference)$/i;

  function cleanText(value, maxLength) {
    const result = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return result ? result.slice(0, maxLength || 300) : null;
  }

  function integer(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(String(value == null ? "" : value), 10);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  function boolean(value) {
    if (value === true || String(value).toLowerCase() === "true") return true;
    if (value === false || String(value).toLowerCase() === "false") return false;
    return null;
  }

  function decimal(value) {
    const normalized = String(value == null ? "" : value).replace(/,/g, "").trim();
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) return null;
    return Number(normalized).toFixed(2);
  }

  function currency(value) {
    const result = String(value || "").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(result) ? result : null;
  }

  function airport(value) {
    const result = String(value || "").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(result) ? result : null;
  }

  function date(value) {
    const result = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(result) && !Number.isNaN(Date.parse(result + "T00:00:00Z")) ? result : null;
  }

  function dateTime(value) {
    const result = String(value || "").trim();
    return result && !Number.isNaN(Date.parse(result)) ? new Date(result).toISOString() : null;
  }

  function dataset(documentValue, vertical) {
    const rootNode = documentValue && documentValue.querySelector
      ? documentValue.querySelector(`[data-jacobi-travel="${vertical}"]`)
      : null;
    return rootNode && rootNode.dataset ? rootNode.dataset : null;
  }

  function pageMarker(documentValue) {
    const marker = documentValue && documentValue.querySelector
      ? documentValue.querySelector('meta[name="jacobi-travel-adapter"]')
      : null;
    return marker ? cleanText(marker.content, 64) : null;
  }

  function matchDemo(locationValue, documentValue, adapterId) {
    if (!locationValue || !LOCAL_HOSTS.has(String(locationValue.hostname || "").toLowerCase())) return false;
    let pathname;
    try { pathname = new URL(String(locationValue.href || "")).pathname; } catch (_) { pathname = String(locationValue.pathname || ""); }
    return PAGE_PATHS[adapterId].has(pathname) && pageMarker(documentValue) === adapterId;
  }

  function sourcePage(locationValue, adapterId, vertical) {
    return {
      site: String(locationValue.hostname || "local-demo").slice(0, 128),
      page_kind: vertical,
      page_reference: adapterId,
      structured_data: {
        adapter_id: adapterId,
        adapter_version: CONTRACT_VERSION,
        fixture_demo: true,
      },
    };
  }

  function baseline(ds, vertical, nowValue) {
    const amount = decimal(ds.price);
    const code = currency(ds.currency);
    if (!amount || !code) return null;
    return {
      offer_id: cleanText(ds.baselineOfferId, 128) || `${vertical}-browser-baseline-v1`,
      provider_id: cleanText(ds.providerId, 128) || "browser_page",
      supplier_id: cleanText(ds.supplierId, 128),
      visible_price: { amount, currency: code },
      observed_at: nowValue.toISOString(),
      observation_method: "browser_observed",
      availability: "current",
      evidence_refs: [`${vertical}-demo-page-v1`],
    };
  }

  function baselineCosts(ds, vertical) {
    const amount = decimal(ds.price);
    const code = currency(ds.currency);
    if (!amount || !code || ds.mandatoryCostBasis !== "complete") return [];
    return [{
      kind: vertical === "flight" ? "base_fare" : "base_rate",
      state: "known",
      money: { amount, currency: code },
      mandatory: true,
      description: "Versioned demo fixture declares the displayed total includes all known mandatory costs.",
      evidence_ref: `${vertical}-demo-page-v1`,
    }];
  }

  function flightExtract(documentValue, locationValue, now) {
    const ds = dataset(documentValue, "flight");
    const missing = [];
    if (!ds) return { context: null, confidence: 0, missing_fields: ["flight_root"] };
    const origin = airport(ds.origin);
    const destination = airport(ds.destination);
    const departure = date(ds.departureDate);
    const returning = date(ds.returnDate);
    const code = currency(ds.currency);
    const baselineOffer = baseline(ds, "flight", now);
    if (!origin) missing.push("origin_airport");
    if (!destination) missing.push("destination_airport");
    if (!departure) missing.push("departure_date");
    if (!code) missing.push("display_currency");
    if (!baselineOffer) missing.push("baseline_price");
    if (origin && destination && origin === destination) missing.push("distinct_airports");
    const legs = origin && destination && departure
      ? [{ origin_airport: origin, destination_airport: destination, departure_date: departure }]
      : [];
    if (returning && origin && destination) legs.push({ origin_airport: destination, destination_airport: origin, departure_date: returning });
    const scheduledDeparture = dateTime(ds.scheduledDeparture);
    const scheduledArrival = dateTime(ds.scheduledArrival);
    const selectedSegments = scheduledDeparture && origin && destination && cleanText(ds.flightNumber, 16)
      ? [{
          marketing_carrier: cleanText(ds.marketingCarrier, 8),
          operating_carrier: cleanText(ds.operatingCarrier, 8),
          flight_number: cleanText(ds.flightNumber, 16),
          origin_airport: origin,
          destination_airport: destination,
          scheduled_departure: scheduledDeparture,
          scheduled_arrival: scheduledArrival,
        }]
      : [];
    const context = missing.length ? null : {
      vertical: "flight",
      baseline_costs: baselineCosts(ds, "flight"),
      intent: {
        trip_type: returning ? "round_trip" : "one_way",
        legs,
        passengers: {
          adults: integer(ds.adults, 1, 1, 9),
          children: integer(ds.children, 0, 0, 9),
          infants: integer(ds.infants, 0, 0, 9),
          seat_occupying_infants: 0,
        },
        requested_cabin: cleanText(ds.cabin, 32),
        selected_itinerary: selectedSegments.length ? {
          segments: selectedSegments,
          cabin: cleanText(ds.cabin, 32),
          checked_bags_included: integer(ds.checkedBagsIncluded, 0, 0, 5),
          fare_restriction_class: cleanText(ds.fareRestrictionClass, 128),
          refundable: boolean(ds.refundable),
          changeable: boolean(ds.changeable),
          ticketing_structure: cleanText(ds.ticketingStructure, 32) || "protected",
        } : null,
        baggage_requirements: {
          cabin_bags_per_passenger: integer(ds.cabinBags, 0, 0, 3),
          checked_bags_per_passenger: integer(ds.checkedBags, 0, 0, 5),
          checked_bag_weight_kg: integer(ds.checkedBagWeightKg, 0, 0, 70) || null,
        },
        baseline_offer: baselineOffer,
        locale: cleanText(ds.locale, 32) || "en-US",
        market: cleanText(ds.market, 16) || "US",
        display_currency: code,
        source_page: sourcePage(locationValue, "flight-demo-v1", "flight"),
        extracted_at: now.toISOString(),
      },
    };
    return { context, confidence: context ? 1 : 0.25, missing_fields: missing };
  }

  function hotelExtract(documentValue, locationValue, now) {
    const ds = dataset(documentValue, "hotel");
    const missing = [];
    if (!ds) return { context: null, confidence: 0, missing_fields: ["hotel_root"] };
    const propertyName = cleanText(ds.propertyName, 300);
    const checkIn = date(ds.checkIn);
    const checkOut = date(ds.checkOut);
    const code = currency(ds.currency);
    const baselineOffer = baseline(ds, "hotel", now);
    if (!propertyName) missing.push("property_name");
    if (!checkIn) missing.push("check_in");
    if (!checkOut) missing.push("check_out");
    if (checkIn && checkOut && checkOut <= checkIn) missing.push("valid_stay_dates");
    if (!code) missing.push("display_currency");
    if (!baselineOffer) missing.push("baseline_price");
    const occupancy = {
      adults: integer(ds.adults, 2, 1, 20),
      children: integer(ds.children, 0, 0, 20),
      children_ages: [],
    };
    const context = missing.length ? null : {
      vertical: "hotel",
      baseline_costs: baselineCosts(ds, "hotel"),
      intent: {
        property_hint: {
          provider_property_id: cleanText(ds.propertyId, 128),
          name: propertyName,
          address: cleanText(ds.address, 500),
          postal_code: cleanText(ds.postalCode, 32),
          official_domain: cleanText(ds.officialDomain, 253),
        },
        check_in: checkIn,
        check_out: checkOut,
        rooms: Array.from({ length: integer(ds.rooms, 1, 1, 9) }, function () { return occupancy; }),
        selected_rate: {
          room_name: cleanText(ds.roomName, 300),
          room_family: cleanText(ds.roomFamily, 200),
          bed_configuration: cleanText(ds.bedConfiguration, 128) ? [cleanText(ds.bedConfiguration, 128)] : null,
          meal_plan: cleanText(ds.mealPlan, 128),
          refundable: boolean(ds.refundable),
          cancellation_deadline: dateTime(ds.cancellationDeadline),
          payment_timing: cleanText(ds.paymentTiming, 32) || "unknown",
          occupancy,
          private_bathroom: boolean(ds.privateBathroom),
          guaranteed_room: boolean(ds.guaranteedRoom),
        },
        baseline_offer: baselineOffer,
        locale: cleanText(ds.locale, 32) || "en-US",
        market: cleanText(ds.market, 16) || "US",
        display_currency: code,
        source_page: sourcePage(locationValue, "hotel-demo-v1", "hotel"),
        extracted_at: now.toISOString(),
      },
    };
    return { context, confidence: context ? 1 : 0.25, missing_fields: missing };
  }

  const ADAPTERS = Object.freeze([
    Object.freeze({
      adapter_id: "flight-demo-v1",
      adapter_version: CONTRACT_VERSION,
      vertical: "flight",
      match: function (locationValue, documentValue) { return matchDemo(locationValue, documentValue, "flight-demo-v1"); },
      observe: function (documentValue) { return Boolean(dataset(documentValue, "flight")); },
      extract: flightExtract,
      sanitize,
    }),
    Object.freeze({
      adapter_id: "hotel-demo-v1",
      adapter_version: CONTRACT_VERSION,
      vertical: "hotel",
      match: function (locationValue, documentValue) { return matchDemo(locationValue, documentValue, "hotel-demo-v1"); },
      observe: function (documentValue) { return Boolean(dataset(documentValue, "hotel")); },
      extract: hotelExtract,
      sanitize,
    }),
  ]);

  function sanitize(value, depth) {
    const level = depth || 0;
    if (level > 10) return null;
    if (Array.isArray(value)) return value.slice(0, 64).map(function (item) { return sanitize(item, level + 1); });
    if (value && typeof value === "object") {
      const output = {};
      Object.keys(value).slice(0, 128).forEach(function (key) {
        if (!SENSITIVE_KEYS.test(key) && key !== "source_url" && key !== "url" && key !== "html" && key !== "raw_html") {
          output[key] = sanitize(value[key], level + 1);
        }
      });
      return output;
    }
    if (typeof value === "string") return value.slice(0, 2048);
    return value;
  }

  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + stable(value[key]); }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function materialContext(context) {
    const intent = context && context.intent ? context.intent : {};
    const copy = sanitize(intent);
    delete copy.baseline_offer;
    delete copy.extracted_at;
    delete copy.source_page;
    return { vertical: context && context.vertical, intent: copy };
  }

  async function fingerprint(context) {
    const payload = new TextEncoder().encode(stable(materialContext(context)));
    if (payload.byteLength > MAX_SERIALIZED_BYTES) throw new Error("travel intent exceeds fingerprint bound");
    const cryptoValue = root.crypto || (typeof require === "function" ? require("node:crypto").webcrypto : null);
    if (!cryptoValue || !cryptoValue.subtle) throw new Error("Web Crypto is unavailable");
    const digest = await cryptoValue.subtle.digest("SHA-256", payload);
    return Array.from(new Uint8Array(digest)).map(function (item) { return item.toString(16).padStart(2, "0"); }).join("");
  }

  async function extract(documentValue, locationValue, nowValue) {
    const adapter = ADAPTERS.find(function (candidate) { return candidate.match(locationValue, documentValue); });
    if (!adapter) return { supported: false, context: null, missing_fields: [] };
    const result = adapter.extract(documentValue, locationValue, nowValue || new Date());
    const context = result.context ? adapter.sanitize(result.context) : null;
    return {
      supported: true,
      adapter_id: adapter.adapter_id,
      adapter_version: adapter.adapter_version,
      vertical: adapter.vertical,
      confidence: result.confidence,
      missing_fields: result.missing_fields,
      context,
      fingerprint: context ? await fingerprint(context) : null,
    };
  }

  return {
    CONTRACT_VERSION,
    MAX_SERIALIZED_BYTES,
    ADAPTERS,
    sanitize,
    stable,
    materialContext,
    fingerprint,
    extract,
  };
});
