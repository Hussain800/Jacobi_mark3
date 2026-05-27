/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{tsx,ts}", "./components/**/*.{tsx,ts}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // ─── Existing tokens (kept — do not remove until Phase ≥ 3) ───
        surface: {
          0: "#050505",
          1: "#0d0d0d",
          2: "#1a1a1a",
          3: "#2a2a2a",
          DEFAULT: "#050505",
          card: "rgba(255,255,255,0.02)",
          elevated: "rgba(255,255,255,0.04)",
        },
        neon: {
          DEFAULT: "#c8c8c8",
          light: "#e8e8e8",
          mid: "#a0a0a0",
          dim: "#686868",
          dark: "#3a3a3a",
          glow: "rgba(200, 200, 200, 0.10)",
          text: "#c8c8c8",
          muted: "rgba(200, 200, 200, 0.4)",
        },
        accent: {
          amber: "#d4a040",
          rose: "#cc5566",
        },

        // ─── Phase 1 — new semantic design system (additive) ───
        // Backgrounds. `ink` instead of `base` to avoid colliding with
        // Tailwind's built-in `text-base` font-size utility.
        ink:     "#07080c",   // bg-ink     · deep canvas
        raised:  "#0c0e13",   // bg-raised  · cards & panels (flat, no glass)
        line:    "#16191f",   // bg-line / border-line · hairlines

        // Text
        primary:   "#e8eaed", // text-primary
        secondary: "#9ba1ad", // text-secondary
        muted:     "#5b6270", // text-muted

        // Semantic — strict usage:
        //   signal      → LIVE state, positive outcomes, primary action
        //   overcharge  → discrimination / hidden premium / negative delta
        //   warning     → demo mode, partial blocking, soft caution
        signal: {
          DEFAULT: "#00d97a",
          soft:    "rgba(0, 217, 122, 0.10)",
          glow:    "rgba(0, 217, 122, 0.22)",
        },
        overcharge: {
          DEFAULT: "#ff5d6c",
          soft:    "rgba(255, 93, 108, 0.10)",
        },
        warning: {
          DEFAULT: "#d4a040",
          soft:    "rgba(212, 160, 64, 0.10)",
        },
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }], // 10px
        "xxs": ["0.6875rem", { lineHeight: "1rem" }],  // 11px
      },
      spacing: {
        "4.5": "1.125rem",
        "18": "4.5rem",
        "22": "5.5rem",
        "30": "7.5rem",
      },
      animation: {
        "spin-slow": "spin 25s linear infinite",
        "spin-slower": "spin 40s linear infinite",
        "spin-slowest": "spin 60s linear infinite",
        "node-pulse": "node-pulse 2s ease-in-out infinite",
        "hub-pulse": "hub-pulse 3s ease-in-out infinite",
        "line-fade": "line-fade 3s ease-in-out infinite",
        "scan-line": "scan-line 3s linear infinite",
        "fade-in-up": "fade-in-up 0.7s ease-out both",
        "fade-in": "fade-in 0.8s ease-out both",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite alternate",
        "terminal-blink": "terminal-blink 1s step-end infinite",
        "border-pulse": "border-pulse 3s ease-in-out infinite",
        "count-up": "count-up 2s ease-out both",
        "ring-pulse": "ring-pulse 4s ease-in-out infinite",
        "scanline-animation": "scanline 8s linear infinite",
        "pulseGlow-animation": "pulseGlow 2s ease-in-out infinite",
        "telemetryBlink-animation": "telemetryBlink 1.5s step-start infinite",
      },
      keyframes: {
        "node-pulse": {
          "0%, 100%": { opacity: "0.3", transform: "translate(-50%, -50%) scale(0.8)" },
          "50%": { opacity: "1", transform: "translate(-50%, -50%) scale(1.35)" },
        },
        "hub-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.25)", opacity: "1" },
        },
        "line-fade": {
          "0%, 100%": { opacity: "0.05" },
          "50%": { opacity: "0.3" },
        },
        "scan-line": {
          "0%": { top: "-2px" },
          "100%": { top: "100%" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "glow-pulse": {
          "0%": { opacity: "0.6", transform: "scale(1)" },
          "100%": { opacity: "0.3", transform: "scale(1.15)" },
        },
        "terminal-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "border-pulse": {
          "0%, 100%": { borderColor: "rgba(52,211,153,0.1)" },
          "50%": { borderColor: "rgba(52,211,153,0.4)" },
        },
        "ring-pulse": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.8" },
        },
        "scanline": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" }
        },
        "pulseGlow": {
          "0%, 100%": { opacity: "0.2", filter: "drop-shadow(0 0 5px rgba(34,211,238,0.2))" },
          "50%": { opacity: "0.8", filter: "drop-shadow(0 0 15px rgba(34,211,238,0.8))" }
        },
        "telemetryBlink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" }
        }
      },
    },
  },
  plugins: [],
};
