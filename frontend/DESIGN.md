# DESIGN.md — Jacobi · "The Forensic Instrument"

> **This file is the visual contract.** Every styling/layout decision for the public marketing surface
> references it. No hard-coded hex in components — use the tokens below. If a choice isn't covered here,
> it must be derivable from these rules; if it can't, stop and ask.
>
> **Scope:** the whole **public marketing/content surface** — the landing (`/`) AND the content pages
> (Method · Pricing · History · Board · About · Extension · Privacy · Terms). All wear the **fully
> isolated `.jx` system** (tokens/CSS in `app/landing.css`) via `components/marketing/MarketingShell`
> (shared LandingNav + LandingFooter). The landing-only IA (§9) governs `/`; sub-pages compose the same
> parts — page header, section markers, signature artifacts, the doc layout, instrument tables.
>
> The `.jx` system must **never** import or mutate `app/jacobi-design.css`, which powers the
> **authenticated product app** (`/chat`, `/dashboard`, `/billing`, `/share`). Those app routes keep
> their own functional chrome and must stay pixel-for-pixel unchanged.

---

## 0. Thesis & operating principles

**Jacobi is a forensic instrument for proving personalized pricing with controlled evidence.** It must
look measured, exact, and expensive — a global price-audit device, not an AI startup.

- The **globe** is the instrument's sensor array (global probe network) — the brand object, prominent.
- The **evidence receipt** is the instrument's printout — the signature proof artifact.
- The **buyer-context matrix** is the instrument's control panel.
- **Numbers are evidence** → tabular, mono, aligned, central.
- Narrative is quiet/editorial; **seriousness is concentrated in the data artifacts**, not sprinkled.
- Temperature: **balanced instrument + editorial** (Apple/Phia whitespace + Bloomberg seriousness, but
  the terminal density lives only inside the artifacts).
- Litmus test for every element: *does this make Jacobi more precise, more credible, more expensive?*
  If no → it's decoration → cut it.

---

## 1. Colour tokens — luminance ladder (surfaces get LIGHTER as they elevate)

CSS variables live under `.jx { … }` in `app/landing.css`. Carbon/Raycast model: depth = luminance
step + 1px hairline. **No two adjacent surfaces in the same band. No surface darker than `--jx-canvas`
except a deliberate contrast moment.**

```css
.jx{
  /* surfaces — the Jacobi Design Direction ladder (canvas → bands → cards → cells → floats) */
  --jx-canvas:     #070809;  /* page base — cool near-black, never pure #000 */
  --jx-layer-0:    #0b0d12;  /* full-bleed bands / hero veil (surface-1) */
  --jx-layer-1:    #10131b;  /* panels, receipt body (surface-2) */
  --jx-layer-2:    #161a24;  /* cards, inner cells, alt table rows (surface-3) */
  --jx-layer-3:    #1e2330;  /* elevated: hover, popover, globe HUD (surface-4 · only shadow) */

  /* ink */
  --jx-ink:        #eef0f5;  /* display + key data */
  --jx-ink-2:      #9aa3b4;  /* body */
  --jx-ink-3:      #5e6675;  /* labels, captions, axis */
  --jx-ink-4:      #3b4250;  /* deepest decorative / disabled */

  /* hairlines */
  --jx-line:       rgba(255,255,255,0.06);  /* subtle */
  --jx-line-2:     rgba(255,255,255,0.11);  /* strong / hover */

  /* THE accent — Jacobi cobalt (brand equity from the [] mark). ONE accent only. */
  --jx-accent:     #5b7cf5;
  --jx-accent-hi:  #92a6ff;  /* hover / focus only */
  --jx-accent-deep:#3a4fc4;  /* deep hairline on the flat cobalt CTA */
  --jx-accent-dim: rgba(91,124,245,0.12);

  /* SEMANTIC — ONLY inside data artifacts (receipt/matrix/charts). Never chrome. */
  --jx-baseline:   #33d39b;  /* clean / cheapest / safe */
  --jx-deviant:    #ff5d6b;  /* overcharge / exposed */
  --jx-caution:    #ffb053;  /* progressive / partial (amber) */
}
```

**Accent budget — cobalt may appear ONLY on:** primary CTA, focus rings, active nav indicator, the
single most important data highlight per view, and the globe's signal colour. Nowhere else.

