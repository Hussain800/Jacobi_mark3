"use client";

/**
 * Terminal — the probe cockpit orchestration shell.
 *
 * This file owns:
 *   - Top-level state machine: empty → running → complete | error
 *   - The runProbe flow (POST /api/probe → poll /api/result → POST /api/analyze)
 *   - Demo mode (useCache) — uses DEMO_REPORT + /api/analyze-demo
 *   - Cancel + retry
 *   - localStorage writes: probe-conversations
 *   - Supabase auth display
 *   - initialUrl auto-run (after 600ms) and initialSession restore
 *   - Re-exports `ResultCard` (consumed by /share/[id]/share-client.tsx)
 *   - Re-exports `TopologyReport` type
 *
 * Everything visual lives in components/cockpit/*.
 *
 * NOTE: API endpoints, payload shapes, polling cadence, timeout, demo
 *       semantics, and localStorage keys are intentionally identical
 *       to the pre-Phase-3 dashboard. Only the UI shell changed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RotateCcw, AlertTriangle } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";

import ProbeHeader from "./cockpit/ProbeHeader";
import RadialAgentStage from "./cockpit/RadialAgentStage";
import ScanTimeline from "./cockpit/ScanTimeline";
import VerdictPanel from "./cockpit/VerdictPanel";
import Evidence from "./cockpit/Evidence";
import EmptyState from "./cockpit/EmptyState";
import {
  TopologyReport,
  Message,
  DEMO_REPORT,
  SAMPLES,
  extractUrl,
  deriveScanPhase,
} from "./cockpit/types";

export type { TopologyReport } from "./cockpit/types";

/* ─── ResultCard ───────────────────────────────────────────────────────
 *
 * Composes the verdict + evidence panels into a single result block.
 * Exported so /share/[id]/share-client.tsx can render historical
 * sessions without going through the Terminal shell.
 */

export function ResultCard({
  report,
  onClose,
}: {
  report: TopologyReport;
  onClose?: () => void;
}) {
  const isDemo = !!(report as any)._demo;

  return (
    <div className="relative border border-line rounded-lg bg-ink overflow-hidden">
      <VerdictPanel report={report} isDemo={isDemo} />

      {/* Stage recap — show the radial swarm with priced endpoints highlighted */}
      <div className="px-5 sm:px-8 py-10 border-b border-line">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-4">
          Agent stage · all 24 returns
        </div>
        <RadialAgentStage report={report} isComplete showLabels />
      </div>

      <Evidence report={report} />

      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-primary"
        >
          close
        </button>
      )}
    </div>
  );
}

/* ─── Terminal default export ─────────────────────────────────────── */

