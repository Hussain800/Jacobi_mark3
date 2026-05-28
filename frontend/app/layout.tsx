import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import NavAuth from "../components/nav-auth";

export const metadata: Metadata = {
  title: "JACOBI — 24-Agent Pricing Topology Probe",
  description: "JACOBI: 24-agent adversarial pricing probe that reveals hidden pricing discrimination via BrightData MCP. Powered by BrightData.",
  openGraph: {
    title: "JACOBI — 24-Agent Pricing Topology Probe",
    description: "24-agent probe engine revealing hidden pricing topology via BrightData MCP. Powered by BrightData.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23000'/><path d='M8 16 L16 8 L24 16 L16 24 Z' fill='none' stroke='%2300ff41' stroke-width='1.5' opacity='0.9'/><circle cx='16' cy='16' r='3' fill='%2300ff41' opacity='0.7'/></svg>" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@200;300;400;500&family=Inter:wght@200;300;400;500&family=Space+Grotesk:wght@300;400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-ink text-primary antialiased font-sans">
        <nav className="fixed top-0 left-0 right-0 h-12 z-50 flex items-center px-5 sm:px-8 border-b border-line bg-ink/85 backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2.5 mr-6 sm:mr-8 group">
            <div className="w-5 h-5 rounded border border-signal/30 group-hover:border-signal/60 flex items-center justify-center transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-signal">
                <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" />
                <circle cx="6" cy="6" r="1.5" fill="currentColor" opacity="0.7" />
              </svg>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">JACOBI</span>
          </Link>
          <div className="flex items-center gap-4 sm:gap-5 font-mono text-[10px] uppercase tracking-[0.18em]">
            <Link href="/chat"        className="text-muted hover:text-primary transition-colors">Probe</Link>
            <Link href="/history"     className="text-muted hover:text-primary transition-colors">History</Link>
            <Link href="/leaderboard" className="text-muted hover:text-primary transition-colors hidden sm:inline">Board</Link>
            <Link href="/pricing"     className="text-muted hover:text-primary transition-colors">Pricing</Link>
          </div>
          <div className="ml-auto">
            <NavAuth />
          </div>
        </nav>
        <div className="pt-12">{children}</div>
      </body>
    </html>
  );
}
