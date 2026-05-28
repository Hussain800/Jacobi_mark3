# Claude Session Handoff — JACOBI Frontend Redesign

> **Start here.** Read this in full before touching code. The previous session is closing because its context window is exhausted; everything below is the carry-over you need.

---

## 1 · Repo path

```
C:\Hussain new\JACOBI CLEAN\Jacobi
```

That is the cloned repo (the actual project root). `C:\Hussain new\JACOBI CLEAN` is the parent workspace folder — nothing reads from there. There is also a `CLAUDE_REDESIGN_HANDOFF.md` from before Phase 1 — that one is **older** and partially superseded by this file. Cross-reference but trust this one first.

---

## 2 · Current branch

```
feat/frontend-redesign
```

Tracks `origin/feat/frontend-redesign`. Branched off `main` at `88a909a` (which is the merge commit for PR #20 that landed the Stripe billing work). Four commits ahead of main.

---

## 3 · Project goal

We are rebuilding the JACOBI frontend into a **breathtaking premium product experience**. Tools at our disposal in this session:

- **Claude Code** — primary driver
- **UI/UX Pro Max skill** — installed at `~/.claude/skills/ui-ux-pro-max-skill/` (loads as the `ui-ux-pro-max` skill). 67 styles, 96 palettes, 57 font pairings, shadcn MCP. Use it for design quality checks, palette/typography lookups, and structured "plan / build / review" passes.
- **21st.dev Magic MCP** — registered in `~/.claude.json` under `mcpServers.magic`. Provides 4 deferred tools:
  - `mcp__magic__21st_magic_component_inspiration` — find reference components by description
  - `mcp__magic__21st_magic_component_builder` — generate a fresh component spec
  - `mcp__magic__21st_magic_component_refiner` — improve an existing component
  - `mcp__magic__logo_search` — logo lookup

  Load schemas via `ToolSearch` before calling. These were available last session and should be available this session (if a system-reminder lists them as deferred tools, that confirms it).
- **Framer Motion v12.40.0** — installed in `frontend/`, used for all the new motion work. Not installed anywhere else.

Goal restated: shippable to real customers, hackathon-winning visual quality, distinct enough to be memorable.

---

## 4 · Design direction (anti-slop contract)

**Luxury forensic pricing probe interface.** A precision instrument, not a chatbot.

The vibe is Apple product reveal + Bloomberg terminal discipline + investigative evidence board. Restrained, spacious, cinematic.

**Forbidden patterns** (rejected by the user multiple times — do not regress):

- Generic SaaS landing pages (gradient cards, "AI-powered insights", "magic ✨" sprinkles, bento grids for the sake of bento)
- Cyberpunk Matrix slop (rain text, neon scanlines, glitch effects)
- Glassmorphism AI-dashboard look (translucent rounded-2xl panels stacked everywhere)
- Random gradient blurs as decoration
- Vague hero copy ("Unlock the future of...", "AI-powered" anything)
- Visual clutter — every element must earn its place

**Color discipline** (strict semantic usage):
- `signal` (#00d97a, electric green) — LIVE state, positive outcomes, baseline, primary action only
- `overcharge` (#ff5d6c, rose) — discrimination, hidden premium, dearest profile only
- `warning` (#d4a040, amber) — demo mode, soft caution only
- `primary` / `secondary` / `muted` — text only
- `ink` / `raised` / `line` — backgrounds and hairlines

---

## 5 · Product concept

JACOBI is a **24-agent adversarial pricing probe**. The user pastes one URL. JACOBI deploys 24 synthetic shoppers across five axes (location, device, cookies, referrer, network tier) and reports whether the same URL serves different prices to different identities.

Hero one-liner that has landed well: **"Run one URL through 24 versions of you."**

Sample probe data the redesign uses for demos: **UA182 / JFK → LHR**. 5 representative prices: $498 (Iowa, signal-green = cheapest baseline), $640 (Manhattan iPhone, overcharge-rose = dearest), $590 / $585 / $620 (neutral). Spread = **+$142**. Tagline: **"Same flight. Same seat. Different identity."**

---

## 6 · Current completed work

Branch `feat/frontend-redesign` carries 7 commits on top of `main`:

```
89bfe90  fix(probe): trim duplicate cockpit nav, defer to global layout
39887fa  feat(probe): redesign chat into pricing probe cockpit
b984e29  feat(landing): refine immersive pricing probe hero
86b308a  feat(landing): add immersive agent deployment hero  (handoff doc only)
cdeec24  feat(landing): Phase 1.5 — cinematic hero scene
65ab7ad  feat(landing): luxury forensic redesign — Phase 1
59772e0  chore(frontend): add framer-motion + redesign handoff doc
```

**Phase 1** (`65ab7ad`):
- Added 9 new semantic Tailwind tokens **alongside** existing `surface`/`neon`/`accent` (additive only, zero renames). Note: `base` was renamed to `ink` to avoid colliding with Tailwind's built-in `text-base` font-size utility — see `tailwind.config.js`.
- Rebuilt `app/page.tsx` as a luxury-forensic landing: URL input hero, mechanism section, agent swarm grid, evidence sample probe, CTA, footer.
- No old components deleted. Old `Tactical3DNetwork`, `MatricesCursor`, `DotMatrix`, `matrix-elements`, `ScrollReveal`, `TacticalCard` still on disk — just not imported from the new landing.
- Framer Motion entrance animations only; respects `useReducedMotion()`.

**Phase 1.5** (`cdeec24`):
- The user's feedback after Phase 1: "too static, template-like." So the hero became a **self-driving cinematic**.
- New: `frontend/components/landing/HeroScene.tsx` — a 4-phase state machine (`idle → focus → deploy → result`) that auto-advances over ~5.4 s on mount and freezes on the verdict.
  - **idle (0.0 s)**: 24 dim circular nodes resting in a flattened halo around the URL input
  - **focus (1.4 s)**: input picks up a soft signal-green outer glow; nodes brighten ambient
  - **deploy (2.8 s)**: nodes fan outward into 5 axis clusters (Location · Device · Cookies · Referrer · Controls); thin SVG strands draw from center to each node with `pathLength` 0→1 staggered 28 ms/agent; axis labels fade in beyond cluster anchors
  - **result (5.4 s)**: 5 representative nodes morph circle → price pill via Framer Motion `layout` ($498 signal, $640 overcharge, three neutrals); serif `+$142 hidden premium` verdict slides in below the stage with "Same flight. Same seat. Different identity."
- Updated `frontend/app/page.tsx` to import `<HeroScene />` and dropped the old hero JSX + the standalone "swarm grid" section. Mechanism, Evidence, CTA, Footer preserved.
- Position math is a single source of truth (`idlePos(i)` + `deployPos(a)`) driven by `useLayoutEffect` + `ResizeObserver`. SVG and nodes share the same coords so they stay aligned at any viewport.
- Mobile responsive: cluster radius scales with viewport; verdict centers below stage on `<sm`, drops to the right on `≥sm`.
- `useReducedMotion()` → jumps straight to result state.
- Build verified clean. Landing first-load JS: 48.5 kB.

**Phase 2** (`b984e29`):
- Refined immersive pricing-probe hero. Verdict bracket moved inside the stage between cheapest ($498 IOWA, far-left tangent of Location cluster) and dearest ($640 NYC, far-right tangent) endpoint pills. Strands recolor on result (signal-green for cheapest, overcharge-rose for dearest, others dim). Pre-clustered idle posture (no flattened halo). Cluster-staggered deploy (Location → Device → Cookies → Referrer → Controls). Strand origin at bottom edge of URL input rather than stage center. Replaced pulsing-dot eyebrow with static `JACOBI · pricing forensics` masthead. Replaced "Try sample →" with a Replay-scene chip that appears only at `result`. Endpoint pills sized 1.5× the neutrals with a subtle scale punch on land. CTA softened during cinematic via Framer filter.
- `frontend/app/page.tsx` trimmed: dropped `useRef`/`heroRef` scroll-into-view; CTA now focuses `#jacobi-probe-input` directly. Evidence-section verdict de-emphasised so it supports the hero bracket rather than competing.

**Phase 3** (`39887fa` + `89bfe90`):
- Split `dashboard.tsx` (924 → ~370 lines) into a thin orchestration shell that imports a new `frontend/components/cockpit/` module.
- New cockpit components (9 files):
  - `types.ts` — single source for `TopologyReport`/`Agent`/`Gradient`, `DEMO_REPORT`, `SAMPLES`, `INDEX_TO_AXIS`, helpers (`extractUrl`/`fmtDelta`/`buildHistogram`/`buildNetworkData`/`exportJSON`/`exportCSV`/`deriveScanPhase`/`cheapestProfile`/`dearestProfile`/`profileSummary`/`topologyHeadline`/`topologyClassColor`).
  - `RadialAgentStage.tsx` — 24 nodes in 5 axis clusters (same vocabulary as `HeroScene`). Wave-driven deploy from real `successful_agents` count. On `isComplete`, the cheapest agent's strand turns signal-green + thickens; the dearest's turns overcharge-rose + thickens; others dim. Clickable nodes open `AgentDetailDrawer`.
  - `AgentDetailDrawer.tsx` — right-side inspector that slides in on click. Bottom-sheet on mobile. Replaces the old centered modal.
  - `ScanTimeline.tsx` — horizontal phase indicator: `queued → deploying → collecting → analyzing → verdict`. Active phase signal-green and pulses. Completed phases filled-dim. Progressive line fill between dots.
  - `ProbeHeader.tsx` — slim status strip (target URL, status pill, demo toggle, cancel). Trimmed in `89bfe90` to NOT duplicate the global nav from `app/layout.tsx` (which already provides JACOBI/Probe/History/Pricing/auth on every page).
  - `VerdictPanel.tsx` — cinematic result reveal: serif headline (`gemini.plain_english_summary` or `topologyHeadline`) → spread numeral → cheapest-identity card → action items.
  - `Evidence.tsx` — restyled price-impact bars, variable comparison table, network fingerprint area chart, price histogram, agent roster (collapsible), exports/share/bookmark ribbon.
  - `Leaderboard.tsx` — restyled.
  - `EmptyState.tsx` — empty-cockpit command core matching landing aesthetic + sample chips + leaderboard.
- `dashboard.tsx` still owns `Terminal` default export, runProbe flow (POST `/api/probe` → 1s poll `/api/result` → POST `/api/analyze`), demo mode (`useCache` + `/api/analyze-demo`), cancel, retry, `probe-conversations` localStorage write, Supabase auth display, `initialUrl` auto-run (600ms), `initialSession` restore, and a leaner `ResultCard` that composes the cockpit pieces. Still exports `ResultCard` (named, consumed by `frontend/app/share/[id]/share-client.tsx`) and `TopologyReport` (type, consumed by `frontend/app/share/[id]/page.tsx`).
- Visual language fully migrated to the Phase-1 tokens: `bg-ink`, `bg-raised`, `border-line`, `text-primary/secondary/muted`, `signal`/`overcharge`/`warning`. Killed the `cx()` helper (glassmorphism wrappers), `FloatingOrbs`, and `DotMatrix` background on `/chat`.
- Build verified clean: `/chat` 1.54 kB / 312 kB FLJ; `/share/[id]` 280 B / 311 kB FLJ; `/` 6.93 kB / 146 kB FLJ.

**Known issue at end of Phase 3**: user reports `/chat` rendering unstyled in dev mode despite clean `next build`. Diagnosis: dev-server process is in a broken state (HTML serves but CSS chunks don't). Production output verified — 44 KB CSS chunk at `.next/static/css/*.css`. Recovery: see the "dev server cure" section.

**What hasn't started yet** (Phase 4+):
- Restyling `/history` / `/share/[id]` / `/pricing` pages to match the new cockpit/landing system
- Migrating the global nav in `app/layout.tsx:25-44` from `bg-surface`/`text-white`/`bg-[#07080c]` to the new token system (`bg-ink`/`text-primary`/`border-line`)
- Deleting `Tactical3DNetwork`, `MatricesCursor`, `DotMatrix`, `matrix-elements`, `ScrollReveal`, `TacticalCard`, `GeoHeatmap`, `jacobi-logo` — now fully unreferenced
- Migrating any remaining `text-neon` callsites to the new `signal`/`primary` tokens
- Code-split `Evidence.tsx`'s recharts modules behind a result event to drop `/chat` initial FLJ
- Single persistent radial stage that morphs from live-deploy → result-with-endpoints in place (instead of two separate stages stacked)
- Mobile cockpit hand-testing (drawer-becomes-bottom-sheet at <sm, cluster geometry under 400px width)

---

## 7 · Files recently touched

### Created in Phase 1.5
- `frontend/components/landing/HeroScene.tsx` (605 lines — the cinematic)
- `CLAUDE_SESSION_HANDOFF.md` (this file)

### Modified in Phase 1 / 1.5
- `frontend/app/page.tsx` — landing composition; now imports `HeroScene`
- `frontend/tailwind.config.js` — added semantic tokens (`ink`, `raised`, `line`, `primary`, `secondary`, `muted`, `signal`, `overcharge`, `warning`); existing tokens preserved
- `frontend/package.json` — added `framer-motion ^12.40.0`
- `frontend/package-lock.json` — regenerated for framer-motion
- `CLAUDE_REDESIGN_HANDOFF.md` — original Phase 1 handoff (older, still on disk for reference)

### Touched in the merged Stripe work (now on `main`, do not redo)
- `backend/{auth_user,billing,profile_store,stripe_client}.py`
- `frontend/app/{billing/success,pricing}/page.tsx`
- `frontend/components/nav-auth.tsx`
- `frontend/lib/billing.ts`

### Critically NOT touched in Phase 1 or 1.5 (and must stay untouched without explicit user approval)
- `frontend/components/dashboard.tsx` (924 lines — the cockpit)
- `frontend/app/chat/page.tsx`, `frontend/app/history/page.tsx`, `frontend/app/share/[id]/*`
- All backend code
- Auth, Stripe surfaces beyond what was already shipped
- `frontend/app/globals.css` (keyframes preserved)

---

## 8 · Exact current git state (as of handoff)

```
$ git status
On branch feat/frontend-redesign
Your branch is up to date with 'origin/feat/frontend-redesign'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.pr-body.md

nothing added to commit but untracked files present (use "git add" to track)
```

```
$ git log --oneline --decorate -8
cdeec24 (HEAD -> feat/frontend-redesign, origin/feat/frontend-redesign) feat(landing): Phase 1.5 — cinematic hero scene
65ab7ad feat(landing): luxury forensic redesign — Phase 1
59772e0 chore(frontend): add framer-motion + redesign handoff doc
88a909a (origin/main, origin/HEAD, main) Merge pull request #20 from RaySam07/feat/stripe-billing
ec14d6d (origin/feat/stripe-billing, feat/stripe-billing) feat(billing): make PRO badge in nav one-click open Stripe Portal
b28aff1 feat(billing): self-healing /api/billing/sync — works without webhooks
e3aa79f fix(billing): handle missing supabase package + harden error paths
56586d1 fix(billing): defer env reads until after dotenv loads
```

```
$ git diff --stat
(empty — working tree clean)
```

Note: `.pr-body.md` at the repo root is a leftover helper from the Stripe PR. It is NOT tracked and should NOT be committed unless explicitly asked.

---

## 9 · Behavior that must be preserved (do not regress)

These are sacred — the visual redesign rides on top of them:

- **URL input on landing** routes to `/chat?url=<encoded URL>` via `router.push`. Bare hostnames (no protocol) get `https://` prefixed before encoding.
- **`/chat?url=...` auto-run** — `dashboard.tsx`'s `Terminal` component takes `initialUrl` from the search param and auto-runs the probe after 600 ms. Do not touch this orchestration.
- **Backend API contract** — every endpoint and payload shape is fixed. The frontend renders results; it does not own the math.
- **Probe polling** — POST `/api/probe` → 1 s poll `GET /api/result/{id}` → POST `/api/analyze` for verdict → 3-min timeout. Lives in `dashboard.tsx::runProbe()`.
- **Demo mode** (`useCache` toggle) — uses `GET /api/analyze-demo` and fake-wave reveal. Keep working.
- **AgentGrid** — the live 24-cell visualization on `/chat`. Animation upgrades fine; data contract fixed.
- **ResultCard** — exported from `dashboard.tsx`, also consumed by `frontend/app/share/[id]/share-client.tsx`. The exported name `ResultCard` must remain stable (or aliased).
- **Auth (Supabase)** — `lib/supabase/client.ts`, `nav-auth.tsx`, `auth-button.tsx`. PRO badge → Stripe Customer Portal. Sign-out clears session.
- **Share / Export / Bookmark / History** — `${origin}/share/{session_id}` clipboard link; client-side `exportJSON/exportCSV` plus Pro-gated `/api/export/{id}/{json|csv|pdf}`; localStorage keys `probe-conversations` and `jacobi-bookmarks`; `GET /api/history`.
- **Leaderboard** — `GET /api/leaderboard`.
- **All Stripe surfaces** — `/pricing`, `/billing/{success,cancel}`, the PRO badge → portal. **Untouched on this branch.**
- **No deletes** — `Tactical3DNetwork`, `MatricesCursor`, `DotMatrix`, `matrix-elements`, `ScrollReveal`, `TacticalCard`, `GeoHeatmap`, `jacobi-logo` all remain on disk. The redesign stopped importing them where appropriate; deletion is a separate later decision.

---

## 10 · Next recommended step for the new session

1. **Read this entire file** before any tool call.
2. Read `CLAUDE_REDESIGN_HANDOFF.md` (older, lower-priority context).
3. **Inspect, don't edit yet**: open `frontend/app/page.tsx` and `frontend/components/landing/HeroScene.tsx`. Understand the 4-phase state machine, the position math, the SVG strand layer.
4. Run `cd frontend && npx next build` to confirm green from a fresh checkout. (Stale dev servers are the #1 cause of weirdness here — see the "dev server cure" sequence below.)
5. **Critique Phase 1.5** before proposing changes. What feels Apple-restrained? What's still template-like? Where does the cinematic land too long or feel anti-climactic? Surface these in a written assessment for the user before touching files.
6. Only after that assessment is read and approved: propose Phase 2 scope. Likely candidates the user has discussed:
   - Add subtle interactivity to the hero (input focus → nodes accelerate? hover a node → it pulses?)
   - Refine cluster geometry / staggers
   - Move on to redesigning `/chat` (the cockpit) — explicitly requires user approval to begin
   - Restyle `/history`, `/share/[id]`, `/pricing` to match the new system

---

## · The "dev server cure" sequence (memorize this)

When the dev server enters a broken state — symptoms include: every static asset returns 404, the page renders unstyled, hot reload stops working, weird Webpack errors — kill it and nuke `.next`:

```powershell
# stop the dev server (Ctrl+C in its terminal, or kill the node process on port 3000)
cd "C:\Hussain new\JACOBI CLEAN\Jacobi\frontend"
Remove-Item -Recurse -Force .next
npx next dev --port 3000
```

This cures 90% of Next.js dev weirdness. Save the habit.

---

## · Reminders the user has reinforced (read carefully)

- "Do not delete API logic, auth logic, probe logic, exports, share links, history, or backend routes."
- "Do not edit backend files."
- "Do not touch dashboard.tsx unless explicitly approved."
- "Apple-style restraint and cinematic pacing."
- "Make one unforgettable scene."
- The user expects **briefed implementation plans before edits** for any non-trivial change. Don't dive in. State the approach, then act.
- After each non-trivial change: `npx next build`, one clean commit, push.

---

## · Long-term memory pointer

The user maintains `C:\Users\hussa\.claude\projects\C--Hussain-new-JACOBI-CLEAN\memory\project_jacobi.md`. It has a high-level project description. Update it if the architecture description materially changes.
