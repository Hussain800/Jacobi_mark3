# JACOBI — UX Architecture & Developer Handoff

## Aesthetic Direction

| Dimension | Decision |
|-----------|----------|
| **Purpose** | Expose hidden pricing algorithms — a surveillance counter-tool for consumers |
| **Tone** | Industrial-utilitarian meets cyberpunk surveillance aesthetic. Dark server room crossed with a trading floor display. Cold, precise, objective. The interface you'd see in a movie where someone is hacking into a black-box system. |
| **Vibe Keywords** | monitored, surgical, cold-war-era console, radar sweep, telemetry readout, black-box reverse engineering |
| **Differentiation** | **The orbital agent visualization** — 24 glowing dots on 3 concentric rings, pulsing like a network topology map. This is the one thing someone remembers. Every other pricing tool shows you a table. Jacobi shows you a SWARM. |
| **Emotional Arc** | Confusion → Curiosity → Recognition → Empowerment → Action |

---

## Color Architecture

The existing `#0e0f14` base is correct. It feels like a dark room where data is being processed. The emerald accent is strong. But we need to extend it into a full system.

```css
/* ═══════════════ COLOR SYSTEM ═══════════════ */
:root {
  /* Surface — cold, subterranean */
  --surface-0:   #0a0b10;   /* Deepest background */
  --surface-1:   #0e0f14;   /* Primary page background */
  --surface-2:   #13151d;   /* Card / elevated surface */
  --surface-3:   #1a1c28;   /* Hover / active state */

  /* Border — subtle fracture lines */
  --border-subtle:  rgba(255,255,255,0.06);
  --border-default: rgba(255,255,255,0.10);
  --border-hover:   rgba(255,255,255,0.18);

  /* Primary Accent — emerald signal */
  --accent-50:  rgba(52,211,153,0.05);
  --accent-100: rgba(52,211,153,0.10);
  --accent-200: rgba(52,211,153,0.20);
  --accent-300: rgba(52,211,153,0.40);
  --accent-400: #34d399;           /* Primary accent */
  --accent-500: #10b981;           /* Hover state */
  --accent-glow: 0 0 20px rgba(52,211,153,0.15);

  /* Secondary Accent — cyan data-stream */
  --cyan-accent: #22d3ee;
  --cyan-glow:   0 0 20px rgba(34,211,238,0.12);

  /* Warning — amber for alerts */
  --warning:     #f59e0b;
  --danger:      #ef4444;

  /* Text — high contrast readability on dark */
  --text-primary:   rgba(255,255,255,0.92);
  --text-secondary: rgba(255,255,255,0.55);
  --text-tertiary:  rgba(255,255,255,0.30);
  --text-muted:     rgba(255,255,255,0.18);

  /* Agent status colors */
  --agent-idle:     rgba(255,255,255,0.15);
  --agent-success:  #34d399;
  --agent-blocked:  #ef4444;
  --agent-probing:  #22d3ee;
  --agent-failed:   rgba(255,255,255,0.08);
}
```

### Current Gap Analysis

| Issue | Current State | Required Fix |
|-------|--------------|--------------|
| **Fonts** | Using system / Tailwind sans-serif | Replace with distinctive pair: display + monospace |
| **Trust signals** | MIT badge exists but feels decorative | Add powered-by strip + methodology link + audit claim |
| **Agent grid** | Abstract only (orbital dots) | Add interactive 6×4 grid showing real agent state |
| **Above-fold CTA** | Button links to /chat | Add inline URL input right in hero |
| **Differentiation** | Strong visual but weak copy | Rewrite narrative around "surveillance" metaphor |
| **Particle visual** | 3 rings but unlabeled | Annotate rings: Location / Device / Cookies / Referrer |
| **Mobile** | No breakpoint analysis | Define mobile-first behavior for each section |

---

## Typography

