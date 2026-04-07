-- Compliance Matters: internal_users read-scope reconciliation
-- Purpose: reconcile the manual TEST/PROD hotfix for internal_users teammate
-- read scope so future environments get the safe helper + non-recursive
-- policy in migration history.

BEGIN;

DROP POLICY IF EXISTS internal_users_internal_select_account_scope ON public.internal_users;

CREATE OR REPLACE FUNCTION public.current_internal_account_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT iu.account_owner_user_id
  FROM public.internal_users iu
  WHERE iu.user_id = auth.uid()
    AND iu.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_internal_account_owner_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_internal_account_owner_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_internal_account_owner_id() TO service_role;

CREATE POLICY internal_users_internal_select_account_scope
ON public.internal_users
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

COMMIT;