"use client";

/**
 * EmptyState — shown on /chat when no probe is running and no
 * history is loaded. Compact command-core matching the landing
 * hero aesthetic + premium sample chips + recent leaderboard.
 */

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Globe } from "lucide-react";
import { SAMPLES } from "./types";
import Leaderboard from "./Leaderboard";

interface Props {
  input: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
  onPick: (url: string) => void;
  running: boolean;
  urlError?: string;
}

export default function EmptyState({
  input,
  onInput,
  onSubmit,
  onPick,
  running,
  urlError,
}: Props) {
  const reducedMotion = useReducedMotion();
  const reveal = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="relative px-5 sm:px-8 py-16 sm:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[40vh] [background:radial-gradient(ellipse_50%_45%_at_50%_0%,rgba(0,217,122,0.05),transparent_70%)]"
      />

      <div className="max-w-2xl mx-auto text-center relative">
        <motion.div
          {...reveal}
          className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-6 flex items-center justify-center gap-3"
        >
          <span className="text-secondary">JACOBI</span>
          <span aria-hidden className="h-2.5 w-px bg-line" />
          <span>probe cockpit</span>
        </motion.div>

        <motion.h1
          {...reveal}
          transition={{ duration: 0.8, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif text-[30px] sm:text-[44px] leading-[1.05] tracking-tight text-primary mb-8"
        >
          Paste a URL.{" "}
          <span className="text-signal">Twenty-four shoppers</span> go to work.
        </motion.h1>

        <motion.form
          {...reveal}
          transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="relative max-w-xl mx-auto"
        >
          <div className="flex items-stretch bg-raised border border-line rounded-md focus-within:border-signal/55 transition-colors">
            <span className="flex items-center pl-4 sm:pl-5 pr-2 sm:pr-3 text-muted shrink-0">
              <Globe className="w-4 h-4" />
            </span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => onInput(e.target.value)}
              placeholder="Paste a flight, hotel, or product URL"
              aria-label="Paste a URL to probe"
              disabled={running}
              autoFocus
              className="flex-1 bg-transparent py-4 pr-2 text-primary placeholder-muted/70 outline-none text-sm sm:text-base font-mono caret-signal min-w-0 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={running || !input.trim()}
              className="m-1.5 sm:m-2 inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md bg-signal text-ink font-mono text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.12em] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              Probe
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {urlError && (
            <p className="text-[10px] font-mono text-overcharge text-center mt-2">
              {urlError}
            </p>
          )}
        </motion.form>

        <motion.div
          {...reveal}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="mt-10 sm:mt-12"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-4">
            Or probe a sample
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => onPick(s.url)}
                disabled={running}
                className="group text-left border border-line rounded-md bg-raised hover:border-signal/50 hover:bg-signal/[0.03] disabled:opacity-50 transition-all px-4 py-3 flex items-center justify-between gap-3"
              >
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-mono text-[11px] text-secondary group-hover:text-primary transition-colors truncate">
                    {s.label}
                  </span>
                  <span className="font-mono text-[10px] text-muted truncate">
                    {s.url.split("/")[2] || s.url.slice(0, 32)}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11px] text-signal tabular-nums">
                    {s.price}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted group-hover:text-signal group-hover:translate-x-0.5 transition-all" />
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          {...reveal}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-12 sm:mt-16"
        >
          <Leaderboard />
        </motion.div>
      </div>
    </div>
  );
}