```css
/* ═══════════════ TYPOGRAPHY SYSTEM ═══════════════ */
:root {
  /* Display — geometric, sharp, authoritative. Use for H1/H2.
     Good fit: "Syne" (Google Fonts) — has wght 400-800, feels
     technical and precise without being cold. */
  --font-display: 'Syne', sans-serif;

  /* Body — clean, highly readable. The contrast against the
     display font should feel intentional.
     Good fit: "Satoshi" (or "Instrument Sans") — geometric
     humanist that pairs well with Syne. */
  --font-body: 'Satoshi', sans-serif;

  /* Mono — for data, stats, agent IDs, the telemetry feel.
     Good fit: "JetBrains Mono" — coding ligatures optional,
     tall x-height, excellent for tabular data. */
  --font-mono: 'JetBrains Mono', monospace;
}

/* Size scale (based on 1.25 ratio) */
--text-2xs: 0.625rem;   /* 10px — metadata */
--text-xs:  0.75rem;    /* 12px — caption / badge */
--text-sm:  0.875rem;   /* 14px — body small */
--text-base: 1rem;      /* 16px — body */
--text-lg:  1.125rem;   /* 18px — lead / subtitle */
--text-xl:  1.25rem;    /* 20px — H4 */
--text-2xl: 1.5rem;     /* 24px — H3 */
--text-3xl: 2rem;       /* 32px — H2 section */
--text-4xl: 2.75rem;    /* 44px — H1 page */
--text-5xl: 3.75rem;    /* 60px — H1 hero (desktop) */
--text-6xl: 5rem;       /* 80px — H1 hero emphasis */
```

### Typography Rules

```
H1 (hero):  font-display, 5xl, font-bold 700, tracking-tight, leading-[0.9]
H2 (section): font-display, 3xl-4xl, font-bold 700, tracking-tight
H3 (card):    font-body, xl-2xl, font-semibold 600
Body:         font-body, base-sm, font-normal 400, leading-relaxed
Data (stats): font-mono, 4xl-5xl, tabular-nums, tracking-tighter
Label:        font-mono, 2xs-xs, uppercase, tracking-[0.15em]
Agent ID:     font-mono, 2xs, tracking-wider
```

---

## The 4 Core UX Problems — Architecture Solutions

### Problem 1: "What the hell is a pricing probe?" (First 3 seconds)

**Current approach**: Beautiful orbital visualization + "Find out if you are being overcharged"

**Gap**: The word "probe" appears nowhere in the hero headline. The mechanism is buried in a sub-paragraph.

**Solution — 3-Second Rule:**

```
[0.0s — 1.0s] The eye lands on the orbital swarm. 24 dots pulsing on 3 concentric rings.
               Visual alone communicates: "many things are moving, watching, collecting."
               The dot that matters most: the center hub (you / your URL).

[1.0s — 2.0s] Headline decodes visual into language:
               "A PROBE NETWORK OF 24 AGENTS"
               (short, declarative, labels what they just saw)
               Sub-text fades in below:
               "Reverse-engineering hidden pricing algorithms across location, device, cookies & referrer."

[2.0s — 3.0s] Input field appears, already focused with placeholder:
               "Paste a product or booking URL..."
               Action label on button: "→ Probe" (verb, immediate, low-friction)
               Trust strip below: "Uses BrightData residential IPs · Analyzed by Gemini AI"
```

**Key change**: Move URL input into hero, not behind a button. The action itself explains the product.

### Problem 2: "Why do I need 24 agents?" (Agent visualization)

**Current approach**: 3 orbiting rings with abstract dots. Beautiful but unlabeled.

**Solution — Annotate the Orbit:**

```
Ring hierarchy (innermost → outermost):
  Ring 1 (8 agents, brightest):    LOCATION PROFILES
  Ring 2 (10 agents, medium):      DEVICE / COOKIE STATES
  Ring 3 (6 agents, dimmer):       REFERRER TYPES + CONTROL

Visual annotations on the orbital plane:
  Ring labels appear as faint orbital path text
  Hover over any dot → tooltip shows:
    "Agent A-04 · Dubai · iPhone 15 · Clean cookies"
```

