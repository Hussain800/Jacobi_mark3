"use client";

/**
 * History — the logbook of past probes, ported to the Claude Design system.
 *
 * Three states:
 *   1. Logged-out  → sign-in CTA (Google via Supabase OAuth)
 *   2. Logged-in, zero probes → honest empty state
 *   3. Logged-in with probes  → table of probes from localStorage
 *
 * NOTE: per-user history is currently sourced from localStorage
 * (`probe-conversations`) since that's how /chat persists results today.
 * When the backend ships a `/api/history?user=…` endpoint, swap the
 * loader in `loadHistory()`.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import { useReveals } from "../../components/design/landing-interactions";
import { createClient } from "../../lib/supabase/client";
import { getClientApiBase } from "../../lib/api-base";
import "../jacobi-design.css";

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
  uniform:     "#3ad79f",
  selective:   "#d8b06a",
  progressive: "#ff9d52",
  aggressive:  "#ff5468",
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

  useReveals();

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
    <div className="jacobi-design">
      <Script src="/jacobi-design/scene.js"   strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />

      <DesignNav />

      <main className="page">
        <section className="section page-top">
          <div className="wrap">
            <div className="sec-head" data-reveal>
              <span className="eyebrow">
                <span className="dot">●</span> Logbook
              </span>
              <h1 className="display sec-title">
                Your{" "}
                <span className="serif-i" style={{ color: "var(--cobalt-bright)" }}>
                  probe history
                </span>
              </h1>
              <p className="sec-lede sec">
                Every probe you've run, with topology, spread, and the receipts.
              </p>
            </div>

            {/* ── Loading auth ────────────────────────────────────── */}
            {signedIn === null && (
              <div
                data-reveal
                style={{
                  padding: "80px 0",
                  textAlign: "center",
                  color: "var(--text-3)",
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                }}
              >
                Checking session…
              </div>
            )}

            {/* ── Logged out ──────────────────────────────────────── */}
            {signedIn === false && (
              <div
                data-reveal
                style={{
                  padding: "80px 24px",
                  textAlign: "center",
                  border: "1px dashed var(--line-2)",
                  borderRadius: "var(--r)",
                  background: "linear-gradient(180deg, var(--surface), var(--ink-2))",
                }}
              >
                <div className="label-mono" style={{ marginBottom: 14, color: "var(--cobalt-bright)" }}>
                  Sign in to view history
                </div>
                <p style={{ fontSize: 14, color: "var(--text-2)", maxWidth: 460, margin: "0 auto 22px", lineHeight: 1.6 }}>
                  Your probes are tied to your account. Sign in with Google to
                  see your evidence trail across devices.
                </p>
                <button onClick={signIn} className="btn btn-primary">
                  Sign in with Google →
                </button>
              </div>
            )}

            {/* ── Logged in, empty ────────────────────────────────── */}
            {signedIn === true && sorted.length === 0 && (
              <div
                data-reveal
                style={{
                  padding: "80px 24px",
                  textAlign: "center",
                  border: "1px dashed var(--line-2)",
                  borderRadius: "var(--r)",
                  background: "linear-gradient(180deg, var(--surface), var(--ink-2))",
                }}
              >
                <div className="label-mono" style={{ marginBottom: 14, color: "var(--cobalt-bright)" }}>
                  The logbook is empty
                </div>
                <p style={{ fontSize: 14, color: "var(--text-2)", maxWidth: 460, margin: "0 auto 22px", lineHeight: 1.6 }}>
                  Probe a URL to start building your evidence trail.
                </p>
                <Link href="/chat" className="btn btn-primary">
                  Start a probe →
                </Link>
              </div>
            )}

            {/* ── Logged in, has probes ───────────────────────────── */}
            {signedIn === true && sorted.length > 0 && (
              <>
                <div
                  data-reveal
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "var(--text-3)",
                  }}
                >
                  <span>{sorted.length} probe{sorted.length !== 1 ? "s" : ""} recorded</span>
                  {!confirmClear ? (
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="btn btn-ghost"
                      style={{ fontSize: 10, padding: "6px 12px" }}
                    >
                      Clear all
                    </button>
                  ) : (
                    <span style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={clearHistory}
                        className="btn btn-primary"
                        style={{ fontSize: 10, padding: "6px 12px" }}
                      >
                        Confirm delete
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="btn btn-ghost"
                        style={{ fontSize: 10, padding: "6px 12px" }}
                      >
                        Cancel
                      </button>
                    </span>
                  )}
                </div>

                <div className="board-scroll" data-reveal>
                  <div className="board-table">
                    <div className="bt-head">
                      <span>#</span>
                      <span>Target</span>
                      <span>Topology</span>
                      <span>Spread</span>
                      <span>Probed</span>
                      <span>&nbsp;</span>
                      <span>&nbsp;</span>
                    </div>
                    {sorted.map((entry, i) => {
                      const topo = (entry.topologyClass || "uniform").toLowerCase();
                      const c = TOPO_COLOR[topo] || "var(--text-3)";
                      const savings = entry.savings ?? 0;
                      return (
                        <div key={entry.id} className="bt-row" data-reveal>
                          <span className="bt-rank">{String(i + 1).padStart(2, "0")}</span>
                          <span className="bt-target">
                            <span className="bt-name">{entry.targetName || host(entry.targetUrl)}</span>
                            <span className="bt-host">{host(entry.targetUrl)}</span>
                          </span>
                          <span
                            className="topo-pill"
                            style={{ color: c, borderColor: `${c}55`, background: `${c}12` }}
                          >
                            <span className="d" style={{ background: c }} />
                            {topo}
                          </span>
                          <span className={`bt-spread ${savings === 0 ? "zero" : ""}`}>
                            {savings > 0 ? `+$${Math.round(savings)}` : "—"}
                          </span>
                          <span className="bt-time">{timeAgo(entry.timestamp)}</span>
                          <span>
                            <Link
                              href={`/chat?url=${encodeURIComponent(entry.targetUrl)}`}
                              className="btn btn-ghost"
                              style={{ fontSize: 10, padding: "6px 12px" }}
                            >
                              Rerun
                            </Link>
                          </span>
                          <span>&nbsp;</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <DesignFooter />
    </div>
  );
}
