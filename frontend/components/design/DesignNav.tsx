"use client";

/**
 * DesignNav — React port of chrome.js's nav() output.
 *
 * Same DOM structure and classes so jacobi-design.css styles it
 * identically. Three behavior changes vs the original static nav:
 *
 *   1. Links point to our real Next.js routes (not .html files).
 *   2. Active route gets `.active` based on usePathname (not chrome.js's
 *      location.pathname.split('/').pop()).
 *   3. The scrolled state (window.scrollY > 24 → `.scrolled`) is owned
 *      by React via a scroll listener, replacing chrome.js's mount.
 *   4. The right-hand "Sign in" / user pill uses real Supabase auth via
 *      `<DesignNavAuth />`, styled to match the design's nav-link.signin.
 *
 * The SVG brand mark is ported byte-for-byte from chrome.js.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";
import BrandLockup from "./BrandLockup";

const LINKS: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Audit",     href: "/chat" },
  { label: "History",   href: "/history" },
  { label: "Board",     href: "/leaderboard" },
  { label: "Pricing",   href: "/pricing" },
];

export default function DesignNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const activeFor = (href: string) => {
    if (href === "/" && pathname === "/") return true;
    return href !== "/" && pathname.startsWith(href);
  };

  return (
    <nav className={`nav ${scrolled ? "scrolled" : ""}`} id="nav">
      <div className="wrap">
        <BrandLockup size={16} />

        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${activeFor(l.href) ? " active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-right">
          <span className="nav-status">
            <span className="led" />
            System · Operational
          </span>
          <DesignNavAuth />
        </div>
      </div>
    </nav>
  );
}

/* ─── Auth control matching the design's .nav-link styling ──────────── */

function DesignNavAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signIn() {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (loading) {
    return <span style={{ width: 60, display: "inline-block" }} aria-hidden />;
  }

  if (user) {
    const displayName =
      (user.user_metadata?.name as string | undefined)?.split(" ")[0] ||
      user.email?.split("@")[0] ||
      "user";
    return (
      <>
        <span className="nav-link" style={{ color: "var(--text-2)" }}>{displayName}</span>
        <button
          onClick={signOut}
          className="nav-link signin"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
          }}
        >
          Sign out
        </button>
      </>
    );
  }

  return (
    <button
      onClick={signIn}
      className="nav-link signin"
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
      }}
    >
      Sign in
    </button>
  );
}