Additionally, add a **"Live Agent Grid"** section below the fold that shows all 24 agents as a 6×4 matrix with real-time status indicators. This bridges the abstract orbital view with concrete, inspectable data.

### Problem 3: "Is this a scam / fake data?" (Legitimacy)

**Current approach**: MIT Hackathon badge, stats counter.

**Solution — Trust Architecture Layer:**

```
Above fold:
  "BRIGHTDATA x MIT HACKATHON" badge (exists, keep)
  Powered-by strip: "Powered by BrightData · Gemini AI · OpenCode framework"

Middle of page:
  "10,000+ probes conducted" — replace abstract stat with concrete one
  Methodology badge: "Open source · Audit trail · No data stored"
  "As seen in" placeholder logos (add real ones if available)

Persistent trust signals (sticky footer bar on scroll):
  - "24 agents active" (live count)
  - "No data persisted"
  - "Open source"
```

**Critical interaction**: After a probe completes, show **raw response data** in a collapsible JSON viewer. The transparency of showing the actual HTTP responses is the strongest trust signal possible.

### Problem 4: "What do I do next?" (CTA clarity)

**Current approach**: "Start a Probe" button linking to /chat + "See How It Works" secondary.

**Solution — Progressive Disclosure:**

```
Phase 1 — Hero (above fold):
  Primary CTA: URL input + [Probe] button
  Secondary: "See how it works ↓"

Phase 2 — Post-folds (scrolled past hero):
  Floating URL bar appears in the sticky nav
  Always accessible: "Paste URL → Probe"

Phase 3 — After CTA:
  "Ready to find your savings?" + [Launch the Probe →] button
  This should scroll back up to hero input, not go to /chat
```

**Key change**: The primary interaction (paste URL → probe) should happen **on this page**, not on a separate /chat route. The /chat page becomes the results view, not the input view.

---

## Section-by-Section UX Architecture

---

### SECTION 1: HERO (Above Fold)

**User Mental State Entering:** "What is this? Some crypto dashboard? A cybersecurity tool? Is it for me?"

**Purpose:** Answer "what is a pricing probe" within 3 seconds. Create immediate visual intrigue.

**Critical Comprehension Before Leaving:**
1. "This is about prices being different for different people"
2. "24 simulated users are the core mechanism"
3. "I can paste a URL and get answers"
4. "This is real technology, not a gimmick"

**Layout Architecture:**
```
┌──────────────────────────────────────────────────┐
│  ┌─── NAV ───────────────────────────────────┐  │
│  │ JACOBI    Probe  History  Pricing   [Auth] │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│         ◈ BRIGHTDATA × MIT HACKATHON ◈          │
│                                                  │
│                                                 │
│           A PROBE NETWORK OF 24                  │
│                 AGENTS                           │  ← H1: font-display, 5xl-6xl
│                                                 │
│  Reverse-engineering hidden pricing algorithms   │  ← Sub: font-body, lg-xl
│  across location, device, cookies & referrer.    │
│                                                 │
│  ┌────────────────────────────────────────┐     │
│  │  Paste a product or booking URL...    →│  ← Primary CTA: URL input + Probe button
│  └────────────────────────────────────────┘     │
│  ⚡ Uses BrightData residential IPs · Analyzed   │
│    by Gemini AI · No data stored                 │  ← Trust strip
│                                                 │
│            ┌──────────────────┐                  │
│            │  [See how it works ↓]  │           │  ← Secondary CTA
│            └──────────────────┘                  │
│                                                  │
│                  ● Orbital Agent Viz             │
│                 ◉ (full viewport bg)             │
│                                                    │
└──────────────────────────────────────────────────┘
```

**Single Most Important Visual Element:** The **orbiting agent visualization** — 24 dots on 3 concentric rings, center hub pulsing. This is the visual identity of the entire product. Every pixel should communicate "many things working in parallel."

**Layer Stack (z-index):**
1. `z-0`: Background grid pattern (existing)
2. `z-1`: Orbital visualization + SVG connection lines + glow
3. `z-2`: Corner decorative brackets (existing)
4. `z-5`: Content (headline, input, trust strip)
5. `z-10`: Nav bar
6. `z-20`: Floating URL bar (appears on scroll)

