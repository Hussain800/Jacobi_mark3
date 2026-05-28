# KIRO x JACOBI — Development Partnership

JACOBI is an adversarial pricing topology probe that deploys 24 parallel agents to detect price discrimination across location, device, cookie, and network dimensions. The entire project — frontend, backend, and Chrome extension — was built with **Kiro** as the primary development interface.

---

## Frontend (Next.js + TypeScript + Tailwind)

Kiro scaffolded and iterated every page and component in `frontend/`:

| Page / Component | Lines | Description |
|---|---|---|
| `app/page.tsx` | Home | Hero, interactive probe form, live topology feed |
| `app/dashboard.tsx` | 924 | Full probe dashboard with Recharts visualizations, agent grid, gradient tables, severity score |
| `app/history/page.tsx` | History | Session browser with filtering by topology class |
| `app/about/page.tsx` | About | Product narrative, methodology, team |
| `app/pricing/page.tsx` | Pricing | Tiered plan cards with Stripe checkout integration |
| `app/billing/success\|cancel/page.tsx` | Billing | Post-checkout redirect handlers |
| `app/share/[id]/page.tsx` | Share | Public shareable probe results (no auth required) |
| `app/chat/page.tsx` | Chat | Gemini-powered analysis chat overlay |
| `components/` | 12 files | Reusable UI: `JacobiLogo`, `DotMatrix`, `MatricesCursor`, `TacticalCard`, `Tactical3DNetwork`, `GeoHeatmap`, `ScrollReveal`, `ErrorBoundary`, `nav-auth`, `auth-button`, `matrix-elements` |

Kiro generated the initial Next.js app structure, wrote the full `dashboard.tsx` component (Recharts integration, real-time agent status polling, gradient heatmap), and implemented the dark-terminal design system with CSS animations and Tailwind.

---

## Backend (FastAPI + Python)

Kiro scaffolded the entire `backend/` directory and wrote every API endpoint in `main.py`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/probe` | POST | Launch 24-agent pricing probe (free/pro tier) |
| `/api/result/{session_id}` | GET | Retrieve full probe report |
| `/api/share/{session_id}` | GET | Public share link (Supabase + in-memory fallback) |
| `/api/history` | GET | Recent probe sessions (Supabase + in-memory) |
| `/api/leaderboard` | GET | Top probes by price spread |
| `/api/demo` | GET | Embedded demo result (no live probe needed) |
| `/api/analyze` | POST | Gemini analysis on completed probe |
| `/api/analyze-demo` | GET | Gemini analysis on demo data |
| `/api/schedule` | POST | **NEW** — Create recurring probe schedule |
| `/api/schedules` | GET | **NEW** — List active schedules |
| `/health` | GET | Health check with BrightData status |

Kiro also generated the supporting modules:
- `brightdata_config.py` — MCP unlocker configuration
- `gemini_analyzer.py` — Google Gemini pricing analysis
- `savings_verdict.py` — Consumer savings computation
- `supabase_client.py` — Supabase persistence layer
- `cognee_memory.py` — Memory persistence integration
- `triggerware.py` — TriggerWare.ai workflow dispatch
- `billing.py` — Stripe billing / usage tracking
- `auth_user.py` — Anonymous + Supabase auth middleware
- `scheduler.py` — **NEW** In-memory recurring probe scheduler
- `rate limiter` (inline in main.py) — Per-IP rate limiting

---

## Chrome Extension

Kiro generated the complete `extension/` directory:

| File | Description |
|---|---|
| `manifest.json` | Manifest v3 with permissions, context menus, keyboard shortcuts (Ctrl+Shift+P/L) |
| `background.js` | Service worker — context menu creation, right-click probe launch |
| `content.js` | Content script for URL extraction and page context |
| `popup.html` / `popup.js` | Popup UI for quick probe submission |
| `settings.html` / `settings.js` | Options page with API endpoint configuration |

The extension was built entirely through Kiro chat: configuration, service worker logic, content script injection, and popup UI.

---

## Specific Kiro Features Used

| Feature | Usage |
|---|---|
| **Multi-file refactoring** | Restructured `main.py` probe pipeline from monolithic to modular (separate scheduler, analyzer, billing modules). Refactored frontend from single page to multi-route app with shared components. |
| **TypeScript code generation** | All React components, Supabase client types, and Recharts visualizations. Kiro inferred the type system from usage patterns without explicit type definitions. |
| **Python code generation** | Full FastAPI application, BrightData HTTP client, price parsers (Google Flights, Expedia, generic e-commerce), gradient computation, topology classification, severity scoring. |
| **Project context awareness** | Kiro maintained awareness of the full codebase across sessions: it knew the existing agent configs, wave staggering logic, SESSION_STORE structure, and rate limiter when adding the scheduler. |
| **Chrome extension scaffolding** | Generated manifest v3, service worker, content scripts, and popup in one session from a single prompt. |
| **Inline rate limiter** | Kiro designed and implemented the per-IP `asyncio.Lock`-based rate limiter without external dependencies, understanding the single-worker uvicorn deployment model. |
| **In-memory scheduler** | Kiro designed the fire-and-forget scheduler pattern that polls every 60s and calls `run_full_probe` via `asyncio.create_task`, correctly avoiding circular imports with a runtime lazy import. |

---

## Time Saved

| Area | Manual Estimate | With Kiro | Saved |
|---|---|---|---|
| Frontend (12 components, 6 pages) | 40 hours | 8 hours | **32h** |
| Backend (10 endpoints, 8 modules) | 50 hours | 10 hours | **40h** |
| Chrome extension | 15 hours | 2 hours | **13h** |
| Debugging / iteration | 20 hours | 5 hours | **15h** |
| **Total** | **125 hours** | **25 hours** | **100h (~80%)** |

Kiro reduced development time from roughly 3-person-weeks to under 1-person-week, with particular leverage on the TypeScript frontend (Kiro's real-time preview and refactoring eliminated most debugging cycles) and the Chrome extension (a domain the developer was unfamiliar with).
