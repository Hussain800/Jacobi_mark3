"use client";

/**
 * RouteChrome — owns the global nav + top spacing.
 *
 * Skips both on /design-preview/* so the Claude Design page can render
 * its own nav (injected by chrome.js into `#nav-root`) without a stacked
 * second nav from our app, and without the fixed-nav 60 px top padding.
 *
 * Lifted out of app/layout.tsx so the layout can stay a server component
 * (for metadata export) while this client component handles the
 * pathname-aware chrome.
 */

import { usePathname } from "next/navigation";
import GlobalNav from "./global-nav";

export default function RouteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The Claude Design landing (/) and its reference preview (/design-preview)
  // both render their own DesignNav. RouteChrome must skip the global nav
  // on those routes so a stacked second nav doesn't appear above them.
  const isDesign = pathname === "/" || pathname.startsWith("/design-preview");

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
