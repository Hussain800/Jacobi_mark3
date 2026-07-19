"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHead } from "../ui";

type Provider = {
  provider_id: string;
  name: string;
  kind: string;
  cost: string;
  health: string;
  fixture: boolean;
  explicit_invocation_required: boolean;
  evidence_tier: string;
  limitations: string[];
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/providers/capabilities", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Provider API returned ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (active) setProviders(Array.isArray(payload.providers) ? payload.providers : []);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Provider API unavailable");
      });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <PageHead
        eyebrow="Price optimization"
        title="Provider capability truth"
        lede="This matrix comes from the configured backend. Fixtures, browser observations, direct public metadata, and managed providers stay visibly distinct."
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <Link href="/extension" className="btn btn-primary">Set up extension</Link>
        <Link href="/developers" className="btn btn-ghost">Provider plug-in guide</Link>
      </div>

      {error && (
        <div style={{ border: "1px solid var(--gold)", padding: 16, color: "var(--gold)", marginBottom: 18 }}>
          Backend unavailable: {error}
        </div>
      )}

      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflowX: "auto" }}>
        <div style={{ minWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .7fr .8fr .9fr 2fr", gap: 12, padding: "12px 16px", background: "var(--surface-2)" }}>
            {["Provider", "Kind", "Cost", "Evidence", "Activation", "Limitations"].map((heading) => (
              <span key={heading} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{heading}</span>
            ))}
          </div>
          {providers.map((provider) => (
            <div key={provider.provider_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .7fr .8fr .9fr 2fr", gap: 12, padding: "14px 16px", borderTop: "1px solid var(--line)", alignItems: "start" }}>
              <div><strong>{provider.name}</strong><div className="mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{provider.provider_id}</div></div>
              <span className="mono">{provider.kind}</span>
              <span className="mono" style={{ color: provider.cost === "zero" ? "var(--good)" : "var(--gold)" }}>{provider.cost}</span>
              <span className="mono">{provider.fixture ? "fixture" : provider.evidence_tier}</span>
              <span className="mono">{provider.explicit_invocation_required ? "explicit" : "default"}</span>
              <span style={{ color: "var(--text-2)" }}>{provider.limitations.join(" · ") || "No declared limitation"}</span>
            </div>
          ))}
          {!providers.length && !error && <div className="mono" style={{ padding: 18, borderTop: "1px solid var(--line)", color: "var(--text-2)" }}>Loading backend capabilities…</div>}
        </div>
      </div>

      <p className="mono" style={{ marginTop: 16, color: "var(--text-2)", fontSize: 11 }}>
        “Healthy” means the adapter is locally available; it is not a fabricated claim that a retailer currently permits or answers automated collection.
      </p>
    </div>
  );
}
