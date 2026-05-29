# Claude Design — JACOBI prototype import

Static HTML/CSS/JS prototype produced by Claude Design before token exhaustion.
Imported here verbatim so it can be viewed, referenced, and progressively
ported into the live Next.js cockpit at `frontend/`.

## Why a separate directory (not a frontend swap)

The Claude Design output is **static HTML** — five hand-authored pages,
shared CSS, plain JS modules. It does not speak to the FastAPI backend,
does not have routing, auth, Stripe, share links, history, exports, demo
mode, or any of the live product behavior. A literal "rip out `frontend/`
and drop these files in" would break:

- `/api/probe` → `/api/result` → `/api/analyze` polling
- Supabase auth flow (`@supabase/ssr`)
- Stripe checkout + customer portal
- `/share/{session_id}` server-rendered shared reports
- `localStorage` history + bookmarks
- `/leaderboard` server-fetched data

So this directory holds the design **as a reference / staging surface**.
Pick patterns out of it and port them into `frontend/components/landing/`
and `frontend/components/cockpit/` incrementally.

## How to view

Two ways:

### Option A — open directly
```powershell
start "C:\Hussain new\JACOBI CLEAN\Jacobi\claude-design\index.html"
```
Some browsers block fetch/XHR from `file://` so JS modules may silently
fail. Use Option B for full fidelity.

### Option B — serve over HTTP (recommended)
```powershell
cd "C:\Hussain new\JACOBI CLEAN\Jacobi\claude-design"
python -m http.server 4500
# then open http://localhost:4500
```
Default port `4500` avoids clashing with `frontend/` on `:3000` or the
backend on `:8000`.

## File map

| Path | Purpose |
|---|---|
| `index.html`            | Landing (hero, mechanism, evidence, CTA, footer) |
| `probe.html`            | Probe cockpit (idle → deploy → result) |
| `board.html`            | Leaderboard equivalent |
| `history.html`          | Probe history list |
| `pricing.html`          | Pricing (Free / Pro) |
| `forensic-export.html`  | Detailed forensic report export view |
| `assets/jacobi.css`     | All styling (52 KB) — single source of truth for the design language |
| `assets/landing.js`     | Landing-page interactions (typed text, reveal-on-scroll, counter) |
| `assets/probe.js`       | Probe cockpit state machine + agent stage |
| `assets/chrome.js`      | Global nav + shared chrome |
| `assets/scene.js`       | Shared scene/animation primitives |
| `assets/effects.js`     | Effect helpers (reveal, parallax-lite, etc.) |
| `assets/globe.js`       | Globe visualization (probably for the deployment map) |
| `screenshots/`          | Designer reference shots — what each surface should look like |
| `uploads/`              | Briefs + analysis PDFs the designer was working from |

## Design language at a glance

(Notes from a quick read of `index.html` + `probe.html` + `assets/jacobi.css`.)

- **Type**: serif accent words (likely Instrument Serif) inside a mono/sans body. Italic emphasis on key phrases via `.cobalt-i` and `.hero-accent`.
- **Color**: cobalt-blue accent (different from our `signal` green). `signal/overcharge/warning` semantic colors used sparingly.
- **Hero headline**: `"Your browser is a bargaining tool"` — different copy direction from our `"Run one URL through 24 versions of you"`.
- **Probe input**: labeled `probe-instrument` / `pi-row` — has a `pi-meta` glyph (`⌖`) inline with the URL field. Reads as a precision instrument bar.
- **Counter**: animated number ticker on the hero chip (`data-count="1247892"` — probes-run counter).
- **Typed text**: `<span id="typed">` driven by `landing.js` — typewriter-style copy reveal.
- **Reveal-on-scroll**: `data-reveal` attribute pattern with IntersectionObserver.

## Recommended next steps

When you decide to port into the Next.js app:

1. **Read `assets/jacobi.css` first** — that's the design system. Map the
   CSS custom properties (`--cobalt`, `--ink`, etc.) onto our Tailwind
   tokens in `frontend/tailwind.config.js`.
2. **Port surface-by-surface**, not all at once:
   1. Landing hero → `frontend/components/landing/HeroScene.tsx`
   2. Probe cockpit → `frontend/components/cockpit/RadialAgentStage.tsx` + `EmptyState.tsx`
   3. History → `frontend/app/history/page.tsx`
   4. Pricing → `frontend/app/pricing/page.tsx`
   5. Leaderboard → `frontend/app/leaderboard/page.tsx`
   6. Forensic export → could become a new `/share/[id]` style template
3. **Preserve all live behavior** — every API call, auth flow, localStorage
   key, share link path must keep working through every port step.
4. **Build after every surface**: `cd frontend && npm run build`. Don't
   batch ports without verifying.

## What this branch contains

This is `design/claude-design-prototype`, branched from the current head
of `feat/frontend-redesign-v2`. Everything else (Next.js frontend,
FastAPI backend, Docker, CI, etc.) is **unchanged** from v2. Only this
`claude-design/` directory is new.
