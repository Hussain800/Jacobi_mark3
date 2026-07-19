---
title: "Jacobi Mark 3 Pivot"
subtitle: "Product Design and Requirements Document - Open-Source Price Optimization Engine"
author: "Prepared for Hussain Sabuwala"
date: "12 July 2026"
lang: en-GB
geometry: margin=0.78in
fontsize: 10pt
mainfont: "DejaVu Sans"
monofont: "DejaVu Sans Mono"
colorlinks: true
linkcolor: blue
urlcolor: blue
toc: true
toc-depth: 3
numbersections: true
header-includes:
  - |
    \usepackage{fancyhdr}
    \usepackage{booktabs}
    \usepackage{longtable}
    \usepackage{array}
    \usepackage{microtype}
    \usepackage{xcolor}
    \pagestyle{fancy}
    \fancyhf{}
    \lhead{Jacobi Mark 3 Pivot PDR}
    \rhead{v1.0 - July 2026}
    \cfoot{\thepage}
    \setlength{\headheight}{14pt}
---

\newpage

# Document control

| Field | Value |
|---|---|
| Document | Jacobi Mark 3 Pivot - Product Design and Requirements Document |
| Version | 1.0 |
| Status | Build-ready baseline |
| Date | 12 July 2026 |
| Product owner | Hussain Sabuwala |
| Repository | `Hussain800/Jacobi_mark3` |
| Primary release surface | Chrome extension side panel |
| Secondary release surfaces | REST API, MCP server, CLI, web dashboard |
| Initial vertical | Exact-match electronics price comparison in the UAE |
| Core promise | Find the cheapest verified way to buy the exact product currently being viewed |

## Purpose of this document

This document converts the Jacobi redesign discussion into an implementation-ready product plan. It explains:

- why the existing product does not create sufficient everyday user value;
- what Jacobi is pivoting into;
- how the new product competes in the same broad category as Phia without becoming a shallow copy;
- which parts of the current repository should be preserved, repurposed, archived, or replaced;
- how the original Jacobian matrix, Welch's t-test, Price Exploitation Index, synthetic shoppers, and evidence engine fit into the new product;
- how to begin building immediately without first completing a long external validation exercise;
- the exact MVP scope, architecture, schemas, APIs, user experience, testing strategy, metrics, open-source strategy, and phased implementation plan.

This PDR intentionally prioritises a product that saves users money over a product that merely explains pricing behaviour.

## Decision summary

The central decision is:

> **Jacobi is pivoting from a pricing-discrimination report generator into an open-source price optimisation engine that automatically finds the cheapest legitimate route to the exact product or outcome a user wants.**

The browser extension becomes the main consumer experience. It should work inside the user's existing shopping journey, without requiring the user to copy a URL, open a separate website, wait up to 60-100 seconds, and interpret a PDF.

The original statistical audit engine remains a major differentiator, but it becomes an optional deep-analysis capability rather than the default workflow. Agentcore remains the trust, evidence, policy, and machine-readable decision layer, but it is not the product's consumer-facing heart.

\newpage

# Executive summary

## The problem with the current Jacobi

Jacobi Mark 3 is technically substantial. The current repository contains a Next.js frontend, a FastAPI backend, Supabase authentication and persistence, billing scaffolding, a Chrome extension, Bright Data integration, a 24/50 synthetic-shopper matrix, controlled buyer-context experiments, Welch's t-tests, robust statistics, a Jacobian sensitivity matrix, a Price Exploitation Index, evidence exports, REST endpoints, an MCP server, and a deterministic agent provenance layer.[^repo-readme] [^agent-doc]

However, the product currently asks a weak consumer question:

> "Am I being charged differently because of who I appear to be?"

The result is often a report or PDF. Even when correct, this creates three problems:

1. **The value is delayed.** The user must paste a URL and wait for a large probe matrix.
2. **The outcome is passive.** The user learns something but may not save any money.
3. **The workflow is avoidable.** A lazy shopper can simply continue toward checkout, inspect the final total, and leave before payment.

The earlier "checkout truth layer" pivot improved trust and evidence, but it still failed the strongest test:

> Would an ordinary person install Jacobi and use it repeatedly because the benefit is immediate and obvious?

The answer was not strong enough.

## The new product thesis

Jacobi should answer a more valuable question:

> **What is the cheapest legitimate way to obtain exactly what I am currently viewing?**

The extension should identify the product automatically, find equivalent offers, calculate the true payable total, eliminate mismatched or risky alternatives, and show a direct saving:

> **You are about to pay AED 1,699. Jacobi found the exact same model for AED 1,499 delivered. Save AED 200.**

This is a direct financial outcome, not a research conclusion.

## Relationship to Phia

Jacobi will compete in the same broad category as Phia: an embedded shopping assistant that helps users make better purchase decisions while browsing. Phia's visible interaction pattern is simple: a user visits a product page, activates the assistant, and receives price comparisons and alternative listings.[^phia]

Jacobi should not copy Phia's product identity, visual design, proprietary data model, or fashion-first strategy. Its distinct position is:

- exact product and exact outcome rather than primarily similar fashion alternatives;
- all-in payable cost rather than headline price alone;
- product identity confidence and offer equivalence;
- shipping, warranty, condition, regional compatibility, taxes, duties, and payment costs;
- reproducible evidence behind each result;
- an open-source core, provider interfaces, schemas, CLI, REST API, and MCP server;
- an optional mathematical deep audit of how prices respond to geography, device, cookies, referrer, and language.

The competitive statement is therefore:

> **Jacobi is an open-source alternative to closed shopping agents, focused on exact-match, evidence-backed, all-in price optimisation for humans and AI agents.**

## Initial wedge

The first MVP should support high-value electronics in the UAE. Electronics provide:

- stable model numbers, MPNs, GTINs, storage variants, colours, and specifications;
- meaningful savings in absolute currency;
- a clear distinction between exact matches and merely similar products;
- users who already compare multiple retailers;
- a manageable first set of merchant adapters;
- a natural later expansion into cross-border landed cost, warranty validity, and regional compatibility.

The first five target sources should be selected from:

- Amazon UAE;
- Noon;
- Sharaf DG;
- Jumbo Electronics;
- official manufacturer stores.

Support depends on technically reliable and policy-compliant access. The architecture must allow any unavailable source to be replaced without rewriting the core.

## Build strategy

A separate three-week validation programme is not a prerequisite. Development begins immediately, but the MVP itself must generate validation evidence.

The first milestone is not a universal commerce platform. It is one end-to-end workflow:

```text
Open supported electronics product page
        |
        v
Extract exact product identity and current offer
        |
        v
Find candidate offers from a small merchant set
        |
        v
Verify exact equivalence and calculate all-in total
        |
        v
Show the best saving in a Chrome side panel
        |
        v
Open the cheaper legitimate route
```

Success is measured through real product pages, real matching accuracy, real savings, result latency, and user click-through.

\newpage

# Strategic diagnosis and pivot rationale

## Current product anatomy

The current repository contains two overlapping product instincts.

### Product A: legacy pricing-discrimination audit

The original product dispatches controlled synthetic shoppers that vary location, device, cookies, referrer, browser language, and network context. It extracts observed prices and applies significance testing, robust statistics, a Jacobian sensitivity matrix, topology classification, and PEI scoring. The repository describes a Smart 24 live tier and a Pro 50 private beta, with typical Smart 24 audits taking 60-100 seconds.[^repo-readme]

This is technically unusual and potentially valuable to:

- researchers;
- investigative journalists;
- regulators;
- consumer-protection organisations;
- pricing teams;
- enterprise audit users.

It is not naturally suited to routine consumer shopping because the workflow is slow and the output requires interpretation.

### Product B: Jacobi for Agents

The newer `backend/agentcore/` subsystem exposes a deterministic price provenance layer through REST, MCP, and a provenance dashboard. It produces a `DecisionEnvelope`, evidence manifest, price summary, policy decision, route summary, confidence, reason codes, and human explanation. It also includes hard boundaries around restricted purchase automation and preserves hashed evidence artifacts.[^agent-doc] [^agent-schemas]

This system is a strong trust substrate. It is not, by itself, a consumer acquisition loop.

## Why the checkout-truth pivot was insufficient

The checkout-truth concept proposed that Jacobi verify displayed totals, detect mandatory fee drift, and tell the user whether to proceed. This solves a real problem in high-friction domains such as travel, tickets, and subscriptions. It should remain a capability.

It is not sufficient as the primary consumer purpose because:

- the user can often expose the final total by progressing through checkout;
- users do not want to perform a separate verification ritual for ordinary purchases;
- warnings prevent losses, but visible savings create stronger motivation;
- repeated use requires a positive reward loop, not only a risk-warning loop;
- the product would still rely on the user remembering to invoke it before every purchase.

Therefore, fee integrity becomes one variable inside the total-cost engine, not the entire product.

## The new heart of Jacobi

The new product's heart is not "agents" and not "reports". It is:

> **Verified savings on the exact thing the user wants.**

Every technical subsystem must justify itself by improving at least one of these outcomes:

- finding a cheaper equivalent offer;
- proving that two offers are truly equivalent;
- calculating the true total more accurately;
- returning the result faster;
- increasing confidence in the recommendation;
- reducing false matches;
- making the result easier to act on;
- enabling developers and agents to reuse the same optimisation engine.

## The product must pass five tests

### 1. Lazy-user test

The product must work where the user already shops. No copying and pasting is required for supported pages.

### 2. Money test

The result must state a concrete financial outcome: save AED X, current offer is already best, or no verified comparison is available.

### 3. Exactness test

The product must distinguish exact product matches from similar alternatives. Similar or refurbished options may appear, but they must be clearly separated.

### 4. Trust test

Every recommended saving must explain material differences such as warranty, condition, shipping, seller, delivery date, region, return policy, and confidence.

### 5. Speed test

A useful partial result should appear within approximately 3 seconds when cached or locally extractable. A complete MVP comparison should target 8-10 seconds, not the legacy 60-100 second audit path.

\newpage

# Product vision, positioning, and principles

## Vision

> **Make the cheapest legitimate purchasing route transparent and programmable for every human and AI agent.**

## Mission

Jacobi helps users avoid overpaying by identifying the exact product they are viewing, comparing equivalent offers, calculating the real all-in cost, and recommending the best verified route with evidence.

## One-line consumer positioning

> **Never overpay. Jacobi finds the cheapest verified way to buy what you are viewing.**