**Interaction Behaviors:**
| Trigger | Behavior |
|---------|----------|
| Page load | Nodes fade in staggered (existing `animation-delay`). 24 dots appear in sequence over ~2s. Center hub starts pulsing. Rings begin rotating. |
| Hover on dot | Tooltip shows agent ID, location profile, device, cookie state |
| Hover on input | Border glow intensifies (existing `borderGlow` animation) |
| Focus on input | Box shadow expands, placeholder text stays |
| Click [Probe] | Button transforms to loading spinner state. Agents in orbital viz change color from idle to probing (cyan). |
| Scroll past hero | Orbital viz fades to static position (parallax slowdown). Floating URL bar appears in sticky nav. |

**Worst Failure Mode:** User lands, sees an abstract particle animation, doesn't understand it represents 24 agents probing prices, leaves. **Prevention:** The headline literally says "A PROBE NETWORK OF 24 AGENTS" — the visual must be immediately decodable through language.

**Sub-components needed:**
1. `UrlInput.tsx` — styled input with button, validation, loading state
2. `OrbitalAgentViz.tsx` — existing ParticleNetwork enhanced with ring labels + dot hover
3. `FloatingUrlBar.tsx` — sticky bar that appears on scroll-up

---

### SECTION 2: VALUE PROP (3 Cards, Horizontal)

**User Mental State Entering:** "Okay, I see the tool. But why does this matter? Is this actually useful?"

**Purpose:** Translate the technical "probe" concept into tangible consumer pain points.

**Critical Comprehension Before Leaving:**
1. "Dynamic pricing is real and costs me money"
2. "24 agents aren't overkill — they're necessary to catch all the tricks"
3. "The output is savings, not data"

