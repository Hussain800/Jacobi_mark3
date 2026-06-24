-- 202606240005_enterprise_rls_member_management.sql
--
-- Completes RLS coverage for the organization lifecycle / team management.
-- 202606240001 enabled RLS on these tables but omitted:
--   * organizations: a DELETE policy (deletes were deny-all to authenticated)
--   * organization_members: UPDATE + DELETE policies (role changes / member
--     removal were deny-all to the authenticated role)
--
-- The backend uses the Supabase service-role key, so RLS is bypassed at the API
-- layer and the enterprise_access checks are the PRIMARY authorization boundary.
-- These policies are the defense-in-depth backstop for any future direct
-- browser->Supabase access and to contain a service-key leak. Idempotent.

BEGIN;

-- Role-aware membership helper (mirrors is_org_member, SECURITY DEFINER so it
-- can read organization_members without tripping that table's own RLS).
CREATE OR REPLACE FUNCTION public.has_org_role(org_id uuid, allowed text[])
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
       AND om.role = ANY(allowed)
  );
$$;

-- Only an owner may delete the organization.
DROP POLICY IF EXISTS organizations_owner_delete ON public.organizations;
CREATE POLICY organizations_owner_delete
  ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(id, ARRAY['owner']));

-- Owners/admins may change a member's role.
DROP POLICY IF EXISTS organization_members_admin_update ON public.organization_members;
CREATE POLICY organization_members_admin_update
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Owners/admins may remove a member.
DROP POLICY IF EXISTS organization_members_admin_delete ON public.organization_members;
CREATE POLICY organization_members_admin_delete
  ON public.organization_members FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

COMMIT;