## One-line developer positioning

> **An open-source price optimisation engine for exact offer matching, true total-cost comparison, evidence, and agent integration.**

## Category positioning

Jacobi sits at the intersection of:

- browser shopping assistants;
- product identity resolution;
- price comparison;
- offer normalisation;
- total-cost calculation;
- evidence-grade price intelligence;
- AI-agent commerce tools.

## Product principles

### Savings before sophistication

Users should see the saving before seeing methodology, scores, or statistical language.

### Exact before broad

Support a small number of categories and merchants accurately before claiming universal shopping coverage.

### Final total before headline price

A lower item price is not a saving if shipping, duties, warranty risk, or eligibility make the offer worse.

### Evidence before assertion

Every comparison must retain the source, timestamp, extracted fields, method, confidence, and known limitations.

### Progressive depth

Fast comparison runs first. Deep probes, cross-context experiments, and full statistical audits run only when useful or requested.

### Open core, replaceable providers

Jacobi owns product identity, comparison logic, evidence contracts, ranking, developer surfaces, and methodology. Collection providers remain replaceable.

### Privacy and minimal permissions

The extension should request the narrowest permission set required for its current functionality. Chrome's policy requires extensions to use the minimum necessary permissions and align data collection to the extension's disclosed single purpose.[^chrome-policy]

### No stealth positioning

Jacobi should not market itself as an anti-bot bypass tool, identity spoofing platform, CAPTCHA evasion system, or automated buyer operating against platform rules.

### Honest uncertainty

"No verified result" is preferable to a false saving.

\newpage

# Target users and jobs to be done

## Primary persona: value-conscious electronics shopper

**Profile:** A consumer in the UAE comparing a laptop, phone, headphone, monitor, camera, or accessory across retailers.

**Behaviour:**

- opens several tabs manually;
- searches product model numbers;
- worries about seller quality and warranty;
- may miss shipping or bundle differences;
- wants an answer quickly;
- will not study a statistical report.

**Job:**

> "While I am viewing a product, tell me whether the exact same version is available for less from a legitimate source, including the real final cost."

**Desired outcome:**

- save money;
- avoid wrong variants;
- avoid unreliable sellers;
- understand important trade-offs;
- open the better offer immediately.

## Secondary persona: cross-border buyer

**Profile:** A user deciding whether to buy locally or import.

**Job:**

> "Compare the true landed cost, delivery, warranty, compatibility, and risk across regions."

This persona becomes important after the UAE-local MVP works.

## Secondary persona: power shopper or researcher

**Profile:** A user who suspects dynamic or personalised pricing.

**Job:**

> "Run a controlled audit and show whether geography, device, cookies, referrer, or language significantly changes the price."

This persona uses Jacobi Deep Audit and values the original mathematical engine.

## Secondary persona: AI-agent developer

**Profile:** A developer building a shopping, procurement, personal finance, or research agent.

**Job:**

> "Give my agent a structured tool that finds the cheapest equivalent offer and explains confidence, trade-offs, and evidence."

MCP is relevant because it is an open standard for connecting AI applications to external tools and workflows, with broad support across assistants and development tools.[^mcp]

## Future persona: team or enterprise analyst

**Profile:** Procurement, pricing, audit, or consumer-protection teams.

**Job:**

> "Monitor products or offers at scale, preserve evidence, and investigate price behaviour."

This persona may use existing organisation, watchlist, findings, audit-log, and export infrastructure later. It is not the first consumer launch target.

\newpage

# Product scope

## MVP scope

The MVP must deliver the following complete workflow:

1. Detect a supported electronics product page.
2. Extract current product identity and current displayed offer.
3. Resolve the canonical product and exact variant.
4. Search a limited set of supported merchants.
5. extract candidate offers;
6. verify exact-match equivalence;
7. calculate a comparable all-in total;
8. rank eligible offers;
9. show the best verified saving in a Chrome side panel;
10. let the user open the cheaper route;
11. retain evidence and telemetry for evaluation.

## MVP category scope

Initial supported categories:

- laptops;
- smartphones;
- headphones and earbuds;
- monitors;
- tablets;
- cameras, if model data is sufficiently structured.

A category can be added only when its exact-identity requirements are defined and tested.

## MVP geography and currency

- User market: UAE.
- Primary currency: AED.
- Cross-border offers: out of scope for initial release unless total landed cost can be calculated confidently.
- Currency conversion may be displayed experimentally but should not drive ranking without a reliable rate and cost model.

## Explicit non-goals for MVP

The MVP will not:

- compare all online products;
- support fashion as the first category;
- autonomously purchase products;
- handle payment credentials;
- log into retailer accounts;
- bypass CAPTCHAs or anti-bot controls;
- guarantee coupons that cannot be verified;
- rank similar products as if they were exact matches;
- rebuild the entire monorepo before shipping;
- remove the old audit engine;
- make the PDF the primary consumer output;
- expose unfinished enterprise dashboards as the main product;
- depend exclusively on Bright Data;
- claim that open source alone is the user value proposition.

## Future scope

After MVP validation:

- cross-border landed-cost optimisation;
- hotel and travel exact-outcome comparison;
- SaaS subscription route comparison;
- historical price tracking and alerts;
- verified coupons and public membership rates;
- refurbished and secondhand alternatives;
- agent-native remote MCP deployment;
- team watchlists and recurring scans;
- community merchant adapter marketplace;
- multi-output Jacobian analysis for price, fees, stock, ranking, and delivery.

\newpage

# Core user experience

## Primary journey

```text
User visits a supported product page
        |
        v
Jacobi detects an eligible product
        |
        v
Small, non-intrusive badge shows status
        |
        +--> "Checking 5 retailers..."
        |
        v
Side panel opens on click or extension action
        |
        v
Jacobi shows current offer and best verified alternative
        |
        +--> Save AED X
        +--> Current offer already best
        +--> No exact verified match found
        |
        v
User opens the preferred route
```

## Consumer interaction rules

### No copy-paste for supported pages

The extension must use the active page context to extract the URL and product data.

### One obvious result

The top of the side panel must answer:

- How much can I save?
- Where?
- Is it the exact same product?
- What material trade-offs exist?

### Progressive detail

The initial result should contain:

- saving amount;
- best merchant;
- all-in total;
- exact-match confidence;
- delivery summary;
- warranty/condition summary;
- primary call to action.

Expandable details may include:

- itemised total;
- identity match evidence;
- source timestamps;
- other offers;
- methodology;
- deep audit option.

## Side-panel states

### State A: detection

> **Recognising this product...**

Show extracted title and model when available.

### State B: searching

> **Checking verified retailers...**

Show merchant count, not technical provider names.

### State C: saving found

> **Save AED 200**
>
> Exact same model at Sony UAE - AED 1,499 delivered.

Primary button: **Open cheaper offer**

Secondary actions:

- Compare all offers
- Why this matches
- Run Deep Audit

### State D: current offer already best

> **This is the best verified price we found.**

Show the nearest alternative and price difference.

### State E: material trade-off

> **AED 120 cheaper, but the warranty is not UAE-local.**

Primary button should reflect the trade-off:

- View offer details
- Keep current offer

### State F: uncertain match

> **We found cheaper listings, but could not verify the exact variant.**

Do not calculate a headline saving.

### State G: unsupported page

> **Jacobi does not support this page yet.**

Offer:

- report site;
- copy detected model;
- open manual comparison.

### State H: deep audit

> **Deep Audit may take 60-100 seconds and tests whether buyer context changes the observed price.**

This makes the latency explicit and voluntary.

## UX quality requirements

- No modal interruption on every page.
- No pulsing neon or aggressive attention capture.
- Preserve Jacobi's premium dark forensic identity and green accent, but remove visual noise.
- The globe and advanced dashboard visuals may remain on the web product, not inside the narrow side panel.
- The extension should be usable at 320-480 px width.
- Important differences must use plain language.
- Do not show statistical jargon in the default consumer view.
- Every saving must be accompanied by a freshness timestamp.

## Chrome architecture choice

The target extension should use Chrome Manifest V3 and `chrome.sidePanel`. Chrome documents the side panel as a persistent companion experience alongside the current webpage and allows it to be enabled for specific sites or opened after a user gesture.[^chrome-sidepanel]

The current extension instead has broad `http://*/*` and `https://*/*` host permissions, injects an all-sites content script, and opens `/chat?url=...` in a new tab.[^extension-manifest] [^extension-background]

The redesign should:

- use `sidePanel`;
- prefer `activeTab`;
- use optional host permissions for supported merchants;
- enable the side panel only on eligible pages;
- remove notifications unless a price-watch feature needs them later;
- avoid always-on all-site collection;
- keep the current Shadow DOM badge concept only if it remains unobtrusive and permissions are appropriately scoped.

\newpage

# Functional requirements

## FR-1: Product-page detection

Jacobi must determine whether the current page is an eligible product page.

**Inputs:** URL, DOM, structured data, title, metadata.

**Signals:**

- JSON-LD `Product` schema;
- `sku`, `mpn`, `gtin`, brand, model;
- Open Graph product metadata;
- merchant-specific selectors;
- add-to-cart context;
- current price and currency;
- URL patterns.

**Acceptance criteria:**

- >=95% precision on the supported test fixture set;
- no badge on obvious non-product pages;
- detection completes locally in <500 ms after page readiness.

## FR-2: Current offer extraction

The extension must extract:

- merchant;
- page URL;
- title;
- brand;
- model/MPN/GTIN/SKU where available;
- variant attributes;
- displayed price;
- currency;
- seller;
- stock status;
- condition;
- delivery text;
- warranty text;
- structured-data source and DOM evidence.

The extension should send normalised fields, not the full page, unless the user explicitly triggers a deeper comparison that requires server-side collection.

## FR-3: Canonical product resolution

The backend must convert noisy page data into a canonical product identity.

Resolution order:

1. GTIN/EAN/UPC exact match;
2. manufacturer part number exact match;
3. brand + model number;
4. merchant SKU mapped through known aliases;
5. structured title parsing;
6. model-assisted fallback, never as sole high-confidence proof.

The output must include:

```text
ProductIdentity
- canonical_id
- brand
- family
- model
- manufacturer_part_number
- gtin/ean/upc
- variant attributes
- category
- regional identifiers
- identity_confidence
- identity_evidence[]
```

## FR-4: Candidate discovery