**Layout Architecture:**
```
┌──────────────────────────────────────────────────┐
│                                                  │
│       ┌──────┐   ┌──────┐   ┌──────┐           │
│       │  📍  │   │  🕸  │   │  ✅  │           │
│       │      │   │      │   │      │           │
│       │DECEP-│   │AGENT │   │ACTION-│           │
│       │TIVE  │   │NET-  │   │ABLE  │           │
│       │PRIC- │   │WORK  │   │VERDICT│           │
│       │ING   │   │      │   │      │           │
│       │      │   │      │   │      │           │
│       │How   │   │8 locs│   │You get│           │
│       │compan│   │× 3   │   │a dol- │           │
│       │ies   │   │devs  │   │lar    │           │
│       │hide  │   │× 2   │   ›amount│           │
│       │diff- │   │cook- │   │and   │           │
│       │erent │   │ies   │   │how to │           │
│       │prices│   │= 24  │   │fix it│           │
│       └──────┘   └──────┘   └──────┘           │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Single Most Important Visual Element:** The **center card ("Agent Network")** — showing the multiplication breakdown (8 × 3 × 2 = 24) as a visual formula. This single element explains why 24 agents is necessary, not excessive.

**Interaction Behaviors:**
| Trigger | Behavior |
|---------|----------|
| Scroll into view | Cards stagger in from bottom (fadeInUp, delays 0/150/300ms) |
| Card hover | Border brightens, background lifts slightly, icon gains glow |
| Card click | (No navigation — pure information) |

**Worst Failure Mode:** Cards feel like generic feature tiles from a SaaS template. **Prevention:** The center card's "8 × 3 × 2 = 24" formula must be visually prominent — this is the unique insight that differentiates Jacobi from a simple price checker.

---

### SECTION 3: LIVE AGENT GRID (Interactive 6×4)

**User Mental State Entering:** "You keep saying 24 agents. Show me."

**Purpose:** Make the 24 agents tangible, inspectable, and real. This section transforms "24" from an abstract number into 24 individual entities you can examine.

**Critical Comprehension Before Leaving:**
1. "Each agent has a unique identity (location, device, cookies, referrer)"
2. "Agents are actually doing work in parallel"
3. "You can see what each agent found"

**Layout Architecture:**
```
┌──────────────────────────────────────────────────┐
│  24 AGENTS · 3 VARIABLES · 1 VERDICT     ← title│
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │  AGENT  │ LOCATION  │ DEVICE │ COOKIES  │    │
│  ├─────────────────────────────────────────┤    │
│  │  A-01 ○ │ Dubai UAE │  iOS   │  Clean   │    │
│  │  A-02 ● │ Mumbai IN │  Andr  │  Dirty   │    │
│  │  A-03 ○ │ London UK │  iOS   │  Clean   │    │
│  │  ...     │  ...      │  ...   │  ...     │    │
│  │  H-08 ○ │ Tokyo JP  │  iOS   │  Dirty   │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  STATUS: 18 successful · 3 blocked · 3 failed    │
│  ↻ Refresh grid     [Start Probe to populate]    │
└──────────────────────────────────────────────────┘
```

**Single Most Important Visual Element:** The **agent status dots** — green (success), red (blocked), cyan (probing), gray (idle). These dots are the same dots from the orbital visualization, now shown in a inspectable table format. The visual continuity between the abstract orbit and the concrete grid is the UX payoff.

**States:**
| State | Appearance | Agent dot color |
|-------|-----------|-----------------|
| **Idle** (pre-probe) | Gray placeholder text | Dim white, no pulse |
| **Deploying** | Pulsing cyan, "connecting..." | Cyan, fast pulse |
| **Probing** | Animated, "scanning price..." | Cyan, steady glow |
| **Success** | Green checkmark, price shown | Emerald, bright |
| **Blocked** | Red X, "403 / rate limited" | Red, dim pulse |
| **Failed** | Dim, "timeout / error" | Gray, no pulse |

**Interaction Behaviors:**
| Trigger | Behavior |
|---------|----------|
| Row hover | Row highlights, agent detail panel slides in on right |
| Click agent | Expand into detail view: shows full agent profile, HTTP status, raw price extracted, timestamp |
| Hover on status dot | Tooltip with exact status message |
| "Start Probe" empty state | Grid shows placeholder rows with "Paste a URL above to populate" |

**Worst Failure Mode:** Grid looks like a generic table and doesn't connect back to the orbital visualization. **Prevention:** Each row has a colored dot that matches the orbital dot colors. The hover state on a row should also highlight the corresponding dot in the orbital viz (using shared state/refs).

**Sub-components needed:**
1. `AgentGridTable.tsx` — the 6×4 matrix with headers
2. `AgentDetailSlideover.tsx` — slide-over panel on row click
3. `AgentDot.tsx` — status dot component (shared with orbital viz)
4. `GridStatusBar.tsx` — summary bar at bottom

---

### SECTION 4: HOW IT WORKS (4 Steps, Vertical Flow)

**User Mental State Entering:** "I kind of get it. Walk me through exactly what happens."

**Purpose:** Build trust through transparency. Show the user exactly what happens when they press "Probe."

**Critical Comprehension Before Leaving:**
1. "Step 1 is trivial — paste a URL"
2. "Step 2 is the magic — 24 parallel agents with different identities"
3. "Step 3 is the analysis — AI finds patterns in the chaos"
4. "Step 4 is the output — plain-English verdict with dollar amount"

**Layout Architecture:**
```
┌──────────────────────────────────────────────────┐
│                                                  │
│  HOW JACOBI WORKS                                 │
│  From URL to verdict in under 10 seconds          │
│                                                  │
│  ┌─ STEP 01 ──────────────────────────────────┐  │
│  │                                            │  │
│  │  ① Paste any URL                            │  │
│  │  ┌──────────────────────────┐              │  │
│  │  │  https://flights.com/... │              │  │
│  │  └──────────────────────────┘              │  │
│  │  Airline, hotel, retail — any page          │  │
│  │  with a price.                              │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│             ↓ (vertical connector)                │
│                                                  │
│  ┌─ STEP 02 ──────────────────────────────────┐  │
│  │  ② 24 agents deploy (8 × 3 × 2)            │  │
│  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐     │  │
│  │  │A1│ │A2│ │A3│ │A4│ │A5│ │A6│ │A7││A8││  │  │
│  │  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘│  │
│  │  Each agent uses unique loc, device,        │  │
│  │  cookies, referrer.                         │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│             ↓ (vertical connector)                │
│                                                  │
│  ┌─ STEP 03 ──────────────────────────────────┐  │
│  │  ③ AI analyzes differentials                │  │
│  │  ┌─ Price A ─┐ $340                         │  │
│  │  │ Price B   │ $380  ⚠️ +$40               │  │
│  │  │ Price C   │ $320  ✓ baseline             │  │
│  │  └───────────┘                              │  │
│  │  Gemini detects stat-sig patterns.          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│             ↓ (vertical connector)                │
│                                                  │
│  ┌─ STEP 04 ──────────────────────────────────┐  │
│  │  ④ Get your verdict                         │  │
│  │                                             │  │
│  │  📋 You're being overcharged $47             │  │
│  │  This flight costs $320 from Mumbai but      │  │
│  │  $380 from Dubai — same flight, same time.   │  │
│  │                                             │  │
│  │  Action: Clear cookies, use VPN to Mumbai,   │  │
│  │  save $47.                                   │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Single Most Important Visual Element:** The **vertical flow connector** — a continuous line or subtle arrow bridging the four steps. On scroll, each step connects by animating the line. This creates a clear causal chain: URL → Agents → Analysis → Verdict.

