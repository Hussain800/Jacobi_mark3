/**
 * DesignFooter — React port of chrome.js's footer() output.
 *
 * Same DOM structure and classes as the original static footer, but
 * routes the "Product" links to our real Next.js paths. "Company"
 * links remain placeholder (`#`) since those pages don't exist yet.
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
          <a className="nav-link" href="#">Method</a>
          <a className="nav-link" href="#">Extension</a>
          <a className="nav-link" href="#">Privacy</a>
          <a className="nav-link" href="#">Terms</a>
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
