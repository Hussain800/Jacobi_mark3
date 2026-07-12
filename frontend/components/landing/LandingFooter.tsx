import Link from "next/link";
import BrandLockup from "../design/BrandLockup";

export default function LandingFooter() {
  return (
    <footer className="jx-footer">
      <div className="jx-wrap jx-wrap--wide jx-footer__grid">
        <div>
          <BrandLockup size={17} />
          <p className="jx-footer__desc">
            The open-source price optimisation engine for exact product matching,
            known all-in totals, replaceable providers, and evidence-backed savings.
          </p>
        </div>
        <nav className="jx-footer__col" aria-label="Product">
          <span className="jx-label">Product</span>
          <Link href="/compare">Compare</Link>
          <Link href="/extension">Extension</Link>
          <Link href="/history">History</Link>
          <Link href="/chat">Deep Audit</Link>
        </nav>
        <nav className="jx-footer__col" aria-label="Project">
          <span className="jx-label">Project</span>
          <Link href="/developers">Developers</Link>
          <Link href="/method">Method</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
      <div className="jx-wrap jx-wrap--wide jx-footer__bottom">
        <span className="jx-footer__tag">Every saving leaves evidence.</span>
        <span className="jx-footer__tag">Copyright 2026 Jacobi / MIT licensed core</span>
      </div>
    </footer>
  );
}
