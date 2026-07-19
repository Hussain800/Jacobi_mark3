"use client";

/**
 * LandingNav — minimal marketing nav, styled by landing.css (`.jx-nav*`).
 * Isolated from the shared app chrome; links route to the real app paths.
 * (Auth wiring is added in a later phase; for now Sign in routes to /chat,
 * which itself gates on Supabase.)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLockup from "../design/BrandLockup";

const LINKS = [
  { label: "Guardian", href: "/travel" },
  { label: "Method", href: "/method" },
  { label: "Providers", href: "/travel#providers" },
  { label: "Extension", href: "/extension" },
  { label: "Retail compare", href: "/compare" },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 16);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <nav className={`jx-nav${scrolled ? " is-scrolled" : ""}`}>
      <div className="jx-nav__row">
        <BrandLockup size={15} />
        <div className="jx-nav__links">
          {LINKS.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname?.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`jx-nav__link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="jx-nav__right">
          <Link href="/chat" className="jx-nav__signin">Deep Audit</Link>
          <Link href="/travel" className="jx-nav__cta">Open Guardian</Link>
        </div>
      </div>
    </nav>
  );
}
