"use client";

/**
 * Reveals — scroll choreography for the landing:
 *   · `[data-reveal]`  → fade/rise in when scrolled into view (staggered groups).
 *   · `[data-count]`   → number counts up from 0 → target when scrolled into view
 *                        (data-prefix / data-suffix / data-decimals supported).
 *   · progress bars fill via CSS once their `[data-reveal]` ancestor gets `.in`.
 * All no-ops (shown immediately) under prefers-reduced-motion.
 */

import { useEffect } from "react";

function fmt(el: HTMLElement, n: number) {
  const dec = parseInt(el.dataset.decimals || "0", 10);
  return (el.dataset.prefix || "") + n.toFixed(dec) + (el.dataset.suffix || "");
}
function setVal(el: HTMLElement, n: number) { el.textContent = fmt(el, n); }
function runCount(el: HTMLElement) {
  const target = parseFloat(el.dataset.count || "0");
  const dur = 1150, t0 = performance.now();
  setVal(el, 0);
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    setVal(el, e * target);
    if (p < 1) requestAnimationFrame(tick); else setVal(el, target);
  };
  requestAnimationFrame(tick);
}

export default function Reveals() {
  useEffect(() => {
    const reveals = Array.from(document.querySelectorAll<HTMLElement>(".jx [data-reveal]"));
    const counters = Array.from(document.querySelectorAll<HTMLElement>(".jx [data-count]"));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || !("IntersectionObserver" in window)) {
      reveals.forEach((e) => e.classList.add("in"));
      counters.forEach((e) => setVal(e, parseFloat(e.dataset.count || "0")));
      return;
    }

    const stagger = (el: HTMLElement) => {
      const parent = el.parentElement;
      const sibs = parent ? Array.from(parent.querySelectorAll<HTMLElement>(":scope > [data-reveal]")) : [el];
      const i = Math.max(0, sibs.indexOf(el));
      el.style.transitionDelay = `${i * 70}ms`;
    };

    const rio = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { stagger(en.target as HTMLElement); (en.target as HTMLElement).classList.add("in"); rio.unobserve(en.target); }
    }), { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((e) => rio.observe(e));

    const cio = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { runCount(en.target as HTMLElement); cio.unobserve(en.target); }
    }), { threshold: 0.6 });
    counters.forEach((e) => cio.observe(e));

    const sweep = window.setTimeout(() => {
      reveals.forEach((e) => e.classList.add("in"));
      counters.forEach((e) => setVal(e, parseFloat(e.dataset.count || "0")));
    }, 3000);
    return () => { rio.disconnect(); cio.disconnect(); clearTimeout(sweep); };
  }, []);
  return null;
}
