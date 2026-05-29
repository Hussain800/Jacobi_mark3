/**
 * /design-preview — faithful static port of the Claude Design landing.
 *
 * Phase A: visual fidelity only. The DOM structure mirrors index.html
 * 1:1, the CSS is the namespaced jacobi-design.css, and the JS modules
 * (chrome / scene / globe / landing) are loaded verbatim from
 * /public/jacobi-design/ so they run unmodified — same WebGL background,
 * same Three.js globe, same typed-text and counter behaviors as the
 * original prototype.
 *
 * This is a thin server-component wrapper so we can export metadata;
 * everything visual lives in PreviewBody (client component) because
 * we need onSubmit handlers on the forms.
 */

import PreviewBody from "./preview-body";

export const metadata = {
  title: "JACOBI — Pricing Topology Probe (Design Preview)",
};

export default function DesignPreviewPage() {
  return <PreviewBody />;
}
