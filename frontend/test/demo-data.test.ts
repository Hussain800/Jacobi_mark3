import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FINDINGS,
  PORTFOLIO,
  kpis,
  getFinding,
  severityColor,
  confidenceColor,
  typeLabel,
  statusLabel,
  fmtDate,
} from "../app/dashboard/demo-data.ts";

test("FINDINGS is a non-empty array of well-formed records", () => {
  assert.ok(Array.isArray(FINDINGS));
  assert.ok(FINDINGS.length > 0);
  for (const f of FINDINGS) {
    assert.equal(typeof f.id, "string");
    assert.equal(typeof f.spreadPct, "number");
    assert.ok(Array.isArray(f.agents));
  }
});

test("PORTFOLIO references valid finding ids", () => {
  const findingIds = new Set(FINDINGS.map((f) => f.id));
  for (const p of PORTFOLIO) {
    if (p.findingId) {
      assert.ok(findingIds.has(p.findingId), `portfolio ${p.id} references unknown finding ${p.findingId}`);
    }
  }
});

test("getFinding returns the correct record or undefined", () => {
  assert.equal(getFinding(FINDINGS[0].id), FINDINGS[0]);
  assert.equal(getFinding("does-not-exist"), undefined);
});

test("kpis returns consistent, bounded summary", () => {
  const k = kpis();
  assert.equal(k.openFindings, FINDINGS.filter((f) => f.status !== "resolved").length);
  assert.equal(k.monitoredUrls, PORTFOLIO.length);
  assert.ok(k.highConfidencePct >= 0 && k.highConfidencePct <= 100);
  assert.ok(k.critical >= 0 && k.high >= 0);
});

test("presentation helpers are total and deterministic", () => {
  assert.equal(severityColor("critical"), "var(--over)");
  assert.equal(confidenceColor("insufficient"), "var(--text-2)");
  assert.equal(typeLabel("surveillance"), "Surveillance-pricing exposure");
  assert.equal(typeLabel("map"), "MAP undercut");
  assert.equal(statusLabel("reviewing"), "Reviewing");
});

test("fmtDate formats UTC deterministically (no locale drift)", () => {
  assert.equal(fmtDate("2026-06-23T14:20:00Z"), "Jun 23, 2026");
  assert.equal(fmtDate("2026-01-05T00:00:00Z"), "Jan 5, 2026");
});
