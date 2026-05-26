"use client";

import { useEffect, useRef, useState } from "react";

/* ─── ScrollReveal ────────────────────────────────────────────────────
   Staggered scroll-triggered reveal with impeccable easing.
   Bencium principles: one choreographed scroll experience, not scattered
   micro-interactions. Uses ease-out-quart for purposeful entrances.
   ─────────────────────────────────────────────────────────────────── */

type Direction = "up" | "down" | "left" | "right" | "none";

interface Options {
  threshold?: number;
  rootMargin?: string;
  direction?: Direction;
  distance?: number;
  duration?: number;
  delay?: number;
  once?: boolean;
}

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.1,
  rootMargin = "0px",
  direction = "up",
  distance = 30,
  duration = 700,
  delay = 0,
  once = true,
}: Options = {}) {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          if (once) obs.unobserve(el);
        } else if (!once) {
          setRevealed(false);
        }
      },
      { threshold, rootMargin }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, rootMargin, once]);

  const dirMap: Record<Direction, string> = {
    up: `translateY(${distance}px)`,
    down: `translateY(${-distance}px)`,
    left: `translateX(${distance}px)`,
    right: `translateX(${-distance}px)`,
    none: "translateY(0)",
  };

  const style: React.CSSProperties = {
    opacity: revealed ? 1 : 0,
    transform: revealed ? "translate(0)" : dirMap[direction],
    transition: `opacity ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`,
    transitionDelay: `${delay}ms`,
    willChange: revealed ? "auto" : "opacity, transform",
  };

  return { ref, style, revealed };
}

/* ─── Staggered container ─────────────────────────────────────────────
   Wraps children and reveals them one by one with staggered delays.
   ─────────────────────────────────────────────────────────────────── */

export function StaggerReveal({
  children,
  baseDelay = 100,
  staggerMs = 80,
  threshold = 0.08,
  className = "",
}: {
  children: React.ReactNode[];
  baseDelay?: number;
  staggerMs?: number;
  threshold?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return (
    <div ref={containerRef} className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(24px)",
            transition: `opacity 0.6s cubic-bezier(0.25, 1, 0.5, 1), transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)`,
            transitionDelay: `${baseDelay + i * staggerMs}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