export default function Terminal({
  initialUrl,
  initialSession,
}: {
  initialUrl?: string;
  initialSession?: string;
} = {}) {
  const reducedMotion = useReducedMotion();
  const [user, setUser] = useState<User | null>(null);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setUser(sess?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialUrl || "");
  const [running, setRunning] = useState(false);
  const [useCache, setUseCache] = useState(false);
  const [urlError, setUrlError] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUrlRef = useRef("");
  const lastNameRef = useRef("");
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  /* Restore past probe from session ID — same behavior as before */
  useEffect(() => {
    if (!initialSession) return;
    fetch(`${apiBase}/api/result/${initialSession}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.status) {
          addMsg({
            id: Date.now().toString(),
            role: "assistant",
            content: "Complete.",
            status: "complete",
            report: data,
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession]);

  /* Auto-run when initialUrl is supplied via ?url= */
  useEffect(() => {
    if (initialUrl && !initialSession) {
      const t = setTimeout(() => handleSend(), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  /* Cleanup poll on unmount */
  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  const addMsg = useCallback(
    (msg: Message) => setMessages((prev) => [...prev, msg]),
    [],
  );
  const updateLast = useCallback((up: Partial<Message>) => {
    setMessages((prev) => {
      const i = prev.length - 1;
      if (i < 0 || prev[i].role !== "assistant") return prev;
      const n = [...prev];
      n[i] = { ...n[i], ...up };
      return n;
    });
  }, []);

  const saveConv = useCallback((report: any) => {
    try {
      const existing = JSON.parse(
        localStorage.getItem("probe-conversations") || "[]",
      );
      existing.unshift({
        id: report.session_id,
        session_id: report.session_id,
        title: (report.target_name || report.target_url || "Probe").slice(0, 50),
        timestamp: Date.now(),
        targetUrl: report.target_url,
        targetName: report.target_name,
        baselinePrice: report.baseline_price,
        savings: report.max_price_spread,
        topologyClass: report.topology_class,
      });
      localStorage.setItem(
        "probe-conversations",
        JSON.stringify(existing.slice(0, 50)),
      );
    } catch {}
  }, []);

  const runProbe = useCallback(
    async (targetUrl: string, targetName: string) => {
      setRunning(true);
      lastUrlRef.current = targetUrl;
      lastNameRef.current = targetName;

      const mid = Date.now().toString();
      addMsg({
        id: mid,
        role: "assistant",
        content: "Deploying 24 probe agents across 3 staggered waves...",
        status: "scanning",
        startedAt: Date.now(),
      });

      /* Demo mode — same scripted sequence as before */
      if (useCache) {
        await new Promise((r) => setTimeout(r, 500));
        updateLast({
          content: "Wave 1/3 — 8 agents deployed",
          report: {
            total_agents: 24,
            successful_agents: 8,
            failed_agents: 0,
            detected_agents: 0,
            agents: DEMO_REPORT.agents.slice(0, 8),
          } as any,
        });
        await new Promise((r) => setTimeout(r, 600));
        updateLast({
          content: "Wave 2/3 — 16 agents active",
          report: {
            total_agents: 24,
            successful_agents: 16,
            failed_agents: 0,
            detected_agents: 0,
            agents: DEMO_REPORT.agents.slice(0, 16),
          } as any,
        });
        await new Promise((r) => setTimeout(r, 600));
        updateLast({
          content: "Wave 3/3 — computing gradients...",
          report: {
            total_agents: 24,
            successful_agents: 22,
            failed_agents: 1,
            detected_agents: 1,
            agents: DEMO_REPORT.agents,
          } as any,
        });
        await new Promise((r) => setTimeout(r, 500));
        try {
          const ar = await fetch(`${apiBase}/api/analyze-demo`);
          if (ar.ok) {
            const a = await ar.json();
            updateLast({
              content: "Complete.",
              report: { ...DEMO_REPORT, _demo: true, _analysis: a } as any,
              status: "complete",
            });
          } else {
            updateLast({
              content: "Complete.",
              report: { ...DEMO_REPORT, _demo: true } as any,
              status: "complete",
            });
          }
        } catch {
          updateLast({
            content: "Complete.",
            report: { ...DEMO_REPORT, _demo: true } as any,
            status: "complete",
          });
        }
        setRunning(false);
        return;
      }

      /* Live mode */
      try {
        const r1 = await fetch(`${apiBase}/api/probe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_url: targetUrl, target_name: targetName }),
        });
        if (!r1.ok) throw new Error(`Server error: ${r1.status}`);
        const b1 = await r1.json();

        pollRef.current = setInterval(async () => {
          try {
            const r2 = await fetch(`${apiBase}/api/result/${b1.session_id}`);
            if (r2.status === 404) {
              if (pollRef.current) clearInterval(pollRef.current);
              updateLast({
                status: "error",
                error: "Probe session expired",
                content: "Probe session expired",
              });
              setRunning(false);
              return;
            }
            if (!r2.ok) throw new Error(`Poll error: ${r2.status}`);
            const data: TopologyReport = await r2.json();
            if (data.status === "completed" || data.status === "failed") {
              if (pollRef.current) clearInterval(pollRef.current);
              if (data.status === "completed") {
                saveConv(data);
                try {
                  const ar = await fetch(`${apiBase}/api/analyze`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      target_url: data.target_url || "",
                      target_name: data.target_name || "",
                      use_data_dir: data.session_id,
                    }),
                  });
                  if (ar.ok) {
                    const a = await ar.json();
                    updateLast({
                      status: "complete",
                      report: { ...data, _analysis: a } as any,
                      content: "Complete.",
                    });
                  } else {
                    updateLast({
                      status: "complete",
                      report: data,
                      content: "Complete.",
                    });
                  }
                } catch {
                  updateLast({
                    status: "complete",
                    report: data,
                    content: "Complete.",
                  });
                }
              } else {
                updateLast({
                  status: "error",
                  report: data,
                  error: data.error ?? undefined,
                  content: data.error || "Failed.",
                });
              }
              setRunning(false);
            } else {
              const succ = data.successful_agents;
              const wave =
                succ < 8
                  ? "Wave 1/3 — Datacenter"
                  : succ < 16
                    ? "Wave 2/3 — Residential"
                    : "Wave 3/3 — Mobile";
              const elapsed = data.elapsed_seconds
                ? `${data.elapsed_seconds.toFixed(0)}s`
                : "";
              updateLast({
                content: `${wave} — ${succ}/${data.total_agents} agents (${elapsed})`,
                report: data,
              });
            }
          } catch (e: any) {
            if (pollRef.current) clearInterval(pollRef.current);
            updateLast({
              status: "error",
              error: e.message,
              content: `Error: ${e.message}`,
            });
            setRunning(false);
          }
        }, 1000);

        setTimeout(() => {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            updateLast({
              status: "error",
              error: "Timed out",
              content: "Timed out after 3m.",
            });
            setRunning(false);
          }
        }, 180000);
      } catch (e: any) {
        updateLast({
          status: "error",
          error: e.message,
          content: `Error: ${e.message}`,
        });
        setRunning(false);
      }
    },
    [apiBase, useCache, addMsg, updateLast, saveConv],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || running) return;
    const url = extractUrl(text);
    if (!url) {
      setUrlError("Enter a valid URL to probe");
      return;
    }
    setUrlError("");
    const label = SAMPLES.find((s) => s.url === url)?.label || url;
    addMsg({
      id: Date.now().toString(),
      role: "user",
      content: text,
    });
    setInput("");
    runProbe(url, label);
  }, [input, running, addMsg, runProbe]);

  const handleCancel = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setRunning(false);
    addMsg({
      id: Date.now().toString(),
      role: "assistant",
      content: "Probe cancelled",
      status: "error",
      error: "Cancelled",
    });
  }, [addMsg]);

  const handleRetry = useCallback(() => {
    if (!lastUrlRef.current) return;
    runProbe(lastUrlRef.current, lastNameRef.current || lastUrlRef.current);
  }, [runProbe]);

  const handlePick = useCallback(
    (url: string) => {
      if (running) return;
      const label = SAMPLES.find((s) => s.url === url)?.label || url;
      addMsg({ id: Date.now().toString(), role: "user", content: url });
      setInput("");
      runProbe(url, label);
    },
    [running, addMsg, runProbe],
  );

  /* ─── Render ─────────────────────────────────────────────────── */

  const lastMsg = messages.length ? messages[messages.length - 1] : null;
  const lastReport = lastMsg?.role === "assistant" ? lastMsg.report : undefined;
  const phase = deriveScanPhase(lastMsg);
  const status: "idle" | "running" | "complete" | "error" = running
    ? "running"
    : lastMsg?.status === "complete"
      ? "complete"
      : lastMsg?.status === "error"
        ? "error"
        : "idle";

  const targetLabel = useMemo(() => {
    const m = messages.find((mm) => mm.role === "user");
    if (!m) return "";
    const url = extractUrl(m.content);
    if (!url) return m.content;
    try {
      const u = new URL(url);
      return u.host + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      return url;
    }
  }, [messages]);

  const isEmpty = messages.length === 0;
  const isComplete = lastMsg?.status === "complete";
  const isError = lastMsg?.status === "error";
  const isScanning = lastMsg?.status === "scanning";

  return (
    <div className="min-h-screen flex flex-col bg-ink text-primary font-sans selection:bg-signal/20">
      <ProbeHeader
        user={user}
        targetLabel={targetLabel}
        status={status}
        useCache={useCache}
        onToggleCache={() => setUseCache((v) => !v)}
        onCancel={handleCancel}
      />

      <main className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState
            input={input}
            onInput={(v) => {
              setInput(v);
              setUrlError("");
            }}
            onSubmit={handleSend}
            onPick={handlePick}
            running={running}
            urlError={urlError}
          />
        ) : (
          <div className="px-5 sm:px-8 py-8 sm:py-10">
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Live scan timeline */}
              <ScanTimeline
                phase={phase}
                successful={lastReport?.successful_agents ?? 0}
                total={lastReport?.total_agents ?? 24}
              />

              {/* Status line */}
              {(isScanning || isError) && (
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-center"
                >
                  {isScanning && (
                    <div className="font-mono text-[11px] text-secondary">
                      {lastMsg?.content}
                    </div>
                  )}
                  {isError && (
                    <div className="border border-overcharge/30 bg-overcharge/5 rounded-md px-5 py-4 max-w-xl mx-auto">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 mt-0.5 text-overcharge shrink-0" />
                        <div className="flex-1 text-left">
                          <p className="font-mono text-[12px] text-overcharge">
                            {lastMsg?.error || lastMsg?.content}
                          </p>
                          {lastUrlRef.current && (
                            <button
                              onClick={handleRetry}
                              className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-signal border border-signal/40 hover:border-signal hover:bg-signal/10 rounded-md px-3 py-1.5 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Retry probe
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Live stage — visible during scan and error (so user sees
                  whatever returned). On complete, the ResultCard owns its
                  own stage with endpoints highlighted. */}
              {(isScanning || isError) && (
                <RadialAgentStage
                  report={lastReport ?? null}
                  scanStarted={lastMsg?.startedAt ?? 0}
                  isComplete={false}
                  showLabels
                />
              )}

              {/* Result card */}
              <AnimatePresence>
                {isComplete && lastReport && (
                  <motion.div
                    key={lastMsg!.id}
                    initial={reducedMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {lastReport.error ? (
                      <div className="border border-warning/30 bg-warning/5 rounded-md px-5 py-4 max-w-xl mx-auto">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
                          <p className="font-mono text-[12px] text-warning">
                            {lastReport.error}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <ResultCard report={lastReport} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