Jacobi must find candidate offers using a provider-agnostic discovery interface.

Provider types:

- merchant-specific site search;
- official merchant catalog/API;
- public search provider;
- cached Jacobi offer index;
- user-observed page from the extension;
- managed collection provider when permitted and configured.

The initial implementation should favour low-cost and reproducible paths:

1. cached offer index;
2. merchant adapters using public pages or official endpoints;
3. direct HTTP extraction;
4. local Playwright fallback;
5. managed provider behind explicit configuration and budget controls.

## FR-5: Merchant adapters

Each merchant adapter must expose a common interface:

```python
class MerchantAdapter(Protocol):
    merchant_id: str

    def supports_url(self, url: str) -> bool: ...

    async def extract_current_offer(
        self,
        page_context: PageContext,
    ) -> OfferObservation: ...

    async def search_offers(
        self,
        product: ProductIdentity,
        market: MarketContext,
    ) -> list[OfferCandidate]: ...

    async def verify_offer(
        self,
        candidate: OfferCandidate,
    ) -> VerifiedOffer: ...
```

Adapters must declare capabilities and limitations. They must not pretend to provide shipping, warranty, or stock fields they cannot observe.

## FR-6: Exact-offer equivalence

Jacobi must decide whether two offers are equivalent enough to compare.

Mandatory dimensions for electronics:

- manufacturer and product family;
- exact model/MPN;
- storage/RAM/capacity;
- size;
- colour where price-relevant;
- region/version;
- connectivity variant;
- condition: new, refurbished, used, open-box;
- included bundle/accessories;
- seller and fulfilment type;
- warranty region and duration.

Offers may be placed into:

- **exact eligible**;
- **exact with disclosed trade-off**;
- **similar alternative**;
- **rejected mismatch**.

Only exact eligible offers may produce the default "Save AED X" headline.

## FR-7: Total-cost calculation

The total-cost engine must calculate:

```text
payable_now =
    item_price
  + mandatory_shipping
  + mandatory_tax
  + known_import_duty
  + mandatory_service_or_platform_fees
  + payment_method_fee
  - verified_instant_discount
```

The following must not silently reduce `payable_now`:

- unverified coupons;
- uncertain cashback;
- loyalty points with unknown value;
- mail-in rebates;
- student pricing when eligibility is unknown;
- trade-in estimates;
- subscription-linked discounts not held by the user.

These may appear as conditional opportunities.

## FR-8: Offer freshness

Every offer must include:

- observed timestamp;
- evidence tier;
- extraction source;
- stock freshness;
- TTL;
- revalidation status.

The initial TTL target is:

- 15 minutes for actively fetched retail offers;
- shorter for volatile stock or flash sales;
- longer for cached catalog identity, never for price.

## FR-9: Ranking

Ranking is filter-first, not score-first.

1. Reject identity mismatches.
2. Reject unavailable offers.
3. Separate condition mismatches.
4. Separate material warranty/region differences.
5. Calculate payable total.
6. rank exact eligible offers by payable total;
7. use confidence, delivery, return quality, and seller trust as tie-breakers.

A lower-confidence offer must not outrank a high-confidence offer merely because its scraped number is lower.

## FR-10: Recommendation output

The result must include:

- current offer;
- best verified offer;
- absolute saving;
- percentage saving;
- exact-match confidence;
- all-in total components;
- trade-offs;
- freshness;
- other eligible offers;
- rejected-offer explanations;
- evidence reference;
- action URL.

## FR-11: Deep Audit

The user may request the original controlled pricing audit.

Deep Audit must:

- use the existing synthetic identity matrix where supported;
- test controlled context axes;
- run the legacy gradient and Welch t-test pipeline;
- generate the Jacobian sensitivity matrix;
- preserve the attribution gate;
- show PEI only when controlled significant effects and coverage gates permit;
- return a consumer summary plus downloadable evidence report.

## FR-12: Price watch

Not required for the first internal build, but the data model must allow a product to be watched.

Future capabilities:

- target price;
- percentage-drop threshold;
- merchant inclusion/exclusion;
- notification cadence;
- historical price chart;
- revalidation before notification.

## FR-13: MCP and API access

The same core engine must be callable by:

- extension;
- REST API;
- MCP server;
- CLI;
- web dashboard.

No surface should implement independent ranking logic.

\newpage

# Non-functional requirements

## Performance

| Stage | Target |
|---|---:|
| Local product detection | <500 ms |
| Current-offer extraction | <1 s |
| Cached comparison first result | <3 s |
| Live MVP complete comparison | p50 <8 s, p95 <15 s |
| Side-panel interactive load | <1.5 s |
| Deep Audit | explicitly allowed to take 60-100 s |

## Reliability

- A failed merchant adapter must not fail the entire comparison.
- Partial results must state which merchants failed.
- Cached values must show freshness.
- Results must be idempotent for the same input and evidence snapshot.
- Duplicate candidates must be collapsed.
- Rate limits and provider budgets must be enforced.

## Accuracy

Initial internal release targets:

- exact-match precision >=97%;
- material variant mismatch rate <3%;
- displayed-price extraction accuracy >=95% on supported fixtures;
- total-cost calculation accuracy >=95% where all required fields are observable;
- false headline-saving rate <2%.

## Security

- SSRF protections remain in place for server-side URL fetches.
- No raw payment data.
- No account credentials in the extension.
- Signed or expiring links for private evidence.
- Supabase RLS for user-owned records.
- secrets stored only in environment variables;
- `.env` and `.env.local` remain ignored;
- provider keys never shipped in the extension.

## Privacy

- Prefer local DOM extraction.
- Send only fields necessary for comparison.
- Do not collect complete browsing history.
- Do not run on unsupported pages.
- Do not use shopping data for personalised advertising.
- Provide a clear privacy policy and data deletion path.

## Observability

The backend should record:

- comparison run status;
- provider latency;
- extraction success/failure;
- identity confidence;
- offer counts;
- savings found;
- result click-through;
- cost per comparison;
- error class;
- deep-audit invocation.

Sentry is already present in the frontend dependencies and can remain for error tracking.[^frontend-package]

\newpage

# Domain model and contracts

## Core entities

### ProductIdentity

```yaml
ProductIdentity:
  canonical_id: string
  category: string
  brand: string
  family: string | null
  model: string
  manufacturer_part_number: string | null
  gtins: string[]
  merchant_skus: object
  variant:
    storage: string | null
    memory: string | null
    colour: string | null
    size: string | null
    connectivity: string | null
    region: string | null
    other: object
  identity_confidence: number
  evidence: IdentityEvidence[]
```

### OfferObservation

```yaml
OfferObservation:
  observation_id: string
  merchant_id: string
  source_url: string
  observed_at: datetime
  product_identity: ProductIdentity
  seller:
    name: string | null
    type: first_party | marketplace | unknown
    trust_score: number | null
  price:
    item: Money
    shipping: Money | null
    taxes: Money | null
    duties: Money | null
    mandatory_fees: Money[]
    verified_discount: Money | null
    payable_total: Money | null
  condition: new | refurbished | used | open_box | unknown
  stock: in_stock | out_of_stock | preorder | unknown
  delivery: object
  warranty: object
  return_terms: object
  extraction_confidence: number
  evidence_ref: string
```

### OfferEquivalence

```yaml
OfferEquivalence:
  left_offer_id: string
  right_offer_id: string
  classification: exact | exact_tradeoff | similar | mismatch
  score: number
  matched_dimensions: string[]
  mismatched_dimensions: string[]
  unknown_dimensions: string[]
  explanation: string
```

### OptimizationResult

```yaml
OptimizationResult:
  comparison_id: string
  current_offer: OfferObservation
  best_offer: OfferObservation | null
  eligible_offers: OfferObservation[]
  conditional_offers: OfferObservation[]
  rejected_offers: RejectedOffer[]
  savings:
    amount: Money | null
    percent: number | null
  recommendation:
    status: save | already_best | tradeoff | insufficient_evidence
    headline: string
    explanation: string
    action_url: string | null
  confidence: low | medium | high
  reason_codes: string[]
  evidence_manifest_id: string
  ttl_seconds: integer
```

## Recommended reason codes

Add reason codes alongside the existing agentcore codes:

- `PRODUCT_IDENTITY_EXACT`
- `PRODUCT_IDENTITY_PROBABLE`
- `PRODUCT_IDENTITY_UNRESOLVED`
- `LOWER_TOTAL_FOUND`
- `CURRENT_OFFER_ALREADY_BEST`
- `VARIANT_MISMATCH`
- `CONDITION_MISMATCH`
- `WARRANTY_MISMATCH`
- `REGION_MISMATCH`
- `SELLER_RISK`
- `SHIPPING_UNKNOWN`
- `TAX_UNKNOWN`
- `DUTY_UNKNOWN`
- `COUPON_UNVERIFIED`
- `CASHBACK_CONDITIONAL`
- `OFFER_STALE`
- `STOCK_UNCONFIRMED`
- `EXACT_MATCH_INSUFFICIENT`
- `OFFICIAL_ROUTE_FOUND`
- `DEEP_AUDIT_AVAILABLE`

## Evidence manifest reuse

The current `EvidenceManifest` already supports:

- target details;
- collection attempts;
- provider capabilities;
- artifacts;
- extractions;
- limitations;
- parent hashes;
- manifest SHA-256;
- optional signing.[^agent-schemas]

This should be extended, not replaced. New fields should include:

```yaml
comparison_context:
  current_offer_id: string
  product_canonical_id: string
  market: AE
  destination: object

offer_evidence:
  - offer_id: string
    source_url: string
    identity_fields: object
    price_fields: object
    seller_fields: object
    freshness: datetime

ranking_trace:
  eligible_offer_ids: string[]
  rejected_offer_ids: string[]
  ranking_version: string
  rule_outputs: object[]
```

## Schema versioning

- Use semantic schema versions.
- Add fields compatibly where possible.
- Keep old agentcore fixture responses working during migration.
- Export JSON Schema from Pydantic models.
- Contract-test REST, MCP, CLI, and extension against the same fixtures.

\newpage

# Ranking and optimisation methodology

## Definition of a valid saving

A saving is valid only when:

1. the alternative is an exact eligible match;
2. the item is in stock or clearly orderable;
3. the payable total is known with sufficient confidence;
4. the offer is fresh;
5. the action route is legitimate and accessible to the user;
6. material trade-offs are absent or prominently disclosed.

## Savings formula

