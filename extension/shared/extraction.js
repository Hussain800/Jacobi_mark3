(function (root, factory) {
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  root.JacobiExtraction = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_JSON_LD_BYTES = 256000;
  const MAX_JSON_LD_NODES = 500;
  const MAX_JSON_LD_DEPTH = 10;
  const MAX_PAGE_TEXT = 50000;
  const MAX_FIELD_LENGTH = 500;

  const CONDITION_MAP = Object.freeze({
    NewCondition: "new",
    RefurbishedCondition: "refurbished",
    UsedCondition: "used",
    DamagedCondition: "used",
  });
  const STOCK_MAP = Object.freeze({
    InStock: "in_stock",
    InStoreOnly: "in_stock",
    OnlineOnly: "in_stock",
    OutOfStock: "out_of_stock",
    SoldOut: "out_of_stock",
    PreOrder: "preorder",
  });

  function cleanText(value, maxLength) {
    if (value === null || value === undefined) return null;
    const limit = maxLength || MAX_FIELD_LENGTH;
    const text = String(value).slice(0, limit * 2).replace(/\s+/g, " ").trim();
    return text ? text.slice(0, limit) : null;
  }

  function parseJsonLd(text) {
    if (typeof text !== "string" || !text.trim() || text.length > MAX_JSON_LD_BYTES) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function findProductNode(value) {
    const queue = [{ value, depth: 0 }];
    const seen = new Set();
    let visited = 0;
    while (queue.length && visited < MAX_JSON_LD_NODES) {
      const current = queue.shift();
      const node = current.value;
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      visited += 1;
      if (!Array.isArray(node)) {
        const type = node["@type"];
        if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return node;
      }
      if (current.depth >= MAX_JSON_LD_DEPTH) continue;
      const children = Array.isArray(node) ? node : Object.values(node);
      for (const child of children) {
        if (child && typeof child === "object") queue.push({ value: child, depth: current.depth + 1 });
        if (queue.length + visited >= MAX_JSON_LD_NODES) break;
      }
    }
    return null;
  }

  function firstOffer(product) {
    if (!product || typeof product !== "object") return null;
    let offer = product.offers;
    if (Array.isArray(offer)) offer = offer[0];
    if (offer && offer["@type"] === "AggregateOffer" && Array.isArray(offer.offers)) offer = offer.offers[0];
    return offer && typeof offer === "object" ? offer : null;
  }

  function schemaEnum(value, map) {
    const key = cleanText(value, 100);
    return key ? map[key.split("/").pop()] || null : null;
  }

  function moneyAmount(value) {
    const text = cleanText(value, 100);
    if (!text) return null;
    const match = text.replace(/\s/g, "").match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/);
    if (!match) return null;
    const amount = match[0].replace(/,/g, "");
    return /^\d+(?:\.\d{1,2})?$/.test(amount) ? amount : null;
  }

  function currencyCode(value) {
    const text = cleanText(value, 100);
    if (!text) return null;
    const upper = text.toUpperCase();
    const code = upper.match(/\b(AED|USD|EUR|GBP|SAR|QAR|KWD|BHD|OMR|INR)\b/);
    if (code) return code[1];
    if (text.includes("د.إ")) return "AED";
    if (text.includes("€")) return "EUR";
    if (text.includes("£")) return "GBP";
    if (text.includes("₹")) return "INR";
    if (text.includes("$")) return "USD";
    return null;
  }

  function cleanUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      const remove = [];
      url.searchParams.forEach(function (_, key) {
        if (/^(utm_|ref$|ref_|tag$|pf_rd|pd_rd|psc$|spm$|aff)/i.test(key)) remove.push(key);
      });
      remove.forEach(function (key) { url.searchParams.delete(key); });
      url.hash = "";
      return url.toString();
    } catch (_) { return null; }
  }

  function field(value, source, fields, sources, key) {
    const cleaned = cleanText(value);
    if (!cleaned) return;
    fields[key] = cleaned;
    sources[key] = source;
  }

  function selectText(doc, selectors) {
    for (const selector of selectors) {
      try {
        const node = doc.querySelector(selector);
        const value = cleanText(node && (node.content || node.textContent));
        if (value) return value;
      } catch (_) { /* invalid or unsupported selector */ }
    }
    return null;
  }

  function meta(doc, selectors) {
    return selectText(doc, selectors);
  }

  function merchantSelectors(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host.endsWith("amazon.ae")) return {
      title: ["#productTitle"],
      price: ["#corePrice_feature_div .a-price .a-offscreen", "#priceblock_ourprice", ".a-price .a-offscreen"],
      brand: ["#bylineInfo"], seller: ["#sellerProfileTriggerId", "#merchant-info"],
      delivery: ["#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE", "#deliveryBlockMessage"],
      warranty: ["#warranty_and_support"],
    };
    if (host.endsWith("noon.com")) return {
      title: ["h1", "[data-qa='pdp-name']"], price: ["[data-qa='pdp-price']", "[class*='priceNow']"],
      seller: ["[data-qa='pdp-seller-name']"], delivery: ["[data-qa='pdp-delivery-date']"],
      warranty: ["[data-qa='pdp-warranty']"],
    };
    if (host.endsWith("sharafdg.com") || host.endsWith("jumbo.ae")) return {
      title: ["h1"], price: ["[itemprop='price']", ".price", "[class*='product-price']"],
      delivery: ["[class*='delivery']"], warranty: ["[class*='warranty']"],
    };
    return { title: ["h1"], price: ["[itemprop='price']"], delivery: [], warranty: [] };
  }

  function pageProduct(doc, locationLike) {
    const fields = {};
    const sources = {};
    let product = null;
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0, 50);
    for (const script of scripts) {
      product = findProductNode(parseJsonLd(String(script.textContent || "")));
      if (product) break;
    }

    if (product) {
      field(product.name, "json_ld", fields, sources, "title");
      field(typeof product.brand === "object" ? product.brand && product.brand.name : product.brand, "json_ld", fields, sources, "brand");
      field(typeof product.model === "object" ? product.model && product.model.name : product.model, "json_ld", fields, sources, "model");
      field(product.mpn, "json_ld", fields, sources, "mpn");
      field(product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || product.gtin, "json_ld", fields, sources, "gtin");
      field(product.sku, "json_ld", fields, sources, "sku");
      field(product.color || product.colour, "json_ld", fields, sources, "colour");
      const offer = firstOffer(product);
      if (offer) {
        field(offer.price !== undefined ? offer.price : offer.lowPrice, "json_ld", fields, sources, "amount");
        field(offer.priceCurrency, "json_ld", fields, sources, "currency");
        field(offer.seller && (offer.seller.name || (typeof offer.seller === "string" ? offer.seller : null)), "json_ld", fields, sources, "seller");
        const condition = schemaEnum(offer.itemCondition, CONDITION_MAP);
        const stock = schemaEnum(offer.availability, STOCK_MAP);
        if (condition) { fields.condition = condition; sources.condition = "json_ld"; }
        if (stock) { fields.stock = stock; sources.stock = "json_ld"; }
      }
    }

    const hooks = merchantSelectors(locationLike.hostname);
    if (!fields.title) field(meta(doc, ['meta[property="og:title"]']) || selectText(doc, hooks.title) || doc.title, "page_metadata", fields, sources, "title");
    if (!fields.amount) field(meta(doc, ['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', 'meta[itemprop="price"]']) || selectText(doc, hooks.price), "page_metadata", fields, sources, "amount");
    if (!fields.currency) field(meta(doc, ['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]', 'meta[itemprop="priceCurrency"]']), "page_metadata", fields, sources, "currency");
    if (!fields.brand) field(selectText(doc, hooks.brand || []), "merchant_dom", fields, sources, "brand");
    if (!fields.seller) field(selectText(doc, hooks.seller || []), "merchant_dom", fields, sources, "seller");
    field(selectText(doc, hooks.delivery || []), "merchant_dom", fields, sources, "delivery_text");
    field(selectText(doc, hooks.warranty || []), "merchant_dom", fields, sources, "warranty_text");

    const boundedText = cleanText(doc.body && doc.body.innerText, MAX_PAGE_TEXT) || "";
    const visiblePrice = selectText(doc, hooks.price || []);
    if (!fields.currency) field(currencyCode(visiblePrice), "merchant_dom", fields, sources, "currency");
    if (!fields.condition) {
      const conditionText = boundedText.match(/\b(refurbished|renewed|pre-owned|used|new condition)\b/i);
      if (conditionText) {
        fields.condition = /refurb|renewed/i.test(conditionText[0]) ? "refurbished" : (/used|pre-owned/i.test(conditionText[0]) ? "used" : "new");
        sources.condition = "visible_text";
      }
    }
    const shippingCurrency = currencyCode(fields.currency);
    if (shippingCurrency && /\bfree\s+(delivery|shipping)\b/i.test(boundedText)) {
      fields.shipping = { amount: "0", currency: shippingCurrency };
      sources.shipping = "visible_text";
    }

    fields.amount = moneyAmount(fields.amount);
    fields.currency = currencyCode(fields.currency);
    return { fields, sources, jsonLdFound: !!product };
  }

  function buildContext(doc, locationLike, now) {
    const result = pageProduct(doc, locationLike);
    const f = result.fields;
    const sourceUrl = cleanUrl(locationLike.href);
    if (!sourceUrl || !f.amount || !f.currency) return { context: null, preview: f, reason: "price_or_currency_unknown" };
    const currentOffer = {};
    ["title", "brand", "model", "mpn", "gtin", "sku", "colour", "seller", "delivery_text", "warranty_text"].forEach(function (key) {
      if (f[key] !== null && f[key] !== undefined) currentOffer[key] = f[key];
    });
    currentOffer.price = { amount: f.amount, currency: f.currency };
    currentOffer.condition = f.condition || "unknown";
    currentOffer.stock = f.stock || "unknown";
    if (f.shipping && f.shipping.currency) currentOffer.shipping = f.shipping;
    const context = {
        source_url: sourceUrl,
        market: "AE",
        current_offer: currentOffer,
        page_evidence: {
          sources: result.sources,
          json_ld_found: result.jsonLdFound,
          extraction_method: result.jsonLdFound ? "browser_json_ld_and_metadata" : "browser_metadata_and_dom",
          extracted_at: (now || new Date()).toISOString(),
          limitations: ["Browser-observed fields are not independently fetched by the backend", "Checkout-only costs may remain unknown"],
        },
      };
    const localDemo = /^(localhost|127\.0\.0\.1)$/.test(String(locationLike.hostname || "").toLowerCase()) &&
      /(?:fixture-product|sony-wh-1000xm6)/i.test(String(locationLike.href || ""));
    if (localDemo) {
      context.include_fixture_offers = true;
      context.page_evidence.fixture_demo = true;
      context.page_evidence.limitations.push("Local deterministic demo explicitly enabled retailer fixtures");
    }
    return {
      context: context,
      preview: f,
      reason: null,
    };
  }

  return {
    MAX_JSON_LD_BYTES,
    MAX_JSON_LD_NODES,
    MAX_PAGE_TEXT,
    cleanText,
    parseJsonLd,
    findProductNode,
    moneyAmount,
    currencyCode,
    cleanUrl,
    merchantSelectors,
    pageProduct,
    buildContext,
  };
});
