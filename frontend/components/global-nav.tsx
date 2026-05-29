"use client";

/**
 * GlobalNav — fixed nav with scroll-state transparency.
 *
 * Matches Claude Design's pattern: 60 px height, transparent at top,
 * cobalt-tinted backdrop blur once the user scrolls past 24 px.
 * Active route gets a 1 px cobalt underline.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavAuth from "./nav-auth";

const LINKS = [
  { href: "/chat",        label: "Probe" },
  { href: "/history",     label: "History" },
  { href: "/leaderboard", label: "Board" },
  { href: "/pricing",     label: "Pricing" },
];

export default function GlobalNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] h-[60px] flex items-center transition-[background,border-color,backdrop-filter] duration-500"
      style={{
        background: scrolled ? "rgba(7,8,11,0.72)" : "transparent",
        backdropFilter: scrolled ? "blur(18px) saturate(140%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(18px) saturate(140%)" : "none",
        borderBottom: scrolled ? "1px solid var(--line)" : "1px solid transparent",
      }}
    >
      <div className="max-w-[1240px] w-full mx-auto px-5 sm:px-8 lg:px-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-[11px] group">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-[6px] border border-cobalt-line"
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-cobalt-bright">
              <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" />
              <circle cx="6" cy="6" r="1.5" fill="currentColor" opacity="0.7" />
            </svg>
          </span>
          <span
            className="font-mono uppercase text-primary"
            style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.18em" }}
          >
            JACOBI
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-[30px]">
          {LINKS.map((l) => {
            const active = pathname === l.href || (l.href === "/chat" && pathname.startsWith("/chat"));
            return (
              <Link
                key={l.href}
                href={l.href}
                className="relative transition-colors"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "12px",
                  letterSpacing: "0.06em",
                  color: active ? "var(--text)" : "var(--text-2)",
                }}
              >
                <span className="hover:text-primary transition-colors">{l.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 -bottom-1.5 h-px"
                    style={{ background: "var(--cobalt)" }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-5">
          <NavAuth />
        </div>
      </div>
    </nav>
  );
}
