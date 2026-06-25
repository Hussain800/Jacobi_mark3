-- 202606240007_optimize_rls_initplan.sql
--
-- Supabase performance linter (0003_auth_rls_initplan) flags RLS policies that
-- call auth.uid() directly, which Postgres re-evaluates per row. Wrapping it as
-- (select auth.uid()) makes it an initplan evaluated once per query. Semantically
-- identical (cross-org isolation verified unchanged); a scale optimization.
-- Idempotent.

DROP POLICY IF EXISTS organizations_owner_insert ON public.organizations;
CREATE POLICY organizations_owner_insert
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS organization_members_self_select ON public.organization_members;
CREATE POLICY organization_members_self_select
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS organization_members_owner_insert ON public.organization_members;
CREATE POLICY organization_members_owner_insert
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) OR public.is_org_member(organization_id));
