/**
 * Landing page — "The Forensic Instrument" redesign.
 * Branch: redesign/forensic-instrument.
 *
 * Fully isolated under the `.jx` namespace (app/landing.css). It deliberately
 * does NOT import the shared jacobi-design.css, so the app routes
 * (chat/dashboard/history/board/pricing/docs) keep their design + behavior.
 *
 * PHASE 2 = grayscale layout wireframe (no globe, no motion, no effects) — the
 * globe lands in Phase 3 and the signature artifacts in Phase 4.
 */

import "./landing.css";
import LandingNav from "../components/landing/LandingNav";
import LandingFooter from "../components/landing/LandingFooter";
import Reveals from "../components/landing/Reveals";
import {
  Hero, Problem, Mechanism, EvidenceReceipt, AuditReadout, Defensibility, FinalCTA,
} from "../components/landing/sections";

export default function LandingPage() {
  return (
    <div className="jx">
      <Reveals />
      <LandingNav />
      <main>
        <Hero />
        <Problem />
        <Mechanism />
        <EvidenceReceipt />
        <AuditReadout />
        <Defensibility />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
