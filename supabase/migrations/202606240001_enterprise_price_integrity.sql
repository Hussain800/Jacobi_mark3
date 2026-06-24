-- 202606240001_enterprise_price_integrity.sql
--
-- Enterprise price-integrity layer for the Jacobi pivot:
-- organizations, products, sellers, watchlists, scan jobs, findings,
-- evidence items, exports, share tokens, and audit logs.
--
-- Idempotent and safe to apply after the existing probe/profile migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_members om
     WHERE om.organization_id = org_id
       AND om.user_id = auth.uid()
  );
$$;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  category text,
  canonical_url text,
  map_floor numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);

CREATE TABLE IF NOT EXISTS public.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  authorization_status text NOT NULL DEFAULT 'unknown'
    CHECK (authorization_status IN ('authorized', 'unauthorized', 'unknown')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain)
);

CREATE TABLE IF NOT EXISTS public.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  workflow_type text NOT NULL DEFAULT 'map'
    CHECK (workflow_type IN ('map', 'surveillance')),
  cadence text NOT NULL DEFAULT 'weekly'
    CHECK (cadence IN ('manual', 'daily', 'weekly', 'monthly')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  target_url text NOT NULL,
  market text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  last_observed_price numeric(12,2),
  last_observed_currency text,
  last_coverage_pct numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, target_url)
);

CREATE TABLE IF NOT EXISTS public.scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  watchlist_id uuid REFERENCES public.watchlists(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audit_depth text NOT NULL DEFAULT 'smart24',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  target_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_job_id uuid REFERENCES public.scan_jobs(id) ON DELETE SET NULL,
  watchlist_item_id uuid REFERENCES public.watchlist_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'MAP_UNDERCUT',
  severity text NOT NULL DEFAULT 'low'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'escalated', 'resolved')),
  observed_price numeric(12,2),
  map_floor numeric(12,2),
  currency text,
  spread_pct numeric(8,2),
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low', 'insufficient')),
  evidence_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.findings(id) ON DELETE CASCADE,
  scan_job_id uuid REFERENCES public.scan_jobs(id) ON DELETE SET NULL,
  probe_session_id text,
  buyer_context text,
  target_url text NOT NULL,
  observed_price numeric(12,2),
  currency text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'csv_import',
  extraction_method text NOT NULL DEFAULT 'manual_observation',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.evidence_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.findings(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format text NOT NULL CHECK (format IN ('pdf', 'csv', 'json')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'completed', 'failed')),
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.findings(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  scope text NOT NULL DEFAULT 'finding_read',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_products_org
  ON public.products(organization_id, active);
CREATE INDEX IF NOT EXISTS idx_sellers_org
  ON public.sellers(organization_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_org
  ON public.watchlists(organization_id, active);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist
  ON public.watchlist_items(watchlist_id, status);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_org_created
  ON public.scan_jobs(organization_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_org_status
  ON public.findings(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_items_finding
  ON public.evidence_items(finding_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_tokens_active
  ON public.share_tokens(token_hash, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
  ON public.audit_log(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sellers_updated_at ON public.sellers;
CREATE TRIGGER trg_sellers_updated_at
  BEFORE UPDATE ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_watchlists_updated_at ON public.watchlists;
CREATE TRIGGER trg_watchlists_updated_at
  BEFORE UPDATE ON public.watchlists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_watchlist_items_updated_at ON public.watchlist_items;
CREATE TRIGGER trg_watchlist_items_updated_at
  BEFORE UPDATE ON public.watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_findings_updated_at ON public.findings;
CREATE TRIGGER trg_findings_updated_at
  BEFORE UPDATE ON public.findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_member_select ON public.organizations;
CREATE POLICY organizations_member_select
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS organizations_owner_insert ON public.organizations;
CREATE POLICY organizations_owner_insert
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS organizations_member_update ON public.organizations;
CREATE POLICY organizations_member_update
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_member(id))
  WITH CHECK (public.is_org_member(id));

DROP POLICY IF EXISTS organization_members_self_select ON public.organization_members;
CREATE POLICY organization_members_self_select
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS organization_members_owner_insert ON public.organization_members;
CREATE POLICY organization_members_owner_insert
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS products_org_all ON public.products;
CREATE POLICY products_org_all
  ON public.products FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS sellers_org_all ON public.sellers;
CREATE POLICY sellers_org_all
  ON public.sellers FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS watchlists_org_all ON public.watchlists;
CREATE POLICY watchlists_org_all
  ON public.watchlists FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS watchlist_items_org_all ON public.watchlist_items;
CREATE POLICY watchlist_items_org_all
  ON public.watchlist_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists wl
      WHERE wl.id = watchlist_id AND public.is_org_member(wl.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlists wl
      WHERE wl.id = watchlist_id AND public.is_org_member(wl.organization_id)
    )
  );

DROP POLICY IF EXISTS scan_jobs_org_all ON public.scan_jobs;
CREATE POLICY scan_jobs_org_all
  ON public.scan_jobs FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS findings_org_all ON public.findings;
CREATE POLICY findings_org_all
  ON public.findings FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS evidence_items_org_all ON public.evidence_items;
CREATE POLICY evidence_items_org_all
  ON public.evidence_items FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS evidence_exports_org_all ON public.evidence_exports;
CREATE POLICY evidence_exports_org_all
  ON public.evidence_exports FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS share_tokens_org_all ON public.share_tokens;
CREATE POLICY share_tokens_org_all
  ON public.share_tokens FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS audit_log_org_select ON public.audit_log;
CREATE POLICY audit_log_org_select
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

COMMIT;