**Contrast:** body text ≥ 4.5:1; mono data aims ≥ 7:1 (`--jx-ink` / `--jx-ink-2` on the ladder pass).
`--jx-ink-3` is for non-essential labels only (verify ≥ 4.5:1 on its background before use for anything
readable).

---

## 2. Typography — engineered sans + mono (NO serif, NO italic accents)

- **Display / UI:** **Schibsted Grotesk 600** via `next/font/google` (CLS-safe); −0.035em tracking,
  0.96 line-height on display. Distinctive engineered grotesk (the Jacobi Design Direction face).
- **Data / terminal:** **JetBrains Mono** (loaded via the shared `<link>`, reused by app routes). One
  mono only. Tabular numerals everywhere numbers appear: `font-variant-numeric: tabular-nums;`.
- **Hierarchy comes from scale + weight + position + the ladder — never from switching to a serif or
  italic.** Emphasis = weight/size/colour. The previous redesign's italic-serif accent word in every
  heading is **banned**.

Scale (fluid `clamp`, tight tracking on display):

| Token        | Size (min→max) | Weight | Tracking | Line-height | Use |
|--------------|----------------|--------|----------|-------------|-----|
| display-xl   | 48 → 92px      | 560    | -0.03em  | 1.0         | hero headline |
| h2           | 32 → 54px      | 540    | -0.025em | 1.05        | section titles |
| h3           | 20 → 24px      | 540    | -0.015em | 1.1         | artifact titles |
| lede         | 18 → 20px      | 400    | -0.005em | 1.5 (≤62ch) | hero/section sub |
| body         | 15 → 16px      | 400    | 0        | 1.6         | paragraphs |
| eyebrow      | 11 → 12px MONO | 500    | 0.18em ↑ | —           | section kicker |
| label        | 10.5 → 11px MONO| 500   | 0.16em ↑ | —           | artifact labels |
| data         | 13 → 17px MONO | 400/500| 0        | tabular     | prices/metrics |

Headlines are short and hard (≤7 words). Copy is exact and evidence-grade.

---

## 3. Spacing, grid, layout

