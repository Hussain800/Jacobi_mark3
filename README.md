# JACOBI — Adversarial Pricing Topology Probe

24-agent pricing discrimination detection engine that reveals hidden pricing algorithms via BrightData MCP.

**Built for the BrightData × MIT Hackathon.**

## How it works

1. Submit a URL (hotel, flight, e-commerce product page)
2. JACOBI fetches pricing data via BrightData MCP with JS rendering
3. Extracts prices using polymorphic BeautifulSoup parsing + Gemini AI fallback
4. Distributes prices across 24 virtual agents with varying location, device, cookie, referrer, and network fingerprints
5. Computes statistical gradients to detect discrimination
6. Returns a topology classification: `uniform` / `selective` / `progressive` / `aggressive`

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Next.js 14 │────▶│  FastAPI     │────▶│ BrightData  │
│  (frontend) │     │  (backend)   │     │  MCP Proxy  │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────┴───────┐
                    │  Gemini 2.0  │  price validation, chat
                    │  Groq Llama  │  EU AI Act auditing
                    └──────────────┘
```

## Quick start

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Server starts at `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Server starts at `http://localhost:3000`

## API reference

| Route | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/api/probe` | POST | Launch a pricing probe |
| `/api/result/{session_id}` | GET | Get probe results |
| `/api/demo` | GET | Static demo data |
| `/api/gemini-validate` | POST | Validate extracted prices via Gemini |
| `/api/chat-assistant` | POST | Chat about probe data |
| `/api/analyze-matrix` | POST | EU AI Act audit via Groq |
| `/api/optimize-shield/{session_id}` | GET | Anti-discrimination shield config |

## Config

Copy `backend/.env.example` to `backend/.env` and set your API keys:
- `BRIGHTDATA_API_KEY` — BrightData MCP proxy
- `GROQ_API_KEY` — Groq LLM (EU AI Act auditing)
- `GEMINI_API_KEY` — Google Gemini (price validation, chat)