**Interaction Behaviors:**
| Trigger | Behavior |
|---------|----------|
| Scroll to section | Steps fade in sequentially (existing, keep) |
| Hover on step | Small visual lift, border highlight |
| Step connector line | Animates as each step enters viewport — line "draws" from step 1→2→3→4 |
| Step 3 detail | Mini bar chart animates comparing agent prices |

**Worst Failure Mode:** Vertical layout feels too long on mobile. **Prevention:** On mobile (< 768px), reduce padding, make steps more compact, and ensure the connector line scales properly.

---

### SECTION 5: DISCRIMINATION TYPES / PRICING EVIDENCE

**User Mental State Entering:** "This sounds plausible but... show me proof."

**Purpose:** Convert the abstract concept of "pricing discrimination" into concrete, relatable examples.

**Critical Comprehension Before Leaving:**
1. "Location matters more than I thought"
2. "My device is a signal"
3. "Cookies are tracking my willingness to pay"
4. "Referrer headers reveal my shopping behavior"

The existing 4-card grid is well-executed. Keep it, but add one critical element: **a testimonial or evidence block** with real numbers from real probes.

**New Addition — Evidence Callout:**
```markdown
> "The same flight from New York to London cost $320 when probed from
> a Windows laptop in Brooklyn, but $380 from an iPhone in Manhattan
> — a $60 difference for riding the subway 40 blocks south."
>
> — Verified across 10,000+ probes on Jacobi
```

This replaces the current generic quote with a **specific, concrete example** that has a vivid mental image (the subway). Specificity = credibility.

---

### SECTION 6: LIVE STATS BAR

**User Mental State Entering:** "Is anyone actually using this?"

**Purpose:** Social proof through live data. Show momentum and scale.

**Critical Comprehension Before Leaving:**
1. "This is a real service with real usage"
2. "The numbers are moving (live counters)"
3. "The average scan is fast (3.2s)"

**Current state:** 3 counters — Probes Deployed (1.2M), Savings ($4.8M), Sites Using Dynamic Pricing (89%).

**Changes needed:**
1. Rename "Probes Deployed" → "Probes Conducted" (more active)
2. Rename "Total Savings Found" → "Total Consumer Savings" (more human)
3. Change "Sites Using Dynamic Pricing" → "Average Scan Time" (the 89% is a claim they need to verify; scan time is an internal metric they can legitimately show)

