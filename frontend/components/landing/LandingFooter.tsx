/**
 * LandingFooter — minimal marketing footer, styled by landing.css.
 */

import Link from "next/link";
import BrandLockup from "../design/BrandLockup";

export default function LandingFooter() {
  return (
    <footer className="jx-footer">
      <div className="jx-wrap jx-wrap--wide jx-footer__grid">
        <div>
          <BrandLockup size={17} />
          <p className="jx-footer__desc">
            Evidence-grade pricing intelligence. Controlled synthetic-buyer
            probes that prove where price changes are driven by buyer context —
            and capture the receipts.
          </p>
        </div>
        <nav className="jx-footer__col">
          <span className="jx-label">Product</span>
          <Link href="/chat">Run an audit</Link>
          <Link href="/leaderboard">Board</Link>
          <Link href="/history">History</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <nav className="jx-footer__col">
          <span className="jx-label">Company</span>
          <Link href="/method">Method</Link>
          <Link href="/extension">Extension</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
      <div className="jx-wrap jx-wrap--wide jx-footer__bottom">
        <span className="jx-footer__tag">Every price leaves evidence.</span>
        <span className="jx-footer__tag">© 2026 Jacobi · all rights reserved</span>
      </div>
    </footer>
  );
}
