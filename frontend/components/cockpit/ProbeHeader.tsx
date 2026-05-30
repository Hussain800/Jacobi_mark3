"use client";

/**
 * ProbeHeader — slim cockpit status strip that sits *under* the global
 * top nav (which already provides brand + Probe/History/Pricing + auth).
 *
 * This file deliberately renders no JACOBI mark and no auth control —
 * those live in app/layout.tsx's <nav>. We only own the live probe
 * state: target URL, status pill, demo toggle, cancel.
 *
 * Pure presentational. All state owned by Terminal.
 */

import { XCircle } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface Props {
  user: User | null;
  targetLabel: string;
  status: "idle" | "running" | "complete" | "error";
  useCache: boolean;
  onToggleCache: () => void;
  onCancel?: () => void;
}

export default function ProbeHeader({
  user: _user,
  targetLabel,
  status,
  useCache,
  onToggleCache,
  onCancel,
}: Props) {
  const statusDot =
    status === "running"
      ? "bg-signal animate-pulse"
      : status === "complete"
        ? "bg-signal"
        : status === "error"
          ? "bg-overcharge"
          : "bg-muted/50";

  const statusLabel =
    status === "running"
      ? "Probing"
      : status === "complete"
        ? "Complete"
        : status === "error"
          ? "Halted"
          : "Ready";

  return (
    <div className="border-b border-line bg-ink/85 backdrop-blur-xl shrink-0 relative z-20">
      <div className="h-11 px-5 sm:px-8 flex items-center gap-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted shrink-0">
          Probe cockpit
        </span>

        {/* Target URL — compact, mono, truncates */}
        {targetLabel && (
          <>
            <span aria-hidden className="h-3 w-px bg-line shrink-0" />
            <span
              className="font-mono text-[11px] text-secondary truncate min-w-0"
              title={targetLabel}
            >
              {targetLabel}
            </span>
          </>
        )}

        <div className="ml-auto flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Status pill */}
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-secondary">
            <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
            <span className="hidden sm:inline">{statusLabel}</span>
          </div>

          {/* Cancel — only while running */}
          {status === "running" && onCancel && (
            <button
              onClick={onCancel}
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-overcharge flex items-center gap-1.5 transition-colors"
              aria-label="Cancel probe"
            >
              <XCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          )}

          {/* Demo toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted group-hover:text-secondary transition-colors">
              Demo
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={useCache}
              onClick={onToggleCache}
              className={`relative w-9 h-5 rounded-full border transition-colors ${
                useCache
                  ? "bg-warning/20 border-warning/50"
                  : "bg-raised border-line"
              }`}
            >
              <span
                aria-hidden
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-transform ${
                  useCache
                    ? "bg-warning translate-x-[18px]"
                    : "bg-secondary/60 translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </div>
      </div>
    </div>
  );
}
