import Link from "next/link";
import BrandLockup from "../design/BrandLockup";

export default function LandingFooter() {
  return (
    <footer className="jx-footer">
      <div className="jx-wrap jx-wrap--wide jx-footer__grid">
        <div>
          <BrandLockup size={17} />
          <p className="jx-footer__desc">
            A travel price guardian for equivalent offers, mandatory-cost clarity,
            truthful provider environments, evidence, and fresh revalidation.
          </p>
        </div>
        <nav className="jx-footer__col" aria-label="Product">
          <span className="jx-label">Product</span>
          <Link href="/travel">Travel Guardian</Link>
          <Link href="/travel#providers">Providers</Link>
          <Link href="/extension">Extension</Link>
          <Link href="/compare">Retail compare</Link>
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
        <span className="jx-footer__tag">Every travel claim keeps its limits attached.</span>
        <span className="jx-footer__tag">Copyright 2026 Jacobi / MIT licensed core</span>
      </div>
    </footer>
  );
}