```text
saving_amount = current_payable_total - alternative_payable_total
saving_percent = saving_amount / current_payable_total * 100
```

No headline saving should be shown when either payable total is materially incomplete.

## Equivalence scoring

A suggested electronics identity score:

```text
identity_score =
    0.30 * exact_mpn_or_gtin
  + 0.20 * exact_model
  + 0.15 * storage_memory_match
  + 0.10 * size_match
  + 0.05 * colour_match
  + 0.10 * region_connectivity_match
  + 0.10 * bundle_condition_match
```

Rules:

- GTIN/MPN conflict is a hard reject.
- condition mismatch prevents exact eligibility.
- storage or memory mismatch is a hard reject.
- unknown warranty may downgrade to `exact_tradeoff`.
- title embedding similarity cannot override a structured identifier conflict.

Suggested thresholds:

- `>=0.95`: exact eligible;
- `0.85-0.949`: exact with trade-off or missing field review;
- `0.65-0.849`: similar alternative;
- `<0.65`: reject.

These thresholds must be calibrated against labelled fixtures.

## Offer quality tie-breaker

Price remains the primary rank after eligibility. Tie-breakers may use:

```text
offer_quality =
    0.30 * evidence_confidence
  + 0.20 * seller_trust
  + 0.15 * warranty_quality
  + 0.15 * return_quality
  + 0.10 * delivery_quality
  + 0.10 * freshness
```

This score must not conceal price. The UI should show why a slightly more expensive route may be preferred.

## Conditional discounts

Conditional discounts should be represented explicitly:

```text
Guaranteed total: AED 1,499
Possible additional saving: AED 75 with eligible student account
```

They must not be merged into the guaranteed total.

## Historical price

Historical price is future scope. When added, it should answer:

- current percentile versus recent history;
- recent low/high;
- volatility;
- whether the alternative is unusually discounted;
- source and observation density.

It should not claim future-price prediction without a validated model.

\newpage

# Role of the original Jacobi mathematical engine

## What is preserved

The following should remain:

- synthetic identity matrix;
- controlled variable pairs;
- gradient estimation;
- Welch's t-test;
- trimmed median;
- median absolute deviation;
- Gini coefficient;
- Spearman correlation where statistically appropriate;
- Jacobian sensitivity matrix;
- attribution-gated PEI;
- coverage gate;
- evidence report.

The existing `math_engine.py` explicitly treats PEI as severity rather than verdict and hard-gates exploitation scoring when no controlled variable significantly moved price or coverage is limited.[^math-engine] This credibility principle must remain.

## What changes

The original engine is no longer the default path for every consumer comparison.

### Old critical path

```text
URL -> 24/50 probes -> statistics -> PDF -> user interprets
```

### New critical path

```text
Current page -> exact product -> candidate offers -> total cost -> verified saving
```

### Optional deep path

```text
User requests Deep Audit
        |
        v
Controlled synthetic contexts
        |
        v
Gradient + Welch t-test
        |
        v
Jacobian sensitivity matrix + attribution gate
        |
        v
Plain-language conclusion + evidence report
```

## New strategic use of the Jacobian

The Jacobian concept can evolve from only measuring price sensitivity to buyer identity into mapping a broader purchase surface.

Potential input variables:

- merchant;
- route: official store, marketplace, aggregator;
- user region;
- currency;
- account state;
- public membership eligibility;
- payment method;
- shipping method;
- timing;
- referrer;
- device;
- cookie state;
- language.

Potential outputs:

- payable price;
- mandatory fees;
- stock availability;
- delivery time;
- ranking position;
- warranty quality;
- return restrictions.

The long-term mathematical identity becomes:

> **Jacobi maps how the purchase outcome changes as the buying context changes, then recommends the cheapest acceptable route.**

## When to invoke Deep Audit automatically

Later versions may suggest Deep Audit when:

- observed prices diverge materially across repeated checks;
- user reports a different price;
- merchant and marketplace totals differ unexpectedly;
- account or region appears to affect price;
- a journalist/research mode is enabled.

The user must understand the additional time and data collection involved.

## Product naming

Recommended product structure:

- **Jacobi** - umbrella product;
- **Jacobi Compare** - consumer extension workflow;
- **Jacobi Deep Audit** - original matrix/statistical engine;
- **Jacobi Core** - open-source product and offer engine;
- **Jacobi MCP** - agent integration;
- **Jacobi Cloud** - possible hosted service later.

These names are working labels, not mandatory branding decisions.

\newpage

# Role of Agentcore

## Agentcore is not being removed

Agentcore should become the common trust and evidence layer used after discovery and normalisation.

It should answer:

- Is the product identity sufficiently certain?
- Is the lower offer genuinely equivalent?
- Is the total complete?
- Is the offer fresh?
- Are material trade-offs disclosed?
- Is the route legitimate?
- What should a human or agent do next?

## Agentcore is not the consumer heart

The user does not install Jacobi because it produces a `DecisionEnvelope`. The user installs Jacobi because it saves money.

Agentcore supports that promise by preventing bad recommendations.

## Required schema evolution

The existing `PriceObligation` and `DecisionEnvelope` can evolve into a broader comparison contract.

Suggested approach:

- retain backward compatibility for existing `/api/v1/agent/*` demos;
- add new `ComparisonRequest` and `OptimizationResult` models;
- allow `DecisionEnvelope` to reference `OptimizationResult`;
- eventually rename package internals only after the new workflow stabilises.

## New decision statuses

For consumer comparison, the core result should use:

- `save`;
- `already_best`;
- `tradeoff`;
- `insufficient_evidence`;
- `unsupported`;
- `error_partial`.

For agent action, preserve:

- `proceed`;
- `proceed_with_caution`;
- `ask_user`;
- `handoff_to_user`;
- `use_official_route`;
- `block`.

## Recommended MCP tools

```text
compare_current_product
find_cheapest_verified_offer
explain_offer_difference
calculate_true_total
verify_offer_equivalence
deep_audit_price_context
watch_product
get_comparison_evidence
```

Tool descriptions must be precise about inputs, outputs, limitations, and when not to call them.

\newpage

# Current architecture and migration assessment

## Current stack to retain

| Current component | Decision | Reason |
|---|---|---|
| Next.js frontend | Retain | Existing dashboard, marketing, auth, and UI foundation |
| FastAPI backend | Retain | Strong fit for async adapters, Pydantic schemas, and existing code |
| Supabase | Retain | Auth, persistence, RLS, existing migrations |
| Chrome extension shell | Rewrite in place | Existing MV3 base, badge, popup, storage, service worker |
| Agentcore | Retain and extend | Evidence, policy, contracts, MCP, REST |
| `pricing_engine.py` | Retain | Robust statistics and current pricing primitives |
| `math_engine.py` | Retain | Jacobian and PEI deep-audit moat |
| PDF export | Retain as secondary | Useful for research and evidence, not main UX |
| Bright Data integration | Make optional | Provider, not product core |
| Stripe test-mode scaffolding | Deprioritise | Not required for open-source MVP |
| Enterprise tables | Preserve, hide from MVP | Useful later, not current user value |
| Leaderboard | Archive from main nav | Distracts from core workflow |
| Chat cockpit | Remove from extension path | Adds friction and does not express saving immediately |

## Current extension problems

The current manifest:

- describes "24 agents" and price discrimination;
- requests broad host permissions;
- injects a content script on all HTTP/HTTPS pages;
- includes notifications and scripting;
- opens a new `/chat?url=` tab.[^extension-manifest] [^extension-background]

The content script already contains useful local capabilities:

- product/pricing heuristics;
- JSON-LD detection;
- Shadow DOM isolation;
- price highlighting;
- dismissal persistence.[^extension-content]

The redesign should reuse the detection techniques while replacing the old interaction and permission model.

## Current backend risks

The backend still concentrates substantial orchestration in `backend/main.py`, while newer functionality is more modular. The migration should not begin by rewriting all routes. Instead:

1. add the new comparison package;
2. expose new endpoints;
3. route the extension to them;
4. prove the workflow;
5. progressively extract legacy responsibilities from `main.py`.

## Target logical architecture

```text
+-------------------------+
| Chrome Extension        |
| - local page extractor  |
| - side panel            |
+------------+------------+
             |
             v
+-------------------------+
| Comparison API          |
| FastAPI routes          |
+------------+------------+
             |
             v
+-------------------------+
| Product Resolver        |
| IDs, variant, category  |
+------------+------------+
             |
             v
+-------------------------+        +-------------------------+
| Discovery Orchestrator  +------->| Merchant Adapters       |
| cache + provider router |        | search/fetch/verify     |
+------------+------------+        +-------------------------+
             |
             v
+-------------------------+
| Offer Normaliser        |
| common schema           |
+------------+------------+
             |
             v
+-------------------------+
| Equivalence Engine      |
| exact vs trade-off      |
+------------+------------+
             |
             v
+-------------------------+
| Total Cost + Ranking    |
| payable and savings     |
+------------+------------+
             |
             v
+-------------------------+
| Agentcore Trust Layer   |
| evidence + reason codes |
+------------+------------+
             |
             +------------------------+
             |                        |
             v                        v
+-------------------------+  +-------------------------+
| Supabase / Cache        |  | Deep Audit Engine       |
| runs, offers, evidence  |  | Jacobian + Welch + PEI  |
+-------------------------+  +-------------------------+
```

## Target deployment

### Consumer/web stack

- Next.js frontend on Vercel;
- FastAPI backend on Render or equivalent long-running service;
- Supabase for auth and relational persistence;
- object storage for evidence artifacts;
- optional Redis-compatible cache later;
- extension distributed through Chrome Web Store and GitHub releases.

### Local/open-source mode

- FastAPI backend locally;
- SQLite or in-memory development persistence option later;
- Playwright/direct HTTP providers;
- local extension development build;
- MCP stdio server;
- fixture mode requiring no paid provider.

## Provider-agnostic architecture

Jacobi should expose capability-aware providers:

```python
class CollectionProvider(Protocol):
    name: str
    capabilities: ProviderCapabilities

    async def fetch(self, request: CollectionRequest) -> CollectionResult: ...
```

Provider order should be policy and budget driven:

1. extension-provided structured fields;
2. cached fresh observation;
3. official API or public catalog;
4. direct HTTP;
5. local Playwright;
6. managed request/browser provider if configured.

Bright Data can remain one adapter. It must not be a mandatory dependency for local development or the open-source value proposition.

