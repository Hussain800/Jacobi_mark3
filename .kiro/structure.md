# JACOBI — Repository Structure

```
jacobi/
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # API server, probe orchestration, endpoints
│   ├── gemini_analyzer.py      # Multi-provider AI analysis pipeline
│   ├── cognee_memory.py        # Cognee knowledge graph integration
│   ├── triggerware.py          # TriggerWare.ai webhook dispatch
│   ├── scheduler.py            # Recurring probe scheduler
│   ├── savings_verdict.py      # Deterministic savings computation
│   ├── supabase_client.py      # Supabase persistence layer
│   ├── brightdata_config.py    # BrightData API configuration
│   ├── pricing_engine.py       # Pricing engine infrastructure
│   ├── ip_broker.py            # IP reputation broker
│   ├── concurrency.py          # AIMD concurrency controller
│   ├── report_export.py        # PDF/CSV/JSON export router
│   ├── billing.py              # Billing logic
│   ├── auth_user.py            # User authentication
│   ├── .env                    # Local environment variables (gitignored)
│   └── .env.example            # Environment variable template
├── frontend/                   # Next.js 14 TypeScript frontend
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Landing page
│   │   ├── layout.tsx          # Root layout with Supabase Auth
│   │   ├── chat/page.tsx       # Main probe interface
│   │   ├── about/page.tsx      # About page
│   │   ├── pricing/page.tsx    # Pricing page
│   │   ├── history/page.tsx    # Probe history page
│   │   └── share/[id]/         # Shareable probe result pages
│   ├── components/             # React components
│   │   ├── dashboard.tsx       # Terminal/probe dashboard component
│   │   ├── ErrorBoundary.tsx   # React error boundary
│   │   ├── auth-button.tsx     # Supabase Auth button
│   │   ├── nav-auth.tsx        # Navigation auth component
│   │   ├── jacobi-logo.tsx     # JACOBI bracket logo
│   │   ├── MatricesCursor.tsx  # Animated background effect
│   │   └── matrix-elements.tsx # Matrix rain effect utilities
│   ├── lib/supabase/           # Supabase client libraries
│   └── package.json            # Node dependencies
├── extension/                  # Chrome Extension (MV3)
│   ├── manifest.json           # Extension manifest
│   ├── background.js           # Service worker
│   ├── content.js              # In-page price detection badge
│   ├── popup.html              # Extension popup UI
│   └── icons/                  # SVG extension icons
├── .kiro/                      # Kiro IDE development artifacts
│   ├── product.md              # Product overview
│   ├── structure.md            # Repository structure
│   └── tech.md                 # Technology stack
├── README.md                   # Project documentation
├── KIRO.md                     # Kiro usage documentation
├── AGENTS.md                   # Development agent instructions
└── supabase/                   # Supabase configuration
    └── migrations/             # Database migrations
```

## Architectural Conventions
- Backend: FastAPI async handlers, Pydantic models, httpx for HTTP calls
- Frontend: Next.js 14 App Router, React Server Components where possible, "use client" for interactivity
- Auth: Supabase Auth (Google OAuth + Email OTP) with session management
- AI: Provider cascade pattern — try first, fall through on failure
- Memory: Fire-and-forget integration patterns for partner services
- Probes: 3-wave staggered parallelism with per-agent timeout and automatic retry
