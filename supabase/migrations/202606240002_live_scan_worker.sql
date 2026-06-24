-- 202606240002_live_scan_worker.sql
--
-- Add worker bookkeeping for live watchlist scans. The main observation payload
-- stays in evidence_items.metadata so this remains a small additive migration.

BEGIN;

ALTER TABLE public.watchlist_items
  ADD COLUMN IF NOT EXISTS last_probe_session_id text,
  ADD COLUMN IF NOT EXISTS last_scan_job_id uuid REFERENCES public.scan_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_scan_status text
    CHECK (last_scan_status IS NULL OR last_scan_status IN ('queued', 'running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_scan_jobs_queue
  ON public.scan_jobs(status, queued_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_scan_jobs_watchlist_status
  ON public.scan_jobs(watchlist_id, status, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_last_scan_job
  ON public.watchlist_items(last_scan_job_id);

CREATE INDEX IF NOT EXISTS idx_evidence_items_scan_job
  ON public.evidence_items(scan_job_id, captured_at DESC);

COMMIT;
