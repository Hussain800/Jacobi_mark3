# JACOBI — Product Overview

## Product surfaces

JACOBI is one repository containing three deliberately separate surfaces:

1. **JACOBI Audit** — Smart24 synthetic-buyer research for pricing topology
   and evidence-backed discrimination analysis.
2. **Enterprise Price Integrity** — authenticated organizations, watchlists,
   MAP findings, scan jobs, evidence, exports, and controlled sharing.
3. **Jacobi for Agents** — deterministic price-provenance and policy decisions
   exposed through REST, MCP, and the provenance dashboard. It does not execute
   purchases or import the legacy audit evasion tooling.

The repository is application-complete for local demos and design-partner
iteration. A private pilot remains conditional on production Supabase/RLS,
worker, provider, observability, and smoke-test verification; public paid
traffic is not implied by this document.

## Purpose

JACOBI Audit probes pricing topology with the currently supported Smart24
workflow. It uses distinct synthetic contexts and statistical analysis to
identify price variation while preserving an evidence-first rule: insufficient
coverage or an unattributed spread must not become a discrimination claim.

## Core Business Logic
1. User submits a URL (hotel, flight, e-commerce product page)
2. Smart24 probe agents launch in staggered waves using the configured
   collection path (the Enterprise product has a separate persisted scan-job
   workflow)
3. Each agent fetches the page through BrightData's Unlocker API with a distinct fingerprint
4. Prices are extracted using polymorphic parsing (JSON-LD → site-specific selectors → regex fallback)
5. Statistical gradients are computed (Welch's t-test with effect-size thresholds)
6. Pricing topology is classified: uniform → selective → progressive → aggressive
7. AI analysis generates a plain-English verdict with actionable savings recommendations
8. Results are persisted to Supabase, Cognee knowledge graph, and dispatched to TriggerWare.ai workflows

## User Goals
- Detect if they are being overcharged based on their digital profile
- Get actionable advice (use VPN, switch device, clear cookies, use direct booking)
- Share probe results with others via permanent links
- Compare pricing discrimination across different vendors
- Schedule recurring probes to track pricing changes over time

## Target Users
- Travelers booking flights/hotels (primary — most common use case)
- Online shoppers comparing prices (secondary)
- Enterprise procurement teams monitoring vendor pricing (tertiary)
- Journalists/researchers investigating pricing algorithms (niche)

## Key Differentiators
- 24-agent parallelism beats single-identity scrapers
- Statistical topology classification (not just "price is higher/lower")
- Multi-provider AI cascade (AI/ML API → Gemini → DeepSeek → Groq → fallback)
- Cross-session memory via Cognee knowledge graph
- Recurring scheduled probes via built-in scheduler
- Chrome extension for one-click probing
