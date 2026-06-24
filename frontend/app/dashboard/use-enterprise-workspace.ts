"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FINDINGS,
  PORTFOLIO,
  kpis,
  type Finding,
  type PortfolioItem,
} from "./demo-data";

type DashboardKpis = ReturnType<typeof kpis>;

export type WatchlistSummary = {
  id: string;
  name: string;
  cadence: string;
  workflow_type?: string;
  active?: boolean;
};

export type ScanJobSummary = {
  id: string;
  watchlist_id?: string;
  audit_depth?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  target_count: number;
  completed_count: number;
  failed_count: number;
  queued_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type EnterpriseDashboardData = {
  portfolio: PortfolioItem[];
  findings: Finding[];
  kpis: DashboardKpis;
  watchlists: WatchlistSummary[];
  scanJobs: ScanJobSummary[];
  evidenceCount: number;
};

type WorkspaceResponse = {
  portfolio?: PortfolioItem[];
  findings?: Finding[];
  kpis?: DashboardKpis;
  watchlists?: WatchlistSummary[];
  scan_jobs?: ScanJobSummary[];
  evidence_items?: unknown[];
};

type WorkspaceState = {
  data: EnterpriseDashboardData;
  loading: boolean;
  mode: "demo" | "live" | "error";
  error?: string;
  reload: () => void;
};

const DEMO_DATA: EnterpriseDashboardData = {
  portfolio: PORTFOLIO,
  findings: FINDINGS,
  kpis: kpis(),
  watchlists: [],
  scanJobs: [],
  evidenceCount: 0,
};

function normalizeWorkspace(payload: WorkspaceResponse): EnterpriseDashboardData {
  return {
    portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : [],
    findings: Array.isArray(payload.findings) ? payload.findings : [],
    kpis: payload.kpis ?? {
      openFindings: payload.findings?.length ?? 0,
      critical: payload.findings?.filter((f) => f.severity === "critical").length ?? 0,
      high: payload.findings?.filter((f) => f.severity === "high").length ?? 0,
      monitoredUrls: payload.portfolio?.length ?? 0,
      highConfidencePct: 0,
      auditsThisMonth: 0,
    },
    watchlists: Array.isArray(payload.watchlists) ? payload.watchlists : [],
    scanJobs: Array.isArray(payload.scan_jobs) ? payload.scan_jobs : [],
    evidenceCount: Array.isArray(payload.evidence_items) ? payload.evidence_items.length : 0,
  };
}

export function useEnterpriseWorkspace(): WorkspaceState {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<WorkspaceState>({
    data: DEMO_DATA,
    loading: true,
    mode: "demo",
    reload: () => {},
  });
  const supabase = useMemo(() => createClient(), []);
  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      setState((current) => ({ ...current, loading: true, reload }));
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      if (!token) {
        if (active) setState({ data: DEMO_DATA, loading: false, mode: "demo", reload });
        return;
      }

      try {
        const response = await fetch("/api/enterprise/workspace", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Workspace request failed with ${response.status}`);
        }
        const payload = (await response.json()) as WorkspaceResponse;
        if (!active) return;
        setState({
          data: normalizeWorkspace(payload),
          loading: false,
          mode: "live",
          reload,
        });
      } catch (error) {
        if (!active) return;
        setState({
          data: DEMO_DATA,
          loading: false,
          mode: "error",
          error: error instanceof Error ? error.message : "Workspace request failed",
          reload,
        });
      }
    }

    void loadWorkspace();
    return () => {
      active = false;
    };
  }, [reload, reloadToken, supabase]);

  return state;
}