- Base unit **4px**. Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160`.
- Section vertical rhythm: `clamp(96px, 12vh, 176px)`.
- Content max-width **1080px** (editorial focus). A few full-bleed bands may go wider (globe stage).
- Gutter `clamp(24px, 6vw, 96px)`.
- Generous silence around the 2–3 dominant moments (globe / receipt / audit).
- 12-col mental grid for alignment; most content sits in a single centered column or an asymmetric
  2-col (text + artifact). **No bento grids.**

---

## 4. Borders & elevation

- Depth = **luminance step (§1) + 1px hairline** (`--jx-line` default, `--jx-line-2` on hover/strong).
- **No drop shadows** except transient overlays (globe HUD tooltip, popover) — those may use a soft
  shadow.
- Optional **shadow-as-border** (Vercel): `box-shadow: 0 0 0 1px var(--jx-line)` for crisp 1px lines
  without box-model shift.
- Radii: **4 / 8 / 12** only. Pill (9999) ONLY for status dots and small tags.
- Hover on a surface → +1 luminance step + `--jx-line-2`. Never a colour flash.

---

## 5. Icons, data-viz, CTA, motion

**Icons:** thin **1.5px line, 24px grid, `currentColor`**, geometric, mono-weight. Used sparingly, only
where they aid scanning (matrix vectors, evidence types). **No emoji. No icon-per-card.**

**Data-viz:** tabular mono numbers; thin 1px rules; no default chart gridlines; mono axis labels;
verdict colour-coding only (`--jx-baseline/deviant/caution`). Prefer **hand-built artifacts** over
generic Recharts. If Recharts is used (price-distribution strip), strip to hairlines + mono.

**CTA:** **one** primary per viewport — *Run an audit* (the URL-probe input is the hero CTA). Primary =
**solid cobalt** (`--jx-accent`), the page's single brightest interactive element; hover `--jx-accent-hi`.
Secondary = underlined/ghost text link in `--jx-ink-2`. Never two competing primaries.

**Motion:** purposeful only — globe idle rotation + audit-deploy sequence; subtle first-view reveal
(≤400ms, translateY≤16px + fade). House easing `cubic-bezier(0.22,1,0.36,1)`. `prefers-reduced-motion:
reduce` → everything static (globe = static frame, reveals off, no parallax). Nothing decorative
auto-plays; nothing blocks LCP.

---

## 6. The Globe — bespoke "Global Probe Network" (the brand object)

**Mandate:** restore the old globe's *prominence* and rebuild it *magnitudes better* into a bespoke,
art-directed instrument. It is the hero's focal object — never dimmed to a background, never a flat SVG.

**Foundation (preserve, proven):** real 3D WebGL sphere; dotted land-mass "signal surface" from a land
mask; fine lat/long graticule; hairline country outlines; market nodes (cities); great-circle arcs from
a target hub; inertial feel.

**Upgrades (the "magnitudes better"):**
- **Prominence:** large, in its own composition, with real depth/volume.
- **Materials/depth:** subtle fresnel rim-light; one thin atmosphere shell (NOT a glow blob); depth
  cueing so back-of-globe dots/arcs dim.
- **Two states:**
  - *idle* — calm slow rotation; market nodes breathing as probe origins.
  - *audit run* — synthetic-buyer probes deploy from the target along great-circle traces; price signals
    return; nodes resolve to verdict colours forming a visible **price-gradient topology**. Triggered
    once on load + on CTA focus/hover.
- **HUD/legend:** small mono readout (`identities · spread · dominant driver`) + verdict legend on
  `--jx-layer-3`, so colours mean something.
- **Restraint:** desaturated palette; cobalt = signal; **no neon, no particle field, no random glow.**
- **Budget:** bundled `three`; lazy-mount post-LCP (`next/dynamic({ssr:false})` + idle/in-view);
  pixel-ratio ≤2; point budget (+ lowPower path); single renderer; dispose on unmount; **fresh canvas
  per mount**; **explicit `getContext('webgl2') || getContext('webgl')`** passed to the renderer; pause
  render loop when offscreen.
- **High-fidelity fallback (critical):** reduced-motion / no-WebGL / low-power → a **rich static globe
  frame** (high-quality static render/snapshot), NOT the flat concentric-circle SVG. It must read as a
  real, intentional globe.
- **Identity rule:** must read as a *global price-audit sensor array* — never a generic "AI globe".

---

## 7. Signature artifacts (these replace generic cards)

All use one canonical, internally-consistent dataset (§8). Build each as a reusable component.

1. **Evidence Receipt** *(signature, emotional centre)* — mono audit printout on `--jx-layer-1`,
   `--jx-line-2` frame; uppercase mono headers; verdict-coloured rows; `PEI`, `Jacobian ratio`,
   `sha256 … · sealed`. Columns: `LOCATION · IP_TYPE · BROWSER · NATIVE · USD · VERDICT`.
2. **Buyer-Context Matrix** *(control panel)* — rows = the 6 vectors (geography, device, browser
   language, cookies, referrer, session) with `varied / held-constant` state + per-vector sensitivity
   bar; framed by the Jacobian. One instrument, **not six cards**.
3. **Price-Delta Comparison** — two synthetic buyers, same URL, native + USD, delta in tabular mono.
4. **Audit Readout** *(salvage + elevate the old dashboard)* — baseline / highest / delta / confidence /
   driver vector / price-distribution strip. Instrument-grade.
5. **Statistical Confidence Module** — mean baseline vs mean exposed, CI bars, p-value, significance
   verdict — an instrument readout, not a generic chart.
6. **Audit-Ready Report Preview** — a report/PDF surface (letterhead, summary, evidence appendix) shown
   edge-intruding (Phia product-surface move).
7. **Raw Evidence Appendix** — dense mono table (`probe_id · location · ip_type · browser · lang ·
   native · usd · captured_at · verdict`), terminal-styled, scrollable.

---

## 8. Canonical sample dataset (keep ALL artifacts consistent)

Sample audit (clearly labelled a *sample*, not live):

```
target      UA182 · JFK → LHR · economy · same date/seat class
probes      24 synthetic buyers · 6 context vectors · 3 network tiers
baseline    $498   (Android · rural Iowa · VPN)        ← cheapest / clean
highest     $642   (iPhone · Manhattan · direct)       ← exposed / deviant
delta       +$144  ( +29% over baseline )
PEI         1.29   (Price Exploitation Index)
variation   71 / 100
drivers     Location 62% · Device 21% · Cookies 10% · Referrer 7%
confidence  Welch t-test, p < 0.01 · 95% CI [ +$96 , +$192 ]  → significant
verdict     PROGRESSIVE — driven by location
representative rows:
  iPhone · Manhattan · direct     $642  deviant (top)
  Safari · Tokyo · direct         $612  normal
  Edge · London · direct          $596  normal
  Firefox · Bangalore · VPN       $512  normal
  Android · rural Iowa · VPN      $498  baseline