\newpage

# Proposed repository structure

The repository should migrate gradually toward capability-based packages.

```text
Jacobi_mark3/
├── backend/
│   ├── main.py                       # temporary composition root
│   ├── api/
│   │   ├── comparison_routes.py
│   │   ├── product_routes.py
│   │   ├── evidence_routes.py
│   │   └── audit_routes.py
│   ├── jacobi_core/
│   │   ├── schemas/
│   │   │   ├── product.py
│   │   │   ├── offer.py
│   │   │   ├── comparison.py
│   │   │   └── evidence.py
│   │   ├── identity/
│   │   │   ├── resolver.py
│   │   │   ├── normalizers.py
│   │   │   └── electronics.py
│   │   ├── discovery/
│   │   │   ├── orchestrator.py
│   │   │   ├── cache.py
│   │   │   └── provider_router.py
│   │   ├── adapters/
│   │   │   ├── base.py
│   │   │   ├── amazon_ae.py
│   │   │   ├── noon.py
│   │   │   ├── sharafdg.py
│   │   │   ├── jumbo.py
│   │   │   └── official_store.py
│   │   ├── equivalence/
│   │   │   ├── engine.py
│   │   │   └── electronics_rules.py
│   │   ├── pricing/
│   │   │   ├── total_cost.py
│   │   │   ├── ranking.py
│   │   │   └── currency.py
│   │   ├── evidence/
│   │   │   ├── manifest.py
│   │   │   └── artifacts.py
│   │   └── services/
│   │       └── comparison_service.py
│   ├── agentcore/                    # retained, integrated
│   ├── audit/
│   │   ├── math_engine.py            # migrated from current location later
│   │   ├── pricing_engine.py
│   │   └── synthetic_profiles.py
│   └── tests/
│       ├── fixtures/
│       ├── unit/
│       ├── contract/
│       └── e2e/
├── extension/
│   ├── manifest.json
│   ├── service-worker.js
│   ├── content/
│   │   ├── detect-product.js
│   │   ├── extract-structured-data.js
│   │   └── merchant-extractors/
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── styles.css
│   └── shared/
│       └── messages.js
├── frontend/
│   ├── app/
│   │   ├── compare/
│   │   ├── history/
│   │   ├── product/[id]/
│   │   └── dashboard/
│   └── components/
├── packages/                         # optional later extraction
│   ├── schemas/
│   └── extension-ui/
├── supabase/migrations/
├── examples/
│   ├── cli_compare.py
│   └── mcp_shopping_agent.md
└── docs/
    ├── PDR_OPEN_SOURCE_PRICE_OPTIMIZATION.md
    ├── ADAPTER_GUIDE.md
    ├── DATA_MODEL.md
    ├── PRIVACY.md
    └── SAFE_USE.md
```

## Migration rule

Do not move existing files merely to make the tree look clean. Create new boundaries where new work requires them. Move legacy files only after tests protect their behaviour.

\newpage

# API requirements

## New REST endpoints

### POST `/api/v1/compare`

Launch comparison from structured current-page context.

Request:

```json
{
  "source_url": "https://example-retailer.ae/product/...",
  "market": "AE",
  "destination": {"country": "AE", "emirate": "Dubai"},
  "current_offer": {
    "title": "Sony WH-1000XM6 Black",
    "brand": "Sony",
    "model": "WH-1000XM6",
    "price": {"amount": 1699, "currency": "AED"},
    "seller": "Example Retailer",
    "condition": "new"
  },
  "page_evidence": {
    "json_ld": {},
    "selectors": [],
    "extracted_at": "2026-07-12T12:00:00Z"
  }
}
```

Response: `OptimizationResult`.

### GET `/api/v1/comparisons/{id}`

Fetch status and partial/final result.

### POST `/api/v1/products/resolve`

Resolve product identity only.

### GET `/api/v1/products/{canonical_id}/offers`

Return fresh known offers.

### POST `/api/v1/offers/{offer_id}/revalidate`

Re-fetch an offer before action.

### POST `/api/v1/comparisons/{id}/deep-audit`

Launch original controlled audit.

### POST `/api/v1/watch`

Create price watch in later phase.

### GET `/api/v1/evidence/{manifest_id}`

Return manifest.

## API behaviour

- Return `202 Accepted` when live discovery continues asynchronously.
- Return cached partial offers immediately where available.
- Include adapter errors as structured warnings.
- Never return fabricated completed data when the backend fails.
- Maintain existing health endpoints.
- Add request IDs and trace correlation.

## Backward compatibility

Keep existing `/api/v1/agent/*` routes operational during the pivot. Internally, they may call the new core when product comparison is requested.

## CLI

Proposed commands:

```bash
jacobi compare <url>
jacobi resolve <url-or-title>
jacobi offers <canonical-product-id>
jacobi audit <url>
jacobi watch <url> --target 1499 AED
jacobi evidence <comparison-id>
```

Example output:

```text
Current: Amazon UAE - AED 1,699
Best: Sony UAE - AED 1,499 delivered
Saving: AED 200 (11.8%)
Match: exact (0.99)
Trade-offs: none detected
Freshness: observed 48 seconds ago
```

\newpage

# Database design

## Existing schema reuse

The current repository already has profiles, probes, subscriptions, organisations, products, sellers, watchlists, scan jobs, findings, evidence items, exports, share tokens, audit logs, and `agent_provenance_records` according to the research and migrations. Preserve these tables until a deliberate migration is planned.

## New or revised tables

### `catalog_products`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | canonical ID |
| `category` | text | electronics category |
| `brand` | text | normalised |
| `family` | text | nullable |
| `model` | text | required |
| `mpn` | text | indexed, nullable |
| `gtins` | jsonb | identifiers |
| `variant` | jsonb | storage, colour, region, etc. |
| `canonical_title` | text | display title |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `product_aliases`

Maps merchant titles, SKUs, and alternate IDs to canonical products.

### `offer_observations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `product_id` | uuid | FK |
| `merchant_id` | text | |
| `seller_id` | text | nullable |
| `source_url` | text | |
| `item_price` | numeric | |
| `currency` | text | |
| `shipping` | numeric | nullable |
| `tax` | numeric | nullable |
| `duties` | numeric | nullable |
| `mandatory_fees` | jsonb | |
| `payable_total` | numeric | nullable |
| `condition` | text | |
| `stock_status` | text | |
| `delivery` | jsonb | |
| `warranty` | jsonb | |
| `return_terms` | jsonb | |
| `identity_confidence` | numeric | |
| `extraction_confidence` | numeric | |
| `observed_at` | timestamptz | indexed |
| `expires_at` | timestamptz | indexed |
| `manifest_id` | text | |

### `comparison_runs`

Stores current offer, result state, best offer, saving, confidence, latency, and errors.

### `comparison_candidates`

Join table recording eligibility, equivalence score, rejection reasons, and rank.

### `merchant_adapters`

Stores adapter version, health status, supported domains/categories, and last successful test.

### `comparison_events`

Product telemetry:

- side panel shown;
- result loaded;
- saving found;
- offer opened;
- report mismatch;
- deep audit started.

### `price_watches`

Future table for target thresholds and notifications.

## Data retention

- Raw HTML/screenshots: short, configurable retention unless user saves evidence.
- Normalised price observations: longer retention for history, subject to privacy policy.
- Full URLs: consider stripping tracking parameters.
- User browsing context: do not retain unrelated page data.
- User deletion should cascade through owned comparison history.

## RLS

- Users may read/write their own comparison history and watches.
- Public aggregate price observations must not expose user identity.
- Service-role writes remain backend-only.
- Shared evidence must use explicit share tokens with expiry.

\newpage

# Browser extension implementation

## Manifest target

Illustrative minimal manifest direction:

```json
{
  "manifest_version": 3,
  "name": "Jacobi - Verified Price Comparison",
  "version": "1.0.0",
  "description": "Find the cheapest verified way to buy the exact product you are viewing.",
  "permissions": [
    "activeTab",
    "storage",
    "sidePanel"
  ],
  "optional_host_permissions": [
    "https://*.amazon.ae/*",
    "https://*.noon.com/*",
    "https://*.sharafdg.com/*",
    "https://*.jumbo.ae/*"
  ],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "action": {
    "default_title": "Open Jacobi"
  }
}
```

Final domains must match actual supported sites and review requirements.

## Message flow

```text
Content script -> PRODUCT_CONTEXT_DETECTED
Service worker -> opens/enables side panel
Side panel -> REQUEST_CURRENT_CONTEXT
Content script -> structured ProductPageContext
Side panel -> backend POST /api/v1/compare
Backend -> partial/final OptimizationResult
Side panel -> render result
```

## Local extraction

The content layer should:

- parse JSON-LD first;
- use merchant-specific selectors second;
- use generic heuristics last;
- avoid sending raw DOM by default;
- strip tracking query parameters;
- record which fields came from which source;
- allow the user to inspect extracted model and variant.

## Side panel technology

Two acceptable routes:

1. lightweight vanilla TypeScript/HTML for fast MVP;
2. a small React/Vite bundle reusing design components.

Do not embed the entire Next.js app in the extension for the first release. Keep the side panel fast and narrowly scoped.

## Badge behaviour

The current floating badge can be repurposed:

- show only on supported product pages;
- initial label: `Check price`;
- result label: `Save AED 200`;
- no continuous pulse;
- user can dismiss per domain;
- clicking opens side panel rather than a new tab.

## Extension acceptance criteria

- installation works in unpacked mode;
- current supported page is detected;
- side panel opens from toolbar and badge;
- extracted model can be inspected;
- comparison result renders;
- cheaper offer opens in a new tab;
- no broad all-site permission warning;
- no raw provider key in package;
- no page content collected before a supported-page action.

\newpage

# Backend implementation

## Comparison service

Create a single orchestration service:

```python
class ComparisonService:
    async def compare(self, request: ComparisonRequest) -> OptimizationResult:
        current = await self.current_offer_normalizer.normalize(request)
        product = await self.product_resolver.resolve(current)
        candidates = await self.discovery.find(product, request.market)
        observations = await self.verifier.verify_all(candidates)
        equivalence = self.equivalence.classify(current, observations)
        totals = self.total_cost.calculate_all(observations, request.destination)
        ranked = self.ranker.rank(current, totals, equivalence)
        manifest = self.evidence.build_comparison_manifest(...)
        return self.result_builder.build(...)
```

