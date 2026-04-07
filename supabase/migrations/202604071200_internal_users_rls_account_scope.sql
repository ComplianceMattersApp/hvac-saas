-- Compliance Matters: internal_users teammate read scope
-- Purpose: allow active internal users to read teammate internal_users rows
-- within the same account_owner_user_id while preserving existing self-select
-- policies and leaving write policies unchanged.

BEGIN;

DROP POLICY IF EXISTS internal_users_internal_select_account_scope ON public.internal_users;

CREATE POLICY internal_users_internal_select_account_scope
ON public.internal_users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND actor.account_owner_user_id = internal_users.account_owner_user_id
  )
);

COMMIT;