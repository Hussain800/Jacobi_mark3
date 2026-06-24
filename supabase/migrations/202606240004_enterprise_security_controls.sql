-- 202606240004_enterprise_security_controls.sql
--
-- Team invite records for role-governed enterprise workspaces.

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'analyst', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_org_created
  ON public.organization_invites(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_invites_token_active
  ON public.organization_invites(token_hash, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_invites_org_select ON public.organization_invites;
CREATE POLICY organization_invites_org_select
  ON public.organization_invites FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS organization_invites_org_insert ON public.organization_invites;
CREATE POLICY organization_invites_org_insert
  ON public.organization_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS organization_invites_org_update ON public.organization_invites;
CREATE POLICY organization_invites_org_update
  ON public.organization_invites FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

COMMIT;
