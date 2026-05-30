"use client";

/**
 * Landing interactions — React ports of the bits from chrome.js +
 * landing.js that aren't owned by DesignNav/DesignFooter:
 *
 *   useReveals()  → adds `.in` class to [data-reveal] when in viewport
 *   useCounters() → animates [data-count] number from 0 → target
 *   useTyped()    → typewriter effect into `#typed`
 *   useGlobe()    → calls window.JacobiGlobe.init() once both
 *                   Three.js and globe.js have loaded, then runs the
 *                   24-agent deploy counter into `#gr-count` / `#gr-status`.
 *
 * All hooks are no-ops under `prefers-reduced-motion`.
 */

import { useEffect } from "react";

const AGENTS = [
  { city: "Manhattan",   profile: "Safari · Manhattan · direct",   price: 642, state: "over"   },
  { city: "New York",    profile: "iPhone 15 · NYC · direct",       price: 638, state: "over"   },
  { city: "Dubai",       profile: "iPhone · Dubai · direct",        price: 631, state: "over"   },
  { city: "Los Angeles", profile: "iPhone · LA · direct",           price: 627, state: "over"   },
  { city: "Tokyo",       profile: "Safari · Tokyo · direct",        price: 612, state: "normal" },
  { city: "Chicago",     profile: "Chrome · Chicago · direct",      price: 612, state: "normal" },
  { city: "Hong Kong",   profile: "Safari · Hong Kong · direct",    price: 608, state: "normal" },
  { city: "Paris",       profile: "Safari · Paris · direct",        price: 601, state: "normal" },
  { city: "London",      profile: "Edge · London · direct",         price: 596, state: "normal" },
  { city: "Seoul",       profile: "Chrome · Seoul · fiber",         price: 590, state: "normal" },
  { city: "Singapore",   profile: "Chrome · Singapore · fiber",     price: 588, state: "normal" },
  { city: "Sydney",      profile: "Chrome · Sydney · fiber",        price: 583, state: "normal" },
  { city: "Frankfurt",   profile: "Chrome · Frankfurt · fiber",     price: 579, state: "normal" },
  { city: "Toronto",     profile: "Edge · Toronto · direct",        price: 574, state: "normal" },
  { city: "Amsterdam",   profile: "Edge · Amsterdam · fiber",       price: 571, state: "normal" },
  { city: "Berlin",      profile: "Firefox · Berlin · fiber",       price: 566, state: "normal" },
  { city: "Madrid",      profile: "Chrome · Madrid · fiber",        price: 558, state: "normal" },
  { city: "São Paulo",   profile: "Android · São Paulo · LTE",      price: 540, state: "normal" },
  { city: "Lagos",       profile: "Android · Lagos · LTE",          price: 531, state: "normal" },
  { city: "Mumbai",      profile: "Android · Mumbai · LTE",         price: 524, state: "normal" },
  { city: "Bogotá",      profile: "Android · Bogotá · VPN",         price: 516, state: "normal" },
  { city: "Bangalore",   profile: "Firefox · Bangalore · VPN",      price: 512, state: "normal" },
  { city: "Mississippi", profile: "Android · Mississippi · LTE",    price: 505, state: "good"   },
  { city: "Rural Iowa",  profile: "Chrome · rural Iowa · VPN",      price: 498, state: "good"   },
];

function prefersReducedMotion() {
  return typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ─── Reveal-on-scroll ─────────────────────────────────────────────── */

export function useReveals() {
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!els.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }

    const show = (el: HTMLElement) => {
      if (el.classList.contains("in")) return;
      const parent = el.parentElement;
      const sibs = parent
        ? Array.from(parent.querySelectorAll<HTMLElement>(":scope > [data-reveal]"))
        : [el];
      el.style.transitionDelay = `${Math.max(0, sibs.indexOf(el)) * 70}ms`;
      el.classList.add("in");
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            show(en.target as HTMLElement);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));

    const sweep = () => {
      const h = window.innerHeight || 800;
      els.forEach((e) => {
        if (e.getBoundingClientRect().top < h * 0.95) {
          show(e);
          io.unobserve(e);
        }
      });
    };
    requestAnimationFrame(sweep);
    const t1 = setTimeout(sweep, 400);
    const t2 = setTimeout(() => els.forEach(show), 2600);

    return () => {
      io.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
}

/* ─── Counter animations ───────────────────────────────────────────── */

