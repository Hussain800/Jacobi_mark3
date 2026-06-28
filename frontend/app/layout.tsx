import type { Metadata } from "next";
import "./globals.css";
import RouteChrome from "../components/route-chrome";
// Geist is loaded for the marketing landing's isolated `.jx` system only.
// Applying the .variable classes here just DEFINES --font-geist-sans / -mono on
// <body>; app routes never reference them, so their fonts are unchanged.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export const metadata: Metadata = {
  title: "JACOBI — Price Integrity Intelligence",
  description:
    "JACOBI runs controlled synthetic-buyer audits to detect personalized-pricing exposure, MAP undercutting, and gray-market drift — and produces evidence-grade reports for compliance and brand-protection teams.",
  openGraph: {
    title: "JACOBI — Price Integrity Intelligence",
    description:
      "Controlled synthetic-buyer pricing audits. Evidence-grade price-integrity reports for compliance and brand-protection teams.",
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
        {/* Favicon — the [] composed-bracket mark drawn as two SVG paths
            so it matches the wordmark exactly (no font dependency). */}
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%2307080b'/><g fill='none' stroke='%236e92ff' stroke-width='3' stroke-linecap='square'><path d='M 16 6 L 8 6 L 8 26 L 16 26'/><path d='M 18 6 L 26 6 L 26 26 L 18 26'/></g></svg>"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`text-primary antialiased ${GeistSans.variable} ${GeistMono.variable}`}
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
