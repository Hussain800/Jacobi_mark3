import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function fetchProbe(sessionId: string) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${apiBase}/api/share/${sessionId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchProbe(id);
  if (!data) {
    return { title: "Probe Not Found — JACOBI" };
  }
  const target = data.target_name || data.target_url || "Probe";
  return {
    title: `${target} — JACOBI Probe`,
    description: `Topology: ${data.topology_class || "unknown"} | Baseline: $${data.baseline_price || "?"} | Spread: $${data.max_price_spread || "?"}`,
    openGraph: {
      title: `${target} — JACOBI Probe`,
      description: `Pricing topology: ${data.topology_class || "unknown"} with $${data.max_price_spread || "?"} spread`,
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchProbe(id);

  if (!data) {
    return (
      <main className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#34d399" strokeWidth="1.5">
              <path d="M10 2 L16 8 L10 14 L4 8 Z" fill="none" />
              <circle cx="10" cy="8" r="2" fill="#34d399" opacity="0.4" />
            </svg>
          </div>
          <h1 className="text-xl font-thin text-white/80 mb-2">Probe Not Found</h1>
          <p className="text-xs font-mono text-white/20">
            This share link has expired or the probe result is no longer available.
          </p>
          <a
            href="/"
            className="inline-block mt-6 text-[10px] font-mono text-neon/50 hover:text-neon/80 transition-colors"
          >
            &larr; Back to JACOBI
          </a>
        </div>
      </main>
    );
  }

  return <ShareResult data={data} />;
}

import { ShareResultClient } from "./share-client";
import type { TopologyReport } from "@/components/dashboard";

interface ShareResultProps {
  data: TopologyReport;
}

function ShareResult({ data }: ShareResultProps) {
  return (
    <main className="min-h-screen bg-[#050505] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg border border-neon/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#34d399" strokeWidth="1.2">
              <path d="M8 2 L12 8 L8 14 L4 8 Z" fill="none" />
              <circle cx="8" cy="8" r="1.5" fill="#34d399" opacity="0.6" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-mono text-white/80 font-light">
              {data.target_name || data.target_url}
            </h1>
            <p className="text-[8px] font-mono text-white/15 font-light">
              Shared probe result — {data.timestamp || "unknown date"}
            </p>
          </div>
          <a
            href="/chat"
            className="ml-auto text-[9px] font-mono text-neon/40 hover:text-neon/70 transition-colors"
          >
            New probe &rarr;
          </a>
        </div>
        <ShareResultClient data={data} />
      </div>
    </main>
  );
}
