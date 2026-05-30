/**
 * BrandLockup — the JACOBI wordmark.
 *
 * Drawn entirely as SVG paths (no font dependency). Glyphs are hand-tuned
 * to match the brand reference:
 *
 *   - J     — top serif + stem + hook curving left at the bottom
 *   - Λ     — A rendered as a clean triangle, NO crossbar (the brand's
 *             signature reduction)
 *   - C     — three-quarter circle opening right
 *   - [ ]   — two cobalt brackets sitting VERY close together so they
 *             read as a single composed O-like glyph (the empty-set
 *             that names the brand)
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

const VIEWBOX_W = 218;
const VIEWBOX_H = 30;

export default function BrandLockup({ size = 18, noLink = false, className }: Props) {
  const width = (size * VIEWBOX_W) / VIEWBOX_H;

  // Use inline CSS variables so the wordmark theme-responds with the rest
  // of the design system. The fallback literals are the actual brand
  // tokens so nothing breaks if the variable resolution fails.
  const txt = "var(--text, #eceef3)";
  const cobalt = "var(--cobalt-bright, #6e92ff)";

  // Stroke width tuned to look the same visual weight as the brand
  // reference at every size from 16 → 36 px.
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
        {/* J — top serif (3,3)→(24,3), stem at x=18 down to y=21, hook
              curving left to ground at (6, 23). */}
        <path
          d="M 6 3 L 24 3 M 18 3 L 18 21 Q 18 27 12 27 Q 6 27 6 22"
          style={{ stroke: txt }}
        />

        {/* Λ — A as a clean triangle. Left foot (36,27) → apex (50,3) → right foot (64,27). */}
        <path
          d="M 36 27 L 50 3 L 64 27"
          style={{ stroke: txt }}
        />

        {/* C — three-quarter circle, centered at (88,15) with r=9.
              SVG arc from (94,7) sweeping clockwise to (94,23). */}
        <path
          d="M 94 7 A 10 10 0 1 0 94 23"
          style={{ stroke: txt }}
        />

        {/* [ — left bracket: top serif (108,3)→(116,3), stem at x=108 down, bottom serif (108,27)→(116,27). */}
        <path
          d="M 116 3 L 108 3 L 108 27 L 116 27"
          style={{ stroke: cobalt }}
        />

        {/* ] — right bracket, gap of just 2 units from [ so together they
              read as one O-glyph. */}
        <path
          d="M 118 3 L 126 3 L 126 27 L 118 27"
          style={{ stroke: cobalt }}
        />

        {/* B — left stem at x=140, two stacked half-bowls. Each bowl is a
              quadratic curve from top of bowl to bottom of bowl. */}
        <path
          d="M 140 3 L 140 27 M 140 3 L 152 3 Q 159 3 159 9 Q 159 15 152 15 L 140 15 M 152 15 Q 161 15 161 21 Q 161 27 152 27 L 140 27"
          style={{ stroke: txt }}
        />

        {/* I — top serif (174,3)→(196,3), stem at x=185, bottom serif (174,27)→(196,27). */}
        <path
          d="M 174 3 L 196 3 M 185 3 L 185 27 M 174 27 L 196 27"
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
