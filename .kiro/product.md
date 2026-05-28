# JACOBI — Product Overview

## Purpose
JACOBI is an adversarial pricing topology probe that detects hidden pricing discrimination on the web. It deploys 24 parallel agents, each with a unique digital fingerprint (location, device, cookie profile, referrer, network tier), against any pricing page and uses statistical analysis + AI to determine if the price varies based on who the user appears to be.

## Core Business Logic
1. User submits a URL (hotel, flight, e-commerce product page)
2. 24 probe agents launch in 3 staggered waves (datacenter → residential → mobile)
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
