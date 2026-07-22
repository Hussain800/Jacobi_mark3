"use client";

/**
 * Enterprise audit workspace shell.
 *
 * Wraps all /dashboard/* pages with the shared chrome (nav, workspace banner,
 * tabs, footer) and the jacobi-design system so the workspace matches the
 * reframed marketing surface. The workspace banner reflects demo, live, or
 * error mode; the seeded portfolio/findings/evidence views remain labeled and
 * only the "Run audit" tab executes a live audit.
 */

import Script from "next/script";
import "../jacobi-design.css";
import DesignNav from "../../components/design/DesignNav";
import DesignFooter from "../../components/design/DesignFooter";
import { DemoModeBanner, DashboardTabs } from "./ui";
import { useEnterpriseWorkspace } from "./use-enterprise-workspace";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { mode, error, loading } = useEnterpriseWorkspace();

  return (
    <div className="jacobi-design">
      <Script src="/jacobi-design/scene.js" strategy="afterInteractive" />
      <Script src="/jacobi-design/effects.js" strategy="afterInteractive" />

      <DesignNav />
      {/* Spacer clears the fixed 60px nav so the workspace banner + tabs aren't occluded. */}
      <div aria-hidden style={{ height: 60 }} />
      <DemoModeBanner mode={mode} error={error} loading={loading} />
      <DashboardTabs />

      <main className="section" style={{ paddingTop: 40, paddingBottom: 80, minHeight: "60vh" }}>
        <div className="wrap">{children}</div>
      </main>

      <DesignFooter />
    </div>
  );
}
