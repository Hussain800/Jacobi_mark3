# JACOBI — Demo Test Checklist

Pre-flight before any investor / judge / user demo. Run top to bottom; every box
should be green. Production URLs:

- Frontend: `https://jacobi-mark3.vercel.app`
- Backend:  `https://jacobi-backend.onrender.com` (Render free tier — see Cold-start)

> **Tip:** Render's free tier sleeps after ~15 min idle. Do the **Cold-start
> test** 1–2 minutes *before* the demo so the backend is warm when you present.

---

## 0. Cold-start warm-up (do this first, ~60s before demo)

- [ ] Open `https://jacobi-backend.onrender.com/health` in a tab.
- [ ] First hit after idle may take 30–60s — wait for the JSON to load.
- [ ] Confirm the JSON shows:
  - `"status": "healthy"`
  - `"probe_mode": "live"`
  - `"brightdata_configured": true`
  - `"supabase_url_shape": "ok"`
- [ ] Reload once more — should now return instantly (backend is warm).

---

## 1. Landing page

- [ ] Open `https://jacobi-mark3.vercel.app` in a normal window.
- [ ] Page loads cleanly — hero, nav, and probe bar all visible, no console errors.
- [ ] Native mouse cursor is normal and responsive (no laggy custom dot).
- [ ] Buttons look professional (solid fill / clean border, no blue glow halo).

## 2. Google auth (incognito)

- [ ] Open the site in a **fresh incognito window** (no cached session).
- [ ] Click sign-in → Google OAuth popup → choose account.
- [ ] Redirects back signed-in; nav shows the account state.
- [ ] (Do NOT change Google auth config — just verify the existing flow.)

## 3. Live scan (real URL)

- [ ] Paste a real product/hotel URL, e.g.
      `https://www.amazon.ae/Lenovo-Legion-Gaming-GeForce-Windows/dp/B0FL4HLJ56/`
- [ ] Launch. The 24-agent radial deploys; agents return in real time.
- [ ] Completes in ~20–30s for Amazon (uniform → 10 real probes, 14 skipped).
- [ ] Uniform label reads:
      **“N real probes · exact-uniform gate passed · M agents skipped”**
      (NOT “confirmed uniform”).
- [ ] Verdict strip + metrics render (baseline, spread, topology).

## 4. Evidence tab

- [ ] Open the evidence / agent table on the result.
- [ ] Real probes show raw on-page text + currency + extraction method.
- [ ] Skipped / failed / missing-evidence rows render as **“—”** (no blank crash).

## 5. PDF export — real scan

- [ ] On a completed live scan, click **Download PDF report**.
- [ ] A PDF downloads (no “Download failed” / “Report not found”).
- [ ] PDF is research-grade: white background, black serif text, title +
      Abstract + numbered sections, clean tables. No neon / dark theme.
- [ ] Long target URL in the intro wraps cleanly (no big word-gaps).

## 6. PDF export — demo / case-study scan

- [ ] From the landing page, run one of the **preset case studies**
      (e.g. Leela Palace Bangalore).
- [ ] Click **Download PDF report**.
- [ ] PDF downloads successfully (demo ids resolve to the curated demo report —
      this used to 404).

## 7. Failure / resilience spot-checks

- [ ] Paste a junk or blocked URL (e.g. a site that hard-blocks bots).
- [ ] UI shows a **clean, friendly error** with a next step — never a blank
      screen or raw stack trace.
- [ ] Click **Retry** / **New probe** — returns to a usable state.

## 8. Mobile layout

- [ ] Open the site on a phone (or DevTools device emulation, ~390px wide).
- [ ] Landing, probe bar, and a completed result are readable and not clipped.
- [ ] Buttons are tappable; tables scroll rather than overflow the viewport.

---

## Known issues (not blockers for demo)

- **Currency display:** prices are normalised to **USD** for cross-identity
  comparison. The real on-page value (e.g. `AED 11,600.00` for the Amazon.ae
  case) is captured in the **evidence layer** but the headline figure shows USD
  (`$3,158.68`). Native-currency display is a *Phase 4+ product feature*, not a
  Phase 6 hardening item — deferred by design.
- **Tax basis:** no explicit VAT/tax-inclusive vs exclusive labelling yet
  (deferred to a later phase).
- **JS-heavy hotel pages (e.g. booking.com search):** BrightData can take
  30–65s to render; very heavy pages may approach the per-agent timeout. Prefer
  a **specific hotel/product detail URL** over a search-results URL for live
  demos. Amazon product pages are the most reliable demo target.

---

## Automated backend checks (optional, before deploy)

```bash
cd backend
python -m pytest tests/ -q          # full suite (PDF export, API, audit)
python -m pytest tests/test_pdf_export.py -q   # PDF export regression (6 shapes + 404)
```

Both should pass with no failures.
