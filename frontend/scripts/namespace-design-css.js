#!/usr/bin/env node
/**
 * Mechanical namespace prefixer for jacobi.css.
 *
 * Reads CLAUDE_DESIGN_EXPORT/assets/jacobi.css and writes
 * frontend/app/jacobi-design.css with every selector scoped under
 * `.jacobi-design `.
 *
 * Rules:
 *   - leave @import / @keyframes / @font-face alone (string-aware so we
 *     don't break on `;` inside url(...) query strings)
 *   - recurse into @media / @supports / @container — selectors inside
 *     still need prefixing
 *   - leave :root, ::selection, ::-webkit-scrollbar* alone (viewport-bound)
 *   - body / html → .jacobi-design
 *   - everything else → ".jacobi-design <selector>"
 *
 * The tokenizer is hand-written rather than regex so it correctly skips
 * strings (`"..."`, `'...'`) and parens (`url(...)`, `:not(...)`) — which
 * is required because the source CSS embeds `;` and `,` inside those.
 */

const fs   = require("fs");
const path = require("path");

const SRC  = path.resolve(__dirname, "..", "..", "..", "..", "CLAUDE_DESIGN_EXPORT", "assets", "jacobi.css");
const DEST = path.resolve(__dirname, "..", "app", "jacobi-design.css");
const NS   = ".jacobi-design";

const css = fs.readFileSync(SRC, "utf8");

/* ─── Tokenization helpers ─────────────────────────────────────────── */

/** Advance through a string literal starting at css[i] (quote char). */
function skipString(s, i) {
  const q = s[i];
  i++;
  while (i < s.length) {
    if (s[i] === "\\") { i += 2; continue; }
    if (s[i] === q) return i + 1;
    i++;
  }
  return i;
}

/** Advance through a /* comment *​/ starting at css[i] (the slash). */
function skipComment(s, i) {
  const end = s.indexOf("*/", i + 2);
  return end < 0 ? s.length : end + 2;
}

/**
 * Read forward until a top-level (depth-0) terminator from `terminators`.
 * String and parens are tracked so we don't break on `;` inside url(),
 * `,` inside :not(...), etc.
 *
 * Returns [substring, endIndex]. endIndex points AT the terminator.
 */
function readUntilTopLevel(s, start, terminators) {
  let i = start;
  let parens = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i); continue; }
    if (c === "/" && s[i + 1] === "*") { i = skipComment(s, i); continue; }
    if (c === "(") { parens++; i++; continue; }
    if (c === ")") { parens--; i++; continue; }
    if (parens === 0 && terminators.includes(c)) return [s.slice(start, i), i];
    i++;
  }
  return [s.slice(start, i), i];
}

/** Read a brace-balanced block starting at s[i] === '{'. Returns slice including the outer braces. */
function readBlock(s, i) {
  const start = i;
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i); continue; }
    if (c === "/" && s[i + 1] === "*") { i = skipComment(s, i); continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { i++; return [s.slice(start, i), i]; } }
    i++;
  }
  return [s.slice(start, i), i];
}

/** Split a selector list on top-level commas (string/paren aware). */
function splitSelectorList(list) {
  const parts = [];
  let i = 0;
  let last = 0;
  let parens = 0;
  while (i < list.length) {
    const c = list[i];
    if (c === '"' || c === "'") { i = skipString(list, i); continue; }
    if (c === "(") { parens++; i++; continue; }
    if (c === ")") { parens--; i++; continue; }
    if (c === "," && parens === 0) { parts.push(list.slice(last, i)); last = i + 1; }
    i++;
  }
  parts.push(list.slice(last));
  return parts;
}

/* ─── Selector transformation ──────────────────────────────────────── */

