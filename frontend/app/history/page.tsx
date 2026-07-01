"use client";

/**
 * History — the logbook of past probes, rebuilt on the .jx forensic system.
 *
 * Three states:
 *   1. Logged-out  → sign-in CTA (Google via Supabase OAuth)
 *   2. Logged-in, zero probes → honest empty state
 *   3. Logged-in with probes  → .jx data table
 *
 * The data layer is UNCHANGED: backend `/api/history` (user-scoped, RLS-safe)
 * with a localStorage fallback for pre-auth probes. Only the presentation moves
 * from the old jacobi-design board to the .jx table.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MarketingShell from "../../components/marketing/MarketingShell";
import { PageHeader, SectionMarker } from "../../components/marketing/parts";
import { createClient } from "../../lib/supabase/client";
import { getClientApiBase } from "../../lib/api-base";

interface ConversationSummary {
  id: string;
  session_id?: string;
  title: string;
  timestamp: number;
  targetUrl: string;
  targetName?: string;
  baselinePrice?: number | null;
  savings?: number | null;
  topologyClass?: string;
}

interface BackendHistoryRow {
  session_id: string;
  target_url: string;
  target_name?: string;
  timestamp: string;
  status: string;
  baseline_price?: number | null;
  max_price_spread?: number | null;
  topology_class?: string;
}

const TOPO_COLOR: Record<string, string> = {
  uniform:     "#33d39b",
  selective:   "#92a6ff",
  progressive: "#ffb053",
  aggressive:  "#ff5d6b",
};

function host(url: string): string {
  try { return new URL(url).host; }
  catch { return url.replace(/^https?:\/\//, "").split("/")[0]; }
}

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60)    return `${Math.round(s)}s ago`;
  if (s < 3600)  return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function HistoryPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  useEffect(() => {
    if (signedIn !== true) return;
    let alive = true;
    (async () => {
      try {
        // Primary: ask the backend for this user's probes (user-scoped, RLS-safe).
        // Refresh the session if needed — see lib/billing.ts authHeaders() for
        // the full reasoning. tl;dr: getSession() doesn't refresh stale tokens.
        const sb = createClient();
        let { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) {
          try {
            const { data: refreshed } = await sb.auth.refreshSession();
            session = refreshed.session;
          } catch { /* truly signed out */ }
        }
        const token = session?.access_token;
        const apiBase = getClientApiBase();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const r = await fetch(`${apiBase}/api/history?limit=50`, { headers });
        if (r.ok) {
          const rows: BackendHistoryRow[] = await r.json();
          if (!alive) return;
          const mapped: ConversationSummary[] = rows.map(row => ({
            id: row.session_id,
            session_id: row.session_id,
            title: (row.target_name || row.target_url || "Probe").slice(0, 50),
            timestamp: row.timestamp ? new Date(row.timestamp).getTime() : Date.now(),
            targetUrl: row.target_url,
            targetName: row.target_name,
            baselinePrice: row.baseline_price ?? null,
            savings: row.max_price_spread ?? null,
            topologyClass: row.topology_class,
          }));
          if (mapped.length > 0) {
            setConversations(mapped);
            return;
          }
        }
      } catch { /* fall through to localStorage */ }

      // Fallback ONLY when backend returns nothing — preserves per-device
      // history of pre-auth probes captured during early access.
      if (!alive) return;
      const raw = localStorage.getItem("probe-conversations");
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) setConversations(data);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [signedIn]);

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.timestamp - a.timestamp),
    [conversations],
  );

  async function signIn() {
    const sb = createClient();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/history` },
    });
  }

  function clearHistory() {
    localStorage.removeItem("probe-conversations");
    setConversations([]);
    setConfirmClear(false);
  }

  return (
    <MarketingShell>
      <PageHeader
        eyebrow="Logbook"
        title={<>Your <span className="jx-soft">audit history</span>.</>}
        lede="Every audit you've run — target, topology, spread, and the evidence behind it — kept in one reviewable trail."
      />

      <SectionMarker id="01" name="The logbook" meta="probes · topology · spread" />
      <section className="jx-section jx-section--tight">
        <div className="jx-wrap jx-wrap--wide">
          {/* ── Loading auth ──────────────────────────────────── */}
          {signedIn === null && (
            <div className="jx-state jx-state--quiet" data-reveal>
              <div className="jx-state__label">Checking session…</div>
            </div>
          )}

          {/* ── Logged out ────────────────────────────────────── */}
          {signedIn === false && (
            <div className="jx-state" data-reveal>
              <div className="jx-state__label">Sign in to view history</div>
              <p className="jx-state__body">
                Your probes are tied to your account. Sign in with Google to see your
                evidence trail across devices.
              </p>
              <div className="jx-state__cta">
                <button onClick={signIn} className="jx-btn jx-btn--primary">Sign in with Google →</button>
              </div>
            </div>
          )}

          {/* ── Logged in, empty ──────────────────────────────── */}
          {signedIn === true && sorted.length === 0 && (
            <div className="jx-state" data-reveal>
              <div className="jx-state__label">The logbook is empty</div>
              <p className="jx-state__body">Audit a URL to start building your evidence trail.</p>
              <div className="jx-state__cta">
                <Link href="/chat" className="jx-btn jx-btn--primary">Start an audit →</Link>
              </div>
            </div>
          )}

          {/* ── Logged in, has probes ─────────────────────────── */}
          {signedIn === true && sorted.length > 0 && (
            <>
              <div className="jx-tablebar" data-reveal>
                <span>{sorted.length} probe{sorted.length !== 1 ? "s" : ""} recorded</span>
                {!confirmClear ? (
                  <button onClick={() => setConfirmClear(true)} className="jx-minibtn">Clear all</button>
                ) : (
                  <span style={{ display: "flex", gap: 8 }}>
                    <button onClick={clearHistory} className="jx-minibtn jx-minibtn--danger">Confirm delete</button>
                    <button onClick={() => setConfirmClear(false)} className="jx-minibtn">Cancel</button>
                  </span>
                )}
              </div>

              <div className="jx-table-stage" data-reveal>
                <div className="jx-table jx-table--history">
                  <div className="jx-table__head">
                    <span>#</span><span>Target</span><span>Topology</span>
                    <span className="r">Spread</span><span className="r">Probed</span><span className="r">&nbsp;</span>
                  </div>
                  {sorted.map((entry, i) => {
                    const topo = (entry.topologyClass || "uniform").toLowerCase();
                    const c = TOPO_COLOR[topo] || "var(--jx-ink-3)";
                    const savings = entry.savings ?? 0;
                    return (
                      <div key={entry.id} className="jx-table__row">
                        <span className="jx-table__rank">{String(i + 1).padStart(2, "0")}</span>
                        <span className="jx-table__target">
                          <span className="jx-table__name">{entry.targetName || host(entry.targetUrl)}</span>
                          <span className="jx-table__host">{host(entry.targetUrl)}</span>
                        </span>
                        <span className="jx-topo" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}>
                          <span className="d" style={{ background: c }} />{topo}
                        </span>
                        <span className={`jx-table__spread r${savings === 0 ? " zero" : ""}`}>
                          {savings > 0 ? `+$${Math.round(savings)}` : "—"}
                        </span>
                        <span className="jx-table__time r">{timeAgo(entry.timestamp)}</span>
                        <span className="r">
                          <Link href={`/chat?url=${encodeURIComponent(entry.targetUrl)}`} className="jx-minibtn">Rerun</Link>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
