# JACOBI — Frontend Redesign Handoff

> Read this in full before touching anything. The previous session set up the environment for a major frontend overhaul but did not start editing files yet.

## Working directory

- Workspace root: `C:\Hussain new\JACOBI CLEAN`
- Cloned repo (project root): `C:\Hussain new\JACOBI CLEAN\Jacobi`
- All commands assume the cloned repo as cwd unless stated otherwise.

## Goal

Full frontend redesign for **JACOBI** — the 24-agent adversarial pricing probe. The user wants a beautiful, distinctive UI that wins the BrightData × MIT hackathon AND can ship to real customers. Quality bar: "make the project so good that we're famous and people love it."

## Tooling — primary stack

- **Claude Code** is the main tool driving the redesign.
- Already installed but require a Claude Code restart to be active:
  - **UI/UX Pro Max skill** — cloned to `~/.claude/skills/ui-ux-pro-max-skill/`. After restart it should appear in the available-skills list.
  - **21st.dev Magic MCP server** — registered in `~/.claude.json` under `mcpServers.magic` (API key already wired in env). After restart its tools should surface as deferred tools and be loadable via ToolSearch.
- **Framer Motion** is installed in `frontend/` only (v12.40.0, already in `frontend/package.json` deps). Do **not** add it anywhere else.

## Current design direction

**Luxury forensic pricing probe interface.** The vibe: a precision instrument for revealing hidden algorithmic price discrimination, not a chatbot.

Anti-pattern to actively avoid: generic SaaS AI slop — i.e., bland gradient cards, "magic ✨" sprinkle, recycled landing-page tropes, vague hero copy like "Powered by AI." We are building something that looks like a forensic / instrumentation product, with the elegance of Linear/Stripe/Vercel and the gravitas of a Bloomberg terminal — not another wrapper around a chat box.

## Things that MUST be preserved (do not break these)

The redesign is visual + interaction polish. The data path and feature surfaces stay intact:

- **Backend integration** — every existing API call to the FastAPI backend must keep working. Endpoint URLs and payload shapes are fixed contracts.
- **Probe logic** — the 24-agent / 3-wave probe engine, gradients, topology classification. Frontend renders results; it does not own the math.
- **`/chat?url=...` behavior** — landing-page hero accepts a URL, navigates to `/chat?url=<encoded>`, and the chat page auto-runs a probe against that URL. Keep that handoff working.
- **API polling** — the chat page polls `GET /api/result/{session_id}` until the probe completes. Keep the polling loop and its error/timeout handling.
- **ResultCard** — the component that renders a completed probe (discrimination index, spread, gradients, scenario callouts). Visual redesign is welcome; the data it consumes is fixed.
- **AgentGrid** — the live grid showing 24 agents and their per-agent statuses (in-flight / success / detected / failed). Animation upgrades are great; structure stays.
- **Auth** — Supabase Auth via `@supabase/ssr` (Google + magic-link email). Session lives in cookies. `NavAuth` reads `supabase.auth.getUser()` + `onAuthStateChange`. Do not regress this. Sign-out clears session.
- **Share / Export / History**:
  - **Share**: copy-to-clipboard of a session URL.
  - **Export**: Pro-gated buttons call `GET /api/export/{report_id}/{json|csv|pdf}` with the Supabase JWT in `Authorization: Bearer …`.
  - **History**: `/history` reads from `localStorage` (key `jacobi-conversations`) and optionally from `GET /api/history`. Both flows must keep functioning.
- **Billing surfaces** — `/pricing`, `/billing/success`, `/billing/cancel`, the PRO badge in nav (which opens Stripe Customer Portal). Already shipped, already on `main`, do not regress.

## Next step after Claude Code restart

**Do not edit any frontend files yet.** Begin with a read-only pass:

1. Inspect the frontend tree under `Jacobi/frontend/`:
   - `app/` — App Router pages (`page.tsx` landing, `chat/`, `history/`, `pricing/`, `billing/`, `auth/`, `layout.tsx`, `globals.css`)
   - `components/` — `dashboard.tsx`, `nav-auth.tsx`, `auth-button.tsx`, `jacobi-logo.tsx`, `dot-matrix.tsx`, `matrix-elements.tsx`, `Tactical3DNetwork.tsx`, `TacticalCard.tsx`, etc.
   - `lib/` — `supabase/`, `billing.ts`
   - `tailwind.config.js`, `next.config.js`
2. Produce a **file-by-file redesign plan** before writing code. For each component / page, list:
   - What the component does today (1–2 lines)
   - What stays (data hooks, props, behavior)
   - What changes visually / interactively
   - Animation opportunities (Framer Motion)
   - Risks to the preserved-behavior list above
3. Surface that plan to the user for approval. Iterate.
4. Only after approval, begin edits — one logical chunk at a time, committing in coherent groups.

## Branch + git state

- Working branch: **`feat/frontend-redesign`** (already created off latest `main` at `88a909a` and pushed to `origin`).
- `main` is fully up to date with all auth + Stripe work (PRs #19, #20 merged).
- `.pr-body.md` at project root is a stale helper from the Stripe PR — ignore or delete.

## Context (where this redesign sits)

Two major PRs already shipped on `main`:
1. **Supabase Auth with Google** (replaced NextAuth)
2. **Stripe billing** (Free 15 probes/mo · Pro $29/mo · self-healing `/api/billing/sync` · Customer Portal from nav)

The redesign rides on top of both. Auth and billing surfaces exist and must keep working through any visual reshuffling.

## Memory file

The user maintains a long-term project memory at `C:\Users\hussa\.claude\projects\C--Hussain-new-JACOBI-CLEAN\memory\project_jacobi.md`. Update it after the redesign if the architecture description changes materially.
