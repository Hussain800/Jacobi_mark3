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
        {/* Favicon: tiny [ ] bracket mark in cobalt on the brand canvas.
            Matches the BrandLockup wordmark (JAC[ ]BI) so the tab icon
            isn't a stale diamond/SVG from before the lockup existed. */}
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%2307080b'/><text x='16' y='23' text-anchor='middle' font-family='Major Mono Display, JetBrains Mono, monospace' font-size='20' font-weight='400' fill='%236e92ff'>[ ]</text></svg>"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500;600&family=Major+Mono+Display&display=swap"
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