## Asynchronous execution

For MVP, FastAPI background tasks may be sufficient for short comparisons. If adapter latency and concurrency increase, introduce a worker queue.

Do not introduce a distributed queue before the first end-to-end comparison works.

Suggested progression:

- Phase 1: in-process async fan-out with strict timeouts;
- Phase 2: persistent jobs table and worker process;
- Phase 3: Redis/queue if scale requires it.

## Timeouts

- per adapter search timeout: 3-5 s;
- per offer verification timeout: 3-5 s;
- overall comparison deadline: 12-15 s;
- return partial result at deadline;
- deep audit retains separate longer deadline.

## Caching

Cache layers:

- product identity aliases: long-lived;
- merchant search results: short-lived;
- offer prices: 5-15 minutes;
- static merchant metadata: long-lived;
- evidence artifacts: retention policy based.

Cache keys must include:

- canonical product;
- market;
- destination where cost-relevant;
- variant;
- merchant;
- currency.

## Extraction confidence

Each adapter should return field-level confidence. The total result confidence should be limited by the weakest material field.

Example:

```text
item price: 0.99
shipping: 0.95
condition: 0.99
warranty: 0.60
identity: 0.99

result: trade-off, not exact eligible, because warranty confidence is low
```

## LLM usage

LLMs may assist with:

- title parsing fallback;
- attribute extraction from messy text;
- explanation generation;
- adapter development diagnostics.

LLMs must not be the sole authority for:

- exact model identity;
- final payable total;
- stock status;
- eligibility;
- warranty equivalence;
- evidence claims.

Structured identifiers and deterministic rules take priority.

\newpage

# Merchant adapter strategy

## Adapter contract requirements

Every adapter must provide:

- supported domains;
- supported categories;
- discovery capability;
- extraction capability;
- verification capability;
- expected evidence tier;
- rate limits;
- timeout;
- known policy constraints;
- fixture set;
- health check;
- version.

## Adapter development workflow

1. Capture approved public fixture pages.
2. Build deterministic parser.
3. Add title/identifier normalisation.
4. Add current price and stock extraction.
5. Add seller, shipping, warranty, and return fields.
6. Add search capability.
7. Test at least 20 products.
8. Add failure fixtures.
9. Add observability.
10. Mark production-ready only after thresholds pass.

## Initial merchant selection rubric

Score each source on:

- public accessibility;
- model-number availability;
- structured data quality;
- local relevance;
- inventory breadth;
- seller complexity;
- shipping visibility;
- warranty clarity;
- legal/policy risk;
- extraction stability.

The first five supported sources should be the highest-scoring set, not necessarily the most famous set.

## Official stores

Official manufacturer stores are strategically important because they provide:

- stronger product identity;
- warranty clarity;
- official-route confidence;
- student/public offers;
- an authoritative reference point.

However, official stores differ by brand. Build a reusable official-store adapter base plus brand-specific mappings.

## Marketplace sellers

Marketplaces require seller-aware comparison.

A marketplace listing should not be treated as one offer if multiple sellers, conditions, or fulfilment methods exist. Each should be a separate offer observation.

\newpage

# Web application redesign

## Role of the web app

The web app is no longer the mandatory entry point for every comparison. It supports:

- landing and documentation;
- comparison history;
- saved products;
- evidence details;
- Deep Audit results;
- developer API keys;
- MCP setup;
- contribution and adapter docs;
- future watchlists.

## Navigation proposal

Primary:

- Compare
- History
- Watches
- Deep Audit
- Developers

Secondary:

- Evidence
- Settings
- About methodology

Deprioritise or hide:

- leaderboard;
- generic chat;
- enterprise portfolio views not relevant to current release;
- billing until a hosted plan is real.

## Landing-page hero

> **Find the exact same product for less.**
>
> Jacobi compares verified offers, calculates the real total, and shows the cheapest legitimate route - open source and built for humans and AI agents.

Primary CTA: **Install extension**

Secondary CTA: **View GitHub**

## Product demonstration

A short loop should show:

1. user visits laptop page;
2. Jacobi side panel opens;
3. exact model is confirmed;
4. three merchants are compared;
5. AED saving appears;
6. evidence and warranty differences are visible.

The demo should not begin with architecture or mathematical formulas.

## Design direction

Preserve:

- dark premium background;
- Jacobi green accent;
- globe/technical visual identity on marketing and dashboard surfaces;
- forensic evidence feel;
- clear typography.

Remove or reduce:

- gratuitous glows;
- pulsing indicators;
- excessive dashed borders;
- generic AI chat appearance;
- unlabelled scores;
- feature density before core outcome.

\newpage

# Testing strategy

## Test pyramid

### Unit tests

- product title normalisers;
- GTIN/MPN parsing;
- variant extraction;
- equivalence rules;
- total-cost calculation;
- ranking;
- conditional discount handling;
- reason-code generation;
- evidence hashing.

### Adapter fixture tests

For each merchant:

- valid product;
- sale price;
- out of stock;
- multiple sellers;
- missing shipping;
- refurbished condition;
- variant mismatch;
- changed DOM;
- bot/interstitial response;
- invalid structured data.

### Contract tests

- REST response schema;
- MCP tool schema;
- CLI output;
- extension message contract;
- backward compatibility for existing agentcore routes.

### Integration tests

- extension page context -> API -> result;
- current offer -> resolver -> adapters -> ranking;
- evidence manifest retrieval;
- Supabase persistence;
- partial adapter failure;
- timeouts and cancellation.

### End-to-end tests

Use Playwright for:

- install development extension where feasible;
- visit fixture product site;
- open side panel;
- receive result;
- click cheaper offer;
- inspect details;
- launch Deep Audit fixture.

## Golden dataset

Create a labelled dataset of at least 100 electronics offer pairs containing:

- exact matches;
- storage mismatches;
- colour-only changes;
- regional models;
- refurbished versus new;
- bundles;
- seller/warranty differences;
- misleading titles;
- false low prices;
- unavailable products.

This dataset becomes a core open-source asset.

## Release gates

No public release until:

- exact-match precision >=97% on the labelled set;
- no severe known price-calculation bug;
- permissions reviewed;
- privacy page published;
- unsupported sites fail safely;
- saving results retain evidence;
- extension has a clear single purpose;
- three complete demo products work consistently;
- no secret keys in repository or package.

## Legacy regression

Continue running current backend tests, including agentcore and mathematical engine tests. The repository currently documents more than one thousand passing tests and the requirements file references a full suite running against modern Pydantic.[^repo-readme] [^backend-requirements]

\newpage

# Product metrics and validation through building

## North-star metric

> **Verified savings opened by users.**

This combines value and action. A saving that no user opens is less meaningful than a saving that changes a purchase decision.

## Core metrics

### Coverage

- supported product-page detection rate;
- product resolution success rate;
- comparisons with >=2 exact eligible offers;
- merchant adapter coverage.

### Value

- percentage of comparisons finding a valid saving;
- median saving amount;
- median saving percentage;
- total verified saving value;
- percentage where current offer is already best.

### Trust

- exact-match precision;
- user-reported mismatch rate;
- stale-offer rate;
- false headline-saving rate;
- result correction rate;
- evidence completeness.

### Behaviour

- side-panel open rate;
- cheaper-offer click-through;
- repeat usage;
- extension retention;
- Deep Audit usage;
- watch creation.

### Performance and economics

- p50/p95 comparison latency;
- adapter success rate;
- cache hit rate;
- managed provider usage rate;
- cost per comparison;
- percent completed with free/local providers.

## Initial validation thresholds

These are targets, not guarantees:

- valid saving >5% or AED 50 in at least 20-25% of eligible electronics comparisons;
- median valid saving >=AED 100 for high-value products;
- cheaper-route click-through >=30%;
- exact-match precision >=97%;
- p50 complete result <=8 s;
- repeat use by at least 25% of testers within two weeks.

If the product fails these thresholds, investigate whether the issue is:

- vertical choice;
- merchant coverage;
- discovery quality;
- matching accuracy;
- latency;
- weak savings frequency;
- poor UX.

Do not respond by adding unrelated features.

## User feedback prompts

After a click or dismissal:

- Was this the exact same product?
- Did the final price match?
- Did you buy from the recommended route?
- What difference mattered most?

Keep feedback optional and short.

\newpage

# Open-source strategy

## Open-source promise

The project should open the parts that create trust and contribution value:

- core schemas;
- product resolver framework;
- equivalence engine;
- total-cost engine;
- ranking logic;
- evidence manifest;
- local/direct providers;
- merchant adapter SDK;
- MCP server;
- CLI;
- fixture dataset;
- Deep Audit methodology;
- browser extension.

## Why developers would star or contribute

A successful repository must offer more than a hosted app source dump.

Developer value propositions:

- install a working local comparison engine;
- add a merchant through a documented adapter;
- call the engine through MCP or REST;
- inspect deterministic ranking logic;
- use the exact-match dataset;
- build country-specific modules;
- extend the mathematical audit engine;
- self-host without a paid scraping account for fixture/local mode.

## README structure

1. One-line promise.
2. 15-second GIF or video.
3. Screenshot of side-panel saving.
4. Quickstart.
5. Supported merchants and categories.
6. Architecture diagram.
7. MCP and CLI examples.
8. How matching works.
9. Evidence and privacy.
10. Deep Audit.
11. Adapter contribution guide.
12. Roadmap.
13. Limitations.
14. Licence.

## Quickstart target

A developer should reach a deterministic fixture comparison in under five minutes:

```bash
git clone https://github.com/Hussain800/Jacobi_mark3
cd Jacobi_mark3/backend
python -m venv .venv
# activate environment
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# second terminal
cd extension
# load unpacked extension in Chrome
```

Add a one-command fixture demo later:

```bash
make demo
```

## Contribution model

Labels:

- `good first adapter`;
- `merchant adapter`;
- `product identity`;
- `pricing rules`;
- `extension`;
- `deep audit`;
- `evidence`;
- `docs`.

Required contributor templates:

- adapter proposal;
- bug report with fixture;
- false match report;
- new category RFC;
- security report.

## Star-growth launch assets

- polished demo video;
- clear comparison with closed alternatives;
- Product Hunt/Hacker News launch only after the result is real;
- technical blog: "How we use exact identifiers and evidence to prevent fake price comparisons";
- benchmark dataset;
- MCP directory listing;
- Chrome Web Store launch;
- country/merchant contribution map;
- public roadmap and issues.

