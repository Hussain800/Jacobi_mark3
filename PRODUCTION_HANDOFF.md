# JACOBI — Production Readiness Handoff

> Status snapshot: **Local SaaS-flow ready for the 24-identity engine path.**
> Not deployment-ready. Stripe stays in test mode until first paying customer.

This document is the complete checklist for taking JACOBI from "works on my
machine" to "real SaaS that people pay for." It is grouped by concern, with
exact commands, exact files, and the rationale for each step.

---

## 1. What this branch already does (locally verified)

| Area | Status | Evidence |
|---|---|---|
| Frontend build | ✅ Green | `npm run build` → all 13 routes compile, zero TS errors |
| Backend syntax | ✅ Green | `ast.parse` on `main.py`, `profile_store.py`, `supabase_client.py`, `auth_user.py`, `billing.py`, `stripe_client.py` |
| Engine deploys exactly 24 distinct synthetic identities | ✅ Verified | `len(AGENT_CONFIGS) == 24`, split into 3 waves of 8 (datacenter / residential / mobile), 4 vectors (location, device, cookie_profile, referrer) × high/low + 2 control repeats |
| `/api/probe` rejects unauthenticated | ✅ 401 `auth_required` | curl-tested |
| `/api/probe` rejects forged Bearer | ✅ 401 (Supabase JWT verify) | curl-tested with `Authorization: Bearer faketoken` |
| `/api/history` rejects unauthenticated | ✅ 401 `auth_required` | curl-tested |
| `/api/leaderboard` fails closed if migration not applied | ✅ Returns `[]` (does NOT leak private probes) | curl-tested before migration |
| `/api/billing/plan` returns safe `anon` tier when unauthenticated | ✅ 200 `{"tier":"anon"}` | curl-tested |
| `/api/billing/checkout` requires auth | ✅ 401 `Sign in to upgrade.` | curl-tested |
| `/api/billing/webhook` rejects bogus signatures | ✅ 400 `signature verification failed` | curl-tested |
| Cockpit shows structured rejection card (sign-in or upgrade CTA) | ✅ Verified | browser-eval: rejection block renders "Sign in with Google" CTA after 401 |
| All customer pages render | ✅ `/`, `/pricing`, `/chat`, `/leaderboard`, `/history`, `/share/[id]`, `/design-preview` all return 200 with content signatures |
| No fake stats anywhere in customer UI | ✅ Swept | `1,247,892`, `$4,823,450`, `12,000+ probes`, `Two million URLs`, `running now`, `24 live`, `deploying identities` — all replaced |
| No apologetic "test mode / beta / demo" disclaimers | ✅ Swept | Stripe banner removed from pricing; cockpit "Demo mode" relabeled to "Use cached result" |

---

## 2. What's known broken / needs human attention

