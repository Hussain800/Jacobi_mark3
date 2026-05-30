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

**Active branch is now `feat/frontend-redesign-v2`** (NOT `feat/frontend-redesign`). The
v2 branch was started by the user's friends with backend audit fixes on top of the
Phase-1.5 commit, then we merged `origin/main` into it and continued from there.

`origin/main` was merged in at `f3f22c0` and carries: Docker/CI, Sentry, backend
test suite, scheduler, triggerware, supabase-client build-time fix, leaderboard
page, direct-HTTP fallback in `backend/main.py`, etc. Trust the latest `main` for
all backend behavior.

Full commit timeline on `feat/frontend-redesign-v2` (most recent first):

```
0818ebd  feat(ui): port Phase 6 swarm vocabulary into cockpit + grid surface
bd0994c  feat(landing): glowy color-tinted swarm with cursor repulsion + premium input
4b35332  feat(landing): alive hero — perpetual life, cursor halo, parallax
48f2304  feat(ui): polish probe cockpit and report surfaces
0fd0a13  Fix local frontend API fallback                 (codex)
f3f22c0  Merge remote-tracking branch 'origin/main' into feat/frontend-redesign-v2
c22ebf7  docs(handoff): record Phase 2+3 state for downstream agents
89bfe90  fix(probe): trim duplicate cockpit nav, defer to global layout
39887fa  feat(probe): redesign chat into pricing probe cockpit
b984e29  feat(landing): refine immersive pricing probe hero
769cc4c  fix(probe): add direct HTTP fallback when BrightData zone unavailable (friend)
5f61aac  Fix all remaining 24 audit bugs                 (friend, backend)
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

**Phase 4** (`48f2304`):
- Single persistent radial stage that morphs from live-deploy → result-with-endpoints in place (no more unmount/remount jank between scan and result).
- ScanTimeline collapses to a quiet "Probe complete · Xs · 22/24 agents" badge on completion.
- `Evidence.tsx` lazy-loaded via `lazy(() => import("./cockpit/Evidence"))`. Recharts only enters the bundle once a result lands. `/chat` dropped 322 → 210 kB FLJ.
- Quiet cancel state (border-line + muted icon), explained timeout state with retry, generic error state with retry.
- Full restyle of `/history` to logbook feel with per-row signal-green intensity bar, token migration. Rerun links carry `?url=` so click continues the investigation.
- Light token alignment on `/pricing`, `/leaderboard`, `/share/[id]`.
- Light token alignment on the global nav in `app/layout.tsx`.
- ShareResultClient now passes `embedStage` so the public share page renders its own agent stage.

**Phase 5** (`4b35332`):
- Landing hero made ALIVE per user feedback. The swarm no longer freezes after the cinematic — perpetual gentle rotation (every 50 ms, ~30 s/rev), per-node organic breath with individual offsets, mouse-tracked cursor halo, 2.5D parallax on cluster + strand layers.
- Curved bezier strands (organic, not straight rays).
- Depth-opacity (`0.7 + 0.3 × (1+sin)/2`) for 2.5D illusion.
- Hover responsiveness on every node + connected strand.

**Phase 6** (`bd0994c` + `0818ebd`):
- **Per-axis color palette** introduced in shared `frontend/components/cockpit/orbital.ts`: Location signal-green, Device cyan (#22d3ee), Cookies amber (#f5b945), Referrer rose (#ff5d6c), Network violet (#a78bfa). Each axis gets `core` / `glow` / `soft` rgba tones. No SaaS rainbow — every color earned by axis semantics.
- **Glowy circles**: `box-shadow: 0 0 14–32px <axis-glow>` on every node, with idle/focus/deploy/result intensities. Endpoint pills (cheapest+dearest) get 32 px shadow blast.
- **Spider-web strands**: SVG `<linearGradient>` defs, bone-white at the input origin to axis core at the node end. Hover tint to solid axis core at 1.6 px with `drop-shadow`. Brighter, web-like.
- **Cursor repulsion physics**: every node + its strand endpoint pushes away from cursor within 160 px radius via `((R−d)/R)^2.2 × 38 px`, spring-smoothed at stiffness 150 / damping 22. Strands warp with their nodes because path endpoints use the same offset.
- **Verdict layout collision fixed**: the verbose verdict block (HIDDEN PREMIUM + $142 + caption) was crashing into the headline. Now: a clean docked **horizontal verdict card** ($498 — +$142 — $640) appears ABOVE the masthead on result; in the swarm there's only a thin gradient connector between the two endpoint pills.
- **Premium input redesign**: wider/taller, animated gradient halo behind (signal→cyan→violet→rose at blur(12px), scales on focus), terminal-style corner ticks fade in on focus, bigger PROBE button with its own signal-green halo shadow.
- **Cockpit fully ported**: `frontend/components/cockpit/RadialAgentStage.tsx` and `EmptyState.tsx` now use the same vocabulary. EmptyState has an orbital backdrop (24 glowy color-tinted nodes in 5 clusters rotating slowly behind the input + sample cards).
- **Surface texture**: `globals.css` now establishes the surface with anchored radial gradients (warm-cool depth at bottom, lift at top-left) + a **forensic dot grid** (28 × 28 px, masked elliptically) + film grain at 0.035 opacity. No more flat black void.
- **Landing label collision** definitively fixed in `0818ebd`: cluster labels pushed to `anchorR + 90` so they clear the entire tangential pill fan. Pre-fix the label landed on the LDN $590 neutral pill at factor 0.
- **Landing strand-node disconnect** fixed in `0818ebd`: nodes and strands now share a single parallax magnitude (10 px both layers) instead of 12 vs 6, so circles always sit on their strand endpoints.

**Bundle state at end of Phase 6**:
- `/` 9.05 kB / 151 kB FLJ
- `/chat` 1.54 kB / 216 kB FLJ
- `/share/[id]` 307 B / 223 kB FLJ
- `/history` 3.39 kB / 142 kB FLJ
- `/pricing` 3.76 kB / 207 kB FLJ
- `/leaderboard` 181 B / 96.5 kB FLJ

**What hasn't started yet** (Phase 7+):
- Topology badge PNG export feature (was on main's old monolithic dashboard at `56a227a`, not yet ported to the cockpit `Evidence.tsx` footer)
- Mobile cockpit hand-testing at 390/430 px (drawer-becomes-bottom-sheet, radial geometry under 400 px width)
- The duplicate `<defs>` block in landing HeroScene SVG (cosmetic — browsers handle it)
- The framer-motion +41 kB on `/history` and `/pricing` could be replaced with plain CSS transitions if anyone cares
- Deleting `Tactical3DNetwork`, `MatricesCursor`, `DotMatrix`, `matrix-elements`, `ScrollReveal`, `TacticalCard`, `GeoHeatmap`, `jacobi-logo` — fully unreferenced, ~1500 lines of dead code on disk
- Migrating any remaining `text-neon` callsites to `signal`/`primary` tokens (just grep `text-neon`)
- Old `CLAUDE_REDESIGN_HANDOFF.md` from before Phase 1 is still on disk; superseded by this file

---

## 7 · Files map (as of end of Phase 6)

### Landing surface
- `frontend/app/page.tsx` — landing composition (HeroScene + Mechanism + Evidence + CTA + Footer)
- `frontend/components/landing/HeroScene.tsx` — the alive hero. Owns: 4-phase state machine, perpetual rotation, per-node breath, cursor halo, cursor repulsion, parallax (10 px unified), curved bezier strands, depth opacity, axis-colored glowy nodes, premium input with gradient halo + corner ticks, docked verdict card above masthead

### Cockpit
- `frontend/components/dashboard.tsx` — Terminal default export (orchestration + runProbe + auth + localStorage). Also exports `ResultCard` (consumed by share-client) and `TopologyReport` type.
- `frontend/components/cockpit/orbital.ts` — **shared primitives** (AXIS_COLOR, CLUSTER_ANGLE, CLUSTER_DELAY, strandPath, depthFactor, repulsionOffset). Imported by HeroScene, RadialAgentStage, EmptyState.
- `frontend/components/cockpit/types.ts` — TopologyReport / Agent / Gradient / DEMO_REPORT / SAMPLES / INDEX_TO_AXIS / helpers
- `frontend/components/cockpit/RadialAgentStage.tsx` — persistent live/result stage. mode="live"|"result" prop. Axis colors + glow + cursor halo + repulsion + spider-web strands.
- `frontend/components/cockpit/EmptyState.tsx` — empty-cockpit surface. Decorative orbital backdrop + premium input + sample case-file cards + leaderboard.
- `frontend/components/cockpit/AgentDetailDrawer.tsx` — right-side inspector (bottom sheet on mobile)
- `frontend/components/cockpit/ScanTimeline.tsx` — queued → deploying → collecting → analyzing → verdict
- `frontend/components/cockpit/ProbeHeader.tsx` — slim status strip below the global nav
- `frontend/components/cockpit/VerdictPanel.tsx` — serif headline + spread + cheapest-identity card + action items
- `frontend/components/cockpit/Evidence.tsx` — restyled bars / comparison table / network chart / histogram / agent roster / exports. Lazy-loaded in dashboard.tsx.
- `frontend/components/cockpit/Leaderboard.tsx` — uses getClientApiBase()

### Standalone pages (token-aligned to cockpit/landing)
- `frontend/app/history/page.tsx` — logbook with per-row intensity bar
- `frontend/app/pricing/page.tsx` — Stripe-untouched, only chrome migrated
- `frontend/app/leaderboard/page.tsx` — server-rendered, signal/warning/overcharge ramp
- `frontend/app/share/[id]/page.tsx` — server-rendered wrapper, banner + CTA
- `frontend/app/share/[id]/share-client.tsx` — passes `embedStage` to ResultCard
- `frontend/app/layout.tsx` — global nav lightly token-aligned

### Surface / tokens
- `frontend/app/globals.css` — body background gradients + forensic dot grid + film grain
- `frontend/tailwind.config.js` — semantic tokens (ink, raised, line, primary, secondary, muted, signal, overcharge, warning) added in Phase 1, untouched since

### Touched but stable (don't rewrite without need)
- `frontend/lib/api-base.ts` (codex's local API fallback)
- `frontend/lib/supabase/{client,server}.ts` (build-time resilience from main)
- `frontend/components/nav-auth.tsx` (auth control in global nav)
- `frontend/components/auth-button.tsx`

### Critically NOT touched
- All backend code (`backend/*`)
- All Stripe billing surfaces beyond what already shipped
- `frontend/lib/billing.ts`

### Dead code still on disk (safe to delete after grep)
- `frontend/components/Tactical3DNetwork.tsx`
- `frontend/components/MatricesCursor.tsx`
- `frontend/components/dot-matrix.tsx`
- `frontend/components/matrix-elements.tsx`
- `frontend/components/ScrollReveal.tsx`
- `frontend/components/TacticalCard.tsx`
- `frontend/components/GeoHeatmap.tsx`
- `frontend/components/jacobi-logo.tsx`

---

## 8 · Exact current git state (end of Phase 6 — user switching to Claude Design)

```
$ git branch --show-current
feat/frontend-redesign-v2

$ git rev-list --left-right --count origin/feat/frontend-redesign-v2...HEAD
0	0          # fully in sync with remote — pushed

$ git status --short
?? .omo/           # agent runtime metadata — DO NOT commit
?? .pr-body.md     # leftover Stripe PR helper — DO NOT commit

$ git log --oneline -10
0818ebd feat(ui): port Phase 6 swarm vocabulary into cockpit + grid surface
bd0994c feat(landing): glowy color-tinted swarm with cursor repulsion + premium input
4b35332 feat(landing): alive hero — perpetual life, cursor halo, parallax
48f2304 feat(ui): polish probe cockpit and report surfaces
0fd0a13 Fix local frontend API fallback
f3f22c0 Merge remote-tracking branch 'origin/main' into feat/frontend-redesign-v2
9762c43 Merge: keep __main__ entry point fix
a5f34dd Fix: add missing __main__ entry point for uvicorn
b99c9d4 Production readiness: Docker, CI, Sentry, logging, test suite
769cc4c fix(probe): add direct HTTP fallback when BrightData zone unavailable
```

GitHub: `https://github.com/RaySam07/Jacobi` — branch `feat/frontend-redesign-v2`
already pushed and up to date.

Production server: started via `npm run start` in `frontend/`, serves on port 3000.
Current `.next/static/css/*.css` chunk hash: `5d56cb7382435918.css` (post-Phase-6).

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

## 10 · Next recommended steps for any agent picking up here

The user is switching tooling (Claude Design / Codex / etc) and wants a clean
resume point. The branch state is locked at `0818ebd` (Phase 6). Recommended
order if resuming:

1. **Read this whole file plus** `frontend/components/cockpit/orbital.ts` — it's
   the single source for AXIS_COLOR, cluster math, and repulsion physics. Both
   the landing HeroScene and the cockpit RadialAgentStage import from it.
2. Open `frontend/components/landing/HeroScene.tsx` and
   `frontend/components/cockpit/RadialAgentStage.tsx` side by side. They are
   intentionally aligned in vocabulary — any future visual change to one
   should usually mirror to the other.
3. `cd frontend && npm run build` to confirm green. Bundle sizes at end of
   Phase 6: `/` 9.05 kB / 151 kB FLJ, `/chat` 1.54 kB / 216 kB FLJ.
4. The biggest open user pain points (frequently re-raised across phases):
   - **Cockpit `/chat` empty state and probing state** should keep feeling
     "$10K-worth" — premium, alive, interactive. Phase 6 ported the Phase-5/6
     vocabulary in but the user may push for more depth (3D pseudo-orbits,
     more sophisticated cursor effects, sound, particle systems).
   - **Mobile** at 390/430 px width hasn't been hand-verified.
   - **Result reveal** — the verdict card at the top of the cockpit is the
     climax; if it lands flat, it's the highest-leverage place to invest.
5. Phase-7 candidates the user has discussed but not started:
   - Topology badge PNG export (port from main's `56a227a`)
   - Delete the 8 dead `frontend/components/*.tsx` files
   - Sweep `text-neon` callsites onto `signal` / `primary` tokens
   - Add subtle ambient sound design on probe completion (Apple-style chime)
   - 3D depth via CSS `perspective` on the swarm parent

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
