"use client";

/**
 * RouteChrome — owns the global nav + top spacing, plus the global
 * backend warm-up ping.
 *
 * Skips the global nav on /design-preview/* so the Claude Design page
 * can render its own nav (injected by chrome.js into `#nav-root`) without
 * a stacked second nav from our app, and without the fixed-nav 60 px top
 * padding.
 *
 * Lifted out of app/layout.tsx so the layout can stay a server component
 * (for metadata export) while this client component handles the
 * pathname-aware chrome.
 *
 * The pre-warm: Render's free tier spins down after 15 minutes of
 * inactivity; the first request after that takes 30–60 s while the
 * worker boots. Without intervention, this manifests as the "Go Pro"
 * button hanging on "Loading…" for the entire cold-start window.
 *
 * We fire a non-blocking `GET /health` on every route mount so Render
 * is already warm by the time the user clicks anything. This is a
 * fire-and-forget — failures are silently swallowed (the call itself
 * may be the one that does the wake-up).
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import GlobalNav from "./global-nav";
import { getClientApiBase } from "../lib/api-base";

export default function RouteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Fire-and-forget warm-up. Render's worker dies after 15 min idle; this
    // wakes it the moment any page mounts so the user's first authenticated
    // call (e.g. clicking "Go Pro") doesn't pay the cold-start tax.
    const apiBase = getClientApiBase();
    fetch(`${apiBase}/health`, { method: "GET", cache: "no-store" }).catch(() => {
      // Intentionally ignored — the goal of this request is the wake-up
      // side effect. The actual response is irrelevant.
    });
  }, []);

  const isDesign =
    pathname === "/" ||
    pathname.startsWith("/design-preview") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/share");

  if (isDesign) {
    return <>{children}</>;
  }

  return (
    <>
      <GlobalNav />
      <div className="pt-[60px]">{children}</div>
    </>
  );
}
