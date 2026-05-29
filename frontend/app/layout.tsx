import type { Metadata } from "next";
import "./globals.css";
import RouteChrome from "../components/route-chrome";

export const metadata: Metadata = {
  title: "JACOBI — Pricing Topology Probe",
  description:
    "24 synthetic shoppers. One URL. The truth about what you pay. JACOBI exposes the pricing discrimination algorithms hide behind your digital fingerprint.",
  openGraph: {
    title: "JACOBI — Pricing Topology Probe",
    description:
      "24 synthetic shoppers. One URL. The truth about what you pay.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23000'/><path d='M8 16 L16 8 L24 16 L16 24 Z' fill='none' stroke='%236e92ff' stroke-width='1.5' opacity='0.9'/><circle cx='16' cy='16' r='3' fill='%236e92ff' opacity='0.7'/></svg>"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="text-primary antialiased"
        style={{
          background: "#06070c",
          fontFamily: "var(--sans)",
          // Original jacobi.css applied this to body. We keep it on the
          // real <body> (not the .jacobi-design wrapper div) so the
          // wrapper doesn't become a scrolling ancestor and break
          // `position: sticky` for .mech-pin.
          overflowX: "hidden",
        }}
      >
        <RouteChrome>{children}</RouteChrome>
      </body>
    </html>
  );
}
