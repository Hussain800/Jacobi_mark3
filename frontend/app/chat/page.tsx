"use client";

/**
 * /chat — Phase C cockpit, wired to live JACOBI backend.
 *
 * Visual shell is the Claude Design probe.html port. Backend behavior is
 * identical to dashboard.tsx — same POST /api/probe → poll
 * /api/result/{session_id} → POST /api/analyze flow, same demo mode, same
 * localStorage history writes.
 *
 * dashboard.tsx is intentionally untouched because it still exports
 * `ResultCard` consumed by /share/[id]/share-client.tsx.
 */

import { Suspense } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import ErrorBoundary from "../../components/ErrorBoundary";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import CockpitProbe from "../../components/design/cockpit/CockpitProbe";
import "../jacobi-design.css";

export const dynamic = "force-dynamic";

function ChatInner() {
  const sp = useSearchParams();
  const initialUrl = sp.get("url") || undefined;
  return (
    <div className="jacobi-design">
      {/* WebGL cobalt background + dual cursor / magnetic CTAs / tilt */}
      <Script src="/jacobi-design/scene.js"   strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />

      <DesignNav />
      <CockpitProbe initialUrl={initialUrl} />
      <DesignFooter />
    </div>
  );
}

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ background: "#06070c", minHeight: "100vh" }} />}>
        <ChatInner />
      </Suspense>
    </ErrorBoundary>
  );
}
