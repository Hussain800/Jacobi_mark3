# Jacobi Investor Demo Script

Date: 2026-06-24

## Positioning

Jacobi is a compliance-led price-integrity platform. It runs controlled synthetic-buyer audits across seller pages, detects MAP undercutting and suspicious price variation, and turns observations into evidence packets that brand-protection and compliance teams can act on.

## Demo Flow

1. **Open the homepage.**
   - Message: Jacobi is not a consumer coupon app. It is an enterprise evidence system for pricing integrity.

2. **Open `/dashboard/overview`.**
   - Show open findings, monitored URLs, high-confidence rate, and audit volume.
   - Call out that anonymous demo data is labeled honestly.

3. **Open `/dashboard/portfolio`.**
   - Show watchlist import and live scan controls.
   - Explain that each row maps product, seller, MAP floor, and target URL.

4. **Import CSV.**
   - Use a controlled public URL and `docs/PILOT_CSV_TEMPLATE.csv`.
   - Run imported MAP preview first.

5. **Run live scan.**
   - Explain durable worker claim/release behavior and partial completion.
   - Mention Smart 24 and Pro 50 guardrails.

6. **Open `/dashboard/evidence`.**
   - Show evidence rows independent of findings.
   - Explain buyer context, observed price, extraction method, source, captured time.

7. **Open a finding detail page.**
   - Show MAP floor, observed low, below-floor percentage, severity, confidence, and coverage.

8. **Export report.**
   - Download MAP PDF.
   - Export JSON.
   - Point out checksum metadata and export audit records.

9. **Create external share.**
   - Create a redacted share link.
   - Open it in a logged-out browser.
   - Revoke it and show the link no longer works.

10. **Open `/dashboard/settings`.**
   - Show roles and invites.
   - Explain owner/admin/analyst/viewer boundaries.

11. **Open production readiness docs.**
   - Show `docs/PRODUCTION_READINESS_CHECKLIST.md`.
   - Explain Supabase RLS verification and BrightData cost controls.

## Key Proof Points

- Existing probe engine is reused; the pivot is not a vaporware rebuild.
- MAP workflow stores durable evidence and audit logs.
- Worker supports retry-safe queue draining and partial completion.
- Exports and shares are revocable, redacted, and checksum-backed.
- Cost and abuse controls exist before paid pilots.

## Close

Jacobi is now ready for design-partner pilots after production environment verification: migrations applied, RLS verified, worker secret configured, BrightData credentials live, and one controlled pilot smoke test completed.
