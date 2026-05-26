import type { Metadata } from "next";
import "./globals.css";

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
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