function transformSelectorList(list) {
  return splitSelectorList(list).map((sel) => {
    // Preserve leading whitespace
    const m = sel.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const lead = m ? m[1] : "";
    const trail = m ? m[3] : "";
    const s = m ? m[2] : sel.trim();

    if (!s) return sel;

    if (/^:root\b/.test(s))             return `${lead}${s}${trail}`;
    if (/^::selection\b/.test(s))       return `${lead}${s}${trail}`;
    if (/^::-webkit-scrollbar/.test(s)) return `${lead}${s}${trail}`;

    // Classes that the design JS injects directly at <body> (so they
    // can't be scoped under a .jacobi-design wrapper without breaking
    // the JS). Allowlist them to stay global.
    if (/^\.jacobi-scene-bg\b/.test(s)) return `${lead}${s}${trail}`;
    if (/^\.jx-cursor\b/.test(s))       return `${lead}${s}${trail}`;
    if (/^\.has-jx-cursor\b/.test(s))   return `${lead}${s}${trail}`;

    if (s === "body" || s === "html")   return `${lead}${NS}${trail}`;
    if (/^body[\s.[:>+~,]/.test(s))     return `${lead}${s.replace(/^body/, NS)}${trail}`;
    if (/^html[\s.[:>+~,]/.test(s))     return `${lead}${s.replace(/^html/, NS)}${trail}`;
    if (/^body::?/.test(s))             return `${lead}${s.replace(/^body/, NS)}${trail}`;
    if (/^html::?/.test(s))             return `${lead}${s.replace(/^html/, NS)}${trail}`;

    return `${lead}${NS} ${s}${trail}`;
  }).join(",");
}

/* ─── Main transformer ─────────────────────────────────────────────── */

function transformCss(input) {
  const out = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];

    // Whitespace
    if (/\s/.test(c)) { out.push(c); i++; continue; }

    // Comments — emit verbatim
    if (c === "/" && input[i + 1] === "*") {
      const end = skipComment(input, i);
      out.push(input.slice(i, end));
      i = end;
      continue;
    }

    // At-rules
    if (c === "@") {
      const [preamble, endPre] = readUntilTopLevel(input, i, ["{", ";"]);
      const nameMatch = preamble.match(/^@(-?\w[\w-]*)/);
      const name = nameMatch ? nameMatch[1].toLowerCase() : "";

      if (endPre < n && input[endPre] === ";") {
        // single-line at-rule like @import — preserve verbatim
        out.push(preamble + ";");
        i = endPre + 1;
        continue;
      }

      if (endPre < n && input[endPre] === "{") {
        const [block, endBlock] = readBlock(input, endPre);
        if (name === "media" || name === "supports" || name === "container" || name === "document") {
          // recurse into nested rules
          out.push(preamble + "{" + transformCss(block.slice(1, -1)) + "}");
        } else {
          // @keyframes / @font-face / @page / @charset → verbatim
          out.push(preamble + block);
        }
        i = endBlock;
        continue;
      }

      // unterminated at-rule — emit and bail
      out.push(preamble);
      i = endPre;
      continue;
    }

    // Stray closing brace — shouldn't happen at top level but emit anyway
    if (c === "}") { out.push("}"); i++; continue; }

    // Rule: selector list { ... }
    const [selList, endSel] = readUntilTopLevel(input, i, ["{", "}"]);
    if (endSel >= n || input[endSel] === "}") {
      // malformed — emit and bail
      out.push(selList);
      i = endSel;
      continue;
    }
    const [block, endBlock] = readBlock(input, endSel);
    out.push(transformSelectorList(selList) + block);
    i = endBlock;
  }

  return out.join("");
}

let transformed = transformCss(css);

/**
 * Post-pass: strip `overflow*` declarations from the `body → .jacobi-design`
 * rule. Original CSS had `body { overflow-x: hidden }` which, once remapped
 * to a wrapper DIV, turns the wrapper into a scrolling ancestor and breaks
 * `position: sticky` for descendants like .mech-pin.
 *
 * The fix: leave the wrapper at `overflow: visible` and let the real <body>
 * (set in app/layout.tsx) own horizontal clipping.
 */
transformed = transformed.replace(
  /(\.jacobi-design\s*\{[^}]*?)\s*overflow(?:-[xy])?\s*:\s*[^;}]+;?/g,
  "$1",
);

const header =
  "/*\n" +
  " * jacobi-design.css — auto-generated by namespace-design-css.js.\n" +
  " *\n" +
  " * Source: CLAUDE_DESIGN_EXPORT/assets/jacobi.css\n" +
  " *\n" +
  " * All selectors are scoped under .jacobi-design so the design system\n" +
  " * only affects pages explicitly wrapped in <div class=\"jacobi-design\">.\n" +
  " *\n" +
  " * Do not edit this file by hand. Regenerate by running:\n" +
  " *   node frontend/scripts/namespace-design-css.js\n" +
  " */\n\n";

fs.writeFileSync(DEST, header + transformed);
console.log(`wrote ${DEST} (${transformed.length} bytes)`);
