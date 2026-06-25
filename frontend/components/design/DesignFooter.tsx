/**
 * DesignFooter — React port of chrome.js's footer() output.
 *
 * Same DOM structure and classes as the original static footer, and
 * routes both the "Product" and "Company" links to our real Next.js
 * paths.
 */

import Link from "next/link";
import BrandLockup from "./BrandLockup";

export default function DesignFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <BrandLockup size={18} />
          <p className="footer-desc sec">
            Controlled synthetic-buyer pricing audits. Evidence-grade detection
            of personalized-pricing exposure, MAP undercutting, and gray-market
            drift.
          </p>
        </div>
        <nav className="footer-col">
          <span className="label-mono">Product</span>
          <Link className="nav-link" href="/chat">Run audit</Link>
          <Link className="nav-link" href="/leaderboard">Leaderboard</Link>
          <Link className="nav-link" href="/history">History</Link>
          <Link className="nav-link" href="/pricing">Pricing</Link>
        </nav>
        <nav className="footer-col">
          <span className="label-mono">Company</span>
          <Link className="nav-link" href="/method">Method</Link>
          <Link className="nav-link" href="/extension">Extension</Link>
          <Link className="nav-link" href="/privacy">Privacy</Link>
          <Link className="nav-link" href="/terms">Terms</Link>
        </nav>
      </div>
      <div className="wrap footer-bottom">
        <p className="footer-tag">
          Every price leaves evidence. JACOBI&nbsp;captures it.
        </p>
        <span className="label-mono">© 2026 JACOBI · all rights reserved</span>
      </div>
    </footer>
  );
}
