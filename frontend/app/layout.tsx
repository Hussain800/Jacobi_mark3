import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

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
      <body className="bg-surface text-white antialiased font-body"><Providers>{children}</Providers></body>
    </html>
  );
}