## Licence and brand

MIT can remain for broad adoption if consistent with repository goals. Consider a trademark policy for the Jacobi name and logo so forks can use the code without impersonating the official project.

\newpage

# Sustainability and optional monetisation

The primary goal is usefulness and open-source adoption, not immediate revenue. A sustainable hosted service may still be valuable.

## Open-core-compatible revenue paths

- managed Jacobi Cloud API;
- hosted comparison and evidence storage;
- managed browser/provider routing;
- scheduled watches and alerts;
- team workspaces;
- enterprise exports and audit logs;
- official retailer integrations;
- support and deployment;
- private merchant adapters;
- higher throughput and SLAs.

## Affiliate links

Affiliate revenue may be used only if:

- disclosed clearly;
- ranking is not influenced by commission;
- non-affiliate cheaper offers remain first;
- users can inspect the ranking method;
- the project has a conflict-of-interest policy.

## What not to monetise

- selling browsing histories;
- personalised advertising based on shopping data;
- hidden ranking payments;
- pay-to-win merchant placement;
- deceptive "savings" based on unverified list prices.

\newpage

# Security, legal, and policy boundaries

This section is product and engineering guidance, not legal advice.

## Allowed product posture

- user-invoked comparison;
- public product pages;
- official merchant APIs and catalog feeds;
- authorised partnerships;
- local extraction from the user's active page;
- evidence capture proportionate to the comparison;
- user handoff to complete purchase.

## Prohibited or de-scoped posture

- account takeover or credential automation;
- CAPTCHA bypass;
- queue evasion;
- fingerprint spoofing marketed as a purchasing feature;
- automated checkout on restricted routes;
- hidden data collection across unrelated pages;
- raw card handling;
- misrepresenting regional eligibility;
- suggesting illegal tax/duty avoidance.

## Platform terms

Merchant adapters should include a policy record describing:

- allowed mode;
- evidence-only mode;
- official route availability;
- manual handoff requirement;
- reviewed date;
- source.

Unknown routes default to conservative behaviour for action automation. Comparison and evidence collection should still be reviewed per source.

## Chrome Web Store

The extension must:

- declare one clear purpose;
- use minimum permissions;
- provide privacy disclosures;
- explain necessary data use;
- avoid unrelated profiling;
- ensure the package behaviour matches disclosures.[^chrome-policy]

## User-generated corrections

Users should be able to report:

- wrong model;
- wrong price;
- expired offer;
- wrong warranty;
- seller issue;
- shipping mismatch.

Corrections should create a new evidence version rather than silently changing an old manifest.

\newpage

# Roadmap and implementation plan

## Phase 0: today - product lock and branch setup

**Goal:** begin immediately without a full rewrite.

Tasks:

1. Create branch: `pivot/price-optimization-mvp`.
2. Add this PDR to `docs/`.
3. Freeze the old extension path except for critical fixes.
4. Create `backend/jacobi_core/` package.
5. Define first Pydantic schemas.
6. Add a fixture product and two fixture merchants.
7. Implement `POST /api/v1/compare` returning deterministic fixture data.
8. Convert extension action to open a side panel.
9. Display fixture saving end to end.

**End-of-day acceptance criterion:**

> On a local fixture product page, clicking Jacobi opens a side panel that shows a verified saving from the new `/api/v1/compare` endpoint.

## Phase 1: days 1-3 - exact product identity spine

Tasks:

- implement local JSON-LD extraction;
- implement electronics title/model parser;
- define `ProductIdentity`;
- define exact-match rules;
- create 30 labelled product pairs;
- build current-offer normaliser;
- add first real merchant adapter;
- render `save`, `already_best`, and `insufficient_evidence` states.

Acceptance criteria:

- exact model extracted on 10 test pages;
- fixture identity precision >=95%;
- side panel displays model and variant;
- no PDF or chat required.

## Phase 2: days 4-7 - live multi-merchant MVP

Tasks:

- implement 3-5 merchant adapters;
- add async discovery fan-out;
- add all-in total model;
- add equivalence classification;
- add ranking;
- persist comparison runs;
- add evidence manifest links;
- add latency/error telemetry;
- test 30-50 real product pages.

Acceptance criteria:

- at least three merchants work end to end;
- comparison completes p50 <10 s;
- exact-match precision >=95% internal;
- real saving can be opened from side panel;
- adapter failure returns partial result.

## Phase 3: weeks 2-3 - trust and open-source readiness

Tasks:

- expand golden dataset to 100 pairs;
- reach >=97% precision;
- improve permission model;
- write privacy and safe-use docs;
- add CLI;
- add MCP comparison tools;
- add adapter SDK and template;
- add screenshots and demo video;
- improve web landing page;
- create mismatch-report flow;
- benchmark local versus managed providers.

Acceptance criteria:

- deterministic local demo;
- documented adapter contribution path;
- MCP tool works with fixture and live supported page;
- no secrets required for fixture mode;
- release candidate passes privacy review.

## Phase 4: month 2 - public beta

Tasks:

- Chrome Web Store submission;
- public GitHub launch;
- expand UAE merchant coverage;
- watchlist beta;
- user feedback loop;
- correction/version workflow;
- historical observation storage;
- production adapter health dashboard.

Go/no-go metrics:

- false headline-saving rate <2%;
- user-reported exact-match errors <3%;
- p95 latency <15 s;
- meaningful saving found in >=20% of eligible comparisons;
- cheaper-route CTR >=30%.

## Phase 5: months 3-4 - differentiation

Tasks:

- cross-border landed-cost module;
- warranty-region rules;
- payment-fee model;
- official-store integration framework;
- Deep Audit side-panel entry;
- multi-output Jacobian research;
- remote MCP server;
- community adapters.

## Phase 6: months 5-6 - category expansion

Select one based on evidence:

- travel/hotels;
- SaaS subscriptions;
- refurbished electronics;
- broader high-value retail.

Do not choose based only on market size. Choose based on observed savings, matching feasibility, user demand, and legal/technical access.

\newpage

# Detailed first-week engineering backlog

## Epic A: new core schemas

### A1 - `ProductIdentity`

- Pydantic model;
- JSON schema export;
- unit tests;
- variant normalisation.

### A2 - `OfferObservation`

- pricing components;
- seller;
- condition;
- warranty;
- stock;
- evidence reference.

### A3 - `OptimizationResult`

- status enum;
- savings;
- reason codes;
- candidate groups;
- evidence reference.

## Epic B: extension side panel

### B1 - manifest migration

- add `sidePanel` permission;
- remove broad permissions not needed;
- add optional supported-domain permissions;
- update description and commands.

### B2 - side panel shell

- loading state;
- result state;
- error state;
- offer cards;
- details expansion.

### B3 - product context extractor

- JSON-LD;
- metadata;
- merchant-specific selectors;
- current price;
- model and variant.

## Epic C: comparison API

### C1 - endpoint and fixture

- `POST /api/v1/compare`;
- deterministic fixture result;
- contract test.

### C2 - orchestrator

- timeouts;
- async fan-out;
- partial results;
- logging.

## Epic D: identity and equivalence

### D1 - electronics normaliser

- remove marketing tokens;
- model regexes;
- storage and colour parsing;
- brand aliases.

### D2 - equivalence engine

- exact rules;
- hard rejects;
- trade-offs;
- explanation.

## Epic E: first adapters

### E1 - adapter base

- interface;
- capability declaration;
- fixture loader;
- health state.

### E2-E5 - merchant adapters

One issue per merchant, each with fixture tests and known limitations.

## Epic F: price and ranking

### F1 - total-cost engine

- guaranteed total;
- conditional discounts;
- unknown components.

### F2 - ranker

- eligibility filtering;
- total ordering;
- tie-breaker;
- result builder.

## Epic G: evidence and persistence

### G1 - comparison manifest

Extend existing manifest with offer and ranking trace.

### G2 - database migration

Add comparison and offer tables.

## Suggested first commit sequence

1. `docs: add Jacobi price optimization pivot PDR`
2. `feat(core): add product, offer, and comparison schemas`
3. `feat(api): add fixture-backed comparison endpoint`
4. `feat(extension): add Manifest V3 side panel shell`
5. `feat(extension): extract structured product context`
6. `feat(identity): resolve electronics model and variant`
7. `feat(adapters): add adapter protocol and fixture provider`
8. `feat(pricing): add all-in total calculation and ranking`
9. `feat(evidence): extend manifest for comparison results`
10. `test(e2e): verify product page to side-panel saving flow`

\newpage

# Acceptance criteria by product surface

## Consumer extension MVP

A user can:

- install the development extension;
- visit a supported product page;
- see Jacobi recognise the exact product;
- open the side panel;
- receive at least two eligible offer comparisons;
- see current and best total prices;
- see a concrete saving or already-best result;
- inspect material trade-offs;
- open the recommended merchant;
- report a mismatch.

## Open-source developer MVP

A developer can:

- clone the repository;
- run backend locally;
- run fixture comparison without paid keys;
- load extension unpacked;
- add a merchant adapter from template;
- run tests;
- call REST endpoint;
- call MCP tool;
- inspect evidence manifest.

## Deep Audit continuity

An advanced user can:

- launch the existing audit path;
- receive controlled gradient results;
- see significance and coverage;
- view Jacobian matrix;
- receive PEI only when the attribution gate opens;
- export the report.

## Production readiness

- provider credentials are server-only;
- RLS is enabled;
- rate limits exist;
- comparison costs are bounded;
- adapter health is observable;
- privacy disclosures are complete;
- no broad unsupported scraping claim;
- unsupported pages fail honestly.

\newpage

