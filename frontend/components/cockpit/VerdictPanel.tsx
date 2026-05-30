"use client";

/**
 * VerdictPanel — the cinematic top of a completed ResultCard.
 *
 *   1. Plain-English verdict (serif)
 *   2. Hidden premium spread (serif numeral, overcharge color)
 *   3. Cheapest actionable profile (a recommendation card)
 *
 * AI-derived summary (Gemini) is preferred for #1 when present; falls
 * back to a topology-class headline.
 */

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Sparkles } from "lucide-react";
import {
  TopologyReport,
  cheapestProfile,
  topologyHeadline,
  profileSummary,
} from "./types";

interface Props {
  report: TopologyReport;
  isDemo: boolean;
}

export default function VerdictPanel({ report, isDemo }: Props) {
  const reducedMotion = useReducedMotion();
  const analysis = (report as any)._analysis;
  const gemini = analysis?.gemini_report;
  const base = report.baseline_price || 0;
  const sigs = report.gradients.filter((g) => g.significant && g.delta > 0);
  const spread = report.max_price_spread ?? sigs.reduce((s, g) => s + g.delta, 0);
  const cheapest = cheapestProfile(report);
  const headline =
    gemini?.plain_english_summary?.split(/[.!?]\s/)[0]?.trim() ||
    topologyHeadline(report.topology_class);
  const overpay = base && spread ? Math.round(((spread / base) * 100) * 10) / 10 : null;

  const reveal = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="relative px-5 sm:px-8 pt-8 sm:pt-10 pb-6 border-b border-line">
      {isDemo && (
        <div className="mb-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-warning/90">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          Simulated probe · toggle demo off for a live run
        </div>
      )}

      <motion.div {...reveal}>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-3">
          Verdict
        </div>
        <h2 className="font-serif text-[28px] sm:text-[40px] leading-[1.05] tracking-tight text-primary max-w-3xl">
          {headline.endsWith(".") ? headline : `${headline}.`}
        </h2>
      </motion.div>

      <motion.div
        {...reveal}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 mt-8 items-end"
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-overcharge mb-2">
            Hidden premium
          </div>
          <div className="font-serif text-6xl sm:text-7xl text-primary leading-none tabular-nums">
            {spread > 0 ? `+$${Math.round(spread)}` : "$0"}
          </div>
          <div className="font-mono text-[11px] text-muted mt-3 tracking-wide">
            {base > 0 && (
              <>
                paying{" "}
                <span className="text-secondary tabular-nums">
                  ${Math.round(base + spread)}
                </span>{" "}
                vs achievable{" "}
                <span className="text-signal tabular-nums">
                  ${Math.round(base)}
                </span>
                {overpay !== null && (
                  <span className="text-muted"> · {overpay}% over baseline</span>
                )}
              </>
            )}
          </div>
        </div>

        {cheapest && (
          <motion.div
            {...reveal}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full lg:w-[340px] border border-line rounded-lg bg-raised p-5 relative"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal mb-3 flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              Cheapest identity
            </div>
            <div className="font-serif text-3xl text-signal tabular-nums leading-none mb-2">
              ${cheapest.price}
            </div>
            <div className="font-mono text-[11px] text-secondary leading-relaxed capitalize">
              {profileSummary(cheapest)}
            </div>
            <div className="mt-4 pt-4 border-t border-line font-mono text-[10px] text-muted">
              {cheapest.agent_id}
              {cheapest.network_tier != null && (
                <span className="ml-2">
                  · {["Datacenter", "Residential", "Mobile 5G"][cheapest.network_tier]}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>

      {gemini?.action_items?.length > 0 && (
        <motion.div
          {...reveal}
          transition={{ duration: 0.7, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-3 flex items-center gap-2">
            <ArrowDown className="w-3 h-3" />
            What to do next
          </div>
          <ul className="space-y-2">
            {gemini.action_items.slice(0, 4).map((item: string, i: number) => (
              <li
                key={i}
                className="font-mono text-[12px] text-secondary leading-relaxed flex items-start gap-3"
              >
                <span className="font-mono text-[10px] text-signal tabular-nums mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </div>
  );
}
