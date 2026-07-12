# Real-user validation protocol

This protocol prepares Phase 4 validation without fabricating results. Recruiting participants, collecting consent, retailer/legal approval, and measured outcomes remain external.

## Instrumented outcomes

With explicit telemetry opt-in, Jacobi records bounded aggregate events for identity success/uncertainty, providers attempted/successful, partial failures, saving/no saving, alternative opened, latency, false-match reports, and wrong-match feedback. URL, title, identifier, seller name, account data, and arbitrary dimensions are rejected by the recorder.

## Study workflow

1. Recruit consented UAE electronics shoppers across the target retailers and devices.
2. Record the product page and expected model/variant label in a separately access-controlled study system.
3. Run the unpacked or approved extension with telemetry consent explicitly enabled.
4. Have two reviewers independently label identity, equivalence, all-in completeness, seller legitimacy, warranty, and recommendation correctness.
5. Resolve disagreements before computing precision, exact-match recall, false-positive rate, saving rate, open rate, and median/p95 latency.
6. File every wrong-match class as a versioned fixture/golden-dataset addition before changing rules.

## Release gates from the PDR

Report exact denominators and confidence intervals. Do not publish a percentage from fixtures as a user-study result. Record blocked pages separately from extraction failures, and browser-observed support separately from independently collected support.

Store only the minimum consented study record, define retention/deletion before collection, and never place raw study data in this repository.
