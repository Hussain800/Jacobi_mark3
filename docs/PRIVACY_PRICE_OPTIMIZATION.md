# Price Optimization Privacy

Jacobi's price comparison is designed to work from a user-invoked active product tab with the minimum data needed to identify and compare the offer.

## Data used

The extension may send:

- the product page URL with common tracking parameters removed;
- title, brand, model, MPN, GTIN, SKU, and variant fields;
- price and currency;
- seller, condition, stock, delivery, and warranty text when observed;
- field-level extraction source, timestamp, and limitations;
- user-submitted observations from comparison tabs or URLs when explicitly provided.

Raw page HTML is not sent by the normal extension comparison. Direct HTTP collection fetches only caller-supplied public URLs after explicit opt-in.

## Data not collected by the comparison path

- complete browsing history;
- unrelated page content;
- account passwords or retailer session credentials;
- payment-card data;
- automated checkout data;
- advertising profiles;
- silent background comparisons across unsupported pages.

## Local extension storage

The extension stores its versioned settings, configured backend/web URLs, telemetry preference, recent Deep Audit targets, dismissed domains, and wrong-match feedback in Chrome storage. Settings provides a local-data clearing action. Browser sync behavior depends on the user's Chrome configuration.

Telemetry is disabled by default.

## Backend storage

Local mode uses bounded in-memory storage and loses comparisons on restart. Supabase mode can retain normalized products, offers, comparison results, candidates, evidence references, events, watches, and preferences. Comparison/evidence responses use an access token; Agentcore uses API-key/org scoping where configured.

Normalized evidence can include a source URL and product interest, which may be personal data when tied to an account or IP log. Operators must publish their retention period, lawful basis, subprocessors, region, deletion contact, and breach process.

## Evidence and retention

Evidence retains source URL, timestamp, extraction method, identifiers, seller, availability, confidence, limitations, and hashes. Raw HTML artifacts belong to the Agentcore/Deep Audit path and should use short configurable retention unless the user explicitly saves evidence.

The repository provides cascade relationships for user-owned Supabase rows, but it does not yet expose a complete end-user export/deletion API for price-optimization history. Hosted operators must provide that workflow before claiming self-service deletion.

## External services

- Supabase may provide authentication and persistence when configured.
- Sentry may receive scrubbed error events only when `SENTRY_DSN` is configured.
- Bright Data may be used by an explicitly launched legacy Deep Audit when a self-hoster configures it. It is not used by normal comparisons.
- Retailer/public sites receive a request only for explicit direct-HTTP URLs or separate Deep Audit operations.

Provider and processor policies can change. Operators must name the services they actually enable.

## Product commitments

- do not sell browsing history or comparison records;
- do not use shopping data for personalized advertising;
- do not influence ranking through affiliate commission;
- do not ship provider keys in the extension;
- preserve honest uncertainty and source timestamps;
- collect only what the selected operation needs;
- make optional telemetry and Deep Audit explicit.

Privacy requests and security reports should use the private contact process in the repository [security policy](../SECURITY.md). Do not include secrets, payment data, or retailer credentials in a public issue.