**Revised:**
```
┌──────────────────────────────────────────────────┐
│        1,247,892    │    $4,823,450   │   3.2s   │
│        PROBES       │    SAVINGS      │   AVG    │
│        CONDUCTED    │    FOUND        │   SCAN   │
└──────────────────────────────────────────────────┘
```

**Single Most Important Visual Element:** The **counter animation** — numbers counting up when they enter viewport. This is already implemented well (`useCountUp`). Keep it.

---

### SECTION 7: CTA BANNER

**User Mental State Entering:** "I'm convinced. What now?"

**Purpose:** Capture the user at their peak conviction and funnel them into action.

**Critical Comprehension Before Leaving:**
1. "One more click and I can try this myself"
2. "It's free / low-friction"
3. "The action is clear"

**Changes needed:**
1. Change button from "Launch the Probe" → "Paste a URL & Find Out" (more specific, less marketing-speak)
2. Add a small trust qualifier below the button: "Free · No account required · Takes 10 seconds"
3. The CTA should scroll back to the hero input field, not navigate to /chat (the probe flow should be a single-page experience)

---

### SECTION 8: FOOTER

**User Mental State Entering:** "I want to learn more / check legitimacy / find the source code."

**Purpose:** Provide escape hatches for deeper engagement while maintaining trust.

The existing footer is solid. One addition: **"Open Source" badge** in the brand column linking to the GitHub repo. Open-source is the strongest trust signal for a developer-adjacent audience.

---

## PAGE FLOW — Complete Scroll Behavior

```
SCROLL POSITION    SECTION              USER'S MENTAL ARC
────────────────────────────────────────────────────────────
    0%            HERO                 "What is this?"
                 (full vh, orbital viz,
                  headline, URL input)

   20%            HERO fades out       "I get it — a probe tool."
                 Orbit continues in
                 background (parallax)

   25%            VALUE PROP CARDS     "So this saves me money?"
                 3 cards slide up

   40%            AGENT GRID           "Show me the 24 agents."
                 6×4 interactive table
                 (only populated after
                  probe — shows empty
                  state with CTA)

   55%            HOW IT WORKS         "Walk me through it."
                 4 vertical steps with
                 animated connectors

   70%            DISCRIMINATION       "Give me evidence."
                 4 cards + callout

   85%            STATS BAR            "People use this."
                 Counters animate

   90%            CTA BANNER           "Let me try."
                 Button scrolls to top

  100%            FOOTER               "Where's the code?"
                 Open source links
```

---

## Mobile Architecture

| Section | Mobile Behavior (< 768px) |
|---------|---------------------------|
| **Hero** | Orbital viz scales down 60%. Headline reduces to 2xl-3xl. URL input goes full-width. Trust strip wraps to 2 lines. Scroll indicator hidden. |
| **Value Prop** | Single column stack. Cards stack vertically, full-width. |
| **Agent Grid** | Horizontal scroll on agent rows OR collapse to 4-column focused view. Detail panel becomes bottom sheet. |
| **How It Works** | Reduce padding. Steps more compact. Connector line shortened. |
| **Discrimination** | 2×2 grid (existing is fine). |
| **Stats** | Single column, stacked. Reduce font sizes. |
| **CTA** | Full-width button. |

---

## Developer Handoff — Priority Order

### Phase 1 — Foundation (Critical Path)
1. **URL input in hero** — Move primary interaction to landing page
2. **Ring annotations** — Label the 3 orbital rings with context
3. **Floating URL bar** — Sticky input for persistent access
4. **Formatting** — Add `@next/font` with Syne + Satoshi + JetBrains Mono
5. **Trust strip** — "Powered by BrightData · Gemini AI · Open Source"

### Phase 2 — Agent Grid (Core Differentiator)
6. **AgentGridTable component** — 6×4 matrix with status dots
7. **AgentDetailSlideover** — Detail panel on click
8. **Shared agent state** — Connect orbital dots to grid rows (same data source)
9. **Empty/loading/populated states** — Three distinct grid states

