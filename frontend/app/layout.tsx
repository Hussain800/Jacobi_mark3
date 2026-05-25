import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JACOBI — Adversarial Pricing Topology Probe",
  description: "24-agent parallel probe engine that reveals hidden pricing algorithms via BrightData MCP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
