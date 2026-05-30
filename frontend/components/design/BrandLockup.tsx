/**
 * BrandLockup — the JACOBI wordmark, rendered as JAC[ ]BI with the
 * bracketed empty-set in cobalt blue.
 *
 * Typeface: "Major Mono Display" — Google Font, monospaced display face
 * with the sharp / squared / instrument-grade letterforms in the brand
 * reference (flat-top A, squared C, geometric bowls). Falls back to
 * JetBrains Mono if the Google Font hasn't loaded yet.
 *
 * Bracketed empty-set: tighter spacing inside `[ ]` so the glyph reads
 * as a single composed bracket-space-bracket unit while the outer JAC
 * and BI keep the wide letter-spacing that gives the wordmark its
 * tech-instrument presence.
 */

import Link from "next/link";

interface Props {
  /** Visual height in pixels — typography scales from this. */
  size?: number;
  /** If true, render as inline span (e.g. inside footer headings). Otherwise renders as a Link to /. */
  noLink?: boolean;
  /** Optional className passed through. */
  className?: string;
}

export default function BrandLockup({ size = 18, noLink = false, className }: Props) {
  const inner = (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: '"Major Mono Display", "JetBrains Mono", ui-monospace, monospace',
        fontWeight: 400,
        fontSize: `${size}px`,
        letterSpacing: "0.22em",
        color: "var(--text)",
        // Optical balance — the brackets are visually taller than the
        // letters at small sizes; nudge baseline so the row reads level.
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
      aria-label="JACOBI"
    >
      <span>JAC</span>
      <span
        style={{
          color: "var(--cobalt-bright)",
          // Tighter spacing inside the bracket so [ ] reads as one
          // composed glyph instead of three loose characters.
          letterSpacing: "0.04em",
          padding: "0 0.06em",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        [&nbsp;]
      </span>
      <span>BI</span>
    </span>
  );

  if (noLink) return inner;
  return (
    <Link
      href="/"
      aria-label="JACOBI home"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      {inner}
    </Link>
  );
}