# Risk register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Exact product mismatches | Severe user trust loss | High | Identifier-first matching, hard rejects, golden dataset |
| Merchant DOM changes | Broken coverage | High | Adapter versions, fixtures, health checks, partial results |
| Low savings frequency | Weak user retention | Medium | High-value category focus, improve merchant coverage, measure honestly |
| Slow live results | User abandonment | High | local extraction, cache, async fan-out, deadlines, partial results |
| Broad Chrome permissions | Store rejection and distrust | Medium | activeTab, optional hosts, single-purpose disclosure |
| Provider cost | Unsustainable open-source demo | Medium | local/direct first, budgets, caching, provider abstraction |
| Platform restrictions | Legal/reputational risk | Medium | policy registry, official routes, user handoff, no purchase automation |
| Affiliate conflict | Ranking distrust | Medium | disclosure, ranking independence, auditability |
| Scope creep | No shippable product | High | electronics-only MVP, explicit non-goals |
| Full rewrite failure | Months lost | High | incremental package addition, keep legacy tests |
| LLM hallucinated identity | False savings | Medium | structured IDs and rules dominate, LLM only fallback |
| Stale prices | Bad recommendation | High | TTL, revalidation, freshness display |
| Marketplace seller quality | User harm | Medium | seller-aware offers, trust and fulfilment fields |
| Cross-border duties wrong | False total | High | out of MVP until reliable module exists |
| Open-source abuse | Reputation risk | Medium | safe-use docs, no bypass modules, conservative defaults |
| Brand confusion with Phia | Weak differentiation | Medium | exact-match, all-in, evidence, open-source positioning |

\newpage

# Decision log

## Decision 1: consumer value is savings, not detection

**Chosen:** Find a cheaper exact route and quantify the saving.

**Rejected as primary:** Generic overcharge report or hidden-fee warning.

**Reason:** Users can often inspect checkout themselves; a direct saving is stronger.

## Decision 2: compete in Phia's broad category

**Chosen:** Position as an open-source competitor in AI-assisted shopping and price comparison.

**Rejected:** Pretend there is no overlap.

**Reason:** The interaction category is proven and understandable.

## Decision 3: do not build a literal Phia clone

**Chosen:** Exact-match, all-in, evidence-backed optimisation across high-value purchases.

**Rejected:** Fashion-first similar-product discovery as initial wedge.

**Reason:** Phia already has a strong fashion/resale identity; Jacobi's existing strengths are evidence, controlled pricing, and technical extensibility.

## Decision 4: preserve the OG engine

**Chosen:** Deep Audit remains an advanced mode and differentiator.

**Rejected:** Delete Jacobian, Welch, PEI, and synthetic shoppers.

**Reason:** They are valuable when used for controlled investigation, not forced into every comparison.

## Decision 5: Agentcore is infrastructure, not the heart

**Chosen:** Use Agentcore for evidence, trust, reason codes, policies, and MCP.

**Rejected:** Make the consumer product entirely about agent governance.

**Reason:** Consumers buy the saving; developers value the structured trust layer.

## Decision 6: begin building immediately

**Chosen:** Build a narrow MVP and validate through usage.

**Rejected:** Delay all development for a separate long research sprint.

**Reason:** The MVP itself can measure savings frequency, accuracy, latency, and clicks.

## Decision 7: initial wedge is UAE electronics

**Chosen:** Exact model comparison across a small merchant set.

**Rejected:** Universal shopping from day one.

**Reason:** Strong identifiers and meaningful absolute savings make the problem tractable.

\newpage

# Definition of done for the pivot MVP

The pivot MVP is done when all of the following are true:

1. A supported electronics product page is detected automatically.
2. The exact model and variant are extracted and visible.
3. The extension opens a side panel, not a chat tab.
4. At least three merchant sources can return live or recently verified offers.
5. Exact-match rules reject wrong storage, region, condition, or model variants.
6. All-in totals are calculated from observable guaranteed costs.
7. The user sees a direct saving, already-best result, or honest uncertainty.
8. The recommended route opens in one click.
9. Every result has a freshness timestamp and evidence reference.
10. Agentcore reason codes and evidence manifest support the result.
11. Deep Audit remains functional and separate.
12. Fixture mode works without paid infrastructure.
13. The repository includes adapter documentation and tests.
14. No broad unnecessary extension permissions remain.
15. The product has been tested on at least 50 real pages and a labelled 100-pair dataset.
16. False headline savings are below the release threshold.
17. The README explains the promise in one sentence and demonstrates it immediately.

\newpage

# Appendix A: Example end-to-end result

## Input

Current page:

```text
Merchant: Retailer A
Product: Sony WH-1000XM6 Wireless Headphones - Black
Model: WH-1000XM6/B
Price: AED 1,699
Shipping: Free
Condition: New
Warranty: UAE 1 year
```

## Candidate observations

| Merchant | Model | Item | Shipping | Total | Condition | Warranty | Classification |
|---|---|---:|---:|---:|---|---|---|
| Retailer A | WH-1000XM6/B | 1,699 | 0 | 1,699 | New | UAE 1 year | Current |
| Sony UAE | WH-1000XM6/B | 1,499 | 0 | 1,499 | New | UAE 1 year | Exact eligible |
| Marketplace B | WH-1000XM6/S | 1,420 | 25 | 1,445 | New | Unknown | Reject: colour/model suffix mismatch if material |
| Seller C | WH-1000XM6/B | 1,399 | 50 | 1,449 | Refurbished | 90 days | Similar/condition trade-off |

## Output

```json
{
  "status": "save",
  "headline": "Save AED 200",
  "current_total": {"amount": 1699, "currency": "AED"},
  "best_total": {"amount": 1499, "currency": "AED"},
  "saving_percent": 11.8,
  "match_confidence": 0.99,
  "best_offer": {
    "merchant": "Sony UAE",
    "condition": "new",
    "warranty": "UAE 1 year",
    "action_url": "https://..."
  },
  "reason_codes": [
    "PRODUCT_IDENTITY_EXACT",
    "LOWER_TOTAL_FOUND",
    "OFFICIAL_ROUTE_FOUND"
  ],
  "ttl_seconds": 900
}
```

\newpage

# Appendix B: Example MCP contract

## Tool: `find_cheapest_verified_offer`

**Purpose:** Find the cheapest currently verifiable exact offer for a product under user constraints.

**Inputs:**

```yaml
source_url: string | null
product:
  brand: string | null
  model: string | null
  gtin: string | null
  variant: object
market: string
currency: string
constraints:
  condition: [new]
  local_warranty_required: true
  max_delivery_days: 5
  official_routes_only: false
```

**Returns:**

- product identity;
- current offer;
- best verified offer;
- savings;
- material trade-offs;
- confidence;
- evidence manifest ID;
- TTL;
- recommended action.

**Do not call when:**

- the user asks only for subjective product recommendations;
- no product identity can be supplied;
- purchase execution is requested;
- the requested route requires unauthorised automation.

## Tool: `deep_audit_price_context`

**Purpose:** Run the original controlled multi-context price audit.

**Returns:**

- coverage;
- controlled gradients;
- Welch statistics;
- Jacobian sensitivity matrix;
- PEI when gated open;
- evidence report.

\newpage

# Appendix C: Source and repository references

This PDR synthesises the product discussion, the current repository, and the existing Jacobi strategy documents.

## Repository sources

- Jacobi Mark 3 repository: <https://github.com/Hussain800/Jacobi_mark3>
- README: `README.md`
- Agent documentation: `docs/JACOBI_FOR_AGENTS.md`
- Agent schemas: `backend/agentcore/schemas.py`
- Mathematical engine: `backend/math_engine.py`
- Extension manifest: `extension/manifest.json`
- Extension service worker: `extension/background.js`
- Extension content script: `extension/content.js`
- Frontend dependencies: `frontend/package.json`
- Backend dependencies: `backend/requirements.txt`

## Strategy documents

- *Jacobi Mark 3 Deep Research and Redesign Master Plan*, July 2026.
- *Jacobi for Agents - Deep Research Edition*, July 2026.

## External references

- Phia product overview reported by The Verge: <https://www.theverge.com/news/656349/phoebe-gates-phia-shopping-app-extension>
- Chrome Side Panel API: <https://developer.chrome.com/docs/extensions/reference/api/sidePanel>
- Chrome Web Store privacy and minimum-permission guidance: <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>
- Model Context Protocol introduction: <https://modelcontextprotocol.io/docs/getting-started/intro>

## Notes on evidence

Market conditions, platform policies, retailer terms, extension policies, and protocol support can change. Before public launch, the team must re-check the current versions of retailer terms, Chrome Web Store policies, and MCP client compatibility.

[^repo-readme]: `README.md` in `Hussain800/Jacobi_mark3`, especially the product description, Smart 24/Pro 50 architecture, 60-100 second timing, mathematical methods, and current feature list.
[^agent-doc]: `docs/JACOBI_FOR_AGENTS.md` in `Hussain800/Jacobi_mark3`, including REST/MCP/dashboard surfaces, decision model, evidence manifest, safety boundaries, and limitations.
[^agent-schemas]: `backend/agentcore/schemas.py` in `Hussain800/Jacobi_mark3`, defining `PriceObligation`, `RouteCandidate`, `ScoreComponents`, `EvidenceManifest`, and `DecisionEnvelope`.
[^math-engine]: `backend/math_engine.py` in `Hussain800/Jacobi_mark3`, documenting the attribution-gated Jacobian and PEI design invariant.
[^extension-manifest]: `extension/manifest.json` in `Hussain800/Jacobi_mark3`, current broad host permissions and all-site content script configuration.
[^extension-background]: `extension/background.js` in `Hussain800/Jacobi_mark3`, current behaviour opening `/chat?url=` in a new browser tab.
[^extension-content]: `extension/content.js` in `Hussain800/Jacobi_mark3`, current local price detection, JSON-LD checks, Shadow DOM badge, highlighting, and dismissal logic.
[^frontend-package]: `frontend/package.json` in `Hussain800/Jacobi_mark3`, current Next.js, React, Sentry, Supabase, Three.js, Zustand, and UI dependencies.
[^backend-requirements]: `backend/requirements.txt` in `Hussain800/Jacobi_mark3`, current FastAPI, MCP, Pydantic, HTTP, parsing, numeric, report, Stripe, Supabase, and optional Playwright dependencies.
[^phia]: The Verge, "Bill Gates' daughter Phoebe launched a shopping app," describing Phia's browser-extension flow and price/similar-listing comparison: <https://www.theverge.com/news/656349/phoebe-gates-phia-shopping-app-extension>.
[^chrome-sidepanel]: Chrome for Developers, `chrome.sidePanel` API, describing persistent extension UI alongside the current page and tab-specific/user-gesture activation: <https://developer.chrome.com/docs/extensions/reference/api/sidePanel>.
[^chrome-policy]: Chrome Web Store user-data guidance, including minimum permissions, single-purpose use, disclosure, and proportionate collection: <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>.
[^mcp]: Model Context Protocol official introduction, describing MCP as an open-source standard connecting AI applications to external data, tools, and workflows: <https://modelcontextprotocol.io/docs/getting-started/intro>.
