-- Compliance Matters: contractors portal member select policy
-- Purpose:
--   Allow authenticated contractor portal members to read only their own
--   active contractor row so portal context can resolve under normal RLS.
--
-- Notes:
-- - SELECT-only; no INSERT/UPDATE/DELETE portal policy is added.
-- - Internal owner-scoped contractor policies remain unchanged.
-- - The helper avoids recursive RLS evaluation between contractors and
--   contractor_users while keeping the policy tied to auth.uid().

BEGIN;

CREATE OR REPLACE FUNCTION public.current_user_has_contractor_membership(
  p_contractor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_contractor_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.contractor_users cu
      WHERE cu.contractor_id = p_contractor_id
        AND cu.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_has_contractor_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_contractor_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_contractor_membership(uuid) TO service_role;

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractors_portal_member_select_own_active ON public.contractors;

CREATE POLICY contractors_portal_member_select_own_active
ON public.contractors
FOR SELECT
TO authenticated
USING (
  lifecycle_state = 'active'
  AND public.current_user_has_contractor_membership(id)
);

COMMIT;
