/**
 * BrandLockup — the JACOBI wordmark.
 *
 * Drawn entirely as SVG paths (no font dependency). Glyphs are hand-tuned
 * to match the brand reference:
 *
 *   - J     — top serif + stem + hook curving left at the bottom
 *   - Λ     — A rendered as a clean triangle, NO crossbar (signature reduction)
 *   - C     — three-quarter circle opening right
 *   - [ ]   — two cobalt brackets with a clear, visible interior gap.
 *             The gap is intentional and exactly the width of one bracket
 *             arm — that's the "empty set" the brand name refers to. NOT
 *             touching (which read as a single rectangle).
 *   - B     — left stem + two stacked half-bowls
 *   - I     — top serif + stem + bottom serif
 *
 * All strokes use stroke-linecap="square" + stroke-linejoin="miter" for
 * the instrument-grade hairlines the brand wants.
 *
 * The wordmark scales by setting `size` (visual height in px). Width is
 * computed from the viewBox aspect ratio.
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

const VIEWBOX_W = 232;
const VIEWBOX_H = 30;

export default function BrandLockup({ size = 18, noLink = false, className }: Props) {
  const width = (size * VIEWBOX_W) / VIEWBOX_H;

  // Brand tokens via CSS vars so the wordmark theme-responds with the
  // rest of the design system. Fallback literals are the actual brand
  // colors so nothing breaks if variable resolution fails.
  const txt = "var(--text, #eef0f5)";
  const cobalt = "var(--cobalt-bright, #92a6ff)";
  const sw = 3;

  const inner = (
    <svg
      height={size}
      width={width}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
      role="img"
      aria-label="JACOBI"
    >
      <g
        fill="none"
        strokeWidth={sw}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        {/* J — top serif (6,3)→(24,3), stem at x=18 down to y=21, hook left to (6,22). */}
        <path
          d="M 6 3 L 24 3 M 18 3 L 18 21 Q 18 27 12 27 Q 6 27 6 22"
          style={{ stroke: txt }}
        />

        {/* Λ — clean triangle: left foot (36,27) → apex (50,3) → right foot (64,27). */}
        <path
          d="M 36 27 L 50 3 L 64 27"
          style={{ stroke: txt }}
        />

        {/* C — three-quarter arc, opens right. */}
        <path
          d="M 94 7 A 10 10 0 1 0 94 23"
          style={{ stroke: txt }}
        />

        {/* [ — left bracket. Stem at x=110, arms protrude right to x=120 (10 wide). */}
        <path
          d="M 120 3 L 110 3 L 110 27 L 120 27"
          style={{ stroke: cobalt }}
        />

        {/* ] — right bracket. Stem at x=140, arms back to x=130 (10 wide).
              Interior gap = 10 units (from x=120 to x=130) — same width as
              one bracket arm. Reads as a clear empty set, NOT a rectangle. */}
        <path
          d="M 130 3 L 140 3 L 140 27 L 130 27"
          style={{ stroke: cobalt }}
        />

        {/* B — left stem at x=152, two stacked half-bowls. */}
        <path
          d="M 152 3 L 152 27 M 152 3 L 164 3 Q 171 3 171 9 Q 171 15 164 15 L 152 15 M 164 15 Q 173 15 173 21 Q 173 27 164 27 L 152 27"
          style={{ stroke: txt }}
        />

        {/* I — top serif (186,3)→(208,3), stem at x=197, bottom serif (186,27)→(208,27). */}
        <path
          d="M 186 3 L 208 3 M 197 3 L 197 27 M 186 27 L 208 27"
          style={{ stroke: txt }}
        />
      </g>
    </svg>
  );

  if (noLink) return <span className={className}>{inner}</span>;
  return (
    <Link
      href="/"
      aria-label="JACOBI home"
      className={className}
      style={{ textDecoration: "none", color: "inherit", display: "inline-flex" }}
    >
      {inner}
    </Link>
  );
}
