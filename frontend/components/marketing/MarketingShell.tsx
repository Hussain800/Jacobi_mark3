"use client";

/**
 * MarketingShell — the shared chrome for every PUBLIC content page
 * (Method / Pricing / History / Board / About / Extension / Privacy / Terms).
 *
 * It extends the landing's isolated `.jx` "Forensic Instrument" system to the
 * rest of the marketing surface so the whole public site reads as one composed
 * instrument — same tokens, same nav, same footer, same reveal motion — instead
 * of the old dark-SaaS template the app routes used to ship.
 *
 * Scope rule (unchanged): this is the marketing/content surface only. The
 * authenticated product app (`/chat`, `/dashboard`, `/billing`, `/share`) keeps
 * its own functional chrome and is NOT touched here.
 */

import "../../app/landing.css";
import Reveals from "../landing/Reveals";
import LandingNav from "../landing/LandingNav";
import LandingFooter from "../landing/LandingFooter";

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="jx">
      {/* drives [data-reveal] + [data-count] exactly like the landing */}
      <Reveals />
      <LandingNav />
      <main className="jx-page">{children}</main>
      <LandingFooter />
    </div>
  );
}
