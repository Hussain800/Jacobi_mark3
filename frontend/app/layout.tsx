import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Link from "next/link";
import NavAuth from "../components/nav-auth";

export const metadata: Metadata = {
  title: "JACOBI — Adversarial Pricing Topology Probe",
  description: "24-agent parallel probe engine that reveals hidden pricing algorithms via BrightData MCP. Built for BrightData × MIT Hackathon.",
  openGraph: {
    title: "JACOBI — Adversarial Pricing Topology Probe",
    description: "24-agent probe engine revealing hidden pricing topology via BrightData MCP. Built for BrightData × MIT Hackathon.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23000'/><path d='M8 16 L16 8 L24 16 L16 24 Z' fill='none' stroke='%23fff' stroke-width='1.5' opacity='0.8'/><circle cx='16' cy='16' r='3' fill='%23fff' opacity='0.6'/></svg>" />
      </head>
      <body className="text-gray-100 antialiased">
        <Providers>
          <nav className="fixed top-0 left-0 right-0 h-12 z-50 flex items-center px-5 border-b border-white/[0.08] bg-[#0e0f14]/90 backdrop-blur-md">
            <Link href="/" className="flex items-center gap-2 mr-8">
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
          <div className="pt-12">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