| Issue | Severity | Path to fix |
|---|---|---|
| **BrightData API rejects `proxy_type` field** | 🚨 SHIP-BLOCKER | `curl /api/debug-probe` returned: `"proxy_type" is not allowed`. The BrightData Unlocker API contract changed (or the zone config doesn't support `proxy_type`). Until this is fixed, NO live probe will succeed end-to-end. Check `backend/brightdata_config.py` and the live zone settings in the Bright Data dashboard. Likely the field should be removed, or the residential/mobile distinction should be encoded via separate zones. |
| **Supabase migration 202605270001 not applied** | 🟠 HIGH | Public board returns `[]` until applied. Apply via `supabase db push` or paste into SQL editor. |
| **Stripe checkout / webhook not E2E tested** | 🟠 HIGH | Code paths exist and the webhook signature check fires; not exercised with a real test card. |
| **Google OAuth redirect URLs not configured for production** | 🟡 MEDIUM | Local `localhost:3000/auth/callback` works. Production callback URL must be added to Supabase Auth settings before deploying. |
| **Localhost history fallback** | 🟢 LOW | History page now fetches `/api/history` first (user-scoped). Falls back to localStorage ONLY when backend returns empty. Acceptable for launch; remove fallback once all users have run at least one authenticated probe. |
| **`/share/[id]` body still uses old `ResultCard`** | 🟢 LOW | Shell is in new design system; inner body inherits older `dashboard.tsx` styling. Not visually broken, just inconsistent. |

---

## 3. Apply this migration before any production cutover

```bash
# Option A: Supabase CLI (recommended)
cd Jacobi
supabase db push

# Option B: Manual via SQL Editor
# Paste the contents of:
#   supabase/migrations/202605270001_board_visibility_and_tiers.sql
# into the Supabase project's SQL editor and run.
```

The migration is idempotent — safe to run on a database that already has
some of the columns.

### What it does

1. Adds `is_public BOOLEAN NOT NULL DEFAULT FALSE` to `probes`.
2. Adds `is_demo BOOLEAN NOT NULL DEFAULT FALSE` to `probes`.
3. Adds index on `(is_public, is_demo, created_at DESC)`.
4. Creates RLS policy `probes_select_public_board` for `anon` + `authenticated`
   SELECT on rows where `is_public = TRUE OR is_demo = TRUE`.
5. Updates the `handle_new_user()` trigger so new free signups get
   `probes_limit = 24` (was 15).
6. Bumps existing free profiles from `probes_limit IN (3, 15)` to `24`.

### Optional follow-up: mark curated demo rows

So the board has content for first-time visitors before any user opts in:

```sql
UPDATE public.probes SET is_demo = TRUE
 WHERE target_name IN (
   'Leela Palace Bangalore',
   'Tokyo Hotels Search',
   'Wireless Headphones'
 );
```

---

## 4. Stripe — test-mode end-to-end checklist

**Keep Stripe in TEST mode** until the first paying customer commits.

### One-time setup (Stripe Dashboard → Test mode toggle ON)

1. Confirm the publishable / secret key in `.env.local` start with `pk_test_`
   and `sk_test_` respectively.
2. Confirm `STRIPE_PRO_PRICE_ID` points to a test-mode product priced at $29/mo.
3. Webhook endpoint:
   - Local: forward via Stripe CLI (see below).
   - Production: add `https://<your-backend>/api/billing/webhook` in Stripe
     dashboard, copy the `whsec_*` into `STRIPE_WEBHOOK_SECRET`.

### Local E2E test procedure

```bash
# Terminal 1 — backend
cd Jacobi/backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — frontend
cd Jacobi/frontend
npm run start          # or npm run dev

# Terminal 3 — Stripe webhook forwarding
stripe listen --forward-to localhost:8000/api/billing/webhook
# Copy the displayed `whsec_*` into Jacobi/.env.local as STRIPE_WEBHOOK_SECRET
# and restart the backend.

# Manual steps in browser:
# 1. Sign in via Google on the app.
# 2. Visit /pricing, click "Go Pro".
# 3. Use card 4242 4242 4242 4242, any future date, any CVC, any ZIP.
# 4. On checkout success you should be redirected to /billing/success.
# 5. Webhook fires → apply_subscription_active() runs:
#       profiles.subscription_tier = 'pro'
#       profiles.probes_limit      = 50
#       subscriptions row upserted
# 6. Reload /pricing — the Pro card should show "ACTIVE" badge.
# 7. Reload /chat — quota header should reflect Pro limit.
# 8. /api/billing/sync is the self-healing fallback if the webhook never lands.
```

### Production webhook gotchas

- The webhook URL is the bare `/api/billing/webhook` — make sure CORS does
  not block it (it's a POST from Stripe's IPs, not a browser).
- The webhook secret in production is DIFFERENT from the local CLI's `whsec_`.
  Use the one printed in the Stripe Dashboard → Webhooks endpoint page.

---

## 5. Auth — Supabase OAuth setup

### Local

Supabase Auth → URL Configuration:

- Site URL: `http://localhost:3000`
- Additional Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3200/auth/callback`  *(if you also test the prod build)*

### Production (do BEFORE deploying)

Add to the same Supabase Auth → URL Configuration:
- `https://<your-vercel-domain>/auth/callback`
- (Optional, for previews) `https://*.vercel.app/auth/callback`

---

## 6. Deployment plan — Railway (backend) + Vercel (frontend)

### Pre-deployment checklist

- [ ] BrightData `proxy_type` issue resolved (item #2 above).
- [ ] Supabase migration `202605270001` applied to the live DB.
- [ ] Stripe TEST mode webhook works locally end-to-end.
- [ ] Google OAuth redirect URLs include the production domain.

### Backend → Railway

1. Create a new Railway service from this repo, root `Jacobi/backend`.
2. Start command:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
3. Environment variables (copy from local `.env.local`, but use production
   Supabase + production Stripe webhook secret):
   ```
   BRIGHTDATA_API_KEY
   BRIGHTDATA_UNLOCKER_ZONE
   SUPABASE_URL
   SUPABASE_SERVICE_KEY
   NEXT_PUBLIC_SUPABASE_ANON_KEY          # auth_user falls back to this
   STRIPE_SECRET_KEY                       # still sk_test_
   STRIPE_PRO_PRICE_ID
   STRIPE_WEBHOOK_SECRET                   # from Stripe dashboard webhook page
   FRONTEND_URL                            # https://<vercel-domain>
   FREE_MONTHLY_PROBES=24
   PRO_MONTHLY_PROBES=50
   GEMINI_API_KEY (or AIMLAPI_KEY / GROQ_API_KEY)
   ```
4. Add the Railway URL to Stripe webhook destinations:
   `https://<railway-domain>/api/billing/webhook`
5. Verify with `curl https://<railway-domain>/health` — should return
   `brightdata_configured: true`.

### Frontend → Vercel

1. Import this repo, root `Jacobi/frontend`.
2. Environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://<railway-domain>
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY      # still pk_test_
   ```
3. Build command (default Next.js): `npm run build`.
4. Output directory (default): `.next`.
5. After first deploy, verify:
   - `https://<vercel-domain>` loads landing.
   - `/pricing` shows Free 24 / Pro 50 / Enterprise.
   - `/chat` shows the cockpit.
   - Network tab: requests to `NEXT_PUBLIC_API_URL` succeed (CORS).

### Production CORS

In `backend/main.py` the `CORSMiddleware` allow_origins list must include
your Vercel domain. Today it likely includes `*` or `localhost` only —
verify and tighten.

---

## 7. Post-deploy verification (run in this order)

1. **Health**: `curl https://<railway>/health` → 200, brightdata_configured.
2. **Auth boundary**:
   ```
   curl -X POST https://<railway>/api/probe -d '{}' -H 'content-type: application/json'
   ```
   Expect `401 auth_required`.
3. **Forged Bearer**: same request with `Authorization: Bearer fake`.
   Expect `401`.
4. **Sign in via Google** on `https://<vercel>` — confirm redirect lands on
   `/auth/callback?...&next=...` and session persists.
5. **Run a real probe** as a signed-in user:
   - Hit `/chat`, paste a URL (e.g. the Leela Palace booking link).
   - Watch the 24-agent wave deploy in the visualizer.
   - Confirm result saves: `SELECT * FROM probes WHERE user_id = '<uid>'`.
   - Confirm `/api/history` returns it.
   - Confirm `/leaderboard` does NOT show it (private by default).
6. **Test the board opt-in path** by tickng the "Include on public board"
   checkbox and running another probe. Confirm it appears on `/leaderboard`.
7. **Quota test (Free=24)**: hit `/api/billing/plan` — confirm `used` increases
   per probe and the cockpit shows a "Monthly limit reached" card on probe 25.
8. **Stripe test checkout**: as above.
9. **Pro quota test**: as a Pro user, attempt probe 51 — confirm 402 with
   `Upgrade to Pro` button replaced by `Manage billing` (since they're already Pro).

---

## 8. Backend integration TODO (24 → 50 expansion plan)

> Do this AFTER everything above is green. The user's directive: 24-flow
> works perfectly FIRST, then talk about expanding.

When you do expand:

1. **Don't bump `AGENT_CONFIGS` to 50 entries.** The 24 configs are
   statistically tuned (4 vectors × 2 directions × 3 network tiers ≈ 24).
   50 isn't an integer multiple and breaks the experimental design.
2. **Pro=50 monthly credits is already implemented.** No backend change
   needed there — `can_run_probe()` already enforces 50 for tier=`pro`,
   the trigger seeds 50 on Pro upgrade.
3. If you mean "more identities per probe," redo the experimental design
   first. Options: 32 (4×2×4 tiers) or 48 (4×3×4 tiers). Talk before coding.

---

## 9. The "where does each thing live" map

```
Jacobi/
├── frontend/                 — Next.js 14 App Router
│   ├── app/
│   │   ├── page.tsx          — landing
│   │   ├── pricing/page.tsx  — Free 24 / Pro 50 / Enterprise
│   │   ├── chat/page.tsx     — cockpit shell (renders CockpitProbe)
│   │   ├── leaderboard/page.tsx — opt-in public board
│   │   ├── history/page.tsx  — backend-first user history
│   │   ├── share/[id]/page.tsx — share-page shell (design-system wrapped)
│   │   └── design-preview/   — design reference (non-customer)
│   ├── components/
│   │   ├── design/
│   │   │   ├── cockpit/CockpitProbe.tsx — Bearer-auth probe + opt-in toggle + 401/402 UX
│   │   │   ├── DesignNav.tsx
│   │   │   ├── DesignFooter.tsx
│   │   │   ├── BrandLockup.tsx — JAC[ ]BI wordmark
│   │   │   └── landing-interactions.ts — useReveals, useCounters, useGlobe
│   │   └── route-chrome.tsx  — design-route skip list
│   └── lib/
│       ├── supabase/client.ts — auth getSession()
│       ├── billing.ts         — fetchPlan, startCheckout, startPortal, syncSubscription
│       └── api-base.ts
│
├── backend/                  — FastAPI
│   ├── main.py               — app, /api/probe, /api/history, /api/leaderboard, AGENT_CONFIGS, WAVE_CONFIGS
│   ├── auth_user.py          — get_optional_user(): Bearer JWT → Supabase user
│   ├── profile_store.py      — can_run_probe, increment_probe_count, apply_subscription_*
│   ├── supabase_client.py    — save_probe, get_probe_history, get_probe_history_for_user, get_public_board
│   ├── billing.py            — /api/billing/* (checkout, sync, portal, plan, webhook)
│   ├── stripe_client.py      — create_checkout_session, verify_webhook
│   ├── gemini_analyzer.py    — narrative analysis
│   └── report_export.py      — PDF / CSV / JSON export router
│
├── supabase/migrations/
│   ├── 202605260001_… create_jacobi_tables.sql
│   ├── 202605262030_… add_user_id_and_billing_columns.sql
│   └── 202605270001_… board_visibility_and_tiers.sql   ← APPLY ME
│
└── .env.local                — root env (FREE/PRO_MONTHLY_PROBES, Supabase, Stripe)
```

---

## 10. The honest readiness verdict

- ✅ **Local SaaS-flow ready for the 24-identity engine path.**
- ❌ **NOT deployment-ready** until:
  1. BrightData `proxy_type` issue resolved.
  2. Supabase migration applied to live DB.
  3. Stripe test checkout verified end-to-end with a real test card.
  4. Production Google OAuth redirect URL configured.
  5. Production CORS origin list updated.
- 💳 **Stripe stays in TEST mode** until the first paying customer commits.
- 🔒 **Nothing has been deployed.**
- 🧬 **The probe engine still deploys exactly 24 synthetic identities.**
  Do not change that count without redoing the experimental design.
