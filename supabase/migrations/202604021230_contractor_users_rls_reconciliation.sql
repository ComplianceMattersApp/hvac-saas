-- Compliance Matters: contractor_users RLS reconciliation
-- Purpose: reconcile Supabase warning and enforce DB-layer protection on contractor membership rows.

BEGIN;

ALTER TABLE public.contractor_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractor_users_select_own ON public.contractor_users;
DROP POLICY IF EXISTS contractor_users_internal_select_owner_scope ON public.contractor_users;

CREATE POLICY contractor_users_select_own
ON public.contractor_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY contractor_users_internal_select_owner_scope
ON public.contractor_users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.internal_users actor
    JOIN public.contractors c
      ON c.owner_user_id = actor.account_owner_user_id
    WHERE actor.user_id = auth.uid()
      AND actor.is_active = true
      AND c.id = contractor_users.contractor_id
  )
);

COMMIT;
