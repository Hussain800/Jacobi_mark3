import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TRUST_LABELS,
  acceptedLiveTrustLabel,
  claimStatus,
  findingIdForScan,
  normalizeAuditUrl,
  reportTrust,
  scanNextAction,
  trustLabelText,
} from "../components/cockpit/trust-state.ts";

test("normalizes public URL input and rejects malformed or credential-bearing values", () => {
  assert.deepEqual(normalizeAuditUrl(" example.com/pricing "), {
    ok: true,
    value: "https://example.com/pricing",
  });
  assert.equal(normalizeAuditUrl("").ok, false);
  assert.equal(normalizeAuditUrl("ftp://example.com/file").ok, false);
  assert.equal(normalizeAuditUrl("https://user:secret@example.com").ok, false);
});

test("keeps demo source distinct from live result states", () => {
  assert.deepEqual(reportTrust({ status: "completed", coverage: "strong", topology_class: "progressive" }, "demo"), {
    source: "demo",
    label: "demo",
  });
  assert.equal(reportTrust({ status: "running", coverage: null, topology_class: "" }, "live").label, "running");
  assert.equal(reportTrust({ status: "completed", coverage: "limited", topology_class: "aggressive" }, "live").label, "insufficient_data");
  assert.equal(reportTrust({ status: "completed", coverage: "strong", topology_class: "indeterminate" }, "live").label, "indeterminate");
  assert.equal(reportTrust({ status: "failed", coverage: null, topology_class: "" }, "live").label, "error");
});

test("claim status does not promote limited or unattributed spread", () => {
  assert.equal(claimStatus({ coverage: "limited", topology_class: "aggressive", pei: null }).canAttribute, false);
  assert.equal(claimStatus({ coverage: "strong", topology_class: "indeterminate", pei: null }).label, "Unattributed variation");
  assert.equal(claimStatus({ coverage: "strong", topology_class: "progressive", pei: { score: 10, gated: false, basis: "gated", dispersion_index: 0, interpretation: "gated" } }).canAttribute, false);
  assert.equal(claimStatus({ coverage: "strong", topology_class: "progressive", pei: { score: 70, gated: true, basis: "controlled", dispersion_index: 70, interpretation: "supported" } }).canAttribute, true);
});

test("scan actions use only returned lifecycle status", () => {
  assert.match(scanNextAction("queued").guidance, /queued/i);
  assert.equal(scanNextAction("completed", "F-1").href, "/dashboard/evidence/F-1");
  assert.match(scanNextAction("failed").guidance, /failed/i);
  assert.deepEqual(TRUST_LABELS.map(trustLabelText), [
    "Demo data",
    "Live public audit",
    "Submitting audit",
    "Queued",
    "Running",
    "Complete",
    "Insufficient data",
    "Unattributed variation",
    "Audit unavailable",
  ]);
});

test("live trust state begins only after a server-accepted status", () => {
  assert.equal(acceptedLiveTrustLabel("queued"), "queued");
  assert.equal(acceptedLiveTrustLabel("running"), "running");
  assert.equal(acceptedLiveTrustLabel(""), "error");
});

test("scan actions link only to findings related to that scan", () => {
  const scan = { id: "scan-1", metadata: {} };
  const evidence = [
    { scan_job_id: "scan-2", finding_id: "unrelated" },
    { scan_job_id: "scan-1", finding_id: "related" },
  ];
  assert.equal(findingIdForScan(scan, evidence), "related");
  assert.equal(findingIdForScan({ id: "scan-3", metadata: {} }, evidence), null);
});
