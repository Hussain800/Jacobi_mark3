"use client";

/**
 * AgentDetailDrawer — right-side inspector that slides in when a node
 * is clicked. Replaces the centered modal from the old dashboard.
 *
 * Mobile (<sm): becomes a bottom sheet.
 *
 * Pure presentational. Caller owns selection state.
 */

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Agent } from "./types";

interface Props {
  agent: Agent;
  onClose: () => void;
}

const TIER_LABEL = ["Datacenter", "Residential", "Mobile 5G"] as const;

export default function AgentDetailDrawer({ agent, onClose }: Props) {
  const tier = agent.network_tier;
  const tierLabel = tier != null ? TIER_LABEL[tier] : "—";
  const statusColor =
    agent.status === "success"
      ? "text-signal"
      : agent.status === "detected" || agent.status === "failed"
        ? "text-overcharge"
        : "text-secondary";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
        aria-hidden
      />
      <motion.aside
        role="dialog"
        aria-label={`Agent ${agent.agent_id} details`}
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] bg-raised border-l border-line shadow-2xl overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-1">
              Inspecting
            </div>
            <div className="font-mono text-sm text-primary">{agent.agent_id}</div>
            <div className="font-mono text-[10px] text-muted mt-0.5">
              {tierLabel} · {agent.proxy_type || "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md border border-line text-muted hover:text-primary hover:border-secondary/50 flex items-center justify-center transition-colors"
            aria-label="Close inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-2">
              Price quoted
            </div>
            <div className="font-serif text-5xl text-primary tabular-nums leading-none">
              {agent.price !== null ? (
                `$${agent.price}`
              ) : (
                <span className="text-overcharge">blocked</span>
              )}
            </div>
            <div className={`mt-2 font-mono text-[11px] uppercase tracking-[0.2em] ${statusColor}`}>
              {agent.status}
              {agent.bot_detected && agent.detection_signal && (
                <span className="ml-2 text-overcharge/80 normal-case tracking-normal">
                  · {agent.detection_signal}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-3">
              Agent profile
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[11px] font-mono">
              {[
                { l: "Network", v: tierLabel },
                { l: "Proxy", v: agent.proxy_type || "—" },
                {
                  l: "Response",
                  v: agent.response_time_ms ? `${agent.response_time_ms}ms` : "—",
                },
                { l: "Bot check", v: agent.bot_detected ? "Triggered" : "Clean" },
              ].map((d) => (
                <div key={d.l}>
                  <dt className="text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
                    {d.l}
                  </dt>
                  <dd className="text-secondary">{d.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {agent.label && (
            <div className="border-t border-line pt-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-2">
                Identity label
              </div>
              <div className="font-mono text-[11px] text-secondary leading-relaxed break-words">
                {agent.label}
              </div>
            </div>
          )}

          {Object.keys(agent.variables || {}).length > 0 && (
            <div className="border-t border-line pt-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-3">
                Variables
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(agent.variables).map(([k, v]) => (
                  <span
                    key={k}
                    className="font-mono text-[10px] text-secondary bg-ink border border-line rounded-md px-2 py-0.5"
                  >
                    <span className="text-muted">{k}</span>: {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {agent.error_message && (
            <div className="border-t border-line pt-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-overcharge mb-2">
                Error
              </div>
              <div className="font-mono text-[11px] text-overcharge/85 leading-relaxed">
                {agent.error_message}
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
