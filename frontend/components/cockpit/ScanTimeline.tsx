"use client";

/**
 * ScanTimeline — horizontal phase indicator for a running probe.
 *
 * Phases: queued → deploying → collecting prices → analyzing → verdict
 *
 * Pure presentational. Driven by deriveScanPhase() from types.ts.
 */

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { ScanPhase } from "./types";

const PHASES: { key: ScanPhase; label: string }[] = [
  { key: "queued",     label: "Queued" },
  { key: "deploying",  label: "Deploying" },
  { key: "collecting", label: "Collecting prices" },
  { key: "analyzing",  label: "Analyzing" },
  { key: "verdict",    label: "Verdict" },
];

interface Props {
  phase: ScanPhase;
  successful?: number;
  total?: number;
}

export default function ScanTimeline({ phase, successful = 0, total = 24 }: Props) {
  if (phase === "error") {
    return (
      <div className="font-mono text-[11px] text-overcharge text-center py-3">
        Probe halted
      </div>
    );
  }

  const activeIdx = PHASES.findIndex((p) => p.key === phase);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative flex items-center justify-between gap-2 sm:gap-3">
        {/* Connecting line behind the dots */}
        <div
          aria-hidden
          className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-px bg-line"
        />
        <motion.div
          aria-hidden
          initial={false}
          animate={{
            width: `${Math.max(0, activeIdx) / (PHASES.length - 1) * 100}%`,
          }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-2 top-1/2 -translate-y-1/2 h-px bg-signal/60"
        />

        {PHASES.map((p, i) => {
          const isActive = i === activeIdx;
          const isDone = i < activeIdx;
          return (
            <div
              key={p.key}
              className="relative z-10 flex flex-col items-center gap-2"
            >
              <motion.div
                initial={false}
                animate={{
                  scale: isActive ? [1, 1.18, 1] : 1,
                }}
                transition={{
                  duration: 1.8,
                  repeat: isActive ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className={`w-3 h-3 rounded-full flex items-center justify-center ${
                  isDone
                    ? "bg-signal"
                    : isActive
                      ? "bg-signal shadow-[0_0_16px_rgba(0,217,122,0.55)]"
                      : "bg-line border border-line"
                }`}
              >
                {isDone && <Check className="w-2 h-2 text-ink" strokeWidth={3} />}
              </motion.div>
              <div
                className={`font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.18em] whitespace-nowrap ${
                  isActive
                    ? "text-primary"
                    : isDone
                      ? "text-secondary"
                      : "text-muted"
                }`}
              >
                {p.label}
              </div>
              {isActive && p.key === "collecting" && total > 0 && (
                <div className="font-mono text-[9px] text-muted tabular-nums">
                  {successful}/{total}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
