# JACOBI — Agent Mode

This project uses **oh-my-openagent (OmO)** — the ultimate OpenCode plugin. All 11 discipline agents, 54+ lifecycle hooks, built-in MCPs, and every slash command are available.

## OmO Quick Start

- Type `ultrawork` or `ulw` in any message for full multi-agent orchestration
- Type `search` for web/doc search, `analyze` for deep analysis
- Slash commands: `/start-work`, `/init-deep`, `/ralph-loop`, `/refactor`, `/handoff`, `/hyperplan`, `/remove-ai-slops`
- Sisyphus (orchestrator) → Hephaestus (deep worker) → Prometheus (planner) → all 11 agents available
- Background agents run in parallel — fire and forget

## Development commands

### Backend
```bash
cd backend
python main.py              # Start dev server on port 8000
python check_prices.py      # Test price extraction patterns
python test_currency.py     # Test INR/AED currency detection
python test_probe.py        # Run full probe pipeline
```

### Frontend
```bash
cd frontend
npm run dev                 # Start dev server on port 3000
npm run build               # Export static build to out/
```

### Environment
- Backend API keys in repo root `.env.local` or `backend/.env` (copy from `backend/.env.example`)
- Frontend API URL configurable via `NEXT_PUBLIC_API_URL` env var or `?api=` query param

## OmO Agent Usage

When working on this project, agents use category-based routing:

| Category | Model | Use for |
|----------|-------|---------|
| `visual-engineering` | Gemini 3.1 Pro | Frontend, UI/UX, design work |
| `deep` | GPT-5.5 | Autonomous research + execution |
| `quick` | GPT-5.4 Mini | Single-file changes, typos, simple edits |
| `ultrabrain` | GPT-5.5 xhigh | Hard logic, architecture decisions |
| default | Claude Opus 4.7 → Kimi K2.6 | General development |

## Skills

- `impeccable` — frontend design, redesign, critique, audit, polish. Run `/impeccable craft [feature]` or any sub-command via `.opencode/skills/impeccable/`.
