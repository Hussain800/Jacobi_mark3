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
            Travel price checks with explicit equivalence, mandatory-cost states,
            truthful provider environments, and revalidation before action.
          </p>
        </div>
        <nav className="footer-col">
          <span className="label-mono">Product</span>
          <Link className="nav-link" href="/travel">Travel Guardian</Link>
          <Link className="nav-link" href="/travel#providers">Providers</Link>
          <Link className="nav-link" href="/compare">Retail compare</Link>
          <Link className="nav-link" href="/chat">Deep Audit</Link>
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
          Every travel claim keeps its evidence and limits attached.
        </p>
        <span className="label-mono">© 2026 JACOBI · all rights reserved</span>
      </div>
    </footer>
  );
}
