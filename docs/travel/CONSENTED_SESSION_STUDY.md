# Consented travel-session study plan

Status: preparation only. No participants have been recruited and no outcomes
have been collected. Repository fixtures, sandbox responses and developer
smoke tests must never be reported as real-user evidence.

## Objective and sample

Run 30–50 explicitly consented booking sessions after legal/privacy approval,
production adapter approval and target telemetry validation. Recruit a bounded
mix of flight and hotel sessions, Chromium devices and supported sites. Report
the exact denominator for every metric; blocked or unsupported pages remain in
the denominator appropriate to activation and must not be silently discarded.

This is an observational product-validation study, not evidence of market-wide
price coverage or a guaranteed saving. Do not publish causal, lowest-price or
retention claims from this sample.

## Consent and session workflow

1. Approve the study notice, controller/contact, collection fields, retention
   period, withdrawal/deletion path and participant support channel.
2. Record explicit telemetry consent before enabling any study event. Declining
   consent must leave telemetry disabled and must not block core comparison.
3. Assign a study-system participant code that is never sent as a metric
   dimension. Keep consent records outside this repository and outside travel
   event payloads.
4. Ask the participant to open a supported trip page and use the extension
   normally, without itinerary re-entry or researcher correction.
5. Have two reviewers independently label extraction, equivalence, mandatory
   cost completeness, provider environment, recommendation and revalidation.
6. Resolve reviewer disagreement before analysis. Turn confirmed failure
   classes into sanitized fixtures only after removing participant data.
7. Honor withdrawal through the authenticated deletion interface and the
   approved study-system deletion process.

## Measures to report

- activation: supported page detected / consented session;
- extraction completeness and field-level accuracy;
- exact/equivalent classification precision, with false-match count;
- provider attempt and success counts, partial failures and unsupported supply;
- complete-total rate and unknown mandatory-cost rate;
- conditional/verified/no-saving counts using exact denominators;
- median and p95 latency from intent acceptance to terminal state;
- revalidation confirmed/changed/unavailable/unsupported counts;
- alternative-opened count after successful revalidation;
- wrong-match and false-match feedback counts; and
- return use only if the approved study window and consent support it.

Report fixture, sandbox API and live official API sessions separately. A sandbox
result is not a live availability result. A returned comparable is not proof of
the lowest price on the internet.

## Instrumentation validation checklist

Complete this checklist with synthetic identifiers before recruiting anyone:

- [ ] telemetry is disabled when `JACOBI_TRAVEL_TELEMETRY_ENABLED` is absent,
  false, malformed or when extension consent is off;
- [ ] enabling study telemetry requires explicit consent and records no event
  before that state transition;
- [ ] emitted event names are limited to `identity_success`,
  `identity_uncertainty`, `providers_attempted`, `providers_successful`,
  `partial_failure`, `saving_found`, `no_saving`, `alternative_opened`,
  `latency_ms`, `false_match_report` and `wrong_match_feedback`;
- [ ] dimensions are limited to the bounded allowlist and reject URLs, titles,
  property names, airport itineraries, search IDs, capability tokens, account
  IDs, participant codes and arbitrary text;
- [ ] fixture, sandbox and live-official environments remain separable without
  adding provider payloads or identifiers;
- [ ] duplicate suppression and retry do not double-count a logical terminal
  search outcome;
- [ ] latency uses a documented start/end boundary and non-negative finite
  values; timeout and cancelled sessions remain distinguishable in analysis;
- [ ] feedback can be joined only inside the approved study system, not by
  placing a participant or search identifier in metric dimensions;
- [ ] study export contains exact numerators/denominators and a missing-data
  table before percentages are calculated;
- [ ] test deletion removes user-linked travel history and evidence namespaces
  while retaining only the documented de-identified catalogue records; and
- [ ] the approved retention schedule and backup expiry are verified in the
  target environment.

## Stop conditions and external blockers

Pause recruitment for consent defects, identifier/URL leakage, unexplained
duplicate events, cross-environment label collapse, inability to honor deletion,
or material false matches. Recruitment, participant consent, provider/site
approval, production credentials, hosted lifecycle configuration and measured
outcomes are external blockers. No result row may be filled from assumptions.