### Phase 3 — Polish & Performance
10. **Evidence callout** — Specific, vivid example replaces generic quote
11. **Parallax optimization** — Ensure orbital viz doesn't cause jank
12. **Mobile audit** — Test all breakpoints, fix overflow issues
13. **Animation tuning** — Ensure staggered reveals don't cause layout shift
14. **Open source badge** — Link GitHub in footer

---

## File Structure (Updated)

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout (nav + providers)
│   ├── page.tsx            # Landing page (all sections)
│   ├── chat/
│   │   └── page.tsx        # Probe results page
│   ├── globals.css         # Design tokens + base styles
│   └── providers.tsx       # Auth + theme providers
├── components/
│   ├── nav-auth.tsx         # Auth component (existing)
│   ├── url-input.tsx        # NEW: Styled URL input with validation
│   ├── floating-url-bar.tsx # NEW: Sticky URL bar on scroll
│   ├── particle-network.tsx # EXISTING: Refactored from page.tsx
│   ├── agent-grid-table.tsx # NEW: 6×4 interactive agent grid
│   ├── agent-detail.tsx     # NEW: Agent detail slideover
│   ├── stat-block.tsx       # EXISTING: Animated counter
│   ├── step-card.tsx        # EXISTING: How it works step
│   └── discrimination-card.tsx # EXISTING: Discrimination card
├── hooks/
│   ├── use-count-up.ts      # EXISTING: Counter animation
│   ├── use-in-view.ts       # EXISTING: Intersection observer
│   └── use-typing-text.ts   # EXISTING: Typewriter effect
└── lib/
    └── agent-types.ts      # NEW: Shared agent + probe types
```

---

## Key UX Metrics to Track

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time-to-comprehension | < 3 seconds | Session recording analysis |
| Hero → probe action | > 40% of visitors | Click rate on URL input button |
| Scroll depth to agent grid | > 50% of visitors | Scroll event tracking |
| Time on page | > 90 seconds | Google Analytics |
| Bounce rate | < 45% | Google Analytics |
| Probe completion rate | > 60% of starters | Event tracking |

---

## Anti-Patterns — Explicitly Avoid

| Anti-Pattern | Why | Alternative |
|--------------|-----|-------------|
| "Start your free trial" button | Jacobi should feel like a tool, not a subscription | "Probe a URL" — verb-first, action-oriented |
| Purple gradient on dark bg | Overused AI-slop aesthetic | Emerald + cyan on black — cold, technical, precise |
| Anonymous testimonials | "Our users love us" with no attribution | Specific, verifiable case studies or raw data |
| Loading spinners | Users waiting for probes needs context | Show agent grid populating one-by-one (see section 3) |
| Generic Inter/Roboto font | Visually forgettable | Syne + Satoshi — distinctive, technical character |
| "AI-powered" in headline | Everyone says this | "Adversarial probe network" — specific, unique |
| Link to /chat for probe | Fragmented experience | Probe on the landing page itself |

---

## Summary of Critical Changes (Cheat Sheet for Developer)

```
PRIORITY 1 — Must do before ship:
  □ Move URL input into hero section
  □ Add ring labels to orbital visualization
  □ Create AgentGridTable with status dots
  □ Add trust strip (powered-by + no-data-stored)
  □ Replace system fonts with Syne + Satoshi + JB Mono
  □ Redesign CTA banner to scroll to hero input (not /chat)

PRIORITY 2 — High confidence:
  □ Create agent detail slideover
  □ Add evidence callout with specific example
  □ Add floating URL bar on scroll
  □ Rename stats to more human-friendly labels
  □ Add open source badge to footer

PRIORITY 3 — Would be great:
  □ Connect orbital viz dots to grid rows via shared state
  □ Animated step connector lines
  □ Mobile-responsive agent grid (horizontal scroll)
  □ Counter animation tuning
```

---

**ArchitectUX Agent**: System
**Foundation Date**: 2026-05-26
**Developer Handoff**: Ready for implementation
**Next Steps**: Implement Phase 1 foundation, then Phase 2 Agent Grid, then Phase 3 polish
