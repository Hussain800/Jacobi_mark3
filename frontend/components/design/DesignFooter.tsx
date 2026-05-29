/**
 * DesignFooter — React port of chrome.js's footer() output.
 *
 * Same DOM structure and classes as the original static footer, but
 * routes the "Product" links to our real Next.js paths. "Company"
 * links remain placeholder (`#`) since those pages don't exist yet.
 */

import Link from "next/link";

function BrandMark() {
  return (
    <svg
      className="mark"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="12.6" stroke="#3a4868" strokeWidth="0.9" opacity="0.8" />
      <circle cx="16" cy="16" r="7.6"  stroke="#7895ff" strokeWidth="1.1" />
      <line x1="16" y1="1.7"  x2="16" y2="5.6"  stroke="#7895ff" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16" y1="26.4" x2="16" y2="30.3" stroke="#7895ff" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1.7"  y1="16" x2="5.6"  y2="16" stroke="#7895ff" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="26.4" y1="16" x2="30.3" y2="16" stroke="#7895ff" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="20.7" cy="12.9" r="2.2" fill="#7895ff" />
      <circle cx="20.7" cy="12.9" r="3.6" stroke="#7895ff" strokeWidth="0.7" opacity="0.5" />
    </svg>
  );
}

export default function DesignFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link href="/" className="brand">
            <BrandMark />
            <span className="word">JACOBI</span>
          </Link>
          <p className="footer-desc sec">
            24-agent adversarial pricing probe. Illuminating the hidden
            algorithms that decide what you pay&nbsp;online.
          </p>
        </div>
        <nav className="footer-col">
          <span className="label-mono">Product</span>
          <Link className="nav-link" href="/chat">New probe</Link>
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
          The internet prices you. JACOBI prices&nbsp;back.
        </p>
        <span className="label-mono">© 2026 JACOBI · all rights reserved</span>
      </div>
    </footer>
  );
}
