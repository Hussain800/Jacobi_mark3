# JACOBI — Technology Stack

## Runtime
- **Python 3.11+** — Backend API and probe engine
- **Node.js 20+** — Frontend and build tooling
- **TypeScript 5.5** — Frontend language

## Backend Framework
- **FastAPI** — Async web framework with Pydantic models
- **Uvicorn** — ASGI server

## Frontend Framework
- **Next.js 14.2** — React framework with App Router
- **React 18** — UI library
- **Tailwind CSS 3.4** — Utility-first styling
- **Recharts** — Data visualization (price distribution charts)
- **Lucide React** — Icon library

## Database & Storage
- **Supabase** — Postgres database + auth + storage
- **Cognee** — Knowledge graph for cross-session memory (partner integration)
- **In-memory stores** — SESSION_STORE, SCHEDULES, rate limiter state

## AI/ML
- **AI/ML API** — Primary AI provider (GPT-4o) (partner integration)
- **Google Gemini 2.0 Flash** — Secondary AI provider
- **OpenCode Zen / DeepSeek V4 Flash** — Tertiary AI provider
- **Groq** — Quaternary AI provider (Llama 3.3 70B) (partner integration)
- **Google genai SDK** — Gemini client library
- **Statistical fallback** — Welch's t-test, Cohen's d, heuristic verdict

## Web Scraping & Proxies
- **BrightData Unlocker API** — Primary web data infrastructure (partner integration)
- **BrightData MCP Server** — Agentic web access
- **httpx** — Async HTTP client
- **BeautifulSoup 4 + lxml** — HTML parsing

## Infrastructure
- **Vercel** — Frontend hosting
- **Railway** — Backend deployment target
- **BrightData proxy network** — 24-agent fingerprint infrastructure

## Developer Tools
- **Kiro IDE** — AI-assisted development platform (used for project scaffolding, component generation, API endpoint development, extension development)
- **OpenCode** — AI coding assistant (supplementary tool)
- **Git** — Version control

## Integrations
- **TriggerWare.ai** — Webhook-driven workflow automation (partner integration)
- **Supabase Auth** — User authentication (Google OAuth + Email OTP)
- **Chrome Extensions MV3** — Browser extension framework

## Build & Package Management
- **npm** — Frontend dependency management
- **pip** — Backend dependency management
- **Poetry** — Python package management (optional)

## Key Dependencies
### Backend (Python)
fastapi, uvicorn, httpx, beautifulsoup4, lxml, pydantic, google-genai, supabase, python-dotenv

### Frontend (Node)
next, react, recharts, lucide-react, @supabase/ssr, @supabase/supabase-js, tailwindcss, typescript