```

---

## 9. Landing IA — section order (editorial rhythm, weighted, NOT card soup)

0. **Nav** — `JAC[ ]BI`, ≤4 links (Method · Audit · Board · Pricing), one primary CTA. Hairline-on-scroll.
1. **Hero** — globe dominates; one hard headline; one-line sub; URL-probe CTA; minimal mono metadata.
2. **Problem** — one oversized statement (*"Same URL. Different buyer. Different price."*) + one tight
   paragraph + **one inline price-delta proof**. Silence-heavy.
3. **Mechanism** — the buyer-context matrix as ONE control panel (vary one vector, hold the rest).
4. **Evidence Receipt** — the signature artifact, dominating the frame.
5. **Audit Readout** — the finished verdict at a glance.
6. **Why it holds up** — defensibility as a 2-col editorial ledger w/ horizontal rules (not 6 cards).
7. **Statistical confidence / price-gradient** — small instrument readout (may merge into §5).
8. **Final CTA** — short, confident, one action; URL bar; globe returns subtly.
9. **Footer** — minimal: wordmark, columns, one-line tagline.

**Hard rule:** at most ONE equal-weight peer set on the whole page. Vary section weight dramatically.

---

## 10. Anti-slop guardrails (DO NOT generate)

❌ glowing radial blobs / ambient glow fields / hero aura gradients
❌ floating particles / particle spam / starfields
❌ meaningless gradient cards / gradient-on-gradient
❌ random bento grids
❌ equal-weight feature-card soup (max ONE genuine peer set)
❌ fake-futuristic chrome / sci-fi HUD that carries no data
❌ neon / high-saturation colour; semantic colours stay desaturated and only inside data
❌ decorative 3D that doesn't explain the product
❌ serif / italic accent words in headings
❌ surfaces all in the same near-black band (enforce the ladder)
❌ 1px-border cards as the dominant motif
❌ two competing primary CTAs in one viewport
❌ vague AI copy: "revolutionary", "unlock insights", "supercharge", "harness", "next-gen",
   "AI-powered" as a value prop
❌ any motion that auto-plays under reduced-motion, or any visual that blocks LCP

---

## 11. Engineering & QA gates

**Isolation:** landing is `.jx`-namespaced with its own CSS/tokens; never imports/mutates
`jacobi-design.css`. `layout.tsx` / `tailwind.config.js` changes are **additive only** and must not
alter shared routes. Keep Instrument Serif / JetBrains Mono loads for the app routes intact.

**Performance:** LCP < 2.5s; CLS < 0.1 (reserve globe space — zero hero layout shift); INP < 200ms;
fonts via next/font (no FOUT/CLS); WebGL lazy + budgeted (§6).

**Accessibility:** WCAG AA (4.5:1 body, aim 7:1 mono data); `:focus-visible` rings on all interactive
elements; semantic landmarks; alt text; keyboard nav; labelled inputs; full `prefers-reduced-motion`.

**Build gates (authoritative — project has no ESLint config; Next 16 removed `next lint`):**
`npx next build` green (TS strict) **and** `npx tsc --noEmit` green; **0 browser console errors**;
responsive 375 / 768 / 1280 / 1440 with no horizontal overflow; `/chat` + `/pricing` + `/dashboard`
verified unchanged.

**Decisions (Jacobi Design Direction, 2026-06):** display = **Schibsted Grotesk 600**; mono =
**JetBrains Mono**; accent = **cobalt #5b7cf5**; primary CTA = **flat solid cobalt** (deep-cobalt
hairline, no glow/shadow); target = **UA182 JFK→LHR**.
