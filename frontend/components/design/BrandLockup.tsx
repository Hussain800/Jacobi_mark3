/**
 * BrandLockup — the JACOBI wordmark, rendered as `JAC[ ]BI` with the
 * bracketed-empty-set in cobalt blue. This is the official lockup —
 * no separate icon, no JACOBI text outside this component.
 *
 * Letters are JetBrains Mono Bold (already loaded by the design system).
 * Wide letter-spacing gives it the tech-instrument feel from the brand
 * preview the user supplied.
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
        fontFamily: "var(--mono)",
        fontWeight: 700,
        fontSize: `${size}px`,
        letterSpacing: "0.32em",
        color: "var(--text)",
        // optical-align the [] which is taller than the letters
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
      aria-label="JACOBI"
    >
      <span>JAC</span>
      <span style={{ color: "var(--cobalt-bright)" }}>[</span>
      <span style={{ color: "var(--cobalt-bright)" }}>&nbsp;</span>
      <span style={{ color: "var(--cobalt-bright)" }}>]</span>
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
