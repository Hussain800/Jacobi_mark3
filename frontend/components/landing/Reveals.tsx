"use client";

/**
 * Reveals — mounts the reveal-on-scroll observer for `.jx [data-reveal]`.
 * No-op under prefers-reduced-motion (content shown immediately). A safety
 * sweep reveals everything after 2.5s in case the observer never fires.
 */

import { useEffect } from "react";

export default function Reveals() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".jx [data-reveal]"));
    if (!els.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) { (en.target as HTMLElement).classList.add("in"); io.unobserve(en.target); }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    const sweep = window.setTimeout(() => els.forEach((e) => e.classList.add("in")), 2500);
    return () => { io.disconnect(); clearTimeout(sweep); };
  }, []);
  return null;
}
