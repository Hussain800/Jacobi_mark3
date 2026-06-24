# Jacobi Pilot Onboarding

Date: 2026-06-24

## Pilot Goal

Help a brand, reseller-ops team, or compliance lead prove that Jacobi can monitor pricing integrity, find below-MAP seller behavior, and produce evidence packets that are useful for internal review or external enforcement conversations.

## Pilot Package

Recommended pilot:

- 25 to 100 monitored URLs
- 1 to 3 product categories
- 2 to 4 week monitoring window
- weekly MAP report review
- redacted evidence shares for selected findings

## Customer Inputs

Ask the pilot customer for:

- product name
- SKU
- MAP floor
- currency
- seller name
- seller domain
- target product URL
- market
- reseller authorization status, if known

Use `docs/PILOT_CSV_TEMPLATE.csv` as the import template.

## Setup Steps

1. Confirm pilot sponsor, success criteria, and escalation contacts.
2. Create the customer workspace.
3. Import the initial CSV watchlist.
4. Run imported MAP preview to validate floors and row quality.
5. Run one live scan on a small target subset.
6. Review evidence quality with the customer before broad monitoring.
7. Enable scheduled worker execution.
8. Agree on weekly report cadence.

## Pilot Success Criteria

The pilot is successful when:

- watchlist import succeeds with less than 5 percent row errors
- live scans complete without duplicate target processing
- findings show clear severity, confidence, MAP floor, observed low, and evidence rows
- exports produce PDF and JSON artifacts with checksums
- redacted share links can be opened and revoked
- customer can identify at least one operational decision made easier by Jacobi

## Pilot Review Agenda

1. Open dashboard overview.
2. Review monitored URL count and open findings.
3. Open the evidence locker.
4. Filter/review evidence by product or seller.
5. Open one finding detail page.
6. Download MAP PDF.
7. Create redacted share link.
8. Revoke share link.
9. Review next watchlist expansion.

## Pricing And Packaging

Recommended pilot packaging:

- **Pilot:** fixed-fee design partner, limited URL volume, weekly review.
- **Professional:** self-serve or light-touch workspace with monthly URL/scan limits.
- **Enterprise:** custom volumes, API/support/SLA, procurement-ready terms.
