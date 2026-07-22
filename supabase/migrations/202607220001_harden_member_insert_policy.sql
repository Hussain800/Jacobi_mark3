-- 202607220001_harden_member_insert_policy.sql
--
-- Defense-in-depth for organization membership writes. The application already
-- rejects owner-role invites, but the previous RLS policy allowed any existing
-- member to insert an arbitrary membership row, including a second owner.
-- Bootstrap permits the creator's first owner row; later membership writes
-- require an owner/admin and may not create another owner.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_bootstrap_org_owner(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organizations org
     WHERE org.id = target_org_id
       AND org.created_by = (select auth.uid())
       AND NOT EXISTS (
         SELECT 1
           FROM public.organization_members existing
          WHERE existing.organization_id = org.id
       )
  );
$$;

REVOKE ALL ON FUNCTION public.can_bootstrap_org_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_bootstrap_org_owner(uuid) TO authenticated;

DROP POLICY IF EXISTS organization_members_owner_insert ON public.organization_members;
CREATE POLICY organization_members_owner_insert
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = (select auth.uid())
      AND role = 'owner'
      AND public.can_bootstrap_org_owner(organization_id)
    )
    OR (
      role <> 'owner'
      AND public.has_org_role(organization_id, ARRAY['owner', 'admin'])
    )
  );

COMMIT;