export function useCounters() {
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    if (!els.length) return;

    const run = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute("data-count") || "0");
      if (reduce) {
        el.textContent = target.toLocaleString();
        return;
      }
      const dur = 1500;
      const t0 = performance.now();
      function tick(now: number) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(e * target).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target.toLocaleString();
      }
      requestAnimationFrame(tick);
    };

    if (!("IntersectionObserver" in window)) {
      els.forEach(run);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            run(en.target as HTMLElement);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

/* ─── Typewriter ───────────────────────────────────────────────────── */

export function useTyped() {
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const el = document.getElementById("typed");
    if (!el) return;
    const full = "24 agents. One URL. The truth about what you pay.";
    if (reduce) {
      el.textContent = full;
      return;
    }
    let i = 0;
    let alive = true;
    let timeout: ReturnType<typeof setTimeout>;
    function step() {
      if (!alive || !el) return;
      el.textContent = full.slice(0, i);
      const ch = full[i - 1];
      i++;
      if (i <= full.length) {
        const delay = ch === "." ? 320 : 34 + Math.random() * 26;
        timeout = setTimeout(step, delay);
      }
    }
    const start = setTimeout(step, 600);
    return () => {
      alive = false;
      clearTimeout(start);
      clearTimeout(timeout);
    };
  }, []);
}

/* ─── Mechanism scroll disassembly ─────────────────────────────────── */

export function useMechScroll() {
  useEffect(() => {
    const scene = document.getElementById("mech-scene");
    const stack = document.getElementById("mech-stack");
    if (!scene || !stack) return;
    const dots = scene.querySelectorAll<HTMLElement>(".mech-progress span");
    let raf = 0;
    const update = () => {
      const r = scene.getBoundingClientRect();
      const total = scene.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -r.top / total));
      stack.style.setProperty("--p", p.toFixed(3));
      const step = Math.min(4, Math.floor(p * 5));
      dots.forEach((d, i) => d.classList.toggle("on", i <= step));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);
}

/* ─── Evidence-index bar ────────────────────────────────────────────── */

export function useEvidenceIndexFill() {
  useEffect(() => {
    const fill = document.querySelector<HTMLElement>(".evi-fill");
    if (!fill) return;
    if (!("IntersectionObserver" in window)) {
      fill.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fill.classList.add("in");
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(fill);
    return () => io.disconnect();
  }, []);
}

/* ─── Evidence row bars ──────────────────────────────────────────────
 *
 * The original landing.js's evidence() builds rows imperatively and
 * animates the .ev-bar-fill scaleX via a transition with delay. In our
 * React port, the rows are rendered in JSX with `data-w` attributes;
 * this hook reads each row's target scale and triggers the animation
 * when the host comes into view.
 */
export function useEvidenceBars() {
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const host = document.getElementById("evidence-rows");
    if (!host) return;
    const fills = Array.from(host.querySelectorAll<HTMLElement>(".ev-bar-fill[data-w]"));
    if (!fills.length) return;

    const reveal = () => {
      fills.forEach((fill, i) => {
        const w = parseFloat(fill.getAttribute("data-w") || "0");
        if (reduce) {
          fill.style.transform = `scaleX(${w / 100})`;
          return;
        }
        fill.style.transition = `transform 1s var(--ease) ${0.2 + i * 0.08}s`;
        requestAnimationFrame(() => {
          fill.style.transform = `scaleX(${w / 100})`;
        });
      });
    };

    if (!("IntersectionObserver" in window)) {
      reveal();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          reveal();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);
}

/* ─── Globe + deploy readout ───────────────────────────────────────── */

export function useGlobe() {
  useEffect(() => {
    const reduce = prefersReducedMotion();
    let alive = true;
    let globe: { deploy?: () => void } | null = null;

    // Poll for globe.js + Three.js to finish loading (next/script
    // afterInteractive doesn't expose a promise). Once both are present,
    // initialize.
    const id = setInterval(() => {
      if (!alive) return;
      const canvas = document.getElementById("globe") as HTMLCanvasElement | null;
      const THREE = (window as unknown as { THREE?: unknown }).THREE;
      const JG = (window as unknown as { JacobiGlobe?: { init: (c: HTMLCanvasElement, opts: unknown) => { deploy?: () => void } } }).JacobiGlobe;
      if (canvas && THREE && JG) {
        clearInterval(id);
        try {
          globe = JG.init(canvas, { agents: AGENTS });
        } catch {
          // best effort
        }
        // Deploy sequence
        setTimeout(() => {
          if (!alive) return;
          try {
            globe?.deploy?.();
          } catch {}
          const statusEl = document.getElementById("gr-status");
          const countEl  = document.getElementById("gr-count");
          if (!countEl) return;
          // Honest labels: this is a cinematic demo cycle, not a live probe.
          if (statusEl) statusEl.textContent = "sample deployment";
          if (reduce) {
            countEl.textContent = "24";
            if (statusEl) statusEl.textContent = "identity grid prepared";
            return;
          }
          const total = AGENTS.length;
          const dur = 4200;
          const t0 = performance.now();
          let n = 0;
          function tick(now: number) {
            if (!alive) return;
            const p = Math.min(1, (now - t0) / dur);
            const cur = Math.round(p * total);
            if (cur !== n) {
              n = cur;
              if (countEl) countEl.textContent = String(n).padStart(2, "0");
            }
            if (p < 1) requestAnimationFrame(tick);
            else if (statusEl) statusEl.textContent = "identity grid prepared";
          }
          requestAnimationFrame(tick);
        }, 900);
      }
    }, 100);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
}
