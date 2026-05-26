import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import NavAuth from "../components/nav-auth";

export const metadata: Metadata = {
  title: "JACOBI — 24-Agent Pricing Topology Probe",
  description: "JACOBI: 24-agent adversarial pricing probe that reveals hidden pricing discrimination via BrightData MCP. Built for BrightData × MIT Hackathon.",
  openGraph: {
    title: "JACOBI — 24-Agent Pricing Topology Probe",
    description: "24-agent probe engine revealing hidden pricing topology via BrightData MCP. Built for BrightData × MIT Hackathon.",
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
      <body className="bg-surface text-white antialiased font-body">
        <nav className="fixed top-0 left-0 right-0 h-12 z-50 flex items-center px-5 border-b border-white/[0.08] bg-[#07080c]/90 backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2 mr-8">
            <div className="w-5 h-5 rounded border border-accent-emerald/30 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#34d399" strokeWidth="1.2">
                <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" />
                <circle cx="6" cy="6" r="1.5" fill="#34d399" opacity="0.6" />
              </svg>
            </div>
            <span className="text-sm font-medium tracking-tight text-white/90">JACOBI</span>
          </Link>
          <div className="flex items-center gap-5 text-[11px] font-mono">
            <Link href="/chat" className="text-white/40 hover:text-white/80 transition-colors">Probe</Link>
            <Link href="/history" className="text-white/40 hover:text-white/80 transition-colors">History</Link>
            <Link href="/pricing" className="text-white/40 hover:text-white/80 transition-colors">Pricing</Link>
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
