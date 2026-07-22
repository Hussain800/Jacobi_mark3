import type { TopologyReport } from "./types";

export const TRUST_LABELS = [
  "demo",
  "live",
  "submitting",
  "queued",
  "running",
  "complete",
  "insufficient_data",
  "indeterminate",
  "error",
] as const;

export type TrustLabel = (typeof TRUST_LABELS)[number];
export type AuditSource = "demo" | "live";

export type UrlValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Advisory client-side validation. The backend remains authoritative for SSRF, auth, and quota. */
export function normalizeAuditUrl(raw: string): UrlValidation {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Enter a public http(s) URL to audit." };
  if (/\s/.test(value)) return { ok: false, error: "Remove spaces from the URL and try again." };

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Use an http:// or https:// URL." };
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return { ok: false, error: "Enter a URL with a public hostname and no embedded credentials." };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, error: "That does not look like a valid http(s) URL." };
  }
}

export type TrustSnapshot = {
  source: AuditSource;
  label: TrustLabel;
};

export function reportTrust(report: Pick<TopologyReport, "status" | "coverage" | "topology_class">, source: AuditSource): TrustSnapshot {
  if (source === "demo") return { source, label: "demo" };
  const status = (report.status || "").toLowerCase();
  if (["queued", "pending"].includes(status)) return { source, label: "queued" };
  if (["running", "scanning", "deploying", "collecting", "analyzing"].includes(status)) {
    return { source, label: "running" };
  }
  if (["failed", "timeout", "cancelled", "error", "needs_context"].includes(status)) {
    return { source, label: "error" };
  }
  if (report.coverage === "limited") return { source, label: "insufficient_data" };
  if (report.topology_class === "indeterminate") return { source, label: "indeterminate" };
  return { source, label: "complete" };
}

export function trustLabelText(label: TrustLabel): string {
  return {
      demo: "Demo data",
      live: "Live public audit",
      submitting: "Submitting audit",
      queued: "Queued",
    running: "Running",
    complete: "Complete",
    insufficient_data: "Insufficient data",
    indeterminate: "Unattributed variation",
    error: "Audit unavailable",
  }[label];
}

export type ClaimStatus = {
  label: string;
  explanation: string;
  tone: "neutral" | "caution" | "positive";
  canAttribute: boolean;
};

export function claimStatus(report: Pick<TopologyReport, "coverage" | "topology_class" | "pei">): ClaimStatus {
  if (report.coverage === "limited") {
    return {
      label: "Insufficient data",
      explanation: "Observed prices are shown, but coverage is too limited to support a buyer-context pricing claim.",
      tone: "caution",
      canAttribute: false,
    };
  }
  if (report.topology_class === "indeterminate") {
    return {
      label: "Unattributed variation",
      explanation: "Prices varied, but the returned evidence does not attribute that spread to a controlled buyer-context signal.",
      tone: "neutral",
      canAttribute: false,
    };
  }
  if (report.pei && !report.pei.gated) {
    return {
      label: "Attribution gate not met",
      explanation: "The price-exploitation index is displayed as gated because the controlled-gradient requirements were not met.",
      tone: "caution",
      canAttribute: false,
    };
  }
  if (report.topology_class === "uniform") {
    return {
      label: "No material variation observed",
      explanation: "The tested profiles returned prices without material controlled variation.",
      tone: "positive",
      canAttribute: false,
    };
  }
  return {
    label: "Controlled variation observed",
    explanation: "At least one controlled gradient cleared the backend significance gate; review the axis samples and raw evidence before drawing conclusions.",
    tone: "positive",
    canAttribute: true,
  };
}

export type ScanAction = {
  label: string;
  guidance: string;
  href?: string;
};

export function scanNextAction(status: string, findingId?: string | null): ScanAction {
  switch (status) {
    case "queued":
      return { label: "Monitor queued scan", guidance: "The job is queued; refresh the workspace for worker progress." };
    case "running":
      return { label: "Monitor running scan", guidance: "The job is still collecting. Refresh to update target, completed, and failed counts." };
    case "completed":
      return findingId
        ? { label: "Review finding evidence", guidance: "The scan completed. Inspect the linked finding and its evidence packet.", href: `/dashboard/evidence/${findingId}` }
        : { label: "Review scan output", guidance: "The scan completed without a linked finding in this response." };
    case "failed":
      return { label: "Review failed scan", guidance: "The backend reported a failed scan. Inspect the error before retrying; no finding is assumed." };
    case "cancelled":
      return { label: "Requeue when ready", guidance: "This scan was cancelled. Start a new scan only after confirming the watchlist and scope." };
    default:
      return { label: "Inspect scan status", guidance: "The workspace returned an unrecognized scan status; no completion is inferred." };
  }
}

export function scanTrustLabel(status: string): TrustLabel {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "completed") return "complete";
  if (status === "failed" || status === "cancelled") return "error";
  return "error";
}

/** Map only a server-accepted probe status to a live trust label. */
export function acceptedLiveTrustLabel(status: unknown): TrustLabel {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "queued" || normalized === "pending") return "queued";
  if (["running", "scanning", "deploying", "collecting", "analyzing"].includes(normalized)) return "running";
  if (normalized === "completed") return "complete";
  return "error";
}

/** Resolve a finding only from the scan's own metadata/evidence relationship. */
export function findingIdForScan(
  scan: { id: string; metadata?: Record<string, unknown> },
  evidence: Array<{ scan_job_id?: string | null; finding_id?: string | null }>,
): string | null {
  const metadata = scan.metadata || {};
  const direct = metadata.finding_id;
  if (typeof direct === "string" && direct) return direct;
  const ids = metadata.finding_ids;
  if (Array.isArray(ids)) {
    const first = ids.find((value): value is string => typeof value === "string" && Boolean(value));
    if (first) return first;
  }
  return evidence.find((item) => item.scan_job_id === scan.id && typeof item.finding_id === "string" && Boolean(item.finding_id))?.finding_id || null;
}
