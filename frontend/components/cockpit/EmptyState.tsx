"use client";

/**
 * EmptyState — Phase 7 restrained cockpit surface.
 *
 * No decorative orbital backdrop, no color-tinted sample cards. Just
 * the command input, a quiet list of sample cases, and the leaderboard.
 * Apple-restrained: content + type + one clear primary action.
 */

import { useRef, useState } from "react";
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
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      {/* Subtle top light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] [background:radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(255,255,255,0.025),transparent_75%)]"
      />

      <div className="relative z-10 px-5 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-6 flex items-center justify-center gap-3"
          >
            <span className="text-secondary">JACOBI</span>
            <span aria-hidden className="h-2.5 w-px bg-line" />
            <span>probe cockpit</span>
          </motion.div>

          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-[32px] sm:text-[44px] leading-[1.04] tracking-tight text-primary mb-10"
          >
            Paste a URL.{" "}
            <span className="text-signal">Twenty-four synthetic buyers</span>{" "}
            go to work.
          </motion.h1>

          {/* Chamber input */}
          <motion.form
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
            className="relative max-w-xl mx-auto"
          >
            <motion.div
              animate={{
                borderColor: focused ? "rgba(232, 234, 237, 0.22)" : "rgba(232, 234, 237, 0.10)",
              }}
              transition={{ duration: 0.5 }}
              className="relative rounded-lg border bg-[#0a0c11] overflow-hidden"
              style={{
                boxShadow:
                  "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 0 rgba(0, 0, 0, 0.6), 0 14px 40px -16px rgba(0, 0, 0, 0.7)",
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(232, 234, 237, 0.18) 50%, transparent 100%)",
                }}
              />
              <div className="flex items-stretch">
                <span className="flex items-center pl-5 pr-3 text-muted shrink-0">
                  <Globe className="w-4 h-4" />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={input}
                  onChange={(e) => onInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={()  => setFocused(false)}
                  placeholder="Paste a flight, hotel, or product URL"
                  aria-label="Paste a URL to probe"
                  disabled={running}
                  autoFocus
                  className="flex-1 bg-transparent py-4 sm:py-5 pr-2 text-primary placeholder-muted/60 outline-none text-base font-mono caret-signal min-w-0 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={running || !input.trim()}
                  className="m-1.5 sm:m-2 inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-md bg-signal text-ink font-mono text-[11px] font-semibold uppercase tracking-[0.18em] hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,filter] shrink-0"
                >
                  <span>Probe</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
            {urlError && (
              <p className="text-[10px] font-mono text-overcharge text-center mt-2">{urlError}</p>
            )}
          </motion.form>

          {/* Sample cases — quiet list */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-14"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-5 flex items-center justify-center gap-3">
              <span aria-hidden className="h-px w-12 bg-line" />
              <span>Or open a case</span>
              <span aria-hidden className="h-px w-12 bg-line" />
            </div>
            <ul className="max-w-xl mx-auto border border-line rounded-lg overflow-hidden bg-raised/40">
              {SAMPLES.map((s, i) => (
                <li key={s.label}>
                  <button
                    onClick={() => onPick(s.url)}
                    disabled={running}
                    className={`group w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors hover:bg-raised disabled:opacity-50 ${
                      i < SAMPLES.length - 1 ? "border-b border-line" : ""
                    }`}
                  >
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-mono text-[12px] text-secondary group-hover:text-primary transition-colors truncate">
                        {s.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted truncate">
                        {s.url.split("/")[2] || s.url.slice(0, 32)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[11px] text-secondary tabular-nums">
                        {s.price}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted group-hover:text-signal group-hover:translate-x-0.5 transition-all" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Leaderboard */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="mt-14"
          >
            <Leaderboard />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
