import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
  if (!data) return { title: "Probe Not Found — JACOBI" };
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
      <main className="min-h-screen bg-ink text-primary font-sans flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full border border-line bg-raised flex items-center justify-center mx-auto mb-6" />
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted mb-3">
            404
          </div>
          <h1 className="font-serif text-2xl text-primary mb-3">
            Probe not found
          </h1>
          <p className="font-mono text-[11px] text-secondary leading-relaxed mb-8">
            This share link has expired or the probe result is no longer
            available.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink bg-signal hover:brightness-110 rounded-md transition-all"
          >
            Back to JACOBI
            <ArrowRight className="w-3 h-3" />
          </Link>
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

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function ShareResult({ data }: ShareResultProps) {
  return (
    <main className="min-h-screen bg-ink text-primary font-sans selection:bg-signal/20 py-10 sm:py-14 px-5 sm:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Banner — establishes this is a shared public report */}
        <div className="mb-6 border border-line rounded-lg bg-raised px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-1">
              Shared probe · public report
            </div>
            <div className="font-mono text-[12px] text-secondary truncate">
              {data.target_name || data.target_url}
            </div>
            <div className="font-mono text-[10px] text-muted mt-1">
              {formatDate(data.timestamp || "")}
            </div>
          </div>
          <Link
            href="/chat"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink bg-signal hover:brightness-110 rounded-md transition-all"
          >
            Run your own probe
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <ShareResultClient data={data} />
      </div>
    </main>
  );
}
