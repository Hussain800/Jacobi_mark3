"use client";

/**
 * Leaderboard — top historical savings, fetched from /api/leaderboard.
 * Quiet, hairline-bordered, sits under the EmptyState.
 */

import { useEffect, useState } from "react";

interface Entry {
  name: string;
  savings: number;
  url: string;
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/api/leaderboard`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setEntries((d || []).slice(0, 8));
      })
      .catch(() => {
        if (active) setEntries([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiBase]);

  if (loading) return null;
  if (!entries.length) return null;

  return (
    <div className="border border-line rounded-md bg-raised overflow-hidden max-w-2xl mx-auto w-full">
      <div className="px-5 py-3 border-b border-line font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        Highest savings · recent probes
      </div>
      <ol>
        {entries.map((e, i) => (
          <li
            key={i}
            className="px-5 py-2.5 border-b border-line last:border-0 flex items-center justify-between font-mono text-[11px]"
          >
            <span className="flex items-center gap-3 text-secondary truncate">
              <span className="text-muted tabular-nums w-5">{String(i + 1).padStart(2, "0")}</span>
              <span className="truncate">{e.name}</span>
            </span>
            <span className="text-signal tabular-nums">
              −${e.savings.toFixed(0)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
