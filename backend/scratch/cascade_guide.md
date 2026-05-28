# Jacobi Cascading Roadmap Critique & Build Guide

This document defines the cascading pipeline of 7 hyper research agents tasked with researching, building, and critiquing the new Jacobi Product Roadmap.

## Pipeline Architecture

The agents execute sequentially. Each agent reads the current state of `backend/scratch/roadmap_draft.md` (which starts as a copy of the existing `product_roadmap.md`), performs domain-specific research on the Jacobi codebase, adds its section, writes critiques of the previous sections, and then invokes the next agent in the sequence.

```
[Start] -> Agent 1 (Evasion) -> Agent 2 (Concurrency) -> Agent 3 (Econometrics) -> Agent 4 (Web3) -> Agent 5 (Integrations) -> Agent 6 (UX/UI) -> Agent 7 (Product Synth) -> [Final Synthesis]
```

---

## Agent Definitions and Instructions

### Agent 1: Evasion Architect
*   **Role**: Core Evasion & Anti-bot Resilience
*   **Task**: Research the anti-fingerprinting preload scripts in `backend/evasion/` and hardware profiles in `backend/profile_store.py`. Draft Phase 4 (Next-gen Evasion) of the roadmap (e.g., TLS/JA4 evasion, HTTP/2 frame fingerprinting, WebGL shader precision matching, behavioral noise injection). Critique the existing evasion plan in `product_roadmap.md`.
*   **Action**: Create `backend/scratch/roadmap_draft.md` by copying `product_roadmap.md` and appending your section and critique.
*   **Next Step**: Invoke Agent 2.

### Agent 2: Concurrency & Infrastructure Engineer
*   **Role**: Distributed Concurrency & Proxy Orchestration
*   **Task**: Research the AIMD semaphore in `backend/concurrency.py` and IP reputation broker in `backend/ip_broker.py`. Propose roadmap items for distributed proxy orchestration, serverless execution workers, SOCKS5 support, and geo-specific proxy routing. Critique the evasion draft from Agent 1 and the concurrency plan in the original roadmap.
*   **Action**: Read `backend/scratch/roadmap_draft.md`, append your section and critique, and save the file.
*   **Next Step**: Invoke Agent 3.

### Agent 3: Econometrician & Math Modeler
*   **Role**: Pricing Algorithms & Statistical Indicators
*   **Task**: Research the PEI formulas, Minkowski power norm power $p$, Gini coefficient, MAD dispersion, and statistical testing in `backend/pricing_engine.py`. Propose roadmap items for advanced price discrimination indicators, real-time threshold tuning, machine-learning-driven customer classification, and outlier handling. Critique the drafts of Agents 1 & 2 and the original math roadmap.
*   **Action**: Read `backend/scratch/roadmap_draft.md`, append your section and critique, and save the file.
*   **Next Step**: Invoke Agent 4.

### Agent 4: Web3 & Cryptography Architect
*   **Role**: Cryptographic Ledger & Consensus Layer
*   **Task**: Research the Solidity smart contract in `contracts/JacobiPricingLedger.sol` and the Merkle verification logic. Propose roadmap items for Layer 2 scaling (e.g., Arbitrum/Optimism), ZK-rollups for private price verification (consumer data privacy), and decentralized validator nodes. Critique the drafts of Agents 1-3 and the original ledger roadmap.
*   **Action**: Read `backend/scratch/roadmap_draft.md`, append your section and critique, and save the file.
*   **Next Step**: Invoke Agent 5.

### Agent 5: Enterprise Integration & Webhook Specialist
*   **Role**: Webhook Architecture & SSRF Defense
*   **Task**: Research the outbox migrations in `supabase/migrations/` and the webhook dispatcher in `backend/webhook_dispatcher.py` / `backend/triggerware.py`. Propose roadmap items for developer APIs, enterprise SDKs, secure webhook validation (HMAC signatures, replay protection), and DNS-level SSRF mitigation. Critique the drafts of Agents 1-4 and the original webhook roadmap.
*   **Action**: Read `backend/scratch/roadmap_draft.md`, append your section and critique, and save the file.
*   **Next Step**: Invoke Agent 6.

### Agent 6: UX/UI Design Director
*   **Role**: Frontend HUD Visualization & Extension Upgrades
*   **Task**: Research the frontend visual components (`frontend/components/GeoHeatmap.tsx`, `frontend/components/Tactical3DNetwork.tsx`, and the Chrome Extension skeleton). Propose roadmap items for 3D Tactical HUD upgrades, real-time Web Worker-driven force topology simulations, and browser-level request interceptors. Critique the drafts of Agents 1-5 and the original UI/UX roadmap.
*   **Action**: Read `backend/scratch/roadmap_draft.md`, append your section and critique, and save the file.
*   **Next Step**: Invoke Agent 7.

### Agent 7: Principal Product Consultant
*   **Role**: Roadmap Synthesizer & Product Strategist
*   **Task**: Read the entire accumulated `backend/scratch/roadmap_draft.md` with all agent sections and critiques. Perform a final synthesis, resolve conflicting critiques, format the document into a stunning, production-ready Product Roadmap, and save it back to `product_roadmap.md`.
*   **Action**: Write the final synthesized roadmap to `c:/Users/wasif/OneDrive/Desktop/aegisagent/Jacobi/product_roadmap.md` and send a final completion message to the parent agent.

---

## Invocation Parameters for the Next Agent

To invoke the next agent, call `invoke_subagent` with the following parameters:
- **TypeName**: `"RoadmapStrategist"`
- **Role**: `"[Role Name]"`
- **Prompt**: `"Read the guide at c:/Users/wasif/OneDrive/Desktop/aegisagent/Jacobi/backend/scratch/cascade_guide.md. You are Agent <N> ([Role Name]). Follow the tasks outlined in the guide, read and update c:/Users/wasif/OneDrive/Desktop/aegisagent/Jacobi/backend/scratch/roadmap_draft.md, and then invoke Agent <N+1> using the exact instructions."`
- **Workspace**: `"inherit"`
