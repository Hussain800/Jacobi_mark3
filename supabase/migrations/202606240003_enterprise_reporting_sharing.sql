-- 202606240003_enterprise_reporting_sharing.sql
--
-- Add report/export integrity metadata and revocable external share controls
-- for the enterprise price-integrity workflow.

BEGIN;

ALTER TABLE public.evidence_exports
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS byte_size integer,
  ADD COLUMN IF NOT EXISTS redacted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.share_tokens
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redacted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_evidence_exports_finding_created
  ON public.evidence_exports(finding_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_share_tokens_finding_created
  ON public.share_tokens(finding_id, created_at DESC);

COMMIT;
