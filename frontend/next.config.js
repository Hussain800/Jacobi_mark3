/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. Intentionally NO
// Content-Security-Policy yet: a strict CSP risks breaking the Three.js/WebGL
// globe, Supabase auth, and Stripe checkout, so it's tracked as a post-launch
// follow-up. These headers are safe and do not affect the app's own rendering.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
