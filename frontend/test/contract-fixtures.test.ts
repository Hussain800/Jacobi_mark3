import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repoFixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../contracts/api/v1/fixtures/${name}`, import.meta.url), "utf8"),
  );

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string) {
  assert.equal(typeof value, "string", `${label} must be a string`);
}

function assertNumber(value: unknown, label: string) {
  assert.equal(typeof value, "number", `${label} must be a number`);
}

function assertEnvelope(payload: JsonRecord, family: string) {
  assert.equal(payload.contract_version, "2026-07-22.g012");
  assert.equal(payload.family, family);
  assert.equal(payload.mode, "demo_fixture");
  assert.ok(isRecord(payload.source));
  assertString(payload.source.code_reference, `${family}.source.code_reference`);
}

test("audit contract decodes with additive-field tolerance and limited-coverage guardrails", () => {
  const fixture = repoFixture("audit-result-insufficient-data.demo.json") as JsonRecord;
  assertEnvelope(fixture, "audit_result");
  assert.ok(isRecord(fixture.uncertainty));
  assert.equal(fixture.uncertainty.coverage, "limited");

  const response = fixture.response as JsonRecord;
  assertString(response.session_id, "session_id");
  assertString(response.target_url, "target_url");
  assert.equal(response.status, "completed");
  assert.equal(response.coverage, "limited");
  assert.equal(response.topology_class, "insufficient_data");
  assert.equal(response.real_probes_executed, 1);
  assert.equal(response.evidence_count, 1);
  assert.ok(Array.isArray(response.agents));
  assert.ok(Array.isArray(response.gradients));
  assert.equal(response.gradients.length, 0);

  assert.ok(isRecord(response.pei));
  assert.equal(response.pei.gated, false);
  assert.equal(response.pei.score, 0);

  const withUnknownFields = {
    ...response,
    future_additive_field: { accepted: true },
  };
  assert.equal(withUnknownFields.session_id, response.session_id);
});

test("enterprise workspace contract decodes job, evidence, and owner-share shapes", () => {
  const fixture = repoFixture("enterprise-workspace.demo.json") as JsonRecord;
  assertEnvelope(fixture, "enterprise_workspace");

  const response = fixture.response as JsonRecord;
  assert.equal(response.mode, "memory");
  assert.ok(Array.isArray(response.portfolio));
  assert.ok(Array.isArray(response.findings));
  assert.ok(Array.isArray(response.scan_jobs));
  assert.ok(Array.isArray(response.evidence_items));
  assert.ok(Array.isArray(response.share_tokens));

  const scanJobs = response.scan_jobs as JsonRecord[];
  assert.ok(scanJobs.some((job) => job.status === "queued" && isRecord(job.metadata) && job.metadata.run_mode === "live"));
  for (const job of scanJobs) {
    assert.ok(["queued", "running", "completed", "failed", "cancelled"].includes(String(job.status)));
    assertNumber(job.target_count, "scan_job.target_count");
    assertNumber(job.completed_count, "scan_job.completed_count");
    assertNumber(job.failed_count, "scan_job.failed_count");
  }

  const evidence = (response.evidence_items as JsonRecord[])[0];
  assert.equal(evidence.source, "live_probe");
  assert.equal(evidence.extraction_method, "generic_price_parser");
  assert.ok(isRecord(evidence.metadata));
  assert.equal(evidence.metadata.coverage_pct, 75);

  const ownerShare = (response.share_tokens as JsonRecord[])[0];
  assert.equal(ownerShare.redacted, true);
  assert.equal(Object.hasOwn(ownerShare, "token_hash"), false);
});

test("redacted enterprise share contract contains no internal identifiers", () => {
  const fixture = repoFixture("enterprise-redacted-share.demo.json") as JsonRecord;
  assertEnvelope(fixture, "enterprise_redacted_share");

  const response = fixture.response as JsonRecord;
  assert.equal(response.redacted, true);
  assert.ok(isRecord(response.share_token));
  assert.deepEqual(Object.keys(response.share_token).sort(), [
    "created_at",
    "expires_at",
    "last_accessed_at",
    "redacted",
    "revoked_at",
    "scope",
  ]);

  const serialized = JSON.stringify(response);
  for (const forbidden of [
    "organization_id",
    "finding_id",
    "scan_job_id",
    "watchlist_item_id",
    "product_id",
    "seller_id",
    "created_by",
    "requested_by",
    "revoked_by",
    "token_hash",
    "probe_row_id",
    "extraction_evidence",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `redacted share leaked ${forbidden}`);
  }
});

test("agent decision and manifest contracts preserve blocked purchase semantics", () => {
  const decisionFixture = repoFixture("agent-decision-blocked-route.demo.json") as JsonRecord;
  const manifestFixture = repoFixture("agent-manifest-blocked-route.demo.json") as JsonRecord;
  assertEnvelope(decisionFixture, "agent_decision");
  assertEnvelope(manifestFixture, "agent_manifest");

  const decision = decisionFixture.response as JsonRecord;
  const manifest = manifestFixture.response as JsonRecord;
  assert.equal(decision.schema_version, "1.0.0");
  assert.equal(decision.decision, "block");
  assert.equal(decision.ttl_seconds, 900);
  assertString(decision.expires_at, "expires_at");
  assert.equal(decision.fixture_mode, false);
  assert.ok(Array.isArray(decision.reason_codes));
  assert.ok((decision.reason_codes as unknown[]).includes("PLATFORM_AUTOMATION_RESTRICTED"));

  assert.ok(isRecord(decision.evidence));
  assert.equal(decision.evidence.capability_tier, "claim_only");
  assert.equal(decision.evidence.manifest_id, manifest.manifest_id);
  assert.match(String(decision.evidence.manifest_sha256), /^[a-f0-9]{64}$/);

  assert.ok(Array.isArray(manifest.collection_attempts));
  assert.equal(manifest.collection_attempts.length, 0);
  assert.ok(Array.isArray(manifest.artifacts));
  assert.equal(manifest.artifacts.length, 0);
});

test("error catalog keeps stable statuses and proxy mode headers", () => {
  const fixture = repoFixture("errors.demo.json") as JsonRecord;
  assertEnvelope(fixture, "error_catalog");
  assert.ok(Array.isArray(fixture.errors));

  const rows = fixture.errors as JsonRecord[];
  const byCode = new Map(rows.map((row) => [`${row.surface}:${row.code}`, row]));
  assert.equal(byCode.get("audit:auth_required")?.status, 401);
  assert.equal(byCode.get("enterprise:not_found")?.status, 404);
  assert.equal(byCode.get("enterprise:forbidden")?.status, 403);
  assert.equal(byCode.get("enterprise_worker:worker_secret_missing")?.status, 503);
  assert.equal(byCode.get("agent:rate_limited")?.status, 429);
  assert.equal(byCode.get("frontend_proxy:probe_unavailable")?.status, 503);

  for (const row of rows) {
    assert.ok(["object", "string"].includes(String(row.detail_shape)));
    if (row.surface === "frontend_proxy") {
      assert.ok(isRecord(row.headers));
      assert.equal(row.headers["x-jacobi-api-mode"], "fallback");
    }
  }
});
